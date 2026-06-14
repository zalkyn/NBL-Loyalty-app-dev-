import { useState, useCallback, useMemo, useEffect } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation, useNavigate } from "react-router";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import { useAppBridge } from "@shopify/app-bridge-react";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const [rules, events] = await Promise.all([
        prisma.pointsRule.findMany({
            where: { sessionId: session.id },
            include: { event: true },
            orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        }),
        prisma.event.findMany({
            where: { sessionId: session.id, isActive: true },
            orderBy: { name: "asc" },
        }),
    ]);

    return { rules, events };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION — delete only
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    if (submitType === "deleteRule") {
        const ruleId = parseInt(formData.get("ruleId"));
        if (!ruleId)
            return { message: "Rule ID is required.", status: "error", submitType };

        try {
            const rule = await prisma.pointsRule.findUnique({ where: { id: ruleId } });
            if (!rule || rule.sessionId !== session.id)
                return { message: "Rule not found or access denied.", status: "error", submitType };

            await prisma.pointsRule.delete({ where: { id: ruleId } });

            // sync app config after delete
            const { default: syncAppConfig } = await import("@controller/metafieldsSync/syncAppConfig");
            await syncAppConfig(admin, session);

            return { message: "Points rule deleted successfully.", status: "success", submitType };
        } catch (err) {
            console.error("Delete Rule Error:", err);
            return { message: err.message || "Failed to delete rule.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** event type → manage route */
const EVENT_ROUTES = {
    ORDER: "/app/new-point-rules/order-event",
    REFERRAL: "/app/new-point-rules/referral-event",
    REVIEW: "/app/new-point-rules/review-event",
};

/** Human-readable earning summary for a rule row */
const getPointsSummary = (r) => {
    const c = r.conditions;
    const type = r.event?.type?.toUpperCase();
    if (!c) return "—";

    if (type === "ORDER") {
        // conditions.order — new structure
        const ord = c.order;
        if (!ord) return "—";
        if (ord.type === "incremental") {
            return `${ord.rate?.points ?? "?"} pt / $${ord.rate?.amount ?? "?"} spent`;
        }
        return `${ord.fixedPoints ?? "?"} pts flat`;
    }

    if (type === "REFERRAL") {
        // conditions.referral.referrer.points — new structure
        const parts = [
            c.referral?.referrer?.points != null
                ? `Referrer: ${c.referral.referrer.points} pts`
                : null,
            c.referral?.referred?.discountValue != null
                ? `Referred: ${c.referral.referred.discountType === "percentage"
                    ? `${c.referral.referred.discountValue}% off`
                    : `$${c.referral.referred.discountValue} off`}`
                : null,
        ].filter(Boolean);
        return parts.length ? parts.join(" · ") : "—";
    }

    if (type === "REVIEW") {
        // conditions.review.text/image/video are now objects { isActive, points }
        const rev = c.review;
        if (!rev) return "—";
        const parts = [
            rev.text?.isActive ? `Text: ${rev.text.points}` : null,
            rev.image?.isActive ? `Photo: ${rev.image.points}` : null,
            rev.video?.isActive ? `Video: ${rev.video.points}` : null,
        ].filter(Boolean);
        return parts.length ? `${parts.join(" · ")} pts` : "—";
    }

    return "—";
};

/** Scope summary for ORDER rules */
const getAppliestoSummary = (r) => {
    const type = r.event?.type?.toUpperCase();
    if (type !== "ORDER") return "—";
    const excludedCount = r.conditions?.order?.excludedProducts?.length ?? 0;
    const groupCount = r.conditions?.order?.groups?.length ?? 0;
    const parts = [];
    if (groupCount > 0) parts.push(`${groupCount} group${groupCount !== 1 ? "s" : ""}`);
    if (excludedCount > 0) parts.push(`${excludedCount} excluded`);
    return parts.length ? parts.join(", ") : "All Products";
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PointsRulesIndexPage() {
    const submit = useSubmit();
    const navigate = useNavigate();
    const loaderData = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const rules = loaderData?.rules ?? [];
    const events = loaderData?.events ?? [];

    // ── Submit state ──────────────────────────────────────────────────────────
    const isDeleting =
        navigation.state === "submitting" &&
        navigation.formData?.get("submitType") === "deleteRule";

    // ── Delete target ─────────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState(null);

    // ── Event selector modal state ────────────────────────────────────────────
    const [selectedEventId, setSelectedEventId] = useState("");

    // ── Pagination ────────────────────────────────────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);
    const PER_PAGE = 10;

    const totalPages = Math.max(1, Math.ceil(rules.length / PER_PAGE));
    const paginatedRules = rules.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    // ── existing event ids (to disable already-added events) ─────────────────
    const existingEventIds = useMemo(() => rules.map((r) => r.eventId), [rules]);

    // Reset page when rules change
    useEffect(() => {
        setCurrentPage(1);
    }, [rules.length]);

    // ── Toast + post-delete cleanup ───────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
        if (actionData.status === "success" && actionData.submitType === "deleteRule") {
            setDeleteTarget(null);
        }
    }, [actionData, shopify]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleDelete = useCallback(() => {
        if (!deleteTarget) return;
        submit({ submitType: "deleteRule", ruleId: deleteTarget.id }, { method: "post" });
    }, [deleteTarget, submit]);

    const handleAddRuleNext = useCallback(() => {
        if (!selectedEventId) return;
        const event = events.find((e) => e.id === parseInt(selectedEventId));
        if (!event) return;
        const route = EVENT_ROUTES[event.type?.toUpperCase()];
        if (!route) return;
        navigate(route);
    }, [selectedEventId, events, navigate]);

    const handleEditRule = useCallback((r) => {
        const route = EVENT_ROUTES[r.event?.type?.toUpperCase()];
        if (!route) return;
        navigate(`${route}?ruleId=${r.id}`);
    }, [navigate]);

    const getEventName = (eventId) =>
        events.find((e) => e.id === parseInt(eventId))?.name ?? "—";

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <s-page inlineSize="base">

            {/* ── Page header ── */}
            <s-section>
                <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                    <s-stack direction="block" gap="extra-small">
                        <h2 style={{ marginBlock: "0" }}>Points Rules</h2>
                        <s-text tone="subdued">
                            Manage how customers earn points for each event.
                        </s-text>
                    </s-stack>
                    <s-button
                        variant="primary"
                        commandFor="event-selector-modal"
                        command="--show"
                    >
                        Add New Rule
                    </s-button>
                </s-grid>
            </s-section>

            {/* ── Rules table ── */}
            <s-section>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Rule Name</s-table-header>
                        <s-table-header>Event</s-table-header>
                        <s-table-header>Earning</s-table-header>
                        <s-table-header>Scope</s-table-header>
                        <s-table-header>Active</s-table-header>
                        <s-table-header>Actions</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {paginatedRules.length === 0 ? (
                            <s-table-row>
                                <s-table-cell colSpan="6" style={{ textAlign: "center", padding: "3rem" }}>
                                    No rules yet. Click "Add New Rule" to get started.
                                </s-table-cell>
                            </s-table-row>
                        ) : (
                            paginatedRules.map((r) => (
                                <s-table-row key={r.id}>
                                    <s-table-cell>
                                        {r.name || getEventName(r.eventId)}
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-badge>{r.event?.type || "—"}</s-badge>
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-text>{getPointsSummary(r)}</s-text>
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-text tone="subdued">{getAppliestoSummary(r)}</s-text>
                                    </s-table-cell>
                                    <s-table-cell>
                                        {r.isActive ? "✅ Yes" : "❌ No"}
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-stack direction="inline" gap="small">
                                            <s-button
                                                variant="text"
                                                size="small"
                                                icon="edit"
                                                disabled={isDeleting}
                                                onClick={() => handleEditRule(r)}
                                            />
                                            <s-button
                                                variant="text"
                                                size="small"
                                                icon="delete"
                                                destructive
                                                disabled={isDeleting}
                                                onClick={() => setDeleteTarget(r)}
                                                commandFor="delete-modal"
                                                command="--show"
                                            />
                                        </s-stack>
                                    </s-table-cell>
                                </s-table-row>
                            ))
                        )}
                    </s-table-body>
                </s-table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <s-stack
                        direction="inline"
                        justifyContent="center"
                        gap="small"
                        style={{ marginBlockStart: "1rem" }}
                    >
                        <s-button
                            variant="plain"
                            disabled={currentPage === 1 || isDeleting}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        >
                            ← Prev
                        </s-button>
                        <s-text>Page {currentPage} of {totalPages}</s-text>
                        <s-button
                            variant="plain"
                            disabled={currentPage === totalPages || isDeleting}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        >
                            Next →
                        </s-button>
                    </s-stack>
                )}
            </s-section>

            {/* ── Event Selector Modal ── */}
            <s-modal
                id="event-selector-modal"
                heading="Select Event Type"
                size="small"
            >
                <s-paragraph>
                    Choose the event you want to create a points rule for.
                </s-paragraph>
                <s-box paddingBlockEnd="base" />
                <s-select
                    label="Points Event"
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                >
                    <s-option value="">Select an event</s-option>
                    {events.map((ev) => {
                        const taken = existingEventIds.includes(ev.id);
                        return (
                            <s-option
                                key={ev.id}
                                value={ev.id}
                                disabled={taken}
                            >
                                {ev.name} ({ev.type}){taken ? " — Already Added" : ""}
                            </s-option>
                        );
                    })}
                </s-select>

                {/* Modal actions */}
                <s-button
                    slot="secondary-actions"
                    commandFor="event-selector-modal"
                    command="--hide"
                    onClick={() => setSelectedEventId("")}
                >
                    Cancel
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    disabled={!selectedEventId}
                    commandFor="event-selector-modal"
                    command="--hide"
                    onClick={handleAddRuleNext}
                >
                    Next
                </s-button>
            </s-modal>

            {/* ── Delete Confirmation Modal ── */}
            <s-modal
                id="delete-modal"
                heading="Delete Points Rule"
                size="small"
            >
                {deleteTarget && (
                    <s-paragraph tone="subdued">
                        Are you sure you want to delete{" "}
                        <strong>
                            {deleteTarget.name || getEventName(deleteTarget.eventId)}
                        </strong>
                        ? This action cannot be undone.
                    </s-paragraph>
                )}

                <s-button
                    slot="secondary-actions"
                    commandFor="delete-modal"
                    command="--hide"
                    disabled={isDeleting}
                    onClick={() => setDeleteTarget(null)}
                >
                    Cancel
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    destructive
                    loading={isDeleting}
                    disabled={isDeleting || !deleteTarget}
                    onClick={handleDelete}
                    commandFor="delete-modal"
                    command="--hide"
                >
                    Yes, Delete
                </s-button>
            </s-modal>

        </s-page>
    );
}