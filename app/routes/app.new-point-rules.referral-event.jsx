import { useCallback, useEffect } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation, useNavigate, redirect } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";
import { useFormState, str, bool, num, arr } from "@app/hooks/useFormState";
import { SaveBar } from "@app/components/saveBar/SaveBar";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const ruleId = url.searchParams.get("ruleId");

    const event = await prisma.event.findFirst({
        where: { sessionId: session.id, type: "REFERRAL", isActive: true },
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
                where: { sessionId: session.id, type: "REFERRAL", isActive: true },
            });
            if (!event)
                return { message: "REFERRAL event not found.", status: "error", submitType };

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
                    conditions: buildConditions(payload.referral),
                    session: { connect: { id: session.id } },
                    event: { connect: { id: event.id } },
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule created successfully.", rule: created, status: "success", submitType };
        } catch (err) {
            console.error("Create REFERRAL Rule Error:", err);
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
                    conditions: buildConditions(payload.referral),
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule updated successfully.", rule, status: "success", submitType };
        } catch (err) {
            console.error("Update REFERRAL Rule Error:", err);
            return { message: "Failed to update rule. Please try again.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONDITIONS BUILDER
// Structures the referral object before saving to DB, matching the schema.
// ─────────────────────────────────────────────────────────────────────────────

function buildConditions(referral) {
    return {
        referral: {
            // Possible values: "oneTime" | "subscription" | "both"
            trigger: referral.trigger,

            // ── PRIORITY 1 (lowest) — Global fallback ────────────────────────
            // Applied when no interval or group matches.
            referrer: {
                points: Number(referral.referrer?.points ?? 0),
                allowRenewalReward: Boolean(referral.referrer?.allowRenewalReward ?? false),
                renewalPoints: Number(referral.referrer?.renewalPoints ?? 0),
            },
            referred: {
                // Always global — never overridden at group level
                // Possible values: "fixed" | "percentage"
                discountType: referral.referred?.discountType ?? "fixed",
                discountValue: Number(referral.referred?.discountValue ?? 0),
                points: Number(referral.referred?.points ?? 0),
                allowRenewalReward: Boolean(referral.referred?.allowRenewalReward ?? false),
                renewalPoints: Number(referral.referred?.renewalPoints ?? 0),
            },

            // ── PRIORITY 2 — Global Interval Override ────────────────────────
            // Product is not in any group, but interval matches.
            // Overrides global fallback.
            // Possible interval values: "monthly" | "yearly"
            intervals: (referral.intervals ?? []).map((iv) => ({
                interval: iv.interval,
                referrer: {
                    points: Number(iv.referrer?.points ?? 0),
                    renewalPoints: Number(iv.referrer?.renewalPoints ?? 0),
                },
                referred: {
                    points: Number(iv.referred?.points ?? 0),
                    renewalPoints: Number(iv.referred?.renewalPoints ?? 0),
                },
            })),

            // ── PRIORITY 3 — Group Points Override ───────────────────────────
            // Product is in this group, but no group interval matches.
            // Overrides global + global interval.
            groups: (referral.groups ?? []).map((g) => ({
                id: g.id,
                name: g.name,
                products: (g.products ?? []).map((p) => ({
                    id: p.id,
                    title: p.title,
                    image: p.image ?? null,
                    handle: p.handle,
                })),
                // Group level referrer/referred points override
                // Note: discount (discountType/discountValue) is always global — not overridden here
                referrer: {
                    points: Number(g.referrer?.points ?? 0),
                    allowRenewalReward: Boolean(g.referrer?.allowRenewalReward ?? false),
                    renewalPoints: Number(g.referrer?.renewalPoints ?? 0),
                },
                referred: {
                    points: Number(g.referred?.points ?? 0),
                    allowRenewalReward: Boolean(g.referred?.allowRenewalReward ?? false),
                    renewalPoints: Number(g.referred?.renewalPoints ?? 0),
                },

                // ── PRIORITY 4 (highest) — Group Interval Override ────────────
                // Product is in this group AND interval matches.
                // Overrides everything — most specific rule.
                intervals: (g.intervals ?? []).map((iv) => ({
                    interval: iv.interval,
                    referrer: {
                        points: Number(iv.referrer?.points ?? 0),
                        renewalPoints: Number(iv.referrer?.renewalPoints ?? 0),
                    },
                    referred: {
                        points: Number(iv.referred?.points ?? 0),
                        renewalPoints: Number(iv.referred?.renewalPoints ?? 0),
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
    const ref = data?.conditions?.referral ?? {};
    return {
        name: str(data?.name),
        description: str(data?.description),
        isActive: bool(data?.isActive ?? true),
        referral: {
            trigger: str(ref?.trigger ?? "subscription"),

            // Global fallback — Priority 1
            referrer: {
                points: num(ref?.referrer?.points ?? 100),
                allowRenewalReward: bool(ref?.referrer?.allowRenewalReward ?? true),
                renewalPoints: num(ref?.referrer?.renewalPoints ?? 80),
            },
            referred: {
                discountType: str(ref?.referred?.discountType ?? "fixed"),
                discountValue: num(ref?.referred?.discountValue ?? 10),
                points: num(ref?.referred?.points ?? 50),
                allowRenewalReward: bool(ref?.referred?.allowRenewalReward ?? false),
                renewalPoints: num(ref?.referred?.renewalPoints ?? 40),
            },

            intervals: arr(ref?.intervals),  // Priority 2
            groups: arr(ref?.groups),         // Priority 3 + 4
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validate(form) {
    const errors = {};
    const ref = form.referral;

    if (!ref.referrer.points || Number(ref.referrer.points) <= 0) {
        errors["referral.referrer.points"] = "Referrer points must be greater than 0.";
    }
    if (!ref.referred.discountValue || Number(ref.referred.discountValue) <= 0) {
        errors["referral.referred.discountValue"] = "Referred discount value must be greater than 0.";
    }
    if (!ref.referred.points || Number(ref.referred.points) <= 0) {
        errors["referral.referred.points"] = "Referred points must be greater than 0.";
    }

    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ReferralEventPage() {
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
                referral: form.referral,
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
    // INTERVAL HELPERS — Priority 2 (Global Intervals)
    // ─────────────────────────────────────────────────────────────────────────

    const addInterval = useCallback(() => {
        fs.addItem("referral.intervals", {
            interval: "",
            referrer: { points: 130, renewalPoints: 100 },
            referred: { points: 65, renewalPoints: 50 },
        });
    }, [fs]);

    const removeInterval = useCallback((idx) => {
        fs.removeItem("referral.intervals", idx);
    }, [fs]);

    const updateIntervalReferrer = useCallback((idx, field, value) => {
        const updated = [...fs.form.referral.intervals];
        updated[idx] = {
            ...updated[idx],
            referrer: { ...updated[idx].referrer, [field]: value },
        };
        fs.set("referral.intervals", updated);
    }, [fs]);

    const updateIntervalReferred = useCallback((idx, field, value) => {
        const updated = [...fs.form.referral.intervals];
        updated[idx] = {
            ...updated[idx],
            referred: { ...updated[idx].referred, [field]: value },
        };
        fs.set("referral.intervals", updated);
    }, [fs]);

    const updateIntervalField = useCallback((idx, field, value) => {
        const updated = [...fs.form.referral.intervals];
        updated[idx] = { ...updated[idx], [field]: value };
        fs.set("referral.intervals", updated);
    }, [fs]);

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP HELPERS — Priority 3
    // ─────────────────────────────────────────────────────────────────────────

    const addGroup = useCallback(() => {
        fs.addItem("referral.groups", {
            id: crypto.randomUUID(),
            name: `Group ${(fs.form.referral.groups?.length ?? 0) + 1}`,
            products: [],
            referrer: { points: 150, allowRenewalReward: true, renewalPoints: 120 },
            referred: { points: 75, allowRenewalReward: true, renewalPoints: 60 },
            intervals: [],
        });
    }, [fs]);

    const removeGroup = useCallback((gIdx) => {
        fs.removeItem("referral.groups", gIdx);
    }, [fs]);

    const updateGroupField = useCallback((gIdx, field, value) => {
        fs.updateItem("referral.groups", gIdx, field, value);
    }, [fs]);

    const updateGroupReferrer = useCallback((gIdx, field, value) => {
        const updated = [...fs.form.referral.groups];
        updated[gIdx] = {
            ...updated[gIdx],
            referrer: { ...updated[gIdx].referrer, [field]: value },
        };
        fs.set("referral.groups", updated);
    }, [fs]);

    const updateGroupReferred = useCallback((gIdx, field, value) => {
        const updated = [...fs.form.referral.groups];
        updated[gIdx] = {
            ...updated[gIdx],
            referred: { ...updated[gIdx].referred, [field]: value },
        };
        fs.set("referral.groups", updated);
    }, [fs]);

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP INTERVAL HELPERS — Priority 4
    // ─────────────────────────────────────────────────────────────────────────

    const addGroupInterval = useCallback((gIdx) => {
        const groups = [...fs.form.referral.groups];
        groups[gIdx] = {
            ...groups[gIdx],
            intervals: [
                ...(groups[gIdx].intervals ?? []),
                {
                    interval: "",
                    referrer: { points: 120, renewalPoints: 90 },
                    referred: { points: 60, renewalPoints: 45 },
                },
            ],
        };
        fs.set("referral.groups", groups);
    }, [fs]);

    const removeGroupInterval = useCallback((gIdx, iIdx) => {
        const groups = [...fs.form.referral.groups];
        groups[gIdx] = {
            ...groups[gIdx],
            intervals: groups[gIdx].intervals.filter((_, j) => j !== iIdx),
        };
        fs.set("referral.groups", groups);
    }, [fs]);

    const updateGroupInterval = useCallback((gIdx, iIdx, field, value) => {
        const groups = [...fs.form.referral.groups];
        const intervals = [...groups[gIdx].intervals];
        intervals[iIdx] = { ...intervals[iIdx], [field]: value };
        groups[gIdx] = { ...groups[gIdx], intervals };
        fs.set("referral.groups", groups);
    }, [fs]);

    const updateGroupIntervalReferrer = useCallback((gIdx, iIdx, field, value) => {
        const groups = [...fs.form.referral.groups];
        const intervals = [...groups[gIdx].intervals];
        intervals[iIdx] = {
            ...intervals[iIdx],
            referrer: { ...intervals[iIdx].referrer, [field]: value },
        };
        groups[gIdx] = { ...groups[gIdx], intervals };
        fs.set("referral.groups", groups);
    }, [fs]);

    const updateGroupIntervalReferred = useCallback((gIdx, iIdx, field, value) => {
        const groups = [...fs.form.referral.groups];
        const intervals = [...groups[gIdx].intervals];
        intervals[iIdx] = {
            ...intervals[iIdx],
            referred: { ...intervals[iIdx].referred, [field]: value },
        };
        groups[gIdx] = { ...groups[gIdx], intervals };
        fs.set("referral.groups", groups);
    }, [fs]);

    // ─────────────────────────────────────────────────────────────────────────
    // RESOURCE PICKER
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Blocked IDs for a group picker:
     *   - products already in OTHER groups
     */
    const getBlockedIdsForGroup = useCallback((gIdx) => {
        const otherGroupIds = (fs.form.referral.groups ?? [])
            .filter((_, i) => i !== gIdx)
            .flatMap((g) => (g.products ?? []).map((p) => p.id));
        return new Set(otherGroupIds);
    }, [fs]);

    const openGroupProductsPicker = useCallback(async (gIdx) => {
        const group = fs.form.referral.groups[gIdx];
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
                `${blocked.length} product${blocked.length > 1 ? "s" : ""} skipped — already in another group: ${blocked.join(", ")}`,
                { isError: true }
            );
        }
        if (allowed.length > 0) {
            updateGroupField(gIdx, "products", allowed);
        }
    }, [fs, shopify, updateGroupField, getBlockedIdsForGroup]);

    const removeGroupProduct = useCallback((gIdx, productId) => {
        const group = fs.form.referral.groups[gIdx];
        updateGroupField(gIdx, "products", group.products.filter((p) => p.id !== productId));
    }, [fs, updateGroupField]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER HELPER — Referrer + Referred points fields (reusable)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Renders a referrer/referred points pair.
     * Used at: global (P1), global intervals (P2), group (P3), group intervals (P4).
     *
     * @param {object} referrerVal  - referrer object with .points / .renewalPoints
     * @param {object} referredVal  - referred object with .points / .renewalPoints
     * @param {function} onReferrer - (field, value) => void
     * @param {function} onReferred - (field, value) => void
     * @param {object}   opts       - { showRenewalToggle: bool }
     */
    const renderPointsFields = (
        referrerVal,
        referredVal,
        onReferrer,
        onReferred,
        { showRenewalToggle = false } = {}
    ) => (
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            {/* Referrer side */}
            <s-box
                padding="base"
                background="base"
                borderWidth="base"
                borderColor="base"
                borderRadius="base"
            >
                <s-text><strong>Referrer</strong></s-text>
                <s-box paddingBlockEnd="small" />
                <s-number-field
                    label="Points"
                    suffix="points"
                    step={1} min={0}
                    value={referrerVal?.points ?? ""}
                    disabled={busy}
                    onInput={(e) => onReferrer("points", e.target.value ? Number(e.target.value) : 0)}
                />
                <s-box paddingBlockEnd="small" />
                <s-number-field
                    label="Renewal Points"
                    suffix="points"
                    step={1} min={0}
                    value={referrerVal?.renewalPoints ?? ""}
                    disabled={busy}
                    details="Earned by the referrer on each subscription renewal."
                    onInput={(e) => onReferrer("renewalPoints", e.target.value ? Number(e.target.value) : 0)}
                />
            </s-box>

            {/* Referred side */}
            <s-box
                padding="base"
                background="base"
                borderWidth="base"
                borderColor="base"
                borderRadius="base"
            >
                <s-text><strong>Referred</strong></s-text>
                <s-box paddingBlockEnd="small" />
                <s-number-field
                    label="Points"
                    suffix="points"
                    step={1} min={0}
                    value={referredVal?.points ?? ""}
                    disabled={busy}
                    onInput={(e) => onReferred("points", e.target.value ? Number(e.target.value) : 0)}
                />
                <s-box paddingBlockEnd="small" />
                <s-number-field
                    label="Renewal Points"
                    suffix="points"
                    step={1} min={0}
                    value={referredVal?.renewalPoints ?? ""}
                    disabled={busy}
                    details="Earned by the referred customer on each subscription renewal."
                    onInput={(e) => onReferred("renewalPoints", e.target.value ? Number(e.target.value) : 0)}
                />
            </s-box>
        </s-grid>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // DERIVED
    // ─────────────────────────────────────────────────────────────────────────

    const referral = fs.form.referral;
    const ref = referral.referrer;
    const referred = referral.referred;

    // Priority 2 + 3 sections unlock only after global points are valid
    const globalPointsValid =
        Number(ref.points) > 0 &&
        Number(referred.points) > 0 &&
        Number(referred.discountValue) > 0;

    // Only show renewals for subscription-based trigger
    const isSubscription = referral.trigger === "subscription" || referral.trigger === "both";

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
                                {mode === "edit" ? "Edit" : "Create"} — Referral Rule
                            </h2>
                        </s-stack>
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
                            <s-heading>Referral Trigger</s-heading>
                            <s-text tone="subdued">
                                Choose what type of purchase activates the referral reward. This controls when the referrer earns points and when the referred customer's discount becomes eligible.
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-choice-list
                                name="referralTrigger"
                                value={[referral.trigger]}
                                onInput={(e) => fs.set("referral.trigger", e.currentTarget.values[0])}
                            >
                                <s-choice value="oneTime" selected={referral.trigger === "oneTime"}>
                                    One-time Purchase — Regular orders only
                                </s-choice>
                                <s-choice value="subscription" selected={referral.trigger === "subscription"}>
                                    Subscription — Subscription orders only
                                </s-choice>
                                <s-choice value="both" selected={referral.trigger === "both"}>
                                    Both — All order types
                                </s-choice>
                            </s-choice-list>
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── Referred: Discount (Global Only, never overridden) ── */}
                        <s-section>
                            <s-heading>Referred Customer Discount</s-heading>
                            <s-text tone="subdued">
                                This is the discount voucher your referred customer receives when they use a referral link. It is applied on their first qualifying order. This discount is always the same for everyone — it cannot be changed per group or per subscription interval.
                            </s-text>
                            <s-box paddingBlockEnd="base" />
                            <s-choice-list
                                name="discountType"
                                value={[referred.discountType]}
                                onInput={(e) => fs.set("referral.referred.discountType", e.currentTarget.values[0])}
                            >
                                <s-choice value="fixed" selected={referred.discountType === "fixed"}>
                                    Fixed Amount ($)
                                </s-choice>
                                <s-choice value="percentage" selected={referred.discountType === "percentage"}>
                                    Percentage (%)
                                </s-choice>
                            </s-choice-list>
                            <s-box paddingBlockEnd="base" />
                            <s-number-field
                                label="Discount Value"
                                prefix={referred.discountType === "fixed" ? "$" : ""}
                                suffix={referred.discountType === "percentage" ? "%" : ""}
                                step={1} min={0}
                                value={referred.discountValue ?? ""}
                                disabled={busy}
                                onInput={(e) => fs.set("referral.referred.discountValue", e.target.value ? Number(e.target.value) : 0)}
                            />
                            {fs.errorFor("referral.referred.discountValue") && (
                                <s-text tone="critical">{fs.errorFor("referral.referred.discountValue")}</s-text>
                            )}
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── PRIORITY 1: Global Points Fallback ── */}
                        <s-section>
                            <s-heading>Referral Points</s-heading>
                            <s-text tone="subdued">
                                Set how many points the referrer earns and how many the referred customer earns. These are the default amounts — they apply when the purchased product does not belong to any group and the subscription interval does not match any override below.
                            </s-text>
                            <s-box paddingBlockEnd="base" />

                            {renderPointsFields(
                                ref,
                                referred,
                                (field, value) => fs.set(`referral.referrer.${field}`, value),
                                (field, value) => fs.set(`referral.referred.${field}`, value),
                            )}

                            {fs.errorFor("referral.referrer.points") && (
                                <s-text tone="critical">{fs.errorFor("referral.referrer.points")}</s-text>
                            )}
                            {fs.errorFor("referral.referred.points") && (
                                <s-text tone="critical">{fs.errorFor("referral.referred.points")}</s-text>
                            )}

                            {/* Renewal reward toggles — only meaningful for subscription */}
                            {isSubscription && (
                                <>
                                    <s-box paddingBlockEnd="base" />
                                    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                                        <s-switch
                                            labelAccessibilityVisibility="exclusion"
                                            label={ref.allowRenewalReward ? "Referrer Renewal Reward: On" : "Referrer Renewal Reward: Off"}
                                            checked={ref.allowRenewalReward}
                                            disabled={busy}
                                            onChange={(e) => fs.set("referral.referrer.allowRenewalReward", e.target.checked)}
                                            details="When enabled, the referrer earns points every time their referred customer renews their subscription. Set the renewal points amount in the field above."
                                        />
                                        <s-switch
                                            labelAccessibilityVisibility="exclusion"
                                            label={referred.allowRenewalReward ? "Referred Renewal Reward: On" : "Referred Renewal Reward: Off"}
                                            checked={referred.allowRenewalReward}
                                            disabled={busy}
                                            onChange={(e) => fs.set("referral.referred.allowRenewalReward", e.target.checked)}
                                            details="When enabled, the referred customer earns points every time they renew their own subscription. Set the renewal points amount in the field above."
                                        />
                                    </s-grid>
                                </>
                            )}
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── PRIORITY 2: Global Interval Override ── */}
                        {/* Unlocks only after global points are valid + subscription trigger */}
                        {globalPointsValid && isSubscription && (
                            <s-section>
                                <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                    <div>
                                        <s-heading>Subscription Interval Overrides</s-heading>
                                        <s-text tone="subdued">
                                            Give different referral point amounts based on the subscription interval. For example, reward more points when a friend subscribes yearly instead of monthly. These rates apply only when the product is not in any group below.
                                        </s-text>
                                    </div>
                                    <s-button variant="primary" disabled={busy} onClick={addInterval}>
                                        + Add Interval
                                    </s-button>
                                </s-grid>

                                {(referral.intervals ?? []).length > 0 && (
                                    <>
                                        <s-box paddingBlockEnd="base" />
                                        {referral.intervals.map((iv, idx) => (
                                            <s-box key={idx} paddingBlockEnd="base">
                                                <s-box
                                                    padding="base"
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
                                                        onInput={(e) => updateIntervalField(idx, "interval", e.target.value)}
                                                    />
                                                    <s-box paddingBlockEnd="small" />
                                                    {renderPointsFields(
                                                        iv.referrer,
                                                        iv.referred,
                                                        (field, value) => updateIntervalReferrer(idx, field, value),
                                                        (field, value) => updateIntervalReferred(idx, field, value),
                                                    )}
                                                </s-box>
                                            </s-box>
                                        ))}
                                    </>
                                )}
                            </s-section>
                        )}

                        {globalPointsValid && <s-box paddingBlockEnd="base" />}

                        {/* ── PRIORITY 3 + 4: Product Groups ── */}
                        {globalPointsValid && (
                            <s-section>
                                <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                    <div>
                                        <s-heading>Product Groups</s-heading>
                                        <s-text tone="subdued">
                                            Set different referral point amounts for specific products. When a referred customer purchases a product that belongs to a group, the group points are used instead of the global amounts. You can also add interval overrides inside each group — for example, extra points when a friend subscribes yearly to a premium product.
                                        </s-text>
                                    </div>
                                    <s-button variant="primary" disabled={busy} onClick={addGroup}>
                                        + Add Group
                                    </s-button>
                                </s-grid>

                                {(referral.groups ?? []).length > 0 && (
                                    <>
                                        <s-box paddingBlockEnd="base" />
                                        {referral.groups.map((group, gIdx) => (
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
                                                            onInput={(e) => updateGroupField(gIdx, "name", e.target.value)}
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
                                                    <s-text tone="subdued" style={{ fontSize: "0.75rem" }}>
                                                        Note: discount is always global and not overridden here.
                                                    </s-text>
                                                    <s-box paddingBlockEnd="small" />
                                                    {renderPointsFields(
                                                        group.referrer,
                                                        group.referred,
                                                        (field, value) => updateGroupReferrer(gIdx, field, value),
                                                        (field, value) => updateGroupReferred(gIdx, field, value),
                                                    )}

                                                    {/* Group renewal toggles */}
                                                    {isSubscription && (
                                                        <>
                                                            <s-box paddingBlockEnd="base" />
                                                            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                                                                <s-switch
                                                                    labelAccessibilityVisibility="exclusion"
                                                                    label={group.referrer?.allowRenewalReward ? "Referrer Renewal On" : "Referrer Renewal Off"}
                                                                    checked={group.referrer?.allowRenewalReward ?? false}
                                                                    disabled={busy}
                                                                    onChange={(e) => updateGroupReferrer(gIdx, "allowRenewalReward", e.target.checked)}
                                                                />
                                                                <s-switch
                                                                    labelAccessibilityVisibility="exclusion"
                                                                    label={group.referred?.allowRenewalReward ? "Referred Renewal On" : "Referred Renewal Off"}
                                                                    checked={group.referred?.allowRenewalReward ?? false}
                                                                    disabled={busy}
                                                                    onChange={(e) => updateGroupReferred(gIdx, "allowRenewalReward", e.target.checked)}
                                                                />
                                                            </s-grid>
                                                        </>
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
                                                                                    iv.referrer,
                                                                                    iv.referred,
                                                                                    (field, value) => updateGroupIntervalReferrer(gIdx, iIdx, field, value),
                                                                                    (field, value) => updateGroupIntervalReferred(gIdx, iIdx, field, value),
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
                            </s-section>
                        )}

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
                                <strong>Event:</strong> {event?.name ?? "Referral"}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Applies to:</strong>{" "}
                                {{ oneTime: "One-time purchases only", subscription: "Subscription orders only", both: "All orders (one-time + subscription)" }[referral.trigger] ?? referral.trigger}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Friend's discount:</strong>{" "}
                                {referred.discountType === "percentage"
                                    ? `${referred.discountValue || 0}% off on their first${referral.trigger === "subscription" ? " subscription" : ""} order`
                                    : `$${referred.discountValue || 0} off on their first${referral.trigger === "subscription" ? " subscription" : ""} order`}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Referrer earns:</strong>{" "}
                                {ref.points || 0} pts on first order
                                {isSubscription && ref.allowRenewalReward ? ` + ${ref.renewalPoints || 0} pts on every renewal` : ""}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Friend earns:</strong>{" "}
                                {referred.points || 0} pts on first order
                                {isSubscription && referred.allowRenewalReward ? ` + ${referred.renewalPoints || 0} pts on every renewal` : ""}
                            </s-text>
                            {(referral.groups ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="small" />
                                    <s-text>
                                        <strong>Product groups:</strong> {(referral.groups ?? []).length} group{(referral.groups ?? []).length !== 1 ? "s" : ""} with custom rates
                                        {" — "}{(referral.groups ?? []).map(g => g.name).filter(Boolean).join(", ")}
                                    </s-text>
                                </>
                            )}
                            {(referral.intervals ?? []).length > 0 && (
                                <>
                                    <s-box paddingBlockEnd="small" />
                                    <s-text>
                                        <strong>Interval overrides:</strong> {(referral.intervals ?? []).length} subscription interval{(referral.intervals ?? []).length !== 1 ? "s" : ""} with custom rates
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