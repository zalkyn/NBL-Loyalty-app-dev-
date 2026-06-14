// ─── SERVER-ONLY imports — safe here because loader/action are server-only exports.
// React Router strips these from the client bundle automatically.
// ⚠️  NEVER import from .server files outside of loader/action — Vite will error.
import { authenticate } from "../shopify.server";
import {
    shopifyUploadFile,
    shopifyUploadFiles,
    shopifyUploadFromRequest,
    shopifyUploadMultipleFields,
} from "../fileUpload.server";

// ─── CLIENT-ONLY imports ─────────────────────────────────────────────────────
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { useRef, useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SAFE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
// SHOPIFY_UPLOAD_ERROR_CODES is defined in fileUpload.server — importing it
// on the client would break the build. Duplicate the strings here as a
// plain client constant. These are just string labels, no server logic.

const EC = Object.freeze({
    INVALID_INPUT:          "INVALID_INPUT",
    EMPTY_FILE:             "EMPTY_FILE",
    FILE_TOO_LARGE:         "FILE_TOO_LARGE",
    BATCH_TOO_LARGE:        "BATCH_TOO_LARGE",
    TOO_MANY_FILES:         "TOO_MANY_FILES",
    INVALID_TYPE:           "INVALID_TYPE",
    INVALID_EXTENSION:      "INVALID_EXTENSION",
    ATOMIC_BATCH_REJECTED:  "ATOMIC_BATCH_REJECTED",
    SHOPIFY_STAGE_ERROR:    "SHOPIFY_STAGE_ERROR",
    S3_UPLOAD_ERROR:        "S3_UPLOAD_ERROR",
    SHOPIFY_REGISTER_ERROR: "SHOPIFY_REGISTER_ERROR",
    POLL_TIMEOUT:           "POLL_TIMEOUT",
    POLL_FAILED:            "POLL_FAILED",
});

const INTENT = Object.freeze({
    SINGLE_IMAGE:      "single_image",
    SINGLE_VIDEO:      "single_video",
    SINGLE_PDF:        "single_pdf",
    MULTIPLE_IMAGES:   "multiple_images",
    MULTIPLE_ANY:      "multiple_any",
    FROM_REQUEST:      "from_request",
    MULTIPLE_FIELDS:   "multiple_fields",
});

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    return {
        shop: session.shop,
        sections: [
            { id: INTENT.SINGLE_IMAGE,    label: "① Single image",             accept: "image/jpeg,image/png,image/webp,image/gif", multiple: false, fieldName: "image"  },
            { id: INTENT.SINGLE_VIDEO,    label: "② Single video",             accept: "video/mp4,video/webm,video/quicktime",       multiple: false, fieldName: "video"  },
            { id: INTENT.SINGLE_PDF,      label: "③ Single PDF / document",    accept: "application/pdf",                            multiple: false, fieldName: "file"   },
            { id: INTENT.MULTIPLE_IMAGES, label: "④ Multiple images (atomic)", accept: "image/*",                                    multiple: true,  fieldName: "images" },
            { id: INTENT.MULTIPLE_ANY,    label: "⑤ Multiple — any type",      accept: "",                                           multiple: true,  fieldName: "files"  },
            { id: INTENT.FROM_REQUEST,    label: "⑥ fromRequest single",       accept: "image/jpeg,image/png,image/webp,image/gif",  multiple: false, fieldName: "avatar" },
            { id: INTENT.MULTIPLE_FIELDS, label: "⑦ Multiple fields",          accept: "",                                           multiple: true,  fieldName: "multi"  },
        ],
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const _t0  = Date.now();
    const _log = (label) => console.log(`[action] ${label} +${Date.now() - _t0}ms`);

    _log("action started");

    const { admin } = await authenticate.admin(request);
    _log("authenticate done");

    const formData = await request.formData();
    _log("formData parsed");

    const intent = formData.get("intent");
    console.log(`[action] intent = ${intent}`);

    try {
        if (intent === INTENT.SINGLE_IMAGE) {
            const result = await shopifyUploadFile(admin, formData.get("image"), {
                allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
                maxSize: 10 * 1024 * 1024,
            });
            _log("shopifyUploadFile done");
            return { intent, ok: result.ok, file: result.file ?? null, error: result.error ?? null, errors: result.errors, meta: result.meta };
        }

        if (intent === INTENT.SINGLE_VIDEO) {
            const result = await shopifyUploadFile(admin, formData.get("video"), {
                allowedTypes: ["video/mp4", "video/webm", "video/quicktime"],
                maxSize: 500 * 1024 * 1024,
            });
            _log("shopifyUploadFile done");
            return { intent, ok: result.ok, file: result.file ?? null, error: result.error ?? null, errors: result.errors, meta: result.meta };
        }

        if (intent === INTENT.SINGLE_PDF) {
            const result = await shopifyUploadFile(admin, formData.get("file"), {
                allowedTypes: ["application/pdf"],
                allowedExtensions: ["pdf"],
                maxSize: 20 * 1024 * 1024,
            });
            _log("shopifyUploadFile done");
            return { intent, ok: result.ok, file: result.file ?? null, error: result.error ?? null, errors: result.errors, meta: result.meta };
        }

        if (intent === INTENT.MULTIPLE_IMAGES) {
            const result = await shopifyUploadFiles(admin, formData.getAll("images"), {
                allowedTypes: ["image/"],
                maxFiles: 10,
                maxSize: 5 * 1024 * 1024,
                atomic: true,
            });
            _log("shopifyUploadFiles done");
            return { intent, ok: result.ok, files: result.files, errors: result.errors, meta: result.meta };
        }

        if (intent === INTENT.MULTIPLE_ANY) {
            const result = await shopifyUploadFiles(admin, formData.getAll("files"), {
                maxFiles: 10,
                maxSize: 50 * 1024 * 1024,
                atomic: false,
            });
            _log("shopifyUploadFiles done");
            return { intent, ok: result.ok, files: result.files, errors: result.errors, meta: result.meta };
        }

        if (intent === INTENT.FROM_REQUEST) {
            const clonedRequest = new Request(request.url, {
                method: "POST",
                body: formData,
                headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
            });
            const result = await shopifyUploadFromRequest(admin, clonedRequest, "avatar", {
                maxFiles: 1,
                allowedTypes: ["image/"],
                maxSize: 2 * 1024 * 1024,
            });
            _log("shopifyUploadFromRequest done");
            return { intent, ok: result.ok, file: result.file ?? null, error: result.error ?? null, errors: result.errors, meta: result.meta };
        }

        if (intent === INTENT.MULTIPLE_FIELDS) {
            const result = await shopifyUploadMultipleFields(admin, {
                thumbnail: {
                    files:   [formData.get("thumbnail")],
                    options: { allowedTypes: ["image/"], maxFiles: 1, maxSize: 2 * 1024 * 1024 },
                },
                gallery: {
                    files:   formData.getAll("gallery"),
                    options: { allowedTypes: ["image/"], maxFiles: 6, maxSize: 5 * 1024 * 1024 },
                },
                video: {
                    files:   [formData.get("video_mf")],
                    options: { allowedTypes: ["video/"], maxFiles: 1, maxSize: 200 * 1024 * 1024 },
                },
            });
            _log("shopifyUploadMultipleFields done");
            return { intent, ok: result.ok, files: result.files, errors: result.errors, meta: result.meta };
        }

        return { intent, ok: false, error: { message: "Unknown intent." }, errors: [], meta: null };

    } catch (err) {
        _log(`error: ${err?.message}`);
        return { intent, ok: false, error: { message: err?.message ?? "Server error." }, errors: [], meta: null };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FileResultCard({ file }) {
    if (!file) return null;
    const isImage = file.type?.startsWith("image/");
    return (
        <s-box padding="300" border-radius="200" background="bg-surface-secondary">
            <s-stack direction="block" gap="200">
                {isImage && file.url && (
                    <img
                        src={file.url}
                        alt={file.alt || file.name}
                        style={{ maxWidth: "100%", maxHeight: "160px", objectFit: "contain", borderRadius: "6px" }}
                    />
                )}
                <s-stack direction="inline" gap="200" align-y="center" wrap>
                    <s-badge tone={file.fileStatus === "READY" ? "success" : "attention"}>
                        {file.fileStatus ?? "PROCESSING"}
                    </s-badge>
                    <s-text variant="bodyMd" font-weight="semibold">{file.name}</s-text>
                    <s-text variant="bodySm" tone="subdued">{formatBytes(file.size)}</s-text>
                </s-stack>
                <s-text variant="bodySm" tone="subdued">
                    {file.url ?? "Processing — URL will be available shortly."}
                </s-text>
                {file.width && (
                    <s-text variant="bodySm" tone="subdued">{file.width} × {file.height}px</s-text>
                )}
            </s-stack>
        </s-box>
    );
}

function FilesResultList({ files }) {
    if (!files?.length) return null;
    return (
        <s-stack direction="block" gap="200">
            {files.map((f, i) => <FileResultCard key={f.id ?? i} file={f} />)}
        </s-stack>
    );
}

function ErrorList({ errors }) {
    if (!errors) return null;

    // Normalise: flat array OR grouped object { fieldName: UploadError[] }
    const flat = Array.isArray(errors)
        ? errors
        : Object.entries(errors).flatMap(([field, errs]) =>
              (errs ?? []).map((e) => ({ ...e, field }))
          );

    if (!flat.length) return null;

    return (
        <s-stack direction="block" gap="100">
            {flat.map((e, i) => (
                <s-banner
                    key={i}
                    tone="critical"
                    heading={[e.field && `[${e.field}]`, e.file].filter(Boolean).join(" ") || "Error"}
                >
                    {e.message}
                    {e.code && <> <s-badge>{e.code}</s-badge></>}
                </s-banner>
            ))}
        </s-stack>
    );
}

function MetaSummary({ meta }) {
    if (!meta) return null;
    return (
        <s-stack direction="inline" gap="400" wrap>
            <s-text variant="bodySm">✅ Uploaded: <strong>{meta.totalUploaded}</strong></s-text>
            <s-text variant="bodySm">❌ Failed: <strong>{meta.totalFailed}</strong></s-text>
            <s-text variant="bodySm">📦 Size: <strong>{formatBytes(meta.totalBytes)}</strong></s-text>
        </s-stack>
    );
}

function DebugBlock({ data, label }) {
    const [open, setOpen] = useState(false);
    if (!data) return null;
    return (
        <s-stack direction="block" gap="100">
            <s-button variant="plain" onClick={() => setOpen((v) => !v)}>
                {open ? "▲ Hide" : "▼ Show"} {label}
            </s-button>
            {open && (
                <pre style={{
                    fontSize: "11px", padding: "10px", margin: 0,
                    background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
                    borderRadius: "6px", overflowX: "auto",
                }}>
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </s-stack>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC UPLOAD SECTION  (sections ①–⑥)
// ─────────────────────────────────────────────────────────────────────────────

function UploadSection({ intent, label, accept, multiple, fieldName, actionData, isThisSubmitting }) {
    const submit   = useSubmit();
    const formRef  = useRef(null);
    const [files, setFiles] = useState([]);

    // Only show result when this section's intent matches
    const result = actionData?.intent === intent ? actionData : null;

    const handleChange = useCallback((e) => {
        setFiles(Array.from(e.currentTarget?.files ?? []));
    }, []);

    const handleDropRejected = useCallback(() => {
        shopify.toast.show("Some files were rejected — check type or size.", { isError: true });
    }, []);

    const handleSubmit = useCallback(() => {
        if (!files.length) {
            shopify.toast.show("Please select a file first.", { isError: true });
            return;
        }
        const fd = new FormData(formRef.current);
        fd.set("intent", intent);
        submit(fd, { method: "POST", encType: "multipart/form-data" });
    }, [files, intent, submit]);

    // Toast on result change
    useEffect(() => {
        if (!result) return;
        if (result.ok) {
            shopify.toast.show(`Upload successful — ${result.meta?.totalUploaded ?? 1} file(s) uploaded.`);
        } else if (result.error?.message) {
            shopify.toast.show(result.error.message, { isError: true, duration: 6000 });
        }
    }, [result]);

    return (
        <s-section heading={label}>
            <s-stack direction="block" gap="400">

                {/* Drop zone — wrapped in a plain <form> so FormData can read files */}
                <form ref={formRef}>
                    <s-drop-zone
                        name={fieldName}
                        label={`Drop or click to select — ${label}`}
                        accessibilityLabel={`File upload zone for ${label}`}
                        accept={accept}
                        multiple={multiple}
                        disabled={isThisSubmitting}
                        onChange={handleChange}
                        onDropRejected={handleDropRejected}
                    />
                </form>

                {/* Selected file list */}
                {files.length > 0 && (
                    <s-stack direction="block" gap="100">
                        <s-text variant="bodySm" tone="subdued">{files.length} file(s) selected:</s-text>
                        {files.map((f, i) => (
                            <s-stack key={i} direction="inline" gap="200" align-y="center" wrap>
                                <s-text variant="bodySm">{f.name}</s-text>
                                <s-text variant="bodySm" tone="subdued">{formatBytes(f.size)}</s-text>
                            </s-stack>
                        ))}
                    </s-stack>
                )}

                {/* Submit — loading only when THIS section is submitting */}
                <s-button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={isThisSubmitting || !files.length}
                    loading={isThisSubmitting}
                >
                    {isThisSubmitting ? "Uploading…" : "Upload to Shopify"}
                </s-button>

                {/* Results */}
                {result && (
                    <s-stack direction="block" gap="300">
                        <s-divider />
                        <MetaSummary meta={result.meta} />

                        {result.ok ? (
                            <s-banner tone="success" heading="Upload complete" dismissible>
                                {result.files?.length > 1
                                    ? `${result.files.length} files uploaded to Shopify CDN.`
                                    : "File uploaded to Shopify CDN."}
                            </s-banner>
                        ) : (
                            <s-banner tone="critical" heading="Upload failed" dismissible>
                                {result.error?.message ?? "One or more files failed."}
                            </s-banner>
                        )}

                        {result.file  && <FileResultCard file={result.file} />}
                        {result.files?.length > 0 && <FilesResultList files={result.files} />}
                        <ErrorList errors={result.errors} />
                        <DebugBlock data={result} label="Action data (raw JSON)" />
                    </s-stack>
                )}
            </s-stack>
        </s-section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTIPLE FIELDS SECTION  (section ⑦)
// ─────────────────────────────────────────────────────────────────────────────

function MultipleFieldsSection({ actionData, isThisSubmitting }) {
    const submit   = useSubmit();
    const formRef  = useRef(null);

    const [thumbFiles,   setThumbFiles]   = useState([]);
    const [galleryFiles, setGalleryFiles] = useState([]);
    const [videoFiles,   setVideoFiles]   = useState([]);

    const result = actionData?.intent === INTENT.MULTIPLE_FIELDS ? actionData : null;

    const handleSubmit = useCallback(() => {
        const hasAny = thumbFiles.length || galleryFiles.length || videoFiles.length;
        if (!hasAny) {
            shopify.toast.show("Select at least one file.", { isError: true });
            return;
        }
        const fd = new FormData(formRef.current);
        fd.set("intent", INTENT.MULTIPLE_FIELDS);
        submit(fd, { method: "POST", encType: "multipart/form-data" });
    }, [thumbFiles, galleryFiles, videoFiles, submit]);

    useEffect(() => {
        if (!result) return;
        if (result.ok) {
            shopify.toast.show(`Multi-field upload: ${result.meta?.totalUploaded ?? 0} file(s) uploaded.`);
        } else {
            shopify.toast.show("Some fields had errors — check the results below.", { isError: true, duration: 6000 });
        }
    }, [result]);

    const fieldResult = (fieldName) => {
        if (!result) return null;
        return {
            files:  result.files?.filter((f) => f.field === fieldName) ?? [],
            errors: (Array.isArray(result.errors) ? result.errors : result.errors?.[fieldName]) ?? [],
        };
    };

    return (
        <s-section heading="⑦ Multiple fields (thumbnail + gallery + video)">
            <s-stack direction="block" gap="500">
                <form ref={formRef}>

                    {/* Thumbnail */}
                    <s-stack direction="block" gap="200">
                        <s-text variant="headingSm">Thumbnail — 1 image, max 2 MB</s-text>
                        <s-drop-zone
                            name="thumbnail"
                            label="Thumbnail"
                            accessibilityLabel="Upload thumbnail image"
                            accept="image/jpeg,image/png,image/webp"
                            multiple={false}
                            disabled={isThisSubmitting}
                            onChange={(e) => setThumbFiles(Array.from(e.currentTarget?.files ?? []))}
                        />
                        {thumbFiles[0] && (
                            <s-text variant="bodySm" tone="subdued">{thumbFiles[0].name} — {formatBytes(thumbFiles[0].size)}</s-text>
                        )}
                    </s-stack>

                    <s-divider />

                    {/* Gallery */}
                    <s-stack direction="block" gap="200">
                        <s-text variant="headingSm">Gallery — up to 6 images, max 5 MB each</s-text>
                        <s-drop-zone
                            name="gallery"
                            label="Gallery images"
                            accessibilityLabel="Upload gallery images"
                            accept="image/*"
                            multiple
                            disabled={isThisSubmitting}
                            onChange={(e) => setGalleryFiles(Array.from(e.currentTarget?.files ?? []))}
                        />
                        {galleryFiles.length > 0 && (
                            <s-text variant="bodySm" tone="subdued">{galleryFiles.length} image(s) selected</s-text>
                        )}
                    </s-stack>

                    <s-divider />

                    {/* Video */}
                    <s-stack direction="block" gap="200">
                        <s-text variant="headingSm">Video — 1 video, max 200 MB</s-text>
                        <s-drop-zone
                            name="video_mf"
                            label="Video"
                            accessibilityLabel="Upload video file"
                            accept="video/mp4,video/webm,video/quicktime"
                            multiple={false}
                            disabled={isThisSubmitting}
                            onChange={(e) => setVideoFiles(Array.from(e.currentTarget?.files ?? []))}
                        />
                        {videoFiles[0] && (
                            <s-text variant="bodySm" tone="subdued">{videoFiles[0].name} — {formatBytes(videoFiles[0].size)}</s-text>
                        )}
                    </s-stack>

                </form>

                <s-button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={isThisSubmitting}
                    loading={isThisSubmitting}
                >
                    {isThisSubmitting ? "Uploading all fields…" : "Upload all fields"}
                </s-button>

                {/* Per-field results */}
                {result && (
                    <s-stack direction="block" gap="400">
                        <s-divider />
                        <MetaSummary meta={result.meta} />

                        {["thumbnail", "gallery", "video"].map((field) => {
                            const r = fieldResult(field);
                            if (!r) return null;
                            const hasError   = r.errors.length > 0;
                            const hasSuccess = r.files.length > 0;
                            return (
                                <s-stack key={field} direction="block" gap="200">
                                    <s-text variant="headingSm">{field}</s-text>
                                    {hasError   && <ErrorList errors={r.errors} />}
                                    {hasSuccess && (
                                        <>
                                            <s-banner tone="success" heading={`${field} uploaded`} dismissible>
                                                {r.files.length} file(s) → Shopify CDN
                                            </s-banner>
                                            <FilesResultList files={r.files} />
                                        </>
                                    )}
                                    {!hasError && !hasSuccess && (
                                        <s-text variant="bodySm" tone="subdued">No file submitted for {field}.</s-text>
                                    )}
                                </s-stack>
                            );
                        })}

                        <DebugBlock data={result} label="Action data (raw JSON)" />
                    </s-stack>
                )}
            </s-stack>
        </s-section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function FileUpload() {
    const loaderData   = useLoaderData();
    const actionData   = useActionData();
    const navigation   = useNavigation();

    const isSubmitting = navigation.state === "submitting";
    // Which intent is currently in-flight?  Used to show loading only on the
    // section that triggered the submit, not all sections at once.
    const submittingIntent = isSubmitting
        ? (navigation.formData?.get("intent") ?? null)
        : null;

    return (
        <s-page heading="Shopify File Upload — All Examples">

            {/* Loader info */}
            <s-section heading="Loader data — session info">
                <s-stack direction="block" gap="200">
                    <s-stack direction="inline" gap="200" align-y="center">
                        <s-badge tone="info">Shop</s-badge>
                        <s-text variant="bodyMd">{loaderData.shop}</s-text>
                    </s-stack>
                    <DebugBlock data={loaderData} label="Full loader data (raw JSON)" />
                </s-stack>
            </s-section>

            {/* Sections ①–⑥ */}
            {loaderData.sections
                .filter((sec) => sec.id !== INTENT.MULTIPLE_FIELDS)
                .map((sec) => (
                    <UploadSection
                        key={sec.id}
                        intent={sec.id}
                        label={sec.label}
                        accept={sec.accept}
                        multiple={sec.multiple}
                        fieldName={sec.fieldName}
                        actionData={actionData}
                        // ✅ isThisSubmitting is TRUE only for the section currently uploading
                        isThisSubmitting={isSubmitting && submittingIntent === sec.id}
                    />
                ))}

            {/* Section ⑦ — multiple fields */}
            <MultipleFieldsSection
                actionData={actionData}
                isThisSubmitting={isSubmitting && submittingIntent === INTENT.MULTIPLE_FIELDS}
            />

            {/* Global raw data */}
            <s-section heading="Last action data (global)">
                <DebugBlock data={actionData} label="Full action data (raw JSON)" />
            </s-section>

        </s-page>
    );
}