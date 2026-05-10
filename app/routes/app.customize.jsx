import { stylePresets } from "../presets/stylePresets";
import { useState, useMemo, useEffect } from "react";
import prisma from "db-server";
import { authenticate } from "shopify-server";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";


// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const style = await prisma.style.findUnique({
        where: { shop: session.shop },
    });

    return { savedStyle: style ?? null };
};


// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    // Derive keys directly from stylePresets — adding a new preset key
    // automatically works here without any manual list to maintain.
    // The only requirement: schema.prisma must have a matching Json? field.
    const STYLE_KEYS = Object.keys(stylePresets);

    // Update — upsert current styles into DB.
    if (intent === "update") {
        const data = {};
        for (const key of STYLE_KEYS) {
            const raw = formData.get(key);
            if (raw) data[key] = JSON.parse(raw);
        }

        await prisma.style.upsert({
            where: { shop: session.shop },
            update: data,
            create: { shop: session.shop, sessionId: session.id, ...data },
        });

        return { ok: true, intent, message: "Styles updated." };
    }

    // Reset — overwrite DB record with preset values (not delete).
    // This keeps the record intact but reverts all style fields to defaults.
    if (intent === "reset") {
        const data = {};
        for (const key of STYLE_KEYS) {
            data[key] = stylePresets[key];
        }

        await prisma.style.upsert({
            where: { shop: session.shop },
            update: data,
            create: { shop: session.shop, sessionId: session.id, ...data },
        });

        return { ok: true, intent, message: "Styles reset to defaults." };
    }

    // Seed — write stylePresets into DB for the first time.
    if (intent === "seed") {
        const data = {};
        for (const key of STYLE_KEYS) {
            data[key] = stylePresets[key];
        }

        await prisma.style.upsert({
            where: { shop: session.shop },
            update: data,
            create: { shop: session.shop, sessionId: session.id, ...data },
        });

        return { ok: true, intent, message: "Default styles saved to database." };
    }

    return { ok: false, message: "Unknown intent." };
};


// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
    { key: "actionButton", label: "Action Button" },
    { key: "header", label: "Header" },
    { key: "tabHome", label: "Home" },
    { key: "tabEarnPoints", label: "Earn Points" },
    { key: "tabRewards", label: "Rewards" },
    { key: "tabActivity", label: "Activity" },
    { key: "tabProfile", label: "Profile" },
    { key: "tabReferral", label: "Referral" },
];

const COLOR_PROPS = new Set([
    "Background Color",
    "Color",
    "Border Color",
]);


// ── Helpers ───────────────────────────────────────────────────────────────────

function isGroup(value) {
    return typeof value === "object" && value !== null;
}

function formatGroupLabel(key) {
    return key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase());
}

function hasAlpha(value) {
    return typeof value === "string" && /^rgba|^hsla/.test(value.trim());
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function isEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

// Merge DB record on top of presets so any new preset keys still appear.
function mergeWithPresets(savedStyle) {
    if (!savedStyle) return deepClone(stylePresets);

    const merged = deepClone(stylePresets);
    for (const key of Object.keys(merged)) {
        if (savedStyle[key]) {
            merged[key] = { ...merged[key], ...savedStyle[key] };
        }
    }
    return merged;
}


// ── StyleField ────────────────────────────────────────────────────────────────

function StyleField({ prop, value, onInput }) {
    if (COLOR_PROPS.has(prop)) {
        return (
            <s-color-field
                label={prop}
                value={value}
                alpha={hasAlpha(value) ? true : undefined}
                onInput={onInput}
            />
        );
    }

    return (
        <s-text-field
            label={prop}
            value={value}
            onInput={onInput}
            auto-complete="off"
        />
    );
}


// ── Page ──────────────────────────────────────────────────────────────────────

export default function Customize() {
    const { savedStyle } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();

    const isSubmitting = navigation.state === "submitting";

    // Build initial styles from DB record merged with presets.
    const initialStyles = useMemo(() => mergeWithPresets(savedStyle), []);

    const [styles, setStyles] = useState(() => deepClone(initialStyles));

    // persistedStyles tracks what's in the DB so we can detect unsaved changes.
    const [persistedStyles, setPersistedStyles] = useState(() => deepClone(initialStyles));

    const [activeTab, setActiveTab] = useState("actionButton");

    // showSeedButton: true when DB has no record. Can also be toggled manually.
    const [showSeedButton, setShowSeedButton] = useState(savedStyle === null);

    // activeIntent: tracks which button triggered the current submission.
    const [activeIntent, setActiveIntent] = useState(null);

    // Show toast whenever actionData arrives from the server.
    useEffect(() => {
        if (!actionData) return;

        shopify.toast.show(actionData.message, {
            isError: !actionData.ok,
        });

        setActiveIntent(null);

        // If update succeeded, sync persistedStyles to current styles.
        if (actionData.ok && actionData.intent === "update") {
            setPersistedStyles(deepClone(styles));
        }

        // If reset succeeded, revert both states to presets.
        if (actionData.ok && actionData.intent === "reset") {
            const preset = deepClone(stylePresets);
            setStyles(preset);
            setPersistedStyles(preset);
        }

        // If seed succeeded, hide seed button and sync persistedStyles.
        if (actionData.ok && actionData.intent === "seed") {
            setPersistedStyles(deepClone(styles));
            setShowSeedButton(false);
        }
    }, [actionData]);

    // ── Derived flags ─────────────────────────────────────────────────────────

    const hasChanges = !isEqual(styles, persistedStyles);

    const isUpdating = isSubmitting && activeIntent === "update";
    const isResetting = isSubmitting && activeIntent === "reset";
    const isSeeding = isSubmitting && activeIntent === "seed";

    // ── Handlers ──────────────────────────────────────────────────────────────

    function handleChange(prop, value, groupKey = null) {
        setStyles((prev) => {
            const tabStyles = { ...prev[activeTab] };

            if (groupKey) {
                tabStyles[groupKey] = { ...tabStyles[groupKey], [prop]: value };
            } else {
                tabStyles[prop] = value;
            }

            return { ...prev, [activeTab]: tabStyles };
        });
    }

    // Update — submit current styles to DB.
    function handleUpdate() {
        setActiveIntent("update");
        const formData = new FormData();
        formData.set("intent", "update");

        for (const { key } of TABS) {
            formData.set(key, JSON.stringify(styles[key]));
        }

        submit(formData, { method: "post" });
    }

    // Discard — revert to last persisted state without hitting the server.
    function handleDiscard() {
        setStyles(deepClone(persistedStyles));
    }

    // Reset — delete DB record and revert to presets.
    function handleReset() {
        setActiveIntent("reset");
        const formData = new FormData();
        formData.set("intent", "reset");
        submit(formData, { method: "post" });
    }

    // Seed — write stylePresets to DB for the first time.
    function handleSeed() {
        setActiveIntent("seed");
        const formData = new FormData();
        formData.set("intent", "seed");
        submit(formData, { method: "post" });
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const activeLabel = TABS.find((t) => t.key === activeTab)?.label;
    const activeStyles = styles[activeTab] ?? {};

    const flatEntries = Object.entries(activeStyles).filter(([, v]) => !isGroup(v));
    const groupEntries = Object.entries(activeStyles).filter(([, v]) => isGroup(v));

    return (
        <s-page>

            {/* ── Top bar ── */}
            <s-section>
                <s-stack direction="inline" alignItems="center" justifyContent="space-between" gap="base">
                    <s-box>
                        <s-heading>Customize Widget</s-heading>
                    </s-box>
                    <s-stack direction="inline" gap="base" alignItems="center" justifyContent="end">

                        {/* Seed button — visible when showSeedButton is true (no DB record, or manually shown) */}
                        {showSeedButton && (
                            <s-button
                                variant="plain"
                                onClick={handleSeed}
                                disabled={isSubmitting}
                                loading={isSeeding}
                            >
                                Save defaults to DB
                            </s-button>
                        )}

                        <s-button
                            variant="plain"
                            onClick={handleDiscard}
                            disabled={!hasChanges || isSubmitting}
                        >
                            Discard
                        </s-button>

                        <s-button
                            variant="plain"
                            tone="critical"
                            onClick={handleReset}
                            disabled={isSubmitting}
                            loading={isResetting}
                        >
                            Reset to defaults
                        </s-button>

                        <s-button
                            variant="primary"
                            onClick={handleUpdate}
                            disabled={!hasChanges || isSubmitting}
                            loading={isUpdating}
                        >
                            Update
                        </s-button>

                    </s-stack>
                </s-stack>
            </s-section>

            {/* ── Two-column layout ── */}
            <s-grid gridTemplateColumns="1fr 3fr" gap="base">

                {/* ── Left: tab buttons ── */}
                <div>
                    <div style={{ position: 'sticky', top: '0' }}>
                        <s-section>
                            <s-stack gap="small">
                                {TABS.map(({ key, label }) => (
                                    <s-button
                                        variant={activeTab === key ? "primary" : "tertiary"}
                                        key={key}
                                        onClick={() => setActiveTab(key)}
                                    >
                                        {label}
                                    </s-button>
                                ))}
                            </s-stack>
                        </s-section>
                    </div>
                </div>

                {/* ── Right: style form ── */}
                <s-section>
                    <s-box paddingBlockEnd="base">
                        <s-heading as="h2">{activeLabel} Styles</s-heading>
                    </s-box>

                    <s-stack direction="vertical" gap="300">

                        {/* Flat properties */}
                        {flatEntries.map(([prop, value]) => (
                            <s-box paddingBlockEnd="small" key={prop}>
                                <StyleField
                                    prop={prop}
                                    value={value}
                                    onInput={(e) => handleChange(prop, e.target.value)}
                                />
                            </s-box>
                        ))}

                        {/* Nested groups */}
                        {groupEntries.map(([groupKey, groupStyles]) => (
                            <s-box key={groupKey} paddingBlockStart="base">
                                <s-box paddingBlockEnd="small">
                                    <s-text fontWeight="semibold">
                                        {formatGroupLabel(groupKey)}
                                    </s-text>
                                </s-box>
                                <s-box padding="base" background="bg-surface-secondary" borderRadius="base">
                                    <s-stack direction="vertical" gap="300">
                                        {Object.entries(groupStyles).map(([prop, value]) => (
                                            <s-box paddingBlockEnd="small" key={prop}>
                                                <StyleField
                                                    prop={prop}
                                                    value={value}
                                                    onInput={(e) => handleChange(prop, e.target.value, groupKey)}
                                                />
                                            </s-box>
                                        ))}
                                    </s-stack>
                                </s-box>
                            </s-box>
                        ))}

                    </s-stack>
                </s-section>

            </s-grid>
        </s-page>
    );
}