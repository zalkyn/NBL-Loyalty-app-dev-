/**
 * @file app/layout/subscription-cancellations/route.jsx
 * @description Subscription Cancellations — audit trail + manual correction
 * for every Appstle subscription.cancelled event this app has received (see
 * server/jobs/subscriptionCancelledJob.js and
 * app/webhook-routes/appstle-subscription-cancelled.jsx). Also hosts the
 * on/off toggle for whether cancellations auto-reset points (see
 * app/controller/appSettings/subscriptionCancelResetSettings.js) — kept on
 * this page rather than points-rules/order so it lives right next to the
 * data it affects, and so it doesn't get tangled with that page's unrelated
 * PointsRule form/dirty-state machinery.
 *
 * Layout follows the app.physical-prizes-claims-manage module pattern:
 *   route.jsx        -> loader, thin action dispatcher, page composition
 *   _data.js         -> client-safe constants + pure helpers (loader and client both import this)
 *   _data.server.js  -> server-only per-submitType handlers (prisma, transactions)
 *   _hooks.js        -> all client-side state + handlers
 *   components/      -> presentational pieces
 */

import { useLoaderData, useActionData } from "react-router";
import { authenticate } from "shopify-server";
import prisma from "db-server";

import { VALID_STATUSES, DEFAULT_PER_PAGE, MAX_PER_PAGE, parseIntParam, buildWhere, NON_ACTIONABLE_SKIP_REASONS } from "./_data";
import { handleUpdateSettings, handleResetPoints, handleBulkResetPoints, handleRestorePoints, attachResetSiblings, attachResetPreview } from "./_data.server";
import { getSubscriptionCancelResetSettings } from "app/controller/appSettings/subscriptionCancelResetSettings.js";
import { useSubscriptionCancellationsPage } from "./_hooks";

import { SettingsCard } from "./components/SettingsCard";
import { FilterBar } from "./components/FilterBar";
import { CancelEventsTable } from "./components/CancelEventsTable";
import { ConfirmModal } from "./components/ConfirmModal";
import { HowItWorksModal, HOW_IT_WORKS_MODAL_ID } from "./components/HowItWorksModal";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);

    const rawStatus = url.searchParams.get("status") ?? "ALL";
    const rawPage = url.searchParams.get("page") ?? "1";
    const rawPerPage = url.searchParams.get("perPage") ?? String(DEFAULT_PER_PAGE);

    const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : "ALL";
    const perPage = parseIntParam(rawPerPage, DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);

    try {
        // ── 1. Stats — always unfiltered so tab counts reflect total reality ──
        // groupBy, not findMany + JS .filter().length — this table only ever
        // grows (cancellation history is never purged), so counting via a
        // full row fetch on every page load/action would get slower forever.
        // groupBy's result set is bounded by the number of distinct
        // (resetApplied, skipReason) combinations (at most a handful), not
        // by row count, so this stays cheap regardless of how much history
        // has piled up.
        const [grouped, settings] = await Promise.all([
            prisma.subscriptionCancelEvent.groupBy({
                by: ["resetApplied", "skipReason"],
                where: { sessionId: session.id },
                _count: { _all: true },
            }),
            getSubscriptionCancelResetSettings(session.shop),
        ]);

        const stats = grouped.reduce(
            (acc, g) => {
                acc.total += g._count._all;
                if (g.resetApplied) acc.applied += g._count._all;
                else if (!NON_ACTIONABLE_SKIP_REASONS.includes(g.skipReason)) acc.needsAction += g._count._all;
                return acc;
            },
            { total: 0, applied: 0, needsAction: 0 }
        );

        // ── 2. Data query — filtered + paginated ───────────────────────────────
        const where = buildWhere(session.id, status);

        // totalItems must be known BEFORE `skip` is computed — clamping
        // `page` only after already querying with the raw, unclamped page
        // (the previous shape here) meant a stale/out-of-range ?page= (e.g.
        // the tab just shrank from a bulk action, or a bookmarked/typed
        // URL) would skip past every matching row, returning an empty
        // `events` array paired with a `page` that LOOKED valid (clamped
        // afterward) — "page 2 of 2" shown above an empty table, with no
        // way to page back to the row that's actually there.
        const totalItems = await prisma.subscriptionCancelEvent.count({ where });
        const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
        const page = parseIntParam(rawPage, 1, 1, totalPages);

        const events = await prisma.subscriptionCancelEvent.findMany({
            where,
            orderBy: { cancelledAt: "desc" },
            skip: (page - 1) * perPage,
            take: perPage,
            include: {
                customer: { select: { id: true, shopifyId: true, points: true } },
                // Restore cap = what the reset actually removed (restorableTotal in _data.js).
                transaction: { select: { points: true } },
            },
        });

        // ── 3. Point ALREADY_ZERO rows at the cancellation that did deduct ──
        // Informational only — a failure here must not take down the page;
        // those rows just fall back to the generic "nothing to restore" text.
        const eventsWithSibling = await attachResetSiblings(session.id, events).catch((err) => {
            console.error("[SubscriptionCancellations Loader] attachResetSiblings failed", err);
            return events;
        });

        // ── 4. What Reset Now would remove under the current mode ──────────
        // Shown in the confirm modal only (the action recomputes it live);
        // on failure the modal falls back to the live balance.
        const eventsWithPreview = await attachResetPreview(eventsWithSibling, settings.manualResetMode).catch((err) => {
            console.error("[SubscriptionCancellations Loader] attachResetPreview failed", err);
            return eventsWithSibling;
        });

        return {
            events: eventsWithPreview,
            stats,
            settings,
            pagination: { page, perPage, totalItems, totalPages },
        };
    } catch (err) {
        console.error("[SubscriptionCancellations Loader]", err);
        return {
            events: [],
            stats: { total: 0, applied: 0, needsAction: 0 },
            settings: { enabled: true, manualResetMode: "FULL_BALANCE" },
            pagination: { page: 1, perPage, totalItems: 0, totalPages: 1 },
            loaderError: "Failed to load cancellations. Please refresh.",
        };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION — thin dispatcher; per-submitType logic lives in _data.server.js
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");
    const ctx = { formData, session, admin };

    switch (submitType) {
        case "updateSettings": return handleUpdateSettings(ctx);
        case "resetPoints": return handleResetPoints(ctx);
        case "bulkResetPoints": return handleBulkResetPoints(ctx);
        case "restorePoints": return handleRestorePoints(ctx);
        default: return { message: "Invalid action.", status: "error", submitType };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function SubscriptionCancellationsPage() {
    const loaderData = useLoaderData();
    const actionData = useActionData();

    const page = useSubscriptionCancellationsPage(loaderData, actionData);

    return (
        <s-page heading="Subscription Cancellations" inlineSize="large">

            <s-section>
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                    <s-text tone="subdued" variant="bodySm">
                        Every Appstle subscription cancellation this app has seen, and whether the customer&apos;s points
                        balance was reset to 0. Lifetime points are never affected — see the toggle below.
                    </s-text>
                    <s-button
                        icon="info"
                        variant="tertiary"
                        accessibilityLabel="How subscription cancellations work"
                        commandFor={HOW_IT_WORKS_MODAL_ID}
                        command="--show"
                    />
                </s-stack>
            </s-section>

            <HowItWorksModal />

            {page.loaderError && (
                <s-section>
                    <s-banner tone="critical">{page.loaderError}</s-banner>
                </s-section>
            )}

            <ConfirmModal
                modalRef={page.modalRef}
                confirmTarget={page.confirmTarget}
                selectedCount={page.selectedIds.size}
                isSubmitting={page.isSubmitting}
                onConfirm={page.handleConfirm}
                onHide={page.closeConfirmModal}
                restoreAmountInput={page.restoreAmountInput}
                onRestoreAmountChange={page.setRestoreAmountInput}
                manualResetMode={page.manualResetMode}
            />

            <SettingsCard
                enabled={page.settingsEnabled}
                manualResetMode={page.manualResetMode}
                isSubmitting={page.isSubmitting}
                onChange={page.handleToggleSettings}
                onModeChange={page.handleModeChange}
            />

            <FilterBar
                stats={page.stats}
                activeTab={page.activeTab}
                onTabChange={page.setActiveTab}
                selectedCount={page.selectedIds.size}
                isSubmitting={page.isSubmitting}
                onBulkReset={page.handleBulkReset}
                onClearSelection={page.clearSelection}
            />

            <CancelEventsTable
                events={page.events}
                selectedIds={page.selectedIds}
                selectableIds={page.selectableIds}
                allSelected={page.allSelected}
                onToggleSelect={page.toggleSelect}
                onToggleSelectAll={page.toggleSelectAll}
                onResetOne={page.handleResetOne}
                onRestore={page.handleRestore}
                isBusy={page.isBusy}
                isSubmitting={page.isSubmitting}
                currentPage={page.currentPage}
                totalPages={page.totalPages}
                totalItems={page.totalItems}
                perPage={page.perPage}
                startIndex={page.startIndex}
                setCurrentPage={page.setCurrentPage}
                setPerPage={page.setPerPage}
            />

        </s-page>
    );
}
