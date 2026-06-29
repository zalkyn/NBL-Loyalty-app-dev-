// =============================================================================
// modules/module-preact/hooks/useReferralModal.js
// Referral modal state machine — purono referral-modal.js-er pura replacement.
// URL/pending code detection, fetch + cache, step management — sob ekhane.
// =============================================================================

import { useState, useEffect, useRef } from 'preact/hooks';
import * as cache from './referralCache.js';

const LOCKED_CODES = ['DISCOUNT_ALREADY_USED', 'REFERRAL_ALREADY_LOCKED'];
const HTTP_ERRORS = { 400: 'Invalid request.', 404: 'Code not found.', 409: 'Already used.', 422: 'Not eligible.', 500: 'Server error.' };

export function useReferralModal({ isLoggedIn, customer, appConfig }) {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState('form'); // 'login' | 'form' | 'success' | 'locked'
    const [codeInput, setCodeInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [formMessage, setFormMessage] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [lockedMessage, setLockedMessage] = useState(null);
    const [discountCode, setDiscountCode] = useState('');
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef(null);

    async function submitCode(rawCode) {
        const code = (rawCode || '').trim();
        setFormMessage(null);

        if (!code) {
            setFormMessage({ type: 'error', text: 'Please enter a referral code.' });
            return;
        }
        if (cache.hasUsedCode()) {
            setStep('locked');
            setLockedMessage({ type: 'error', text: 'You have already used a referral code.' });
            return;
        }

        const cached = cache.getCache(code);
        if (cached) {
            applyResponse(code, cached);
            return;
        }

        setLoading(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setLoading(false);
            setFormMessage({ type: 'error', text: 'Request timed out. Please try again.' });
        }, 8000);

        try {
            const res = await fetch(appConfig.appUrl + '/api/get-referral-discount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shop: window.Shopify && window.Shopify.shop,
                    customerId: customer && customer.id,
                    referralCode: code,
                }),
            });
            const data = await res.json();
            if (!res.ok && !data.message) data.message = HTTP_ERRORS[res.status] || HTTP_ERRORS[500];

            clearTimeout(timeoutRef.current);
            cache.setCache(code, data);
            applyResponse(code, data);
        } catch (err) {
            clearTimeout(timeoutRef.current);
            setLoading(false);
            setFormMessage({ type: 'error', text: 'Network error.' });
        }
    }

    function applyResponse(code, data) {
        setLoading(false);
        if (data.success) {
            setStep('success');
            setDiscountCode(data.referralDiscountCode);
            setSuccessMessage({ type: 'success', text: data.message || 'Your code is ready!' });
        } else if (LOCKED_CODES.indexOf(data.code) > -1) {
            setStep('locked');
            setLockedMessage({ type: 'error', text: data.message });
        } else {
            setFormMessage({ type: 'error', text: data.message });
        }
    }

    // ── Boot-time: URL/pending code detection (runs once on mount) ───────────
    useEffect(() => {
        const code = cache.restorePendingCode();
        const sweepId = setInterval(cache.sweepExpiredCache, 30000);

        if (code) {
            setIsOpen(true);
            setCopied(false);
            if (!isLoggedIn) {
                setStep('login');
            } else {
                setStep('form');
                setCodeInput(code);
                submitCode(code);
            }
        }

        return () => clearInterval(sweepId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        if (step === 'success' && !copied) {
            setSuccessMessage({ type: 'error', text: 'Please copy your code before closing.' });
            return;
        }
        closeModal();
    }
    function handleCopy() {
        if (!discountCode || !navigator.clipboard) return;
        navigator.clipboard.writeText(discountCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }
    function handleSubmit() {
        submitCode(codeInput);
    }

    return {
        isOpen, step, codeInput, setCodeInput, loading,
        formMessage, successMessage, lockedMessage, discountCode, copied,
        openModal, closeModal, handleLogin, handleFinish, handleCopy, handleSubmit,
    };
}
