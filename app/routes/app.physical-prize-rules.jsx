/**
 * @file app.physical-prizes.jsx
 * @description Physical Prize management page — list / create / edit.
 *
 * Uses useFormState for form state, dirty tracking, and validation.
 * Uses SaveBar for the floating save / discard bar.
 * Image is sent as multipart with form data on submit (no pre-upload).
 */

import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import { shopifyUploadFile } from "@app/fileUpload.server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";
import { useFormState, str, num, bool } from "@app/hooks/useFormState";
import { SaveBar } from "@app/components/saveBar/SaveBar";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const prizes = await prisma.physicalPrize.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "desc" },
    });
    return { prizes };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ── Helper: upload image if a real file was provided ─────────────────────
    const uploadImageIfPresent = async (file) => {
        if (!file || typeof file === "string" || file.size === 0) return null;
        const result = await shopifyUploadFile(admin, file, {
            allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
            maxSize: 5 * 1024 * 1024,
            waitForReady: true,
        });
        if (!result.ok) throw new Error(result.error?.message || "Image upload failed.");
        return result.file.url;
    };

    // ── CREATE ────────────────────────────────────────────────────────────────
    if (submitType === "addPrize") {
        const data = JSON.parse(formData.get("prize") || "{}");

        if (!data.title?.trim())
            return { message: "Title is required.", status: "error", submitType };
        if (!data.pointsCost || Number(data.pointsCost) <= 0)
            return { message: "Points cost must be greater than 0.", status: "error", submitType };

        try {
            const uploadedUrl = await uploadImageIfPresent(formData.get("image"));

            const created = await prisma.physicalPrize.create({
                data: {
                    title: data.title.trim(),
                    description: data.description || null,
                    imageUrl: uploadedUrl || null,
                    pointsCost: Number(data.pointsCost),
                    productValue: data.productValue ? Number(data.productValue) : null,
                    isActive: data.isActive ?? true,
                    session: { connect: { id: session.id } },
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Prize created successfully.", prize: created, status: "success", submitType };
        } catch (err) {
            console.error("Create PhysicalPrize Error:", err);
            return { message: err.message || "Failed to create prize.", status: "error", submitType };
        }
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (submitType === "updatePrize") {
        const data = JSON.parse(formData.get("prize") || "{}");

        if (!data.id)
            return { message: "Prize ID is required.", status: "error", submitType };
        if (!data.title?.trim())
            return { message: "Title is required.", status: "error", submitType };
        if (!data.pointsCost || Number(data.pointsCost) <= 0)
            return { message: "Points cost must be greater than 0.", status: "error", submitType };

        try {
            const existing = await prisma.physicalPrize.findUnique({ where: { id: parseInt(data.id) } });
            if (!existing || existing.sessionId !== session.id)
                return { message: "Prize not found or access denied.", status: "error", submitType };

            const uploadedUrl = await uploadImageIfPresent(formData.get("image"));
            // New upload wins; otherwise keep whatever imageUrl came from form state
            const imageUrl = uploadedUrl || data.imageUrl || null;

            const updated = await prisma.physicalPrize.update({
                where: { id: parseInt(data.id) },
                data: {
                    title: data.title.trim(),
                    description: data.description || null,
                    imageUrl,
                    pointsCost: Number(data.pointsCost),
                    productValue: data.productValue ? Number(data.productValue) : null,
                    isActive: data.isActive ?? true,
                },
            });

            await syncAppConfig(admin, session);
            return { message: "Prize updated successfully.", prize: updated, status: "success", submitType };
        } catch (err) {
            console.error("Update PhysicalPrize Error:", err);
            return { message: err.message || "Failed to update prize.", status: "error", submitType };
        }
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (submitType === "deletePrize") {
        const prizeId = parseInt(formData.get("prizeId"));
        if (!prizeId)
            return { message: "Prize ID is required.", status: "error", submitType };

        try {
            const prize = await prisma.physicalPrize.findUnique({ where: { id: prizeId } });
            if (!prize || prize.sessionId !== session.id)
                return { message: "Prize not found or access denied.", status: "error", submitType };

            await prisma.physicalPrize.delete({ where: { id: prizeId } });
            await syncAppConfig(admin, session);
            return { message: "Prize deleted successfully.", status: "success", submitType };
        } catch (err) {
            console.error("Delete PhysicalPrize Error:", err);
            return { message: err.message || "Failed to delete prize.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

// ─────────────────────────────────────────────────────────────────────────────
// FORM SHAPE
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_PRIZE_DATA = {
    id: null, title: null, description: null, imageUrl: null,
    pointsCost: null, productValue: null, isActive: true,
};

function buildFormShape(data) {
    return {
        id: data?.id ?? null,
        title: str(data?.title),
        description: str(data?.description),
        imageUrl: data?.imageUrl ?? null,
        pointsCost: num(data?.pointsCost),
        productValue: num(data?.productValue),
        isActive: bool(data?.isActive ?? true),
    };
}

const PER_PAGE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PhysicalPrizesPage() {
    const submitRR = useSubmit();
    const loaderData = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const formRef = useRef(null);

    // ── View state ────────────────────────────────────────────────────────────
    const [view, setView] = useState("list");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [multiplier, setMultiplier] = useState(15);
    const [pointsPerDollar, setPointsPerDollar] = useState(10);

    // ── Submission state ──────────────────────────────────────────────────────
    const pendingSubmitType = navigation.formData?.get("submitType") ?? null;
    const isSubmitting = navigation.state === "submitting";
    const isSaving = isSubmitting && pendingSubmitType === "addPrize";
    const isUpdating = isSubmitting && pendingSubmitType === "updatePrize";
    const isDeleting = isSubmitting && pendingSubmitType === "deletePrize";
    const isAnyBusy = isSubmitting;

    // ── useFormState ──────────────────────────────────────────────────────────
    const fs = useFormState(EMPTY_PRIZE_DATA, buildFormShape, {
        validate: (form) => {
            const errors = {};
            if (!form.title?.trim())
                errors.title = "Title is required.";
            if (!form.pointsCost || Number(form.pointsCost) <= 0)
                errors.pointsCost = "Points cost must be greater than 0.";
            return errors;
        },
    });

    // ── ACTION DATA EFFECT ────────────────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });

        if (actionData.status === "success") {
            if (actionData.submitType === "addPrize" || actionData.submitType === "updatePrize") {
                setView("list");
                fs.reset();
            }
            if (actionData.submitType === "deletePrize") {
                setDeleteTarget(null);
            }
        }
    }, [actionData]);

    useEffect(() => { setCurrentPage(1); }, [loaderData?.prizes?.length]);

    // ── DERIVED ───────────────────────────────────────────────────────────────
    const prizes = loaderData?.prizes ?? [];
    const totalPages = Math.max(1, Math.ceil(prizes.length / PER_PAGE));
    const paginatedPrizes = prizes.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    const suggestedPoints = useMemo(() => {
        const val = Number(fs.form.productValue);
        if (!val || val <= 0) return null;
        return Math.round(val * multiplier * pointsPerDollar);
    }, [fs.form.productValue, multiplier, pointsPerDollar]);

    // ── NAVIGATION HELPERS ────────────────────────────────────────────────────
    const goToCreate = useCallback(() => {
        fs.reset();
        setView("create");
    }, [fs]);

    const goToEdit = useCallback((p) => {
        // Sync form state to the selected prize
        const shape = buildFormShape(p);
        // Use setMany to batch-load all fields into form state
        fs.setMany(Object.entries(shape));
        // Update snapshot so isDirty starts false
        fs.syncAfterSave(p);
        setView("edit");
    }, [fs]);

    const goToList = useCallback(() => {
        setView("list");
        fs.reset();
    }, [fs]);

    // ── SUBMIT HELPERS ────────────────────────────────────────────────────────
    const buildMultipartFD = useCallback((submitType) => {
        const fd = new FormData(formRef.current);
        fd.set("submitType", submitType);
        fd.set("prize", JSON.stringify(fs.form));
        return fd;
    }, [fs.form]);

    const handleSave = useCallback(async () => {
        const valid = await fs.submit();
        if (!valid) return;
        submitRR(buildMultipartFD("addPrize"), { method: "post", encType: "multipart/form-data" });
    }, [fs, buildMultipartFD, submitRR]);

    const handleUpdate = useCallback(async () => {
        const valid = await fs.submit();
        if (!valid) return;
        submitRR(buildMultipartFD("updatePrize"), { method: "post", encType: "multipart/form-data" });
    }, [fs, buildMultipartFD, submitRR]);

    const handleDelete = useCallback(() => {
        if (!deleteTarget) return;
        submitRR({ submitType: "deletePrize", prizeId: deleteTarget.id }, { method: "post" });
    }, [deleteTarget, submitRR]);

    const handleDiscard = useCallback(() => {
        fs.reset();
    }, [fs]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — header bar
    // ─────────────────────────────────────────────────────────────────────────

    const renderHeading = () => {
        if (view === "list") {
            return (
                <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                    <h2 style={{ marginBlock: "0" }}>Physical Prizes</h2>
                    <s-button variant="primary" onClick={goToCreate} disabled={isAnyBusy}>
                        Add New Prize
                    </s-button>
                </s-grid>
            );
        }
        const isEdit = view === "edit";
        return (
            <s-stack direction="inline" gap="small" alignItems="center">
                <s-button
                    variant="plain" onClick={goToList} disabled={isAnyBusy}
                    style={{ padding: 0, minHeight: "unset" }}
                >
                    Prizes
                </s-button>
                <s-text tone="subdued">›</s-text>
                <h2 style={{ marginBlock: "0" }}>{isEdit ? "Edit Prize" : "Add New Prize"}</h2>
            </s-stack>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — prizes table
    // ─────────────────────────────────────────────────────────────────────────

    const renderTable = () => (
        <s-section>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Image</s-table-header>
                    <s-table-header>Title</s-table-header>
                    <s-table-header>Product Value</s-table-header>
                    <s-table-header>Points Cost</s-table-header>
                    <s-table-header>Active</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {paginatedPrizes.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan="6" style={{ textAlign: "center", padding: "3rem" }}>
                                No prizes yet. Click "Add New Prize" to get started.
                            </s-table-cell>
                        </s-table-row>
                    ) : (
                        paginatedPrizes.map((p) => (
                            <s-table-row key={p.id}>
                                <s-table-cell>
                                    {p.imageUrl ? (
                                        <img
                                            src={p.imageUrl} alt={p.title}
                                            style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "6px" }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: "48px", height: "48px", borderRadius: "6px",
                                            background: "#f0f0f0", display: "flex",
                                            alignItems: "center", justifyContent: "center", fontSize: "20px",
                                        }}>🎁</div>
                                    )}
                                </s-table-cell>
                                <s-table-cell>
                                    <s-text variant="headingSm">{p.title}</s-text>
                                    {p.description && (
                                        <s-text tone="subdued" variant="bodySm">
                                            {p.description.length > 60 ? p.description.slice(0, 60) + "…" : p.description}
                                        </s-text>
                                    )}
                                </s-table-cell>
                                <s-table-cell>
                                    {p.productValue ? `$${Number(p.productValue).toLocaleString()}` : "—"}
                                </s-table-cell>
                                <s-table-cell>
                                    <strong>{Number(p.pointsCost).toLocaleString()} pts</strong>
                                </s-table-cell>
                                <s-table-cell>{p.isActive ? "✅ Yes" : "❌ No"}</s-table-cell>
                                <s-table-cell>
                                    <s-stack gap="small" direction="inline">
                                        <s-button
                                            variant="text" size="small" icon="edit"
                                            disabled={isAnyBusy} onClick={() => goToEdit(p)}
                                        />
                                        <s-button
                                            variant="text" size="small" icon="delete" destructive
                                            disabled={isAnyBusy}
                                            onClick={() => setDeleteTarget(p)}
                                            commandFor="delete-prize-modal" command="--show"
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
                        variant="plain" disabled={currentPage === 1 || isAnyBusy}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >← Prev</s-button>
                    <s-text>Page {currentPage} of {totalPages}</s-text>
                    <s-button
                        variant="plain" disabled={currentPage === totalPages || isAnyBusy}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >Next →</s-button>
                </s-stack>
            )}
        </s-section>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — create / edit form
    // ─────────────────────────────────────────────────────────────────────────

    const renderForm = () => {
        const busy = isSaving || isUpdating;
        const isEdit = view === "edit";
        const imageFile = fs.pendingFiles?.image?.[0] ?? null;
        const imagePreviewUrl = imageFile ? URL.createObjectURL(imageFile) : null;

        return (
            <form ref={formRef}>
                <s-grid gridTemplateColumns="2fr 1fr" gap="base">

                    {/* ── Left ───────────────────────────────────────────── */}
                    <s-box>

                        {/* Title + Description */}
                        <s-box paddingBlockEnd="base">
                            <s-section>
                                <s-text-field
                                    label="Prize Title"
                                    placeholder="e.g. SanDisk CFexpress Card"
                                    value={fs.form.title}
                                    disabled={busy}
                                    error={fs.errorFor("title") ?? undefined}
                                    onInput={(e) => fs.set("title", e.target.value)}
                                    onBlur={() => fs.touchField("title")}
                                />
                                <s-box paddingBlockEnd="base" />
                                <s-text-area
                                    label="Description / Notes (Optional)"
                                    placeholder="e.g. Aspirational prize. Set value to your cost."
                                    value={fs.form.description}
                                    rows={3}
                                    disabled={busy}
                                    onInput={(e) => fs.set("description", e.target.value)}
                                />
                            </s-section>
                        </s-box>

                        {/* Image Upload */}
                        <s-box paddingBlockEnd="base">
                            <s-section>
                                <s-stack direction="block" gap="200">
                                    <s-text variant="headingSm">Prize Image (Optional)</s-text>
                                    <s-text tone="subdued" variant="bodySm">
                                        Upload an image to show customers what they can win. JPG, PNG, WebP or GIF. Max 5 MB.
                                    </s-text>

                                    {/* Existing image preview in edit mode */}
                                    {fs.form.imageUrl && !imageFile && (
                                        <s-stack direction="inline" gap="base" alignItems="center">
                                            <img
                                                src={fs.form.imageUrl}
                                                alt="Current prize image"
                                                style={{
                                                    width: "72px", height: "72px",
                                                    objectFit: "cover", borderRadius: "8px",
                                                    border: "1px solid #e0e0e0",
                                                }}
                                            />
                                            <s-stack direction="block" gap="100">
                                                <s-text variant="bodySm" tone="subdued">Current image</s-text>
                                                <s-button
                                                    variant="plain" destructive size="small"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        fs.set("imageUrl", null);
                                                        fs.removeMedia("imageUrl");
                                                    }}
                                                >
                                                    Remove
                                                </s-button>
                                            </s-stack>
                                        </s-stack>
                                    )}

                                    {/* New file selected — show local preview */}
                                    {imageFile && imagePreviewUrl && (
                                        <s-stack direction="inline" gap="base" alignItems="center">
                                            <img
                                                src={imagePreviewUrl}
                                                alt="Selected image preview"
                                                style={{
                                                    width: "72px", height: "72px",
                                                    objectFit: "cover", borderRadius: "8px",
                                                    border: "2px solid var(--nbl-primary, #0284c7)",
                                                }}
                                            />
                                            <s-stack direction="block" gap="100">
                                                <s-text variant="bodySm" tone="subdued">
                                                    {imageFile.name} — {(imageFile.size / 1024).toFixed(0)} KB
                                                </s-text>
                                                <s-button
                                                    variant="plain" destructive size="small"
                                                    disabled={busy}
                                                    onClick={() => fs.clearPendingFilesFor("image")}
                                                >
                                                    Remove
                                                </s-button>
                                            </s-stack>
                                        </s-stack>
                                    )}

                                    {/* Drop zone */}
                                    <s-drop-zone
                                        name="image"
                                        label="Prize image"
                                        accessibilityLabel="Upload prize image"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        multiple={false}
                                        disabled={busy}
                                        onChange={(e) => {
                                            const file = e.currentTarget?.files?.[0] ?? null;
                                            if (file) fs.fileSetterFor("image")([file]);
                                        }}
                                    />
                                </s-stack>
                            </s-section>
                        </s-box>

                        {/* Points Cost + Product Value */}
                        <s-box paddingBlockEnd="base">
                            <s-section>
                                <s-text variant="headingSm">Pricing</s-text>
                                <s-text tone="subdued" variant="bodySm">
                                    Set the product value and use the multiplier calculator below to work out the right points cost.
                                </s-text>
                                <s-box paddingBlockEnd="small" />
                                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                                    <s-number-field
                                        label="Product Value ($)"
                                        prefix="$"
                                        step={1} min={0}
                                        value={fs.form.productValue}
                                        disabled={busy}
                                        details="Estimated retail value of this prize."
                                        onInput={(e) => fs.set("productValue", e.target.value)}
                                        onBlur={() => fs.touchField("productValue")}
                                    />
                                    <s-number-field
                                        label="Points Cost"
                                        suffix="pts"
                                        step={1} min={1}
                                        value={fs.form.pointsCost}
                                        disabled={busy}
                                        details="How many points a customer needs to claim this prize."
                                        error={fs.errorFor("pointsCost") ?? undefined}
                                        onInput={(e) => fs.set("pointsCost", e.target.value)}
                                        onBlur={() => fs.touchField("pointsCost")}
                                    />
                                </s-grid>

                                {/* Suggested points from calculator */}
                                {suggestedPoints !== null && (
                                    <s-box paddingBlockStart="small">
                                        <s-stack direction="inline" gap="small" alignItems="center">
                                            <s-text tone="subdued" variant="bodySm">
                                                Suggested: <strong>{suggestedPoints.toLocaleString()} pts</strong>
                                            </s-text>
                                            <s-button
                                                variant="plain" size="small" disabled={busy}
                                                onClick={() => fs.set("pointsCost", String(suggestedPoints))}
                                            >
                                                Use this
                                            </s-button>
                                        </s-stack>
                                    </s-box>
                                )}
                            </s-section>
                        </s-box>

                        {/* Multiplier Calculator */}
                        <s-section>
                            <s-text variant="headingSm">Multiplier Calculator</s-text>
                            <s-text tone="subdued" variant="bodySm">
                                Points cost = Product value × Multiplier × Points per $1.
                                Lower multiplier = easier to claim (10x). Higher = harder (20x).
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                                <s-number-field
                                    label="Multiplier"
                                    suffix="x"
                                    step={1} min={1} max={100}
                                    value={multiplier}
                                    onInput={(e) => setMultiplier(Number(e.target.value) || 15)}
                                />
                                <s-number-field
                                    label="Points per $1 spent"
                                    suffix="pts"
                                    step={1} min={1}
                                    value={pointsPerDollar}
                                    onInput={(e) => setPointsPerDollar(Number(e.target.value) || 10)}
                                />
                            </s-grid>

                            {/* Calculated breakdown */}
                            {fs.form.productValue && suggestedPoints && (
                                <s-box paddingBlockStart="small">
                                    <s-text tone="subdued" variant="bodySm">
                                        ${Number(fs.form.productValue).toLocaleString()} × {multiplier}x × {pointsPerDollar} pts/$1
                                        {" = "}<strong>{suggestedPoints.toLocaleString()} pts</strong>
                                        {" · "}Spend equivalent: <strong>${(suggestedPoints / pointsPerDollar).toLocaleString()}</strong>
                                        {" · "}Effective return: <strong>{((Number(fs.form.productValue) / (suggestedPoints / pointsPerDollar)) * 100).toFixed(1)}%</strong>
                                        {" · "}Value per point: <strong>${(Number(fs.form.productValue) / suggestedPoints).toFixed(4)}</strong>
                                    </s-text>
                                </s-box>
                            )}
                        </s-section>
                    </s-box>

                    {/* ── Right ──────────────────────────────────────────── */}
                    <s-box>
                        {/* Summary */}
                        <s-section>
                            <s-text variant="headingSm">Summary</s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text><strong>Title:</strong> {fs.form.title || "—"}</s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Product value:</strong>{" "}
                                {fs.form.productValue ? `$${Number(fs.form.productValue).toLocaleString()}` : "—"}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Points cost:</strong>{" "}
                                {fs.form.pointsCost ? `${Number(fs.form.pointsCost).toLocaleString()} pts` : "—"}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Image:</strong>{" "}
                                {imageFile
                                    ? `✅ ${imageFile.name}`
                                    : fs.form.imageUrl
                                        ? "✅ Uploaded"
                                        : "❌ None"}
                            </s-text>
                            <s-box paddingBlockEnd="small" />
                            <s-text>
                                <strong>Status:</strong>{" "}
                                {fs.form.isActive ? "Active ✅" : "Inactive ❌"}
                            </s-text>
                        </s-section>

                        <s-box paddingBlockEnd="base" />

                        {/* Active Status */}
                        <s-section>
                            <s-text variant="headingSm">Active Status</s-text>
                            <s-text tone="subdued" variant="bodySm">
                                Inactive prizes will not be shown to customers in the widget.
                            </s-text>
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

                {/* ── SaveBar ──────────────────────────────────────────── */}
                <SaveBar
                    visible={fs.isDirty || busy}
                    position="bottom-center"
                    message={isEdit ? "You have unsaved changes" : "New prize — not saved yet"}
                    primaryLabel={isEdit ? "Update Prize" : "Save Prize"}
                    secondaryLabel="Discard"
                    loading={busy}
                    disabled={busy}
                    onPrimary={isEdit ? handleUpdate : handleSave}
                    onSecondary={handleDiscard}
                />
            </form>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER — delete modal
    // ─────────────────────────────────────────────────────────────────────────

    const renderDeleteModal = () => (
        <s-modal id="delete-prize-modal" heading="Delete Prize" size="small">
            <s-paragraph color="subdued">
                Are you sure you want to delete <strong>{deleteTarget?.title}</strong>?
                Existing claims will not be affected, but customers will no longer be able to claim this prize.
                This action cannot be undone.
            </s-paragraph>
            <s-button
                slot="secondary-actions"
                commandFor="delete-prize-modal" command="--hide"
                disabled={isDeleting}
            >
                Cancel
            </s-button>
            <s-button
                slot="primary-action" variant="primary" destructive
                onClick={handleDelete}
                commandFor="delete-prize-modal" command="--hide"
                loading={isDeleting} disabled={isDeleting}
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