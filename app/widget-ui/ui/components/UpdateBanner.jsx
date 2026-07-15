// =============================================================================
// app/widget-ui/ui/components/UpdateBanner.jsx
// "An update is available" banner — shown above every tab's content (see
// WidgetShell.jsx) when the shop has an active ConfigUpdateVersion the
// customer's own account hasn't synced yet. See main.preact.jsx's
// computeUpdateStatus() for the (admin flag + active version + customer
// mismatch) condition, and App.jsx's handleUpdateClick for what happens on
// click.
// =============================================================================

import { h } from 'preact';
import { icon } from '../icons.js';

export function UpdateBanner({ banner, loading, dismissed, errorMsg, onUpdate, onDismiss }) {
    if (!banner || dismissed) return null;

    return (
        <div class="nbl-update-banner" role="status">
            <span
                class="nbl-update-banner__icon"
                dangerouslySetInnerHTML={{ __html: icon('star') }}
            />
            <div class="nbl-update-banner__text">
                <span class="nbl-update-banner__title">{banner.title}</span>
                {banner.description ? (
                    <span class="nbl-update-banner__desc">{banner.description}</span>
                ) : null}
                {errorMsg ? (
                    <span class="nbl-update-banner__desc nbl-update-banner__desc--error">{errorMsg}</span>
                ) : null}
            </div>
            <button
                type="button"
                class="nbl-update-banner__btn"
                onClick={onUpdate}
                disabled={loading}
            >
                {loading ? 'Updating…' : 'Update'}
            </button>
            <button
                type="button"
                class="nbl-update-banner__close"
                aria-label="Dismiss"
                onClick={onDismiss}
                disabled={loading}
            >
                <span dangerouslySetInnerHTML={{ __html: icon('close') }} />
            </button>
        </div>
    );
}
