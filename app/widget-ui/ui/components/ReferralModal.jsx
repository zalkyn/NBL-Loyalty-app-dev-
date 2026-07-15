// =============================================================================
// app/widget-ui/ui/components/ReferralModal.jsx
// Referral modal — purono html.js referralModalHTML()-er pura replacement.
// Sob logic useReferralModal hook-e, eta shudhu render kore.
// =============================================================================

import { h } from 'preact';
import { Icon } from './Icon.jsx';
import { Heading } from './Heading.jsx';
import { Text } from './Text.jsx';
import { Button } from './Button.jsx';
import { formatNumber } from '../utils.js';

function buildFriendRewardRows(pointRules, currencySymbol) {
    const refRule = (pointRules || []).find((r) => r.event && r.event.type === 'REFERRAL');
    const refCond = (refRule && refRule.conditions && refRule.conditions.referral) || {};
    const referrer = refCond.referrer || {};
    const referred = refCond.referred || {};
    const trigger = refCond.trigger || 'oneTime';

    const rows = [];
    if (referred.discountValue) {
        const voucherValue = referred.discountType === 'percentage'
            ? `${referred.discountValue}% discount voucher`
            : `a ${currencySymbol}${formatNumber(referred.discountValue)} discount voucher`;
        const note = referred.minimumOrderValue
            ? ` on orders over ${currencySymbol}${formatNumber(referred.minimumOrderValue)}`
            : trigger === 'subscription' ? ' for your first subscription order'
                : trigger === 'both' ? ' for your first order'
                    : ' for your first one-time purchase';
        rows.push({ iconName: 'gift', text: `You get ${voucherValue}${note}.` });
    }
    if ((trigger === 'subscription' || trigger === 'both') && referred.allowRenewalReward && referred.renewalPoints > 0) {
        rows.push({ iconName: 'refresh', text: `Earn ${formatNumber(referred.renewalPoints)} points every time you renew your subscription.` });
    }
    return rows;
}

function RewardSummary({ rows }) {
    if (!rows.length) return null;
    return (
        <div class="nbl-refer-modal__reward-summary">
            {rows.map((row, i) => (
                <div class="nbl-refer-modal__reward-row" key={i}>
                    <Icon name={row.iconName} extraClass="nbl-icon--unstyled" /> {row.text}
                </div>
            ))}
        </div>
    );
}

function Message({ msg, onRetry, onUpdateClick, updateLoading }) {
    if (!msg) return null;
    return (
        <div class={`nbl-refer-modal__message nbl-refer-modal__message--${msg.type}`}>
            <div>{msg.text}</div>
            {/* See checkUpdateRequired.js / App.jsx's handleUpdateClick —
                same sync-then-reload flow as the top widget banner's own
                Update button, instead of retrying the same submission
                (which would just fail again the same way). */}
            {msg.isUpdateRequired && onUpdateClick ? (
                <Button bare extraClass="nbl-refer-modal__btn nbl-refer-modal__btn--retry" onClick={onUpdateClick} disabled={updateLoading}>
                    {updateLoading ? 'Updating…' : 'Update'}
                </Button>
            ) : (
                msg.retry && onRetry && (
                    <Button bare extraClass="nbl-refer-modal__btn nbl-refer-modal__btn--retry" onClick={onRetry}>
                        Try Again
                    </Button>
                )
            )}
        </div>
    );
}

export function ReferralModal({ refModal, pointRules, currencySymbol, onUpdateClick, updateLoading, lbl }) {
    if (!refModal.isOpen) return null;

    const {
        step, codeInput, setCodeInput, loading,
        formMessage, successMessage, lockedMessage, discountCode, copied,
        closeModal, handleLogin, handleFinish, handleCopy, handleSubmit, handleRetry,
    } = refModal;

    const rewardRows = buildFriendRewardRows(pointRules, currencySymbol);
    const brand = lbl('referralModalBrand') || 'NBL Loyalty';

    return (
        <div class="nbl-refer-modal-overlay show" role="dialog" aria-modal="true" aria-labelledby="nbl-modal-title">
            <div class="nbl-refer-modal">
                <div class="nbl-refer-modal__close" aria-label="Close" onClick={closeModal}>
                    <Icon name="close" px={16} />
                </div>
                <div class="nbl-refer-modal__content">

                    {step === 'login' && (
                        <div>
                            <div class="nbl-refer-modal__brand">{brand}</div>
                            <Heading as="h3" bare extraClass="nbl-refer-modal__title" id="nbl-modal-title">
                                {lbl('referralLoginTitle') || 'Login to Claim Your Referral Discount'}
                            </Heading>
                            <Text as="p" bare extraClass="nbl-refer-modal__subtitle">
                                {lbl('referralLoginSubtitle') || 'Log into your account to unlock your referral discount.'}
                            </Text>
                            <RewardSummary rows={rewardRows} />
                            <Text as="p" size="sm" color="muted" extraClass="nbl-refer-modal__login-note">
                                {lbl('referralLoginNote') || "Almost there! After you sign in, just head back to our store — your discount code will be waiting for you right here."}
                            </Text>
                            <Button bare extraClass="nbl-refer-modal__btn nbl-refer-modal__btn--primary" onClick={handleLogin}>
                                {lbl('referralLoginBtn') || 'Login / Register'}
                            </Button>
                        </div>
                    )}

                    {step === 'form' && (
                        <div>
                            <div class="nbl-refer-modal__brand">{brand}</div>
                            <Heading as="h3" bare extraClass="nbl-refer-modal__title">
                                {lbl('referralFormTitle') || 'Get Your Referral Discount'} <Icon name="gift" px={18} />
                            </Heading>
                            <Text as="p" bare extraClass="nbl-refer-modal__subtitle">
                                {lbl('referralFormSubtitle') || 'Enter your referral code to unlock your discount.'}
                            </Text>
                            <RewardSummary rows={rewardRows} />
                            <input
                                type="text"
                                class="nbl-refer-modal__input"
                                readonly
                                value={codeInput}
                                onInput={(e) => setCodeInput(e.target.value)}
                            />
                            {loading ? (
                                <div class="nbl-refer-modal__loader">
                                    <span class="nbl-spinner nbl-spinner--modal" />
                                    <Text as="span" bare>{lbl('referralFormVerifying') || 'Verifying your referral code...'}</Text>
                                </div>
                            ) : (
                                <Button bare extraClass="nbl-refer-modal__btn nbl-refer-modal__btn--primary" onClick={handleSubmit}>
                                    {lbl('referralFormSubmitBtn') || 'Request Discount Code'}
                                </Button>
                            )}
                            <Message msg={formMessage} onRetry={handleRetry} onUpdateClick={onUpdateClick} updateLoading={updateLoading} />
                        </div>
                    )}

                    {step === 'success' && (
                        <div>
                            <div class="nbl-refer-modal__brand">{brand}</div>
                            <Heading as="h3" bare extraClass="nbl-refer-modal__title">
                                <Icon name="sparkles" px={18} /> {lbl('referralSuccessTitle') || 'Your Discount Code'}
                            </Heading>
                            <div class="nbl-refer-modal__code-box">
                                <div class="nbl-refer-modal__code">{discountCode}</div>
                                <Button bare extraClass="nbl-refer-modal__copy-btn" disabled={copied} onClick={handleCopy}>
                                    {copied ? (lbl('referralSuccessCopiedBtn') || 'Copied') : (lbl('referralSuccessCopyBtn') || 'Copy Code')}
                                </Button>
                            </div>
                            <RewardSummary rows={rewardRows} />
                            <div class="nbl-refer-modal__important">
                                <strong>{lbl('referralImportantHeading') || 'Important:'}</strong>
                                <ul>
                                    <li>{lbl('referralImportantNote1') || 'One-time code — use at checkout.'}</li>
                                    <li>{lbl('referralImportantNote2') || 'Use it quickly.'}</li>
                                </ul>
                            </div>
                            <Button bare extraClass="nbl-refer-modal__btn nbl-refer-modal__btn--finish" onClick={handleFinish}>
                                {lbl('referralFinishBtn') || 'Finish & Save'}
                            </Button>
                            <Message msg={successMessage} />
                        </div>
                    )}

                    {step === 'locked' && (
                        <div>
                            <div class="nbl-refer-modal__brand">{brand}</div>
                            <Heading as="h3" bare extraClass="nbl-refer-modal__title">
                                <Icon name="block" px={18} /> {lbl('referralLockedTitle') || 'Referral Already Used'}
                            </Heading>
                            <Text as="p" bare extraClass="nbl-refer-modal__subtitle">
                                {lbl('referralLockedSubtitle') || 'Only one referral discount is allowed per customer.'}
                            </Text>
                            <Button bare extraClass="nbl-refer-modal__btn nbl-refer-modal__btn--finish" onClick={closeModal}>Close</Button>
                            <Message msg={lockedMessage} />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}