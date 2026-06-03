import { useEffect, useState, useMemo, useCallback } from "react";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";

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
// ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ── CREATE ──
    if (submitType === "addRule") {
        const newRule = JSON.parse(formData.get("rule") || "{}");
        const conditions = JSON.parse(formData.get("conditions") || "{}");

        if (!newRule.eventId)
            return { message: "Please select a Points event.", status: "error", submitType };

        try {
            const existing = await prisma.pointsRule.findFirst({
                where: { eventId: parseInt(newRule.eventId), sessionId: session.id },
            });
            if (existing)
                return { message: "A rule for this event already exists.", status: "error", submitType };

            const created = await prisma.pointsRule.create({
                data: {
                    name: newRule.name || null,
                    description: newRule.description || null,
                    priority: newRule.priority ? parseInt(newRule.priority) : 0,
                    startDate: newRule.startDate ? new Date(newRule.startDate) : null,
                    endDate: newRule.endDate ? new Date(newRule.endDate) : null,
                    isActive: newRule.isActive ?? true,
                    conditions,
                    session: { connect: { id: session.id } },
                    event: { connect: { id: parseInt(newRule.eventId) } },
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule created successfully.", rule: created, status: "success", submitType };
        } catch (err) {
            console.error("Create PointsRule Error:", err);
            return { message: "Failed to create rule. Please try again.", status: "error", submitType };
        }
    }

    // ── UPDATE ──
    if (submitType === "updateRule") {
        const updatedRule = JSON.parse(formData.get("rule") || "{}");
        const conditions = JSON.parse(formData.get("conditions") || "{}");

        if (!updatedRule.id || !updatedRule.eventId)
            return { message: "Rule ID and event are required.", status: "error", submitType };

        try {
            const existing = await prisma.pointsRule.findUnique({ where: { id: parseInt(updatedRule.id) } });
            if (!existing || existing.sessionId !== session.id)
                return { message: "Rule not found or access denied.", status: "error", submitType };

            const duplicate = await prisma.pointsRule.findFirst({
                where: {
                    eventId: parseInt(updatedRule.eventId),
                    sessionId: session.id,
                    NOT: { id: parseInt(updatedRule.id) },
                },
            });
            if (duplicate)
                return { message: "Another rule for this event already exists.", status: "error", submitType };

            const rule = await prisma.pointsRule.update({
                where: { id: parseInt(updatedRule.id) },
                data: {
                    name: updatedRule.name || null,
                    description: updatedRule.description || null,
                    priority: updatedRule.priority ? parseInt(updatedRule.priority) : 0,
                    startDate: updatedRule.startDate ? new Date(updatedRule.startDate) : null,
                    endDate: updatedRule.endDate ? new Date(updatedRule.endDate) : null,
                    isActive: updatedRule.isActive ?? true,
                    conditions,
                    event: { connect: { id: parseInt(updatedRule.eventId) } },
                    session: { connect: { id: session.id } },
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule updated successfully.", rule, status: "success", submitType };
        } catch (err) {
            console.error("Update Rule Error:", err);
            return { message: "Failed to update rule. Please try again.", status: "error", submitType };
        }
    }

    // ── DELETE ──
    if (submitType === "deleteRule") {
        const ruleId = parseInt(formData.get("ruleId"));
        if (!ruleId)
            return { message: "Rule ID is required.", status: "error", submitType };

        try {
            const rule = await prisma.pointsRule.findUnique({ where: { id: ruleId } });
            if (!rule || rule.sessionId !== session.id)
                return { message: "Rule not found or access denied.", status: "error", submitType };

            await prisma.pointsRule.delete({ where: { id: ruleId } });
            await syncAppConfig(admin, session);
            return { message: "Points rule deleted successfully.", status: "success", submitType };
        } catch (err) {
            console.error("Delete Rule Error:", err);
            return { message: err.message || "Failed to delete rule. Please try again.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT STATE
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_RULE = {
    id: null,
    eventId: null,
    name: "",
    description: "",
    priority: 1,
    startDate: null,
    endDate: null,
    isActive: true,
};

const EMPTY_CONDITIONS = {
    earning: {
        type: "fixed",
        fixedPoints: 10,
        rate: { amount: 10, points: 1 },
    },
    appliesTo: {
        type: "allProducts",
        products: [],
        collections: [],
        excludedProducts: [],
    },
    referral: {
        trigger: "subscription",
        referrer: {
            firstOrderPoints: 100,
            allowRenewalReward: true,
            renewalPoints: 80,
        },
        referred: {
            discountType: "fixed",
            discountValue: 10,
            allowRenewalReward: false,
            renewalPoints: 50,
        },
    },
    review: {
        text: 10,
        image: 20,
        video: 30,
        rewardMode: "per_type",
    },
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PointsRulePage() {
    const submit = useSubmit();
    const loaderData = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    // ── Derived submit state ──────────────────────────────────────────────────
    const pendingSubmitType = navigation.formData?.get("submitType") ?? null;
    const isSubmitting = navigation.state === "submitting";

    const isSaving = isSubmitting && pendingSubmitType === "addRule";
    const isUpdating = isSubmitting && pendingSubmitType === "updateRule";
    const isDeleting = isSubmitting && pendingSubmitType === "deleteRule";
    const isAnyBusy = isSubmitting;

    // ── View: "list" | "create" | "edit" ─────────────────────────────────────
    const [view, setView] = useState("list");

    // ── Form state ────────────────────────────────────────────────────────────
    const [rule, setRule] = useState(EMPTY_RULE);
    const [conditions, setConditions] = useState(EMPTY_CONDITIONS);

    // Snapshot for hasChanges (edit only)
    const [savedRule, setSavedRule] = useState(EMPTY_RULE);
    const [savedConditions, setSavedConditions] = useState(EMPTY_CONDITIONS);

    // ── Delete target ─────────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState(null);

    // ── Pagination ────────────────────────────────────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);
    const PER_PAGE = 10;

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION DATA EFFECT — toast + navigation
    // FIX: added `shopify` to dependency array
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!actionData) return;

        const isError = actionData.status === "error";
        shopify.toast.show(actionData.message, { isError });

        if (actionData.status === "success") {
            if (actionData.submitType === "addRule" || actionData.submitType === "updateRule") {
                setView("list");
                setRule(clone(EMPTY_RULE));
                setConditions(clone(EMPTY_CONDITIONS));
                setSavedRule(clone(EMPTY_RULE));
                setSavedConditions(clone(EMPTY_CONDITIONS));
            }
            if (actionData.submitType === "deleteRule") {
                setDeleteTarget(null);
            }
        }
    }, [actionData, shopify]);

    // Reset to page 1 when rule count changes
    useEffect(() => {
        setCurrentPage(1);
    }, [loaderData?.rules?.length]);

    // ─────────────────────────────────────────────────────────────────────────
    // DERIVED VALUES
    // ─────────────────────────────────────────────────────────────────────────

    const rules = loaderData?.rules ?? [];
    const events = loaderData?.events ?? [];

    const existingEventIds = useMemo(() => rules.map((r) => r.eventId), [rules]);

    const totalPages = Math.max(1, Math.ceil(rules.length / PER_PAGE));
    const paginatedRules = rules.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    const selectedEvent = useMemo(
        () => events.find((e) => e.id === parseInt(rule.eventId)),
        [rule.eventId, events]
    );
    const eventType = selectedEvent?.type?.toUpperCase();

    const hasChanges =
        view === "edit" &&
        (JSON.stringify(rule) !== JSON.stringify(savedRule) ||
            JSON.stringify(conditions) !== JSON.stringify(savedConditions));

    // ─────────────────────────────────────────────────────────────────────────
    // NAVIGATION HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    const goToCreate = useCallback(() => {
        setRule(clone(EMPTY_RULE));
        setConditions(clone(EMPTY_CONDITIONS));
        setView("create");
    }, []);

    const goToEdit = useCallback((r) => {
        const editRule = {
            id: r.id,
            eventId: r.eventId,
            name: r.name ?? "",
            description: r.description ?? "",
            priority: r.priority ?? 1,
            startDate: r.startDate ?? null,
            endDate: r.endDate ?? null,
            isActive: r.isActive ?? true,
        };
        const editConds = r.conditions ? clone(r.conditions) : clone(EMPTY_CONDITIONS);

        setRule(editRule);
        setConditions(editConds);
        setSavedRule(clone(editRule));
        setSavedConditions(clone(editConds));
        setView("edit");
    }, []);

    // FIX: also reset savedRule/savedConditions when navigating back to list
    const goToList = useCallback(() => {
        setView("list");
        setRule(clone(EMPTY_RULE));
        setConditions(clone(EMPTY_CONDITIONS));
        setSavedRule(clone(EMPTY_RULE));
        setSavedConditions(clone(EMPTY_CONDITIONS));
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // FIELD HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    const setRuleField = useCallback((field, value) => {
        setRule((prev) => ({ ...prev, [field]: value }));
    }, []);

    // Deep-set by path array, e.g. ["earning", "rate", "points"]
    const setCondPath = useCallback((path, value) => {
        setConditions((prev) => {
            const next = clone(prev);
            let cur = next;
            for (let i = 0; i < path.length - 1; i++) {
                if (cur[path[i]] == null || typeof cur[path[i]] !== "object") cur[path[i]] = {};
                cur = cur[path[i]];
            }
            cur[path[path.length - 1]] = value;
            return next;
        });
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT SELECTION
    // FIX: added `events` to dependency array (was missing, causing stale closure)
    // ─────────────────────────────────────────────────────────────────────────

    const handleEventChange = useCallback((e) => {
        const id = Number(e.target.value) || null;
        const ev = events.find((x) => x.id === id);

        setConditions((prev) => ({
            ...clone(EMPTY_CONDITIONS),
            earning: {
                ...prev.earning,
                type: ev?.type === "ORDER" ? "incremental" : "fixed",
            },
        }));
        setRule((prev) => ({ ...prev, eventId: id }));
    }, [events]);

    // ─────────────────────────────────────────────────────────────────────────
    // RESOURCE PICKER
    // ─────────────────────────────────────────────────────────────────────────

    const openResourcePicker = useCallback(async (resourceType, field) => {
        const selectionIds = (conditions.appliesTo[field] || []).map((p) => ({ id: p.id }));
        const result = await shopify.resourcePicker({
            type: resourceType,
            multiple: true,
            selectionIds,
            filter: { variants: false },
        });
        if (result?.selection?.length > 0) {
            const mapped = result.selection.map((s) => ({
                id: s.id,
                title: s.title,
                image: s.images?.[0]?.originalSrc ?? null,
                handle: s.handle,
            }));
            setCondPath(["appliesTo", field], mapped);
        }
    }, [conditions.appliesTo, setCondPath, shopify]);

    const removeAppliesItem = useCallback((field, id) => {
        setConditions((prev) => ({
            ...prev,
            appliesTo: {
                ...prev.appliesTo,
                [field]: prev.appliesTo[field].filter((item) => item.id !== id),
            },
        }));
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────────────────────────────────

    const validate = useCallback(() => {
        if (!rule.eventId) {
            shopify.toast.show("Please select a Points event.", { isError: true });
            return false;
        }
        if (eventType === "ORDER") {
            const earning = conditions.earning;
            if (earning?.type === "fixed" && !(Number(earning?.fixedPoints) > 0)) {
                shopify.toast.show("Fixed points must be greater than 0.", { isError: true });
                return false;
            }
            if (earning?.type === "incremental") {
                if (!(Number(earning?.rate?.points) > 0)) {
                    shopify.toast.show("Points per rate must be greater than 0.", { isError: true });
                    return false;
                }
                if (!(Number(earning?.rate?.amount) > 0)) {
                    shopify.toast.show("Amount per rate must be greater than 0.", { isError: true });
                    return false;
                }
            }
        }
        if (eventType === "REFERRAL") {
            if (!(Number(conditions.referral?.referrer?.firstOrderPoints) >= 0)) {
                shopify.toast.show("Referrer first order points cannot be empty.", { isError: true });
                return false;
            }
        }
        return true;
    }, [rule.eventId, eventType, conditions, shopify]);

    // ─────────────────────────────────────────────────────────────────────────
    // SUBMIT HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    const handleSave = useCallback(() => {
        if (!validate()) return;
        submit(
            { submitType: "addRule", rule: JSON.stringify(rule), conditions: JSON.stringify(conditions) },
            { method: "post" }
        );
    }, [rule, conditions, submit, validate]);

    const handleUpdate = useCallback(() => {
        if (!validate()) return;
        submit(
            { submitType: "updateRule", rule: JSON.stringify(rule), conditions: JSON.stringify(conditions) },
            { method: "post" }
        );
    }, [rule, conditions, submit, validate]);

    const handleDelete = useCallback(() => {
        if (!deleteTarget) return;
        submit({ submitType: "deleteRule", ruleId: deleteTarget.id }, { method: "post" });
    }, [deleteTarget, submit]);

    // ─────────────────────────────────────────────────────────────────────────
    // DISPLAY HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    const getEventName = (eventId) =>
        events.find((e) => e.id === parseInt(eventId))?.name ?? "—";

    /**
     * Returns a human-readable earning summary for a rule row.
     */
    const getPointsSummary = (r) => {
        const c = r.conditions;
        const type = r.event?.type?.toUpperCase();

        if (!c) return "—";

        if (type === "ORDER") {
            if (c.earning?.type === "incremental") {
                const pts = c.earning?.rate?.points ?? "?";
                const amt = c.earning?.rate?.amount ?? "?";
                return `${pts} pt / $${amt} spent`;
            }
            return `${c.earning?.fixedPoints ?? "?"} pts flat`;
        }

        if (type === "REFERRAL") {
            const referrer = c.referral?.referrer;
            const referred = c.referral?.referred;

            const referrerPart = referrer?.firstOrderPoints != null
                ? `Referrer: ${referrer.firstOrderPoints} pts`
                : null;

            const referredPart = referred?.discountValue != null
                ? `Referred: ${referred.discountType === "percentage"
                    ? `${referred.discountValue}% off`
                    : `$${referred.discountValue} off`}`
                : null;

            const parts = [referrerPart, referredPart].filter(Boolean);
            return parts.length ? parts.join(" · ") : "—";
        }

        if (type === "REVIEW") {
            const rev = c.review;
            if (!rev) return "—";
            const parts = [
                rev.text != null ? `Text: ${rev.text}` : null,
                rev.image != null ? `Photo: ${rev.image}` : null,
                rev.video != null ? `Video: ${rev.video}` : null,
            ].filter(Boolean);
            return parts.length ? `${parts.join(" · ")} pts` : "—";
        }

        if (c.earning?.type === "incremental") {
            const pts = c.earning?.rate?.points ?? "?";
            const amt = c.earning?.rate?.amount ?? "?";
            return `${pts} pt / $${amt}`;
        }
        return c.earning?.fixedPoints != null
            ? `${c.earning.fixedPoints} pts`
            : "—";
    };

    /**
     * FIX: was called in renderTable but never defined — now added.
     * Returns a human-readable "applies to" scope summary for ORDER rules.
     * For non-ORDER rules it returns "—" since scope is not applicable.
     */
    const getAppliestoSummary = (r) => {
        const type = r.event?.type?.toUpperCase();
        if (type !== "ORDER") return "—";

        const appliesTo = r.conditions?.appliesTo;
        if (!appliesTo) return "All Products";

        if (appliesTo.type === "specificProducts") {
            const count = appliesTo.products?.length ?? 0;
            return count > 0 ? `${count} product${count !== 1 ? "s" : ""}` : "Specific (none)";
        }

        // allProducts — show excluded count if any
        const excludedCount = appliesTo.excludedProducts?.length ?? 0;
        if (excludedCount > 0) {
            return `All (${excludedCount} excluded)`;
        }
        return "All Products";
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — header bar
    // ─────────────────────────────────────────────────────────────────────────

    const renderHeading = () => {
        if (view === "list") {
            return (
                <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                    <h2 style={{ marginBlock: "0" }}>Points Rules</h2>
                    <s-button
                        variant="primary"
                        onClick={goToCreate}
                        disabled={isAnyBusy}
                    >
                        Add New Rule
                    </s-button>
                </s-grid>
            );
        }

        if (view === "create") {
            return (
                <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-button
                            variant="plain"
                            onClick={goToList}
                            disabled={isAnyBusy}
                            style={{ padding: 0, minHeight: "unset" }}
                        >
                            Rules
                        </s-button>
                        <s-text tone="subdued">›</s-text>
                        <h2 style={{ marginBlock: "0" }}>Create New Rule</h2>
                    </s-stack>
                    <s-stack direction="inline" gap="base" alignItems="center">
                        <s-button onClick={goToList} disabled={isAnyBusy}>
                            Cancel
                        </s-button>
                        <s-button
                            variant="primary"
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={isSaving || !rule.eventId}
                        >
                            Save Rule
                        </s-button>
                    </s-stack>
                </s-grid>
            );
        }

        // edit
        return (
            <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                <s-stack direction="inline" gap="small" alignItems="center">
                    <s-button
                        variant="plain"
                        onClick={goToList}
                        disabled={isAnyBusy}
                        style={{ padding: 0, minHeight: "unset" }}
                    >
                        Rules
                    </s-button>
                    <s-text tone="subdued">›</s-text>
                    <h2 style={{ marginBlock: "0" }}>Edit — {selectedEvent?.type ?? "Rule"}</h2>
                </s-stack>
                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-button onClick={goToList} disabled={isAnyBusy}>Cancel</s-button>
                    <s-button
                        variant="primary"
                        onClick={handleUpdate}
                        loading={isUpdating}
                        disabled={isUpdating || !hasChanges}
                    >
                        Update Rule
                    </s-button>
                </s-stack>
            </s-grid>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — rules table
    // ─────────────────────────────────────────────────────────────────────────

    const renderTable = () => (
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

                                {/* FIX: getAppliestoSummary now defined above */}
                                <s-table-cell>
                                    <s-text tone="subdued">
                                        {getAppliestoSummary(r)}
                                    </s-text>
                                </s-table-cell>

                                <s-table-cell>{r.isActive ? "✅ Yes" : "❌ No"}</s-table-cell>

                                <s-table-cell>
                                    <s-stack gap="small" direction="inline">
                                        <s-button
                                            variant="text"
                                            size="small"
                                            icon="edit"
                                            disabled={isAnyBusy}
                                            onClick={() => goToEdit(r)}
                                        />
                                        <s-button
                                            variant="text"
                                            size="small"
                                            icon="delete"
                                            destructive
                                            disabled={isAnyBusy}
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

            {totalPages > 1 && (
                <s-stack direction="inline" justifyContent="center" gap="small" style={{ marginBlockStart: "1rem" }}>
                    <s-button
                        variant="plain"
                        disabled={currentPage === 1 || isAnyBusy}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                        ← Prev
                    </s-button>
                    <s-text>Page {currentPage} of {totalPages}</s-text>
                    <s-button
                        variant="plain"
                        disabled={currentPage === totalPages || isAnyBusy}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                        Next →
                    </s-button>
                </s-stack>
            )}
        </s-section>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — event selector (create only)
    // ─────────────────────────────────────────────────────────────────────────

    const renderEventSelector = () => (
        <s-section>
            <s-heading>Select Points Event (Required)</s-heading>
            <s-box paddingBlockEnd="small" />
            <s-select
                label="Points event *"
                labelAccessibilityVisibility="exclusive"
                value={rule.eventId ?? ""}
                disabled={isSaving}
                onChange={handleEventChange}
            >
                <s-option value="">Select a Points event</s-option>
                {events.map((ev) => {
                    const taken = existingEventIds.includes(ev.id);
                    return (
                        <s-option key={ev.id} value={ev.id} disabled={taken}>
                            {ev.name} ({ev.type}){taken ? " — Already Added" : ""}
                        </s-option>
                    );
                })}
            </s-select>
        </s-section>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — ORDER conditions
    // ─────────────────────────────────────────────────────────────────────────

    const renderOrderConditions = () => {
        const earning = conditions.earning;
        const appliesTo = conditions.appliesTo;
        const busy = isSaving || isUpdating;

        return (
            <>
                <s-section>
                    <s-heading>Earning Method</s-heading>
                    <s-choice-list
                        name="earningMethod"
                        value={[earning?.type ?? "fixed"]}
                        onInput={(e) => {
                            const val = e.currentTarget.values[0];
                            setConditions((prev) => ({
                                ...prev,
                                earning: {
                                    ...prev.earning,
                                    type: val,
                                    rate: val === "incremental" ? { amount: 10, points: 1 } : prev.earning.rate,
                                    fixedPoints: val === "fixed" ? 10 : prev.earning.fixedPoints,
                                },
                            }));
                        }}
                    >
                        <s-choice value="incremental" selected={earning?.type === "incremental"}>
                            Incremented Points (Recommended)
                        </s-choice>
                        <s-choice value="fixed" selected={earning?.type === "fixed"}>
                            Fixed Amount of Points
                        </s-choice>
                    </s-choice-list>
                </s-section>

                <s-box paddingBlockEnd="base" />

                <s-section>
                    <s-heading>Earning Points</s-heading>
                    <s-box paddingBlockEnd="small" />
                    {earning?.type === "incremental" ? (
                        <s-grid gridTemplateColumns="1fr auto 1fr" gap="large" alignItems="center">
                            <s-number-field
                                label="Points" labelAccessibilityVisibility="exclusive"
                                suffix="points" step={1} min={1}
                                value={earning?.rate?.points ?? ""}
                                disabled={busy}
                                onInput={(e) => setCondPath(["earning", "rate", "points"], e.target.value ? Number(e.target.value) : 0)}
                            />
                            <s-text>for every</s-text>
                            <s-number-field
                                label="Amount" labelAccessibilityVisibility="exclusive"
                                prefix="$" suffix="spent" step={1} min={1}
                                value={earning?.rate?.amount ?? ""}
                                disabled={busy}
                                onInput={(e) => setCondPath(["earning", "rate", "amount"], e.target.value ? Number(e.target.value) : 0)}
                            />
                        </s-grid>
                    ) : (
                        <s-number-field
                            label="Points" labelAccessibilityVisibility="exclusive"
                            suffix="points"
                            value={earning?.fixedPoints ?? ""}
                            disabled={busy}
                            onInput={(e) => setCondPath(["earning", "fixedPoints"], e.target.value ? Number(e.target.value) : 0)}
                        />
                    )}
                </s-section>

                <s-box paddingBlockEnd="base" />

                <s-section>
                    <s-heading>Applies To</s-heading>
                    <s-box paddingBlockEnd="small" />
                    <s-choice-list
                        name="appliesToType"
                        value={[appliesTo?.type ?? "allProducts"]}
                        onInput={(e) => {
                            const val = e.currentTarget.values[0];
                            setConditions((prev) => ({
                                ...prev,
                                appliesTo: { ...prev.appliesTo, type: val, products: [], collections: [] },
                            }));
                        }}
                    >
                        <s-choice value="allProducts" selected={appliesTo?.type === "allProducts"}>All Products</s-choice>
                        <s-choice value="specificProducts" selected={appliesTo?.type === "specificProducts"}>Specific Products</s-choice>
                    </s-choice-list>
                </s-section>

                <s-box paddingBlockEnd="base" />

                {appliesTo?.type === "specificProducts" && (
                    <s-section>
                        <s-heading>Select Specific Products</s-heading>
                        <s-text>Only selected products are eligible for earning points.</s-text>
                        <s-box paddingBlockEnd="base" />
                        <s-stack direction="inline" gap="base" alignItems="center">
                            <s-button
                                variant="primary"
                                disabled={busy}
                                onClick={() => openResourcePicker("product", "products")}
                            >
                                Select Products
                            </s-button>
                            {appliesTo.products.length > 0 && (
                                <s-text>{appliesTo.products.length} product(s) selected</s-text>
                            )}
                        </s-stack>
                        <s-box paddingBlockEnd="base" />
                        {renderItemList(appliesTo.products, "products", busy)}
                    </s-section>
                )}

                {appliesTo?.type === "allProducts" && (
                    <s-section>
                        <s-heading>Excluded Products (Optional)</s-heading>
                        <s-text>Orders containing these products will not earn points.</s-text>
                        <s-box paddingBlockEnd="base" />
                        <s-stack direction="inline" gap="base" alignItems="center">
                            <s-button
                                variant="primary"
                                disabled={busy}
                                onClick={() => openResourcePicker("product", "excludedProducts")}
                            >
                                Select Excluded Products
                            </s-button>
                            {appliesTo.excludedProducts.length > 0 && (
                                <s-text>{appliesTo.excludedProducts.length} excluded</s-text>
                            )}
                        </s-stack>
                        <s-box paddingBlockEnd="base" />
                        {renderItemList(appliesTo.excludedProducts, "excludedProducts", busy)}
                    </s-section>
                )}
            </>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — shared product list
    // ─────────────────────────────────────────────────────────────────────────

    const renderItemList = (list, field, busy) => {
        if (!list?.length) return null;
        return (
            <s-ordered-list>
                {list.map((p) => (
                    <s-list-item key={p.id}>
                        <s-grid gridTemplateColumns="1fr 50px" gap="base" alignItems="center">
                            <s-text>{p.title}</s-text>
                            <s-button
                                icon="delete" variant="text"
                                disabled={busy}
                                onClick={() => removeAppliesItem(field, p.id)}
                            />
                        </s-grid>
                    </s-list-item>
                ))}
            </s-ordered-list>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — REFERRAL conditions
    // ─────────────────────────────────────────────────────────────────────────

    const renderReferralConditions = () => {
        const ref = conditions.referral;
        const busy = isSaving || isUpdating;

        const updRef = (path, value) => setCondPath(["referral", ...path], value);

        return (
            <>
                <s-section>
                    <s-heading>Referral Type</s-heading>
                    <s-choice-list
                        name="referralTrigger"
                        onInput={(e) => updRef(["trigger"], e.currentTarget.values[0])}
                    >
                        <s-choice value="oneTime" selected={ref?.trigger === "oneTime"}>One-time Referral</s-choice>
                        <s-choice value="subscription" selected={ref?.trigger === "subscription"}>Subscription-based Referral</s-choice>
                    </s-choice-list>
                    <s-text>One-time = only first purchase. Subscription = recurring rewards on renewals.</s-text>
                </s-section>

                <s-box paddingBlockEnd="base" />

                <s-section>
                    <s-heading>Referred Customer Benefits</s-heading>
                    <s-choice-list
                        onInput={(e) => updRef(["referred", "discountType"], e.currentTarget.values[0])}
                    >
                        <s-choice value="fixed" selected={ref?.referred?.discountType === "fixed"}>Fixed Discount</s-choice>
                        <s-choice value="percentage" selected={ref?.referred?.discountType === "percentage"}>Percentage Discount</s-choice>
                    </s-choice-list>
                    <s-box paddingBlockEnd="base" />
                    <s-number-field
                        label="Discount Value"
                        value={ref?.referred?.discountValue ?? ""}
                        prefix={ref?.referred?.discountType === "fixed" ? "$" : ""}
                        suffix={ref?.referred?.discountType === "percentage" ? "%" : ""}
                        details="Applied on the referred customer's first order."
                        disabled={busy}
                        onInput={(e) => updRef(["referred", "discountValue"], e.target.value === "" ? "" : Number(e.target.value))}
                    />
                    <s-box paddingBlockEnd="base" />
                    <s-switch
                        labelAccessibilityVisibility="exclusion"
                        label={ref?.referred?.allowRenewalReward ? "Renewal Reward Enabled" : "Renewal Reward Disabled"}
                        checked={ref?.referred?.allowRenewalReward}
                        disabled={busy}
                        onChange={(e) => updRef(["referred", "allowRenewalReward"], e.target.checked)}
                        details="Give referred customers points on subscription renewals."
                    />
                    {ref?.referred?.allowRenewalReward && (
                        <>
                            <s-box paddingBlockEnd="base" />
                            <s-number-field
                                label="Renewal Reward Points"
                                value={ref?.referred?.renewalPoints ?? ""}
                                details="Points earned by referred customers on each renewal."
                                disabled={busy}
                                onInput={(e) => updRef(["referred", "renewalPoints"], e.target.value === "" ? "" : Number(e.target.value))}
                            />
                        </>
                    )}
                </s-section>

                <s-box paddingBlockEnd="base" />

                <s-section>
                    <s-heading>Referrer Rewards</s-heading>
                    <s-number-field
                        label="First Order Reward Points"
                        value={ref?.referrer?.firstOrderPoints ?? ""}
                        details="Points given to the referrer when their friend places a first order."
                        disabled={busy}
                        onInput={(e) => updRef(["referrer", "firstOrderPoints"], e.target.value === "" ? "" : Number(e.target.value))}
                    />
                    <s-box paddingBlockEnd="base" />
                    <s-switch
                        labelAccessibilityVisibility="exclusion"
                        label={ref?.referrer?.allowRenewalReward ? "Renewal Reward Enabled" : "Renewal Reward Disabled"}
                        checked={ref?.referrer?.allowRenewalReward}
                        disabled={busy}
                        onChange={(e) => updRef(["referrer", "allowRenewalReward"], e.target.checked)}
                        details="Referrers earn points on every renewal from customers they referred."
                    />
                    {ref?.referrer?.allowRenewalReward && (
                        <>
                            <s-box paddingBlockEnd="base" />
                            <s-number-field
                                label="Renewal Reward Points"
                                value={ref?.referrer?.renewalPoints ?? ""}
                                details="Points awarded to the referrer on each renewal."
                                disabled={busy}
                                onInput={(e) => updRef(["referrer", "renewalPoints"], e.target.value === "" ? "" : Number(e.target.value))}
                            />
                        </>
                    )}
                </s-section>
            </>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — REVIEW conditions
    // ─────────────────────────────────────────────────────────────────────────

    const renderReviewConditions = () => {
        const rev = conditions.review;
        const busy = isSaving || isUpdating;

        const TYPES = [
            { key: "text", label: "Text Review" },
            { key: "image", label: "Photo Review" },
            { key: "video", label: "Video Review" },
        ];
        const MODES = [
            { value: "once", label: "Once per product (any review type)" },
            { value: "per_type", label: "Once per review type per product (default)" },
            { value: "unlimited", label: "Every submission earns points" },
        ];

        return (
            <>
                <s-section>
                    <s-heading>Points per Review Type</s-heading>
                    <s-text>Set how many points each review type earns.</s-text>
                    <s-box paddingBlockEnd="base" />
                    {TYPES.map(({ key, label }) => (
                        <s-box key={key} paddingBlockEnd="base">
                            <s-number-field
                                label={label} suffix="points"
                                value={rev?.[key] ?? ""}
                                disabled={busy}
                                onInput={(e) => setCondPath(["review", key], e.target.value ? Number(e.target.value) : 0)}
                            />
                        </s-box>
                    ))}
                </s-section>

                <s-box paddingBlockEnd="base" />

                <s-section>
                    <s-heading>Reward Mode</s-heading>
                    <s-text>Controls how many times a customer can earn review points per product.</s-text>
                    <s-box paddingBlockEnd="small" />
                    <s-choice-list
                        name="rewardMode"
                        onInput={(e) => setCondPath(["review", "rewardMode"], e.currentTarget.values[0])}
                    >
                        {MODES.map(({ value, label }) => (
                            <s-choice key={value} value={value} selected={(rev?.rewardMode ?? "per_type") === value}>
                                {label}
                            </s-choice>
                        ))}
                    </s-choice-list>
                </s-section>
            </>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — fallback fixed points (other event types)
    // ─────────────────────────────────────────────────────────────────────────

    const renderDefaultConditions = () => {
        const busy = isSaving || isUpdating;
        return (
            <s-section>
                <s-heading>Earning Points</s-heading>
                <s-box paddingBlockEnd="small" />
                <s-number-field
                    label="Points" labelAccessibilityVisibility="exclusive"
                    suffix="points"
                    value={conditions.earning?.fixedPoints ?? ""}
                    disabled={busy}
                    onInput={(e) => setCondPath(["earning", "fixedPoints"], e.target.value ? Number(e.target.value) : 0)}
                />
            </s-section>
        );
    };

    const renderConditions = () => {
        switch (eventType) {
            case "ORDER": return renderOrderConditions();
            case "REFERRAL": return renderReferralConditions();
            case "REVIEW": return renderReviewConditions();
            default: return renderDefaultConditions();
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — right summary sidebar
    // ─────────────────────────────────────────────────────────────────────────

    const renderSummary = () => {
        const earning = conditions.earning;

        const earningLine = () => {
            if (eventType === "ORDER") {
                if (earning?.type === "incremental")
                    return `${earning?.rate?.points ?? 0} pt per $${earning?.rate?.amount ?? 0} spent`;
                return `${earning?.fixedPoints ?? 0} pts per order`;
            }
            if (eventType === "REFERRAL")
                return `${conditions.referral?.referrer?.firstOrderPoints ?? 0} pts for referrer`;
            if (eventType === "REVIEW")
                return `Text ${conditions.review?.text ?? 0} / Photo ${conditions.review?.image ?? 0} / Video ${conditions.review?.video ?? 0} pts`;
            return `${earning?.fixedPoints ?? 0} pts`;
        };

        return (
            <s-section>
                <s-heading>Summary</s-heading>
                <s-box paddingBlockEnd="small" />
                {selectedEvent ? (
                    <>
                        <s-text><strong>Event:</strong> {selectedEvent.name}</s-text>
                        <s-box paddingBlockEnd="small" />
                        <s-text><strong>Earning:</strong> {earningLine()}</s-text>
                        <s-box paddingBlockEnd="small" />
                        <s-text><strong>Status:</strong> {rule.isActive ? "Active ✅" : "Inactive ❌"}</s-text>
                    </>
                ) : (
                    <s-text tone="subdued">Select an event to see a summary.</s-text>
                )}
            </s-section>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — create / edit form
    // ─────────────────────────────────────────────────────────────────────────

    const renderForm = () => {
        const busy = isSaving || isUpdating;
        return (
            <s-grid gridTemplateColumns="2fr 1fr" gap="base">
                <s-box>
                    {view === "create" && (
                        <s-box paddingBlockEnd="base">{renderEventSelector()}</s-box>
                    )}

                    {(rule.eventId || view === "edit") && (
                        <s-box paddingBlockEnd="base">{renderConditions()}</s-box>
                    )}

                    <s-section>
                        <s-heading>Description (Optional)</s-heading>
                        <s-box paddingBlockEnd="small" />
                        <s-text-area
                            label="Description"
                            labelAccessibilityVisibility="exclusive"
                            placeholder="Describe this rule..."
                            value={rule.description ?? ""}
                            disabled={busy}
                            onInput={(e) => setRuleField("description", e.target.value)}
                        />
                    </s-section>
                </s-box>

                <s-box>
                    {renderSummary()}
                    <s-box paddingBlockEnd="base" />
                    <s-section>
                        <s-heading>Active Status</s-heading>
                        <s-box paddingBlockEnd="small" />
                        <s-switch
                            labelAccessibilityVisibility="exclusion"
                            label={rule.isActive ? "Active" : "Inactive"}
                            checked={rule.isActive}
                            disabled={busy}
                            onChange={(e) => setRuleField("isActive", e.target.checked)}
                        />
                    </s-section>
                </s-box>
            </s-grid>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — delete modal
    // FIX: guard deleteTarget null before rendering modal content
    // ─────────────────────────────────────────────────────────────────────────

    const renderDeleteModal = () => (
        <s-modal id="delete-modal" heading="Delete Points Rule" size="small">
            {deleteTarget && (
                <s-paragraph color="subdued">
                    Are you sure you want to delete{" "}
                    <strong>{deleteTarget.name || getEventName(deleteTarget.eventId)}</strong>?
                    This action cannot be undone.
                </s-paragraph>
            )}
            <s-button
                slot="secondary-actions"
                commandFor="delete-modal"
                command="--hide"
                disabled={isDeleting}
            >
                Cancel
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                destructive
                onClick={handleDelete}
                commandFor="delete-modal"
                command="--hide"
                loading={isDeleting}
                disabled={isDeleting || !deleteTarget}
            >
                Yes, Delete
            </s-button>
        </s-modal>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // FINAL RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <s-page inlineSize="base">
            <s-section>{renderHeading()}</s-section>

            {view === "list" && renderTable()}
            {(view === "create" || view === "edit") && renderForm()}

            {renderDeleteModal()}
        </s-page>
    );
}