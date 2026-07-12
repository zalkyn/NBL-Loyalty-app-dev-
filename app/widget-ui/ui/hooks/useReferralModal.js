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
const ATTEMPT_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 1200;

function isTransientError(err) {
    return !!err && (err.name === 'AbortError' || err.name === 'TypeError' || err.message === 'Failed to fetch');
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useReferralModal({ isLoggedIn, proxyPath, provisioning, provisionNeeded, customerId }) {
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

    // Tracks the in-flight submission so a stale response (or a stale retry
    // loop) can never clobber state after the user has moved on (closed the
    // modal, submitted a different code, etc).
    const requestIdRef = useRef(0);

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

        const requestId = ++requestIdRef.current;
        setLoading(true);

        let lastError = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
            // A newer submission has started (or the user navigated away) —
            // abandon this retry loop instead of racing it.
            if (requestId !== requestIdRef.current) return;

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

                if (requestId !== requestIdRef.current) return;

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

        if (requestId !== requestIdRef.current) return;

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
    // the UI/cache if so. Uses the same requestIdRef guard as submitCode() so a
    // genuine newer user action (submitting a different code, etc.) always wins
    // over a slow background reconciliation call.
    function revalidateClaim(code) {
        const requestId = ++requestIdRef.current;
        requestReferralDiscount({ proxyPath, referralCode: code })
            .then((data) => {
                if (requestId !== requestIdRef.current) return;
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
    // Only matters on the failure path — success reloads the page before this
    // would ever run. Guards against double-submitting by checking that a
    // pending code is still sitting in codeInput with nothing already in flight.
    const prevProvisioningRef = useRef(provisioning);
    useEffect(() => {
        const wasProvisioning = prevProvisioningRef.current;
        prevProvisioningRef.current = provisioning;

        if (wasProvisioning && !provisioning && !provisionNeeded && codeInput && step === 'form') {
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
        window.location.href = '/account/login';
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