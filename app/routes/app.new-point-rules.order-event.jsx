import { useCallback, useEffect } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation, useNavigate, redirect } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";
import { useFormState, str, bool, num, arr, obj } from "@app/hooks/useFormState";
import { SaveBar } from "@app/components/saveBar/SaveBar";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const ruleId = url.searchParams.get("ruleId");

    const event = await prisma.event.findFirst({
        where: { sessionId: session.id, type: "ORDER", isActive: true },
    });

    if (!event) {
        return redirect("/app/new-point-rules");
    }

    if (ruleId) {
        const rule = await prisma.pointsRule.findUnique({
            where: { id: parseInt(ruleId) },
            include: { event: true },
        });

        if (!rule || rule.sessionId !== session.id) {
            return redirect("/app/new-point-rules");
        }

        return { rule, event, mode: "edit" };
    }

    return { rule: null, event, mode: "create" };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ── CREATE ──
    if (submitType === "createRule") {
        const payload = JSON.parse(formData.get("payload") || "{}");

        try {
            const event = await prisma.event.findFirst({
                where: { sessionId: session.id, type: "ORDER", isActive: true },
            });
            if (!event)
                return { message: "ORDER event not found.", status: "error", submitType };

            const existing = await prisma.pointsRule.findFirst({
                where: { eventId: event.id, sessionId: session.id },
            });
            if (existing)
                return { message: "A rule for this event already exists.", status: "error", submitType };

            const created = await prisma.pointsRule.create({
                data: {
                    name: payload.name || null,
                    description: payload.description || null,
                    isActive: payload.isActive ?? true,
                    conditions: buildConditions(payload.order),
                    session: { connect: { id: session.id } },
                    event: { connect: { id: event.id } },
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule created successfully.", rule: created, status: "success", submitType };
        } catch (err) {
            console.error("Create ORDER Rule Error:", err);
            return { message: "Failed to create rule. Please try again.", status: "error", submitType };
        }
    }

    // ── UPDATE ──
    if (submitType === "updateRule") {
        const payload = JSON.parse(formData.get("payload") || "{}");
        const ruleId = parseInt(formData.get("ruleId"));

        if (!ruleId)
            return { message: "Rule ID is required.", status: "error", submitType };

        try {
            const existing = await prisma.pointsRule.findUnique({ where: { id: ruleId } });
            if (!existing || existing.sessionId !== session.id)
                return { message: "Rule not found or access denied.", status: "error", submitType };

            const rule = await prisma.pointsRule.update({
                where: { id: ruleId },
                data: {
                    name: payload.name || null,
                    description: payload.description || null,
                    isActive: payload.isActive ?? true,
                    conditions: buildConditions(payload.order),
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule updated successfully.", rule, status: "success", submitType };
        } catch (err) {
            console.error("Update ORDER Rule Error:", err);
            return { message: "Failed to update rule. Please try again.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONDITIONS BUILDER
// Properly structures the order object before saving to DB.
// All numeric strings → numbers, all optional arrays guaranteed present.
// ─────────────────────────────────────────────────────────────────────────────

function buildConditions(order) {
    return {
        order: {
            // Possible values: "oneTime" | "subscription" | "both"
            trigger: order.trigger,

            // Earning type — same type applies at all levels, only value overrides
            // Possible values: "fixed" | "incremental"
            type: order.type,

            // type: "fixed"       → fixedPoints used   (Global fallback)
            // type: "incremental" → rate used           (Global fallback)
            fixedPoints: Number(order.fixedPoints ?? 0),
            rate: {
                amount: Number(order.rate?.amount ?? 0),
                points: Number(order.rate?.points ?? 0),
            },

            // PRIORITY 1 (lowest) — Global fallback
            // Applied when no interval or group matches.

            // Optional — products that should never earn points
            excludedProducts: (order.excludedProducts ?? []).map((p) => ({
                id: p.id,
                title: p.title,
                image: p.image ?? null,
                handle: p.handle,
            })),

            // PRIORITY 2 — Global Interval Override
            // Product is not in any group, but interval matches.
            // Overrides global fallback.
            // Possible interval values: "monthly" | "yearly"
            intervals: (order.intervals ?? []).map((iv) => ({
                interval: iv.interval,
                fixedPoints: Number(iv.fixedPoints ?? 0),
                rate: {
                    amount: Number(iv.rate?.amount ?? 0),
                    points: Number(iv.rate?.points ?? 0),
                },
            })),

            // PRIORITY 3 — Group Points Override
            // Product is in this group, but no group interval matches.
            // Overrides global + global interval.
            groups: (order.groups ?? []).map((g) => ({
                id: g.id,
                name: g.name,
                products: (g.products ?? []).map((p) => ({
                    id: p.id,
                    title: p.title,
                    image: p.image ?? null,
                    handle: p.handle,
                })),
                // Group level override
                fixedPoints: Number(g.fixedPoints ?? 0),
                rate: {
                    amount: Number(g.rate?.amount ?? 0),
                    points: Number(g.rate?.points ?? 0),
                },

                // PRIORITY 4 (highest) — Group Interval Override
                // Product is in this group AND interval matches.
                // Overrides everything — most specific rule.
                intervals: (g.intervals ?? []).map((iv) => ({
                    interval: iv.interval,
                    fixedPoints: Number(iv.fixedPoints ?? 0),
                    rate: {
                        amount: Number(iv.rate?.amount ?? 0),
                        points: Number(iv.rate?.points ?? 0),
                    },
                })),
            })),
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM SHAPE
// ─────────────────────────────────────────────────────────────────────────────

function buildFormShape(data) {
    // DB stores order conditions under conditions.order
    const order = data?.conditions?.order ?? {};
    return {
        name: str(data?.name),
        description: str(data?.description),
        isActive: bool(data?.isActive ?? true),
        order: {
            trigger: str(order?.trigger ?? "subscription"),
            type: str(order?.type ?? "incremental"),
            fixedPoints: num(order?.fixedPoints ?? 100),
            rate: {
                amount: num(order?.rate?.amount ?? 10),
                points: num(order?.rate?.points ?? 1),
            },
            excludedProducts: arr(order?.excludedProducts),
            intervals: arr(order?.intervals),
            groups: arr(order?.groups),
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validate(form) {
    const errors = {};
    const order = form.order;

    if (order.type === "fixed") {
        if (!order.fixedPoints || Number(order.fixedPoints) <= 0) {
            errors["order.fixedPoints"] = "Fixed points must be greater than 0.";
        }
    }

    if (order.type === "incremental") {
        if (!order.rate.points || Number(order.rate.points) <= 0) {
            errors["order.rate.points"] = "Points per rate must be greater than 0.";
        }
        if (!order.rate.amount || Number(order.rate.amount) <= 0) {
            errors["order.rate.amount"] = "Amount per rate must be greater than 0.";
        }
    }

    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function OrderManagePage() {
    const { rule, event, mode } = useLoaderData();
    const actionData = useActionData();
    const submitRR = useSubmit();
    const navigate = useNavigate();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const isSubmitting =
        navigation.state === "submitting" &&
        ["createRule", "updateRule"].includes(navigation.formData?.get("submitType"));

    // ── useFormState ──────────────────────────────────────────────────────────
    const fs = useFormState(rule, buildFormShape, {
        validate,
        onSubmit: async (form) => {
            const payload = JSON.stringify({
                name: form.name,
                description: form.description,
                isActive: form.isActive,
                order: form.order,
            });

            if (mode === "edit") {
                submitRR(
                    { submitType: "updateRule", ruleId: rule.id, payload },
                    { method: "post" }
                );
            } else {
                submitRR(
                    { submitType: "createRule", payload },
                    { method: "post" }
                );
            }
        },
    });

    // ── Toast + redirect on success ───────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
        if (actionData.status === "success") {
            navigate("/app/new-point-rules");
        }
    }, [actionData, shopify, navigate]);

    const busy = isSubmitting;

    // ─────────────────────────────────────────────────────────────────────────
    // EARNING — interval helpers
    // ─────────────────────────────────────────────────────────────────────────

    const addInterval = useCallback(() => {
        fs.addItem("order.intervals", {
            interval: "",
            fixedPoints: 120,
            rate: { amount: 10, points: 2 },
        });
    }, [fs]);

    const removeInterval = useCallback((idx) => {
        fs.removeItem("order.intervals", idx);
    }, [fs]);

    const updateInterval = useCallback((idx, field, value) => {
        fs.updateItem("order.intervals", idx, field, value);
    }, [fs]);

    const updateIntervalRate = useCallback((idx, rateField, value) => {
        const updated = [...fs.form.order.intervals];
        updated[idx] = {
            ...updated[idx],
            rate: { ...updated[idx].rate, [rateField]: value },
        };
        fs.set("order.intervals", updated);
    }, [fs]);

    // ─────────────────────────────────────────────────────────────────────────
    // EARNING — group helpers
    // ─────────────────────────────────────────────────────────────────────────

    const addGroup = useCallback(() => {
        fs.addItem("order.groups", {
            id: crypto.randomUUID(),
            name: `Group ${(fs.form.order.groups?.length ?? 0) + 1}`,
            products: [],
            fixedPoints: 150,
            rate: { amount: 10, points: 2 },
            intervals: [],
        });
    }, [fs]);

    const removeGroup = useCallback((gIdx) => {
        fs.removeItem("order.groups", gIdx);
    }, [fs]);

    const updateGroup = useCallback((gIdx, field, value) => {
        fs.updateItem("order.groups", gIdx, field, value);
    }, [fs]);

    const updateGroupRate = useCallback((gIdx, rateField, value) => {
        const updated = [...fs.form.order.groups];
        updated[gIdx] = {
            ...updated[gIdx],
            rate: { ...updated[gIdx].rate, [rateField]: value },
        };
        fs.set("order.groups", updated);
    }, [fs]);

    // group interval helpers
    const addGroupInterval = useCallback((gIdx) => {
        const groups = [...fs.form.order.groups];
        groups[gIdx] = {
            ...groups[gIdx],
            intervals: [
                ...(groups[gIdx].intervals ?? []),
                { interval: "", fixedPoints: 130, rate: { amount: 10, points: 3 } },
            ],
        };
        fs.set("order.groups", groups);
    }, [fs]);

    const removeGroupInterval = useCallback((gIdx, iIdx) => {
        const groups = [...fs.form.order.groups];
        groups[gIdx] = {
            ...groups[gIdx],
            intervals: groups[gIdx].intervals.filter((_, j) => j !== iIdx),
        };
        fs.set("order.groups", groups);
    }, [fs]);

    const updateGroupInterval = useCallback((gIdx, iIdx, field, value) => {
        const groups = [...fs.form.order.groups];
        const intervals = [...groups[gIdx].intervals];
        intervals[iIdx] = { ...intervals[iIdx], [field]: value };
        groups[gIdx] = { ...groups[gIdx], intervals };
        fs.set("order.groups", groups);
    }, [fs]);

    const updateGroupIntervalRate = useCallback((gIdx, iIdx, rateField, value) => {
        const groups = [...fs.form.order.groups];
        const intervals = [...groups[gIdx].intervals];
        intervals[iIdx] = {
            ...intervals[iIdx],
            rate: { ...intervals[iIdx].rate, [rateField]: value },
        };
        groups[gIdx] = { ...groups[gIdx], intervals };
        fs.set("order.groups", groups);
    }, [fs]);

    // ─────────────────────────────────────────────────────────────────────────
    // RESOURCE PICKERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Blocked IDs for a group picker:
     *   - excluded products
     *   - products already in OTHER groups
     */
    const getBlockedIdsForGroup = useCallback((gIdx) => {
        const order = fs.form.order;

        // ── Conditional priority visibility ──────────────────────────────────────
        // Global is always shown.
        // Interval + Group sections unlock after global points are valid.
        const globalPointsValid =
            order.type === "fixed"
                ? Number(order.fixedPoints) > 0
                : Number(order.rate?.points) > 0 && Number(order.rate?.amount) > 0;
        const excludedIds = (order.excludedProducts ?? []).map((p) => p.id);
        const otherGroupIds = (order.groups ?? [])
            .filter((_, i) => i !== gIdx)
            .flatMap((g) => (g.products ?? []).map((p) => p.id));
        return new Set([...excludedIds, ...otherGroupIds]);
    }, [fs]);

    /**
     * Blocked IDs for excluded picker:
     *   - products already in ANY group
     */
    const getBlockedIdsForExcluded = useCallback(() => {
        const allGroupIds = (fs.form.order.groups ?? [])
            .flatMap((g) => (g.products ?? []).map((p) => p.id));
        return new Set(allGroupIds);
    }, [fs]);

    // ── Excluded Products Picker ──────────────────────────────────────────────

    const openExcludedProductsPicker = useCallback(async () => {
        const selectionIds = (fs.form.order.excludedProducts ?? []).map((p) => ({ id: p.id }));
        const result = await shopify.resourcePicker({
            type: "product",
            multiple: true,
            selectionIds,
            filter: { variants: false },
        });
        if (!result?.selection?.length) return;

        const blockedIds = getBlockedIdsForExcluded();
        const allowed = [];
        const blocked = [];

        result.selection.forEach((s) => {
            if (blockedIds.has(s.id)) {
                blocked.push(s.title);
            } else {
                allowed.push({
                    id: s.id,
                    title: s.title,
                    image: s.images?.[0]?.originalSrc ?? null,
                    handle: s.handle,
                });
            }
        });

        if (blocked.length > 0) {
            shopify.toast.show(
                `${blocked.length} product${blocked.length > 1 ? "s" : ""} skipped — already in a group: ${blocked.join(", ")}`,
                { isError: true }
            );
        }
        if (allowed.length > 0) {
            fs.set("order.excludedProducts", allowed);
        }
    }, [fs, shopify, getBlockedIdsForExcluded]);

    const removeExcludedProduct = useCallback((id) => {
        fs.set(
            "order.excludedProducts",
            fs.form.order.excludedProducts.filter((p) => p.id !== id)
        );
    }, [fs]);

    // ── Group Products Picker ─────────────────────────────────────────────────

    const openGroupProductsPicker = useCallback(async (gIdx) => {
        const group = fs.form.order.groups[gIdx];
        const selectionIds = (group.products ?? []).map((p) => ({ id: p.id }));
        const result = await shopify.resourcePicker({
            type: "product",
            multiple: true,
            selectionIds,
            filter: { variants: false },
        });
        if (!result?.selection?.length) return;

        const blockedIds = getBlockedIdsForGroup(gIdx);
        const allowed = [];
        const blocked = [];

        result.selection.forEach((s) => {
            if (blockedIds.has(s.id)) {
                blocked.push(s.title);
            } else {
                allowed.push({
                    id: s.id,
                    title: s.title,
                    image: s.images?.[0]?.originalSrc ?? null,
                    handle: s.handle,
                });
            }
        });

        if (blocked.length > 0) {
            shopify.toast.show(
                `${blocked.length} product${blocked.length > 1 ? "s" : ""} skipped — already excluded or in another group: ${blocked.join(", ")}`,
                { isError: true }
            );
        }
        if (allowed.length > 0) {
            updateGroup(gIdx, "products", allowed);
        }
    }, [fs, shopify, updateGroup, getBlockedIdsForGroup]);

    const removeGroupProduct = useCallback((gIdx, productId) => {
        const group = fs.form.order.groups[gIdx];
        updateGroup(gIdx, "products", group.products.filter((p) => p.id !== productId));
    }, [fs, updateGroup]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Reusable points fields: fixed or incremental depending on order.type
     */
    const renderPointsFields = (
        val,
        onChangeFixed,
        onChangeRatePoints,
        onChangeRateAmount,
    ) => {
        const orderType = fs.form.order.type;
        return orderType === "incremental" ? (
            <s-grid gridTemplateColumns="1fr auto 1fr" gap="large" alignItems="center">
                <s-number-field
                    label="Points"
                    labelAccessibilityVisibility="exclusive"
                    suffix="points"
                    step={1}
                    min={1}
                    value={val?.rate?.points ?? ""}
                    disabled={busy}
                    onInput={(e) => onChangeRatePoints(e.target.value ? Number(e.target.value) : 0)}
                />
                <s-text>for every</s-text>
                <s-number-field
                    label="Amount"
                    labelAccessibilityVisibility="exclusive"
                    prefix="$"
                    suffix="spent"
                    step={1}
                    min={1}
                    value={val?.rate?.amount ?? ""}
                    disabled={busy}
                    onInput={(e) => onChangeRateAmount(e.target.value ? Number(e.target.value) : 0)}
                />
            </s-grid>
        ) : (
            <s-number-field
                label="Points"
                labelAccessibilityVisibility="exclusive"
                suffix="points"
                value={val?.fixedPoints ?? ""}
                disabled={busy}
                onInput={(e) => onChangeFixed(e.target.value ? Number(e.target.value) : 0)}
            />
        );
    };

    const order = fs.form.order;

    // ── Conditional priority visibility ──────────────────────────────────────
    // Global is always shown.
    // Interval + Group sections unlock after global points are valid.
    const globalPointsValid =
        order.type === "fixed"
            ? Number(order.fixedPoints) > 0
            : Number(order.rate?.points) > 0 && Number(order.rate?.amount) > 0;

    // Intervals (P2 + P4) only apply for subscription-based orders
    const isSubscription = fs.form.order.trigger === "subscription" || fs.form.order.trigger === "both";

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <>
            <s-page inlineSize="base">

                {/* ── Page Header ── */}
                <s-section>
                    <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                        <s-stack direction="inline" gap="small" alignItems="center">
                            <s-button
                                variant="plain"
                                onClick={() => navigate("/app/new-point-rules")}
                                disabled={busy}
                                style={{ padding: 0, minHeight: "unset" }}
                            >
                                Points Rules
                            </s-button>
                            <s-text tone="subdued">›</s-text>
                            <h2 style={{ marginBlock: "0" }}>
                                {mode === "edit" ? "Edit" : "Create"} — Order Rule
                            </h2>
                        </s-stack>
                        {/* Status badge */}
                        <s-badge tone={fs.form.isActive ? "success" : "critical"}>
                            {fs.form.isActive ? "Active" : "Inactive"}
                        </s-badge>
                    </s-grid>
                </s-section>

                <s-grid gridTemplateColumns="2fr 1fr" gap="base">

                    {/* ── Left: Conditions ── */}
                    <s-box>

                        {/* ── Trigger Type ── */}
                        <s-section>
                            <s-heading>Order Trigger</s-heading>
                            <s-text tone="subdued">
                                Choose which type of orders will earn points. This lets you reward only one-time buyers, only subscribers, or everyone.
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-choice-list
                                name="orderTrigger"
                                value={[fs.form.order.trigger]}
                                onInput={(e) => fs.set("order.trigger", e.currentTarget.values[0])}
                            >
                                <s-choice value="oneTime" selected={fs.form.order.trigger === "oneTime"}>
                                    One-time Purchase — Regular orders only
                                </s-choice>
                                {fs.form.order.trigger === "oneTime" && (
                                    <s-text tone="subdued" style={{ paddingInlineStart: "var(--s-space-large)", display: "block", marginBlockEnd: "var(--s-space-small)" }}>
                                        Points are earned only on regular (non-subscription) orders. Subscription orders will not earn points.
                                    </s-text>
                                )}
                                <s-choice value="subscription" selected={fs.form.order.trigger === "subscription"}>
                                    Subscription — Subscription orders only
                                </s-choice>
                                {fs.form.order.trigger === "subscription" && (
                                    <s-text tone="subdued" style={{ paddingInlineStart: "var(--s-space-large)", display: "block", marginBlockEnd: "var(--s-space-small)" }}>
                                        Points are earned on subscription orders — both the first order and every renewal.
                                    </s-text>
                                )}
                                <s-choice value="both" selected={fs.form.order.trigger === "both"}>
                                    Both — All order types
                                </s-choice>
                                {fs.form.order.trigger === "both" && (
                                    <s-text tone="subdued" style={{ paddingInlineStart: "var(--s-space-large)", display: "block" }}>
                                        Points are earned on all orders — one-time purchases and subscription orders alike.
                                    </s-text>
                                )}
                            </s-choice-list>
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── Earning Method ── */}
                        <s-section>
                            <s-heading>Earning Method</s-heading>
                            <s-text tone="subdued">
                                Decide how points are calculated. You can reward customers based on how much they spend, or give a flat number of points per order.
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-choice-list
                                name="orderMethod"
                                value={[order.type]}
                                onInput={(e) => {
                                    const val = e.currentTarget.values[0];
                                    fs.setMany([
                                        ["order.type", val],
                                        ["order.rate", val === "incremental"
                                            ? { amount: 10, points: 1 }
                                            : order.rate],
                                        ["order.fixedPoints", val === "fixed" ? 100 : order.fixedPoints],
                                    ]);
                                }}
                            >
                                <s-choice
                                    value="incremental"
                                    selected={order.type === "incremental"}
                                >
                                    Incremental — Points based on spend amount (Recommended)
                                </s-choice>
                                {order.type === "incremental" && (
                                    <s-text tone="subdued" style={{ paddingInlineStart: "var(--s-space-large)", display: "block", marginBlockEnd: "var(--s-space-small)" }}>
                                        Customers earn points based on how much they spend. For example: 1 point for every $10 spent. The more they spend, the more they earn.
                                    </s-text>
                                )}
                                <s-choice
                                    value="fixed"
                                    selected={order.type === "fixed"}
                                >
                                    Fixed — Same points for every order
                                </s-choice>
                                {order.type === "fixed" && (
                                    <s-text tone="subdued" style={{ paddingInlineStart: "var(--s-space-large)", display: "block" }}>
                                        Every qualifying order earns the same number of points, regardless of the order value. Simple and predictable.
                                    </s-text>
                                )}
                            </s-choice-list>
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── Priority 1: Global Fallback ── */}
                        <s-section>
                            <s-heading>Global Earning Points</s-heading>
                            <s-text tone="subdued">
                                This is the default rate that applies to all products. If a product belongs to a group or the order has a matching subscription interval, those settings will take priority over this. Think of this as your baseline.
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            {renderPointsFields(
                                order,
                                (v) => fs.set("order.fixedPoints", v),
                                (v) => fs.set("order.rate.points", v),
                                (v) => fs.set("order.rate.amount", v),
                            )}
                            {fs.errorFor("order.fixedPoints") && (
                                <s-text tone="critical">{fs.errorFor("order.fixedPoints")}</s-text>
                            )}
                            {fs.errorFor("order.rate.points") && (
                                <s-text tone="critical">{fs.errorFor("order.rate.points")}</s-text>
                            )}
                            {fs.errorFor("order.rate.amount") && (
                                <s-text tone="critical">{fs.errorFor("order.rate.amount")}</s-text>
                            )}
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── Excluded Products ── */}
                        <s-section>
                            <s-heading>Excluded Products (Optional)</s-heading>
                            <s-text tone="subdued">
                                Products added here will never earn points — no matter what group or interval they belong to. Use this for gift cards, free items, or any product you want to exclude from the rewards program entirely.
                            </s-text>
                            <s-box paddingBlockEnd="base" />
                            <s-stack direction="inline" gap="base" alignItems="center">
                                <s-button
                                    variant="primary"
                                    disabled={busy}
                                    onClick={openExcludedProductsPicker}
                                >
                                    Select Excluded Products
                                </s-button>
                                {(order.excludedProducts ?? []).length > 0 && (
                                    <s-text>{order.excludedProducts.length} excluded</s-text>
                                )}
                            </s-stack>
                            {(order.excludedProducts ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="small" />
                                    <s-ordered-list>
                                        {order.excludedProducts.map((p) => (
                                            <s-list-item key={p.id}>
                                                <s-grid
                                                    gridTemplateColumns="1fr 50px"
                                                    gap="base"
                                                    alignItems="center"
                                                >
                                                    <s-text>{p.title}</s-text>
                                                    <s-button
                                                        icon="delete"
                                                        variant="text"
                                                        disabled={busy}
                                                        onClick={() => removeExcludedProduct(p.id)}
                                                    />
                                                </s-grid>
                                            </s-list-item>
                                        ))}
                                    </s-ordered-list>
                                </>
                            )}
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── Priority 2: Global Interval Overrides ── */}
                        {/* Only shown after global points are valid + subscription trigger */}
                        {globalPointsValid && isSubscription && <s-section>
                            <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                <div>
                                    <s-heading>Subscription Interval Overrides</s-heading>
                                    <s-text tone="subdued">
                                        Give different point rates based on how often a customer subscribes. For example, you can reward yearly subscribers more than monthly ones. These rates apply to products that are not in any group below.
                                    </s-text>
                                </div>
                                <s-button variant="primary" disabled={busy} onClick={addInterval}>
                                    + Add Interval
                                </s-button>
                            </s-grid>

                            {(order.intervals ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="base" />
                                    {order.intervals.map((iv, idx) => (
                                        <s-box paddingBlockEnd="base" key={idx}>
                                            <s-box
                                                padding="base"
                                                borderStyle="dashed"
                                                background="base"
                                                borderWidth="base"
                                                borderColor="base"
                                                borderRadius="base"
                                            >
                                                <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                                    <s-text><strong>Interval {idx + 1}</strong></s-text>
                                                    <s-button
                                                        icon="delete"
                                                        variant="text"
                                                        disabled={busy}
                                                        onClick={() => removeInterval(idx)}
                                                    />
                                                </s-grid>
                                                <s-box paddingBlockEnd="small" />
                                                <s-text-field
                                                    label="Interval value"
                                                    labelAccessibilityVisibility="exclusive"
                                                    value={iv.interval}
                                                    disabled={busy}
                                                    placeholder="e.g. monthly"
                                                    details="Valid values: weekly, every_two_weeks, monthly, every_two_months, every_three_months, every_six_months, yearly"
                                                    onInput={(e) => updateInterval(idx, "interval", e.target.value)}
                                                />
                                                <s-box paddingBlockEnd="small" />
                                                {renderPointsFields(
                                                    iv,
                                                    (v) => updateInterval(idx, "fixedPoints", v),
                                                    (v) => updateIntervalRate(idx, "points", v),
                                                    (v) => updateIntervalRate(idx, "amount", v),
                                                )}
                                            </s-box>
                                        </s-box>
                                    ))}
                                </>
                            )}
                        </s-section>}

                        <s-box paddingBlockEnd="base" />

                        {/* ── Priority 3 + 4: Product Groups ── */}
                        {/* Only shown after global points are valid */}
                        {globalPointsValid && <s-section>
                            <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                <div>
                                    <s-heading>Product Groups</s-heading>
                                    <s-text tone="subdued">
                                        Assign custom point rates to specific products. Products in a group will earn points at the group rate instead of the global rate. You can also add interval overrides inside each group for even more control — for example, higher points for yearly subscribers buying a premium product.
                                    </s-text>
                                </div>
                                <s-button variant="primary" disabled={busy} onClick={addGroup}>
                                    + Add Group
                                </s-button>
                            </s-grid>

                            {(order.groups ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="base" />
                                    {order.groups.map((group, gIdx) => (
                                        <s-box key={group.id} paddingBlockEnd="base">
                                            <s-box
                                                padding="base"
                                                background="base"
                                                borderWidth="base"
                                                borderColor="base"
                                                borderRadius="base"
                                            >
                                                {/* Group header */}
                                                <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                                    <s-text-field
                                                        label="Group Name"
                                                        labelAccessibilityVisibility="exclusive"
                                                        value={group.name}
                                                        disabled={busy}
                                                        onInput={(e) => updateGroup(gIdx, "name", e.target.value)}
                                                    />
                                                    <s-button
                                                        icon="delete"
                                                        variant="text"
                                                        disabled={busy}
                                                        onClick={() => removeGroup(gIdx)}
                                                    />
                                                </s-grid>

                                                {/* Group products */}
                                                <s-box paddingBlockEnd="small" />
                                                <s-stack direction="inline" gap="base" alignItems="center">
                                                    <s-button
                                                        variant="primary"
                                                        disabled={busy}
                                                        onClick={() => openGroupProductsPicker(gIdx)}
                                                    >
                                                        Select Products
                                                    </s-button>
                                                    {group.products?.length > 0 && (
                                                        <s-text>{group.products.length} product(s) selected</s-text>
                                                    )}
                                                </s-stack>
                                                {group.products?.length > 0 && (
                                                    <>
                                                        <s-box paddingBlockEnd="small" />
                                                        <s-ordered-list>
                                                            {group.products.map((p) => (
                                                                <s-list-item key={p.id}>
                                                                    <s-grid
                                                                        gridTemplateColumns="1fr 50px"
                                                                        gap="base"
                                                                        alignItems="center"
                                                                    >
                                                                        <s-text>{p.title}</s-text>
                                                                        <s-button
                                                                            icon="delete"
                                                                            variant="text"
                                                                            disabled={busy}
                                                                            onClick={() => removeGroupProduct(gIdx, p.id)}
                                                                        />
                                                                    </s-grid>
                                                                </s-list-item>
                                                            ))}
                                                        </s-ordered-list>
                                                    </>
                                                )}

                                                {/* Group points — Priority 3 */}
                                                <s-box paddingBlockEnd="base" />
                                                <s-text tone="subdued" style={{ fontSize: "0.75rem" }}>
                                                    Priority 3 — group override (no interval match)
                                                </s-text>
                                                <s-box paddingBlockEnd="small" />
                                                {renderPointsFields(
                                                    group,
                                                    (v) => updateGroup(gIdx, "fixedPoints", v),
                                                    (v) => updateGroupRate(gIdx, "points", v),
                                                    (v) => updateGroupRate(gIdx, "amount", v),
                                                )}

                                                {/* Group intervals — Priority 4 (subscription only) */}
                                                {isSubscription && (
                                                    <>
                                                        <s-box paddingBlockEnd="base" />
                                                        <s-divider />
                                                        <s-box paddingBlockEnd="base" />
                                                        <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                                            <s-text tone="subdued" style={{ fontSize: "0.75rem" }}>
                                                                Priority 4 — group + interval override (highest)
                                                            </s-text>
                                                            <s-button
                                                                variant="plain"
                                                                disabled={busy}
                                                                onClick={() => addGroupInterval(gIdx)}
                                                            >
                                                                + Add Interval
                                                            </s-button>
                                                        </s-grid>

                                                        {(group.intervals ?? []).length > 0 && (
                                                            <>
                                                                <s-box paddingBlockEnd="small" />
                                                                {group.intervals.map((iv, iIdx) => (
                                                                    <s-box paddingBlockEnd="base" key={iIdx}>
                                                                        <s-box
                                                                            padding="base"
                                                                            borderStyle="dashed"
                                                                            borderWidth="base"
                                                                            borderColor="base"
                                                                            borderRadius="base"
                                                                        >
                                                                            <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                                                                <s-text><strong>Interval {iIdx + 1}</strong></s-text>
                                                                                <s-button
                                                                                    icon="delete"
                                                                                    variant="text"
                                                                                    disabled={busy}
                                                                                    onClick={() => removeGroupInterval(gIdx, iIdx)}
                                                                                />
                                                                            </s-grid>
                                                                            <s-box paddingBlockEnd="small" />
                                                                            <s-text-field
                                                                                label="Interval value"
                                                                                labelAccessibilityVisibility="exclusive"
                                                                                value={iv.interval}
                                                                                disabled={busy}
                                                                                placeholder="e.g. monthly"
                                                                                details="Valid values: weekly, every_two_weeks, monthly, every_two_months, every_three_months, every_six_months, yearly"
                                                                                onInput={(e) => updateGroupInterval(gIdx, iIdx, "interval", e.target.value)}
                                                                            />
                                                                            <s-box paddingBlockEnd="small" />
                                                                            {renderPointsFields(
                                                                                iv,
                                                                                (v) => updateGroupInterval(gIdx, iIdx, "fixedPoints", v),
                                                                                (v) => updateGroupIntervalRate(gIdx, iIdx, "points", v),
                                                                                (v) => updateGroupIntervalRate(gIdx, iIdx, "amount", v),
                                                                            )}
                                                                        </s-box>
                                                                    </s-box>
                                                                ))}
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </s-box>
                                        </s-box>
                                    ))}
                                </>
                            )}
                        </s-section>}

                        <s-box paddingBlockEnd="base" />

                        {/* ── Description ── */}
                        <s-section>
                            <s-heading>Description (Optional)</s-heading>
                            <s-box paddingBlockEnd="small" />
                            <s-text-area
                                label="Description"
                                labelAccessibilityVisibility="exclusive"
                                placeholder="Describe this rule..."
                                value={fs.form.description}
                                disabled={busy}
                                onInput={(e) => fs.set("description", e.target.value)}
                            />
                        </s-section>

                    </s-box>

                    {/* ── Right: Summary + Active Status ── */}
                    <s-box>
                        <s-section>
                            <s-heading>Summary</s-heading>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Event:</strong> {event?.name ?? "Direct Purchase"}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Applies to:</strong>{" "}
                                {{ oneTime: "One-time purchases only", subscription: "Subscription orders only", both: "All orders (one-time + subscription)" }[fs.form.order.trigger] ?? fs.form.order.trigger}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Default rate:</strong>{" "}
                                {order.type === "incremental"
                                    ? `${order.rate.points || 0} pt for every $${order.rate.amount || 0} spent`
                                    : `${order.fixedPoints || 0} pts flat per order`}
                            </s-text>
                            {(order.groups ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="small" />
                                    <s-text>
                                        <strong>Product groups:</strong> {(order.groups ?? []).length} group{(order.groups ?? []).length !== 1 ? "s" : ""} with custom rates
                                        {" — "}{(order.groups ?? []).map(g => g.name).filter(Boolean).join(", ")}
                                    </s-text>
                                </>
                            )}
                            {(order.intervals ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="small" />
                                    <s-text>
                                        <strong>Interval overrides:</strong> {(order.intervals ?? []).length} subscription interval{(order.intervals ?? []).length !== 1 ? "s" : ""} with custom rates
                                    </s-text>
                                </>
                            )}
                            {(order.excludedProducts ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="small" />
                                    <s-text>
                                        <strong>Excluded:</strong> {(order.excludedProducts ?? []).length} product{(order.excludedProducts ?? []).length !== 1 ? "s" : ""} earn no points
                                        {" — "}{(order.excludedProducts ?? []).map(p => p.title).filter(Boolean).join(", ")}
                                    </s-text>
                                </>
                            )}
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Status:</strong>{" "}
                                {fs.form.isActive ? "Active ✅" : "Inactive ❌"}
                            </s-text>
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        <s-section>
                            <s-heading>Active Status</s-heading>
                            <s-box paddingBlockEnd="small" />
                            <s-switch
                                labelAccessibilityVisibility="exclusion"
                                label={fs.form.isActive ? "Active" : "Inactive"}
                                checked={fs.form.isActive}
                                disabled={busy}
                                onChange={(e) => fs.set("isActive", e.target.checked)}
                            />
                        </s-section>
                    </s-box>

                </s-grid>

            </s-page>

            {/* ── SaveBar ── */}
            <SaveBar
                visible={mode === "create" || fs.isDirty}
                position="bottom-center"
                message={
                    mode === "edit"
                        ? "You have unsaved changes"
                        : "Ready to save your new rule"
                }
                primaryLabel={mode === "edit" ? "Update Rule" : "Save Rule"}
                secondaryLabel={mode === "edit" ? "Discard Changes" : "Cancel"}
                onPrimary={fs.submit}
                onSecondary={() => mode === "edit" ? fs.reset() : navigate("/app/new-point-rules")}
                loading={isSubmitting}
                disabled={isSubmitting}
            />
        </>
    );
}