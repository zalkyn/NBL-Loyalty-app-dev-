/**
 * @file dev-config/shadow-rules/route.jsx
 * @description Admin page for creating/managing ShadowRules — the
 * amount->points rate rules used by POINTS_BACKFILL (see
 * server/jobs/pointsBackfillJob.js). Deliberately NOT exposed on
 * /app/points-rules — see ShadowRule's own schema.prisma comment for why
 * these are kept entirely separate from normal per-order PointsRules.
 *
 * Layout follows the app-wide module pattern (same as
 * layout/physical-prizes-rules):
 *   route.jsx   -> loader, action, thin page composition
 *   _data.js    -> form shape, validation, pagination
 *   _hooks.js   -> client-side state + handlers
 *   components/ -> presentational pieces
 */

import { useActionData, useLoaderData, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import shopCurrency from "@graphql/query/shop/shopCurrency.js";

import { useShadowRulesPage } from "./_hooks";
import { DevConfigNav } from "../components/DevConfigNav";
import { PageHeading } from "./components/PageHeading";
import { ShadowRuleTable } from "./components/ShadowRuleTable";
import { ShadowRuleForm } from "./components/ShadowRuleForm";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";

// ─────────────────────────────────────────────────────────────────────────────
// Shared server-side rate validation — mirrors _data.js's validate() for
// the rate-specific fields (defense in depth: client for UX, server for
// integrity — same pattern as every other rule page in this codebase).
// ─────────────────────────────────────────────────────────────────────────────

function validateRate(data) {
    if (data.rateType === "FIXED") {
        if (!data.fixedPoints || Number(data.fixedPoints) <= 0) return "Fixed points must be greater than 0.";
    } else if (data.rateType === "PER_AMOUNT") {
        if (!data.perAmount || Number(data.perAmount) <= 0) return "Amount must be greater than 0.";
        if (!data.pointsPerUnit || Number(data.pointsPerUnit) <= 0) return "Points per amount must be greater than 0.";
    } else {
        return "Choose a valid rate type.";
    }
    if (data.maxPoints && Number(data.maxPoints) <= 0) return "Max points must be greater than 0 if set.";
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);

    const [rules, currencyCode] = await Promise.all([
        prisma.shadowRule.findMany({
            where: { sessionId: session.id },
            orderBy: { createdAt: "desc" },
            include: { _count: { select: { entries: true } } },
        }),
        // Best-effort — a failed fetch here shouldn't break the whole
        // page; the create/edit form falls back to a plain "shop
        // currency" placeholder label, and the actual save always
        // re-verifies live anyway (see the action below).
        shopCurrency(admin).catch(() => null),
    ]);

    return {
        rules: rules.map((r) => ({ ...r, entryCount: r._count.entries })),
        shopCurrencyCode: currencyCode,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (submitType === "createShadowRule") {
        const data = JSON.parse(formData.get("rule") || "{}");

        if (!data.name?.trim())
            return { message: "Name is required.", status: "error", submitType };

        const rateError = validateRate(data);
        if (rateError) return { message: rateError, status: "error", submitType };

        try {
            // Always re-derived server-side from live Shopify data — never
            // trust a client-submitted currencyCode. A wrong value here
            // would silently misprice every PER_AMOUNT award later (see
            // currencyMatches() in utils/backfill/computePoints.js) with
            // nothing else to catch it.
            const currencyCode = await shopCurrency(admin);
            if (!currencyCode) {
                return { message: "Could not verify your shop's currency — please try again.", status: "error", submitType };
            }

            const created = await prisma.shadowRule.create({
                data: {
                    name: data.name.trim(),
                    description: data.description || null,
                    rateType: data.rateType,
                    fixedPoints: data.rateType === "FIXED" ? Number(data.fixedPoints) : null,
                    perAmount: data.rateType === "PER_AMOUNT" ? Number(data.perAmount) : null,
                    pointsPerUnit: data.rateType === "PER_AMOUNT" ? Number(data.pointsPerUnit) : null,
                    maxPoints: data.maxPoints ? Number(data.maxPoints) : null,
                    currencyCode,
                    isActive: data.isActive ?? false,
                    session: { connect: { id: session.id } },
                },
            });

            return { message: "Shadow rule created.", rule: created, status: "success", submitType };
        } catch (err) {
            console.error("Create ShadowRule Error:", err);
            return { message: err.message || "Failed to create points backfill rule.", status: "error", submitType };
        }
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (submitType === "updateShadowRule") {
        const data = JSON.parse(formData.get("rule") || "{}");

        if (!data.id)
            return { message: "Rule ID is required.", status: "error", submitType };
        if (!data.name?.trim())
            return { message: "Name is required.", status: "error", submitType };

        try {
            const existing = await prisma.shadowRule.findUnique({
                where: { id: parseInt(data.id) },
                include: { _count: { select: { entries: true } } },
            });
            if (!existing || existing.sessionId !== session.id)
                return { message: "Shadow rule not found or access denied.", status: "error", submitType };

            const hasEntries = existing._count.entries > 0;

            let updateData = {
                name: data.name.trim(),
                description: data.description || null,
                isActive: data.isActive ?? false,
            };

            // Calculation-affecting fields are locked once this rule has
            // actually awarded/evaluated any customer — see
            // PointsBackfillEntry.amountSpent's schema comment on why a
            // completed run must stay reproducible from its own records.
            // Silently ignoring a client-submitted change to these fields
            // (rather than erroring) means ShadowRuleForm's "disabled"
            // state is a real guarantee, not just a UI suggestion —
            // someone can't bypass it by editing the request by hand.
            if (!hasEntries) {
                const rateError = validateRate(data);
                if (rateError) return { message: rateError, status: "error", submitType };

                updateData = {
                    ...updateData,
                    rateType: data.rateType,
                    fixedPoints: data.rateType === "FIXED" ? Number(data.fixedPoints) : null,
                    perAmount: data.rateType === "PER_AMOUNT" ? Number(data.perAmount) : null,
                    pointsPerUnit: data.rateType === "PER_AMOUNT" ? Number(data.pointsPerUnit) : null,
                    maxPoints: data.maxPoints ? Number(data.maxPoints) : null,
                };
            }

            const updated = await prisma.shadowRule.update({
                where: { id: parseInt(data.id) },
                data: updateData,
            });

            return { message: "Shadow rule updated.", rule: updated, status: "success", submitType };
        } catch (err) {
            console.error("Update ShadowRule Error:", err);
            return { message: err.message || "Failed to update points backfill rule.", status: "error", submitType };
        }
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (submitType === "deleteShadowRule") {
        const ruleId = parseInt(formData.get("ruleId"));
        if (!ruleId)
            return { message: "Rule ID is required.", status: "error", submitType };

        try {
            const rule = await prisma.shadowRule.findUnique({
                where: { id: ruleId },
                include: { _count: { select: { entries: true } } },
            });
            if (!rule || rule.sessionId !== session.id)
                return { message: "Shadow rule not found or access denied.", status: "error", submitType };

            if (rule._count.entries > 0) {
                return {
                    message: `Can't delete "${rule.name}" — it has already awarded points to ${rule._count.entries.toLocaleString()} customer(s). Deactivate it instead.`,
                    status: "error",
                    submitType,
                };
            }

            await prisma.shadowRule.delete({ where: { id: ruleId } });
            return { message: "Shadow rule deleted.", status: "success", submitType };
        } catch (err) {
            console.error("Delete ShadowRule Error:", err);
            // Backstop for the Restrict FK constraint (Postgres error code
            // P2003 via Prisma) in case of a race between the count check
            // above and this delete — see schema.prisma's own comment on
            // why PointsBackfillEntry.shadowRuleId is Restrict, not Cascade.
            if (err?.code === "P2003") {
                return { message: "Can't delete — this rule has already awarded points to at least one customer.", status: "error", submitType };
            }
            return { message: err.message || "Failed to delete points backfill rule.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function ShadowRulesPage() {
    const loaderData = useLoaderData();
    const actionData = useActionData();

    const page = useShadowRulesPage(loaderData, actionData);
    const isEdit = page.view === "edit";

    return (
        <s-page heading="Points Backfill Rules">
            <DevConfigNav active="points-backfill-rules" />

            <s-section>
                <PageHeading
                    view={page.view}
                    isAnyBusy={page.isAnyBusy}
                    onCreate={page.goToCreate}
                    onBackToList={page.goToList}
                />
            </s-section>

            {page.view === "list" && (
                <ShadowRuleTable
                    rules={page.paginatedRules}
                    currentPage={page.currentPage}
                    totalPages={page.totalPages}
                    isAnyBusy={page.isAnyBusy}
                    onEdit={page.goToEdit}
                    onRequestDelete={page.setDeleteTarget}
                    onPageChange={page.setCurrentPage}
                />
            )}

            {(page.view === "create" || page.view === "edit") && (
                <ShadowRuleForm
                    fs={page.fs}
                    isEdit={isEdit}
                    busy={page.busy}
                    hasEntries={page.editingEntryCount > 0}
                    entryCount={page.editingEntryCount}
                    shopCurrencyCode={loaderData?.shopCurrencyCode}
                    onPrimary={isEdit ? page.handleUpdate : page.handleSave}
                    onDiscard={page.handleDiscard}
                />
            )}

            <DeleteConfirmModal
                deleteTarget={page.deleteTarget}
                isDeleting={page.isDeleting}
                onConfirm={page.handleDelete}
            />
        </s-page>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Same reasoning as the Points Backfill page's own boundary: without one,
 * a failed loader replaces the whole embedded app with a generic frame
 * instead of a page the merchant can retry from.
 *
 * Thrown Responses go straight back to Shopify's boundary — re-auth and
 * app-uninstalled are signalled that way and only work if their headers
 * survive.
 */
export function ErrorBoundary() {
    const error = useRouteError();

    if (isRouteErrorResponse(error)) {
        return boundary.error(error);
    }

    return (
        <s-page heading="Points Backfill Rules">
            <s-section>
                <s-banner tone="critical">
                    <s-paragraph>
                        <strong>This page couldn't load.</strong> Your existing rules are untouched — nothing here
                        was created, changed or deleted.
                    </s-paragraph>
                    {error?.message && (
                        <s-box paddingBlockStart="small">
                            <s-paragraph tone="subdued">{error.message}</s-paragraph>
                        </s-box>
                    )}
                </s-banner>

                <s-box paddingBlockStart="base">
                    <s-button variant="primary" onClick={() => window.location.reload()}>
                        Reload page
                    </s-button>
                </s-box>
            </s-section>
        </s-page>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
