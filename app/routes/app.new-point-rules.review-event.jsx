import { useCallback, useEffect } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation, useNavigate, redirect } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";
import { useFormState, str, bool, num } from "@app/hooks/useFormState";
import { SaveBar } from "@app/components/saveBar/SaveBar";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const ruleId = url.searchParams.get("ruleId");

    const event = await prisma.event.findFirst({
        where: { sessionId: session.id, type: "REVIEW", isActive: true },
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
                where: { sessionId: session.id, type: "REVIEW", isActive: true },
            });
            if (!event)
                return { message: "REVIEW event not found.", status: "error", submitType };

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
                    conditions: buildConditions(payload.review),
                    session: { connect: { id: session.id } },
                    event: { connect: { id: event.id } },
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule created successfully.", rule: created, status: "success", submitType };
        } catch (err) {
            console.error("Create REVIEW Rule Error:", err);
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
                    conditions: buildConditions(payload.review),
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Points rule updated successfully.", rule, status: "success", submitType };
        } catch (err) {
            console.error("Update REVIEW Rule Error:", err);
            return { message: "Failed to update rule. Please try again.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONDITIONS BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildConditions(review) {
    return {
        review: {
            // Each review type has its own isActive flag and points value.
            // isActive: false means this type is hidden/disabled — no points awarded.
            text: {
                isActive: Boolean(review.text?.isActive ?? true),
                points: Number(review.text?.points ?? 0),
            },
            image: {
                isActive: Boolean(review.image?.isActive ?? true),
                points: Number(review.image?.points ?? 0),
            },
            video: {
                isActive: Boolean(review.video?.isActive ?? true),
                points: Number(review.video?.points ?? 0),
            },

            // Controls how many times a customer can earn review points per product.
            // Possible values: "once" | "per_type" | "unlimited"
            rewardMode: review.rewardMode ?? "per_type",
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM SHAPE
// ─────────────────────────────────────────────────────────────────────────────

function buildFormShape(data) {
    const review = data?.conditions?.review ?? {};
    return {
        name: str(data?.name),
        description: str(data?.description),
        isActive: bool(data?.isActive ?? true),
        review: {
            text: {
                isActive: bool(review?.text?.isActive ?? true),
                points: num(review?.text?.points ?? 10),
            },
            image: {
                isActive: bool(review?.image?.isActive ?? true),
                points: num(review?.image?.points ?? 20),
            },
            video: {
                isActive: bool(review?.video?.isActive ?? true),
                points: num(review?.video?.points ?? 30),
            },
            rewardMode: str(review?.rewardMode ?? "per_type"),
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validate(form) {
    const errors = {};
    const review = form.review;

    const anyActive = review.text.isActive || review.image.isActive || review.video.isActive;
    if (!anyActive) {
        errors["review.types"] = "At least one review type must be enabled.";
    }

    if (review.text.isActive && (!review.text.points || Number(review.text.points) <= 0)) {
        errors["review.text.points"] = "Text review points must be greater than 0.";
    }
    if (review.image.isActive && (!review.image.points || Number(review.image.points) <= 0)) {
        errors["review.image.points"] = "Photo review points must be greater than 0.";
    }
    if (review.video.isActive && (!review.video.points || Number(review.video.points) <= 0)) {
        errors["review.video.points"] = "Video review points must be greater than 0.";
    }

    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_TYPES = [
    { key: "text", label: "Text Review", description: "Written review without any media." },
    { key: "image", label: "Photo Review", description: "Review with at least one image attached." },
    { key: "video", label: "Video Review", description: "Review with a video attached." },
];

const REWARD_MODES = [
    { value: "once", label: "Once per product", description: "Customer earns points once per product, regardless of review type." },
    { value: "per_type", label: "Once per review type", description: "Customer earns points separately for text, photo, and video — once each." },
    { value: "unlimited", label: "Every submission", description: "Every review submission earns points, no limits." },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ReviewEventPage() {
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
                review: form.review,
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
    const review = fs.form.review;

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
                                {mode === "edit" ? "Edit" : "Create"} — Review Rule
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

                        {/* ── Review Types ── */}
                        <s-section>
                            <s-heading>Review Types & Points</s-heading>
                            <s-text tone="subdued">
                                Enable or disable each review type and set how many points it earns.
                                Disabled types will not be shown to customers.
                            </s-text>
                            <s-box paddingBlockEnd="base" />

                            {fs.errorFor("review.types") && (
                                <>
                                    <s-text tone="critical">{fs.errorFor("review.types")}</s-text>
                                    <s-box paddingBlockEnd="small" />
                                </>
                            )}

                            {REVIEW_TYPES.map(({ key, label, description }) => {
                                const typeVal = review[key];
                                return (
                                    <s-box
                                        key={key}
                                        padding="base"
                                        background="base"
                                        borderWidth="base"
                                        borderColor="base"
                                        borderRadius="base"
                                        style={{ marginBlockEnd: "var(--s-space-base)" }}
                                    >
                                        <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                                            <div>
                                                <s-text><strong>{label}</strong></s-text>
                                                <s-box paddingBlockEnd="small" />
                                                <s-text tone="subdued">{description}</s-text>
                                            </div>
                                            <s-switch
                                                labelAccessibilityVisibility="exclusion"
                                                label={typeVal.isActive ? "Enabled" : "Disabled"}
                                                checked={typeVal.isActive}
                                                disabled={busy}
                                                onChange={(e) => fs.set(`review.${key}.isActive`, e.target.checked)}
                                            />
                                        </s-grid>

                                        {typeVal.isActive && (
                                            <>
                                                <s-box paddingBlockEnd="base" />
                                                <s-number-field
                                                    label="Points"
                                                    labelAccessibilityVisibility="exclusive"
                                                    suffix="points"
                                                    step={1}
                                                    min={1}
                                                    value={typeVal.points ?? ""}
                                                    disabled={busy}
                                                    onInput={(e) => fs.set(`review.${key}.points`, e.target.value ? Number(e.target.value) : 0)}
                                                />
                                                {fs.errorFor(`review.${key}.points`) && (
                                                    <s-text tone="critical">{fs.errorFor(`review.${key}.points`)}</s-text>
                                                )}
                                            </>
                                        )}
                                    </s-box>
                                );
                            })}
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* ── Reward Mode ── */}
                        <s-section>
                            <s-heading>Reward Mode</s-heading>
                            <s-text tone="subdued">
                                Controls how many times a customer can earn review points per product.
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-choice-list
                                name="rewardMode"
                                value={[review.rewardMode]}
                                onInput={(e) => fs.set("review.rewardMode", e.currentTarget.values[0])}
                            >
                                {REWARD_MODES.map(({ value, label, description }) => (
                                    <s-choice key={value} value={value} selected={review.rewardMode === value}>
                                        {label}
                                        <span slot="description">{description}</span>
                                    </s-choice>
                                ))}
                            </s-choice-list>
                        </s-section>

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
                                <strong>Event:</strong> {event?.name ?? "Review"}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            {REVIEW_TYPES.map(({ key, label }) => (
                                <s-box key={key} paddingBlockEnd="small">
                                    <s-text>
                                        <strong>{label}:</strong>{" "}
                                        {review[key].isActive
                                            ? `${review[key].points || 0} pts`
                                            : <s-text tone="subdued">Disabled</s-text>
                                        }
                                    </s-text>
                                </s-box>
                            ))}
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Reward Mode:</strong>{" "}
                                {REWARD_MODES.find((m) => m.value === review.rewardMode)?.label ?? review.rewardMode}
                            </s-text>
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