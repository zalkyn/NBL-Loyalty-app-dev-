// =============================================================================
// modules/module-preact/hooks/useReferralModal.js
// Referral modal state machine — purono referral-modal.js-er pura replacement.
// URL/pending code detection, fetch + cache, step management — sob ekhane.
// =============================================================================

import { useState, useEffect, useRef } from 'preact/hooks';
import * as cache from './referralCache.js';
import { requestReferralDiscount } from '../api.js';

const LOCKED_CODES = ['DISCOUNT_ALREADY_USED', 'REFERRAL_ALREADY_LOCKED'];

// ── Customer-facing error copy ────────────────────────────────────────────
// Mapped from the backend's structured `code` field. Never show raw/dev
// error text (e.g. "Shop is required.", "Customer ID is required.") to the
// customer — those are for logs only. Anything we don't recognize falls
// back to GENERIC_ERROR_MESSAGE.
const GENERIC_ERROR_MESSAGE = "We couldn't process your referral right now. Please try again in a moment.";

const ERROR_MESSAGES = {
    INVALID_INPUT: GENERIC_ERROR_MESSAGE,
    INVALID_REFERRAL_CODE: "This referral code doesn't look right. Please double-check it and try again.",
    CUSTOMER_NOT_FOUND: 'We couldn\u2019t find your account. Please log in again and retry.',
    DISCOUNT_ALREADY_USED: 'You\u2019ve already used your referral discount \u2014 it can only be used once.',
    DISCOUNT_ALREADY_EXISTS: 'A referral discount has already been generated for your account.',
    REFERRAL_ALREADY_LOCKED: 'You already have a referral discount from someone else. You can\u2019t switch referral codes.',
    SELF_REFERRAL: "You can't use your own referral code.",
    INELIGIBLE_CUSTOMER_ORDERS: "This offer is only for new customers, and it looks like you've already placed an order.",
    INTERNAL_ERROR: GENERIC_ERROR_MESSAGE,
};

function friendlyMessage(data) {
    if (data && data.code && ERROR_MESSAGES[data.code]) return ERROR_MESSAGES[data.code];
    return GENERIC_ERROR_MESSAGE;
}

// ── Retry configuration ───────────────────────────────────────────────────
// Each attempt gets its own timeout. If an attempt times out or hits a
// transient network error, we retry silently (just keep the spinner up) —
// the customer should never see the word "timeout". Only once every retry
// is exhausted do we show a friendly error, with a manual Try Again action.
const MAX_ATTEMPTS = 3;
// A first-time referral claim needs two sequential Shopify Admin API calls
// server-side (an eligibility check, then discount code generation) before
// it can respond — each one can individually take several seconds under
// normal Shopify API latency, so 8s was frequently too tight and produced
// false "please try again" failures on a request that was actually still
// legitimately in progress server-side. 15s gives real headroom for that
// two-call chain while still failing fast enough that a genuinely stuck
// request doesn't leave the customer staring at a spinner indefinitely.
const ATTEMPT_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 1200;

function isTransientError(err) {
    return !!err && (err.name === 'AbortError' || err.name === 'TypeError' || err.message === 'Failed to fetch');
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useReferralModal({ isLoggedIn, proxyPath, provisioning, provisionNeeded, customerId, redirectUrl }) {
    // NOTE: `provisioning` here is expected to be useCustomerProvision's
    // `inFlight` value (always accurate), not its `provisioning` (overlay-only,
    // can stay false even while a call is pending if the overlay is disabled
    // via appConfig.showProvisionLoadingOverlay). See App.jsx wiring.
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState('form'); // 'login' | 'form' | 'success' | 'locked'
    const [codeInput, setCodeInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [formMessage, setFormMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [lockedMessage, setLockedMessage] = useState(null);
    const [discountCode, setDiscountCode] = useState('');
    const [copied, setCopied] = useState(false);

    // Permanent "has this code been copied at least once" flag, separate from
    // `copied` above (which is purely transient — it flips back to false after
    // 2.5s so the button label reverts to "Copy Code"). handleFinish must gate
    // on THIS, not on `copied`, or clicking Finish more than ~2.5s after a
    // successful copy would wrongly block closing the modal.
    const copiedOnceRef = useRef(false);

    // Two SEPARATE counters — one per operation. Previously these shared a
    // single requestIdRef, which meant a revalidateClaim() call firing while
    // submitCode()'s own retry loop was still in flight would bump the same
    // counter out from under it. When the loop then finished (success OR all
    // attempts exhausted), its "is this still the current request?" check
    // would see a mismatch and silently `return` — WITHOUT ever calling
    // setLoading(false) — leaving the "Verifying your referral code..."
    // spinner stuck forever, recoverable only by a full page reload. Fully
    // independent counters make that cross-interference impossible: each
    // operation can only ever be invalidated by a newer call to itself.
    const submitRequestIdRef = useRef(0);
    const revalidateRequestIdRef = useRef(0);

    async function submitCode(rawCode) {
        const code = (rawCode || '').trim();
        setFormMessage(null);

        if (!code) {
            setFormMessage({ type: 'error', text: 'Please enter a referral code.' });
            return;
        }

        const claim = cache.getClaim(customerId);
        if (claim && claim.used) {
            setStep('locked');
            setLockedMessage({ type: 'error', text: ERROR_MESSAGES.DISCOUNT_ALREADY_USED });
            return;
        }
        if (claim && claim.code && claim.code !== code && claim.discountCode) {
            // Already claimed a discount with a *different* code — backend
            // would reject this as REFERRAL_ALREADY_LOCKED anyway, but we
            // can tell the customer immediately without a round-trip.
            setStep('locked');
            setLockedMessage({ type: 'error', text: ERROR_MESSAGES.REFERRAL_ALREADY_LOCKED });
            return;
        }
        if (claim && claim.code === code && claim.discountCode) {
            // Same code, already claimed locally — show it immediately for a
            // snappy UI (no spinner flash on repeat opens). But NEVER trust this
            // cached "still valid" state as the final word: `discountUsed` flips
            // to true at checkout, which happens entirely outside this browser
            // (a webhook), so this local cache has no way to learn about that on
            // its own. Reconcile with the server in the background on every
            // reuse so a used code can't keep showing as valid forever.
            applyClaimedResponse(code, claim);
            revalidateClaim(code);
            return;
        }

        const cached = cache.getCache(customerId, code);
        if (cached) {
            applyResponse(code, cached);
            return;
        }

        const requestId = ++submitRequestIdRef.current;
        setLoading(true);

        let lastError = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
            // A newer submission has started (or the user navigated away) —
            // abandon this retry loop instead of racing it.
            if (requestId !== submitRequestIdRef.current) return;

            try {
                let signal;
                let manualController;
                if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                    signal = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
                } else {
                    manualController = new AbortController();
                    signal = manualController.signal;
                    setTimeout(() => manualController.abort(), ATTEMPT_TIMEOUT_MS);
                }

                const data = await requestReferralDiscount({ proxyPath, referralCode: code, signal });

                if (requestId !== submitRequestIdRef.current) return;

                cache.setCache(customerId, code, data);
                applyResponse(code, data);
                return;
            } catch (err) {
                lastError = err;
                // eslint-disable-next-line no-console
                console.error('[NBL Referral] attempt', attempt, 'of', MAX_ATTEMPTS, 'failed:', err);

                if (!isTransientError(err) || attempt === MAX_ATTEMPTS) break;
                await wait(RETRY_DELAY_MS * attempt);
            }
        }

        if (requestId !== submitRequestIdRef.current) return;

        // eslint-disable-next-line no-console
        console.error('[NBL Referral] all attempts exhausted:', lastError);
        setLoading(false);
        setFormMessage({
            type: 'error',
            text: GENERIC_ERROR_MESSAGE,
            retry: true,
        });
    }

    function applyResponse(code, data) {
        setLoading(false);
        if (data.success) {
            cache.setClaim(customerId, { code, discountCode: data.referralDiscountCode, used: false, message: data.message });
            copiedOnceRef.current = false;
            setStep('success');
            setDiscountCode(data.referralDiscountCode);
            setSuccessMessage({ type: 'success', text: data.message || 'Your code is ready!' });
        } else if (data.code === 'DISCOUNT_ALREADY_USED') {
            cache.markClaimUsed(customerId);
            setStep('locked');
            setLockedMessage({ type: 'error', text: friendlyMessage(data) });
        } else if (LOCKED_CODES.indexOf(data.code) > -1) {
            setStep('locked');
            setLockedMessage({ type: 'error', text: friendlyMessage(data) });
        } else {
            setFormMessage({ type: 'error', text: friendlyMessage(data) });
        }
    }

    function applyClaimedResponse(code, claim) {
        setLoading(false);
        copiedOnceRef.current = false;
        setStep('success');
        setDiscountCode(claim.discountCode);
        setSuccessMessage({ type: 'success', text: claim.message || 'Your referral discount is still valid. Use it at checkout!' });
    }

    // ── Background reconciliation for a cached claim ──────────────────────────
    // Fires whenever submitCode() short-circuits on a previously-cached claim
    // (see above). Silent, fire-and-forget: never surfaces a raw network/5xx
    // error over what's already a perfectly good optimistic view. Its only job
    // is to catch the one state transition that matters — `discountUsed` having
    // flipped to true at checkout since we last cached this claim — and correct
    // the UI/cache if so. Uses its own revalidateRequestIdRef guard (separate
    // from submitCode()'s submitRequestIdRef — see the comment where both are
    // declared above) so a newer revalidateClaim() call always wins over a
    // slow/stale one, without ever affecting submitCode()'s own tracking.
    function revalidateClaim(code) {
        const requestId = ++revalidateRequestIdRef.current;
        requestReferralDiscount({ proxyPath, referralCode: code })
            .then((data) => {
                if (requestId !== revalidateRequestIdRef.current) return;
                if (data.code === 'DISCOUNT_ALREADY_USED') {
                    cache.markClaimUsed(customerId);
                    setStep('locked');
                    setLockedMessage({ type: 'error', text: friendlyMessage(data) });
                } else if (LOCKED_CODES.indexOf(data.code) > -1) {
                    setStep('locked');
                    setLockedMessage({ type: 'error', text: friendlyMessage(data) });
                } else if (data.success) {
                    // Still valid — refresh the cache (message/code may have
                    // changed) so the next open stays in sync too.
                    cache.setClaim(customerId, { code, discountCode: data.referralDiscountCode, used: false, message: data.message });
                }
                // Any other outcome (transient network error, 5xx, etc.) —
                // say nothing and keep showing the cached view; the next open
                // (or the customer's own retry) will reconcile again.
            })
            .catch(() => {
                // Silent by design — see comment above.
            });
    }

    // ── Boot-time: URL/pending code detection (runs once on mount) ───────────
    useEffect(() => {
        const code = cache.restorePendingCode();
        const sweepId = setInterval(() => cache.sweepExpiredCache(customerId), 30000);

        if (code) {
            setIsOpen(true);
            setCopied(false);
            if (!isLoggedIn) {
                setStep('login');
            } else {
                setStep('form');
                setCodeInput(code);
                // Customer is logged in on Shopify but useCustomerProvision says
                // their app-side record doesn't exist yet (or is incomplete).
                // Submitting right now would hit the backend before that record
                // is created and get a hard CUSTOMER_NOT_FOUND — even though
                // from the customer's point of view nothing is actually wrong.
                //
                // If provisioning succeeds it triggers a full page reload on its
                // own (see useCustomerProvision), at which point this whole hook
                // re-mounts with fresh customer.config and the pending code is
                // re-submitted naturally. So we only need to handle the "don't
                // fire too early" half here — just show the loading state and
                // let the watcher effect below pick up the actual submit once
                // provisioning is no longer in the way (or wasn't needed at all).
                if (!provisionNeeded) {
                    submitCode(code);
                } else {
                    setLoading(true);
                }
            }
        }

        return () => clearInterval(sweepId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Watcher: fire the deferred boot-time submit once provisioning clears ──
    // Fires on !provisioning alone (not !provisionNeeded too, which used to be
    // required here) — useCustomerProvision's inFlight (passed in as
    // `provisioning`) is guaranteed to resolve to false within its own 7s hard
    // cutoff either way, but provisionNeeded specifically does NOT reliably
    // flip to false on the failure path: it's computed from customer.config,
    // which a failed provisioning attempt never updates. Requiring it here
    // meant that on failure — exactly the path this watcher's comment always
    // said it existed for — the condition could never be satisfied, so
    // submitCode() was never called and the boot effect's setLoading(true)
    // was never followed by any setLoading(false), leaving the modal stuck on
    // "Verifying your referral code..." indefinitely. On the success path this
    // is moot regardless (a page reload happens first); on failure, letting
    // submitCode() run anyway is correct — the backend's own CUSTOMER_NOT_FOUND
    // handling (already a friendly, mapped error message) takes it from there.
    const prevProvisioningRef = useRef(provisioning);
    useEffect(() => {
        const wasProvisioning = prevProvisioningRef.current;
        prevProvisioningRef.current = provisioning;

        if (wasProvisioning && !provisioning && codeInput && step === 'form') {
            submitCode(codeInput);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provisioning, provisionNeeded]);

    function openModal() {
        setIsOpen(true);
        setCopied(false);
    }
    function closeModal() {
        setIsOpen(false);
        cache.removeURLCode();
    }
    function handleLogin() {
        const code = cache.getURLCode();
        if (code) cache.savePendingCode(code);
        // /customer_authentication/login is Shopify's unified passwordless
        // sign-in/register entry point (Customer Accounts — the default
        // system since 2026). Its return_to param sends the customer back
        // to a chosen storefront page after a successful login OR
        // registration, with no theme changes needed on the merchant's
        // side — see https://shopify.dev/docs/storefronts/themes/sign-in.
        //
        // redirectUrl is merchant-configurable (Customize > Referral in the
        // admin — see cssVarsConfig.js's referral.redirectUrl field).
        // return_to only accepts relative paths, so anything that isn't one
        // (empty, or a full https:// URL entered by mistake) falls back to
        // the homepage rather than silently breaking the redirect.
        const target = typeof redirectUrl === 'string' && redirectUrl.startsWith('/') ? redirectUrl : '/';
        // On stores still using the older Legacy Customer Accounts system,
        // return_to has no effect there (that system needs a hidden form
        // field added directly to the merchant's theme templates, which an
        // app can't do) — customers land on the default order-history page
        // instead. That's exactly why the modal shows an explicit "come
        // back to our store" message right before this button — see
        // ReferralModal.jsx's login step.
        window.location.href = '/customer_authentication/login?return_to=' + encodeURIComponent(target);
    }
    function handleFinish() {
        if (step === 'success' && !copiedOnceRef.current) {
            setSuccessMessage({ type: 'error', text: 'Please copy your code before closing.' });
            return;
        }
        closeModal();
    }
    function handleCopy() {
        if (!discountCode || !navigator.clipboard) return;
        navigator.clipboard.writeText(discountCode).then(() => {
            copiedOnceRef.current = true;
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }
    function handleSubmit() {
        if (provisioning) {
            // Provisioning is actively resolving this customer's account —
            // don't race it. Just keep the loading state up; the watcher
            // effect (or the reload on provisioning success) takes it from here.
            setLoading(true);
            return;
        }
        submitCode(codeInput);
    }
    function handleRetry() {
        submitCode(codeInput);
    }

    return {
        isOpen, step, codeInput, setCodeInput, loading,
        formMessage, successMessage, lockedMessage, discountCode, copied,
        openModal, closeModal, handleLogin, handleFinish, handleCopy, handleSubmit, handleRetry,
    };
}