import { useState, useMemo, useCallback, useRef, useDeferredValue } from "react";
import LivePreviewPanel from "@components/livePreview/LivePreview";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "../controller/metafieldsSync/syncAppConfig";
import SaveBar from "@components/saveBar/SaveBar";

import {
    WIDGET_CONFIG_SECTIONS, PRESETS, CSS_DEFAULTS,
    deepClone, isEqual, buildInitialVars, buildInitialWidgetConfig,
    isHex, DS, SECTION_TO_SCENE,
} from "@app/presets/widgetPresetsV3";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER / ACTION  (unchanged from v2)
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const style = await prisma.style.findUnique({ where: { shop: session.shop } });
    return {
        savedCssVars: style?.cssVars ?? null,
        savedPresetKey: style?.presetKey ?? null,
        savedWidgetConfig: style?.widgetConfig ?? null,
    };
};

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const fd = await request.formData();
    const intent = fd.get("intent");

    async function upsertAndSync(cssVars, presetKey = null, widgetConfig = null) {
        const data = { cssVars, presetKey, widgetConfig };
        await prisma.style.upsert({
            where: { shop: session.shop },
            update: data,
            create: { shop: session.shop, sessionId: session.id, ...data },
        });
        await syncAppConfig(admin, session);
    }

    try {
        if (intent === "update") {
            const cssVars = JSON.parse(fd.get("cssVars") || "{}");
            const presetKey = fd.get("presetKey") || null;
            const widgetConfig = fd.get("widgetConfig") ? JSON.parse(fd.get("widgetConfig")) : null;
            await upsertAndSync(cssVars, presetKey, widgetConfig);
            return { ok: true, intent, message: "Saved.", savedCssVars: cssVars, savedPresetKey: presetKey, savedWidgetConfig: widgetConfig };
        }
        if (intent === "resetAll") {
            await upsertAndSync({ ...CSS_DEFAULTS }, null, null);
            return { ok: true, intent, message: "Reset to defaults.", savedCssVars: { ...CSS_DEFAULTS }, savedPresetKey: null, savedWidgetConfig: null };
        }
        return { ok: false, message: "Unknown intent." };
    } catch (err) {
        console.error("[customize] action error:", err);
        return { ok: false, intent, message: "Something went wrong." };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MINI DESIGN SYSTEM — shared button / field styles
// ─────────────────────────────────────────────────────────────────────────────

const S = {
    card: {
        background: DS.bgCard, border: `1px solid ${DS.borderLight}`,
        borderRadius: DS.r12, padding: `${DS.sp14} ${DS.sp16}`,
    },
    label: { fontSize: 13, fontWeight: 600, color: DS.text, marginBottom: DS.sp4, display: "block" },
    hint: { fontSize: 12, color: DS.textMuted, margin: 0, lineHeight: 1.4, marginBottom: DS.sp8 },
    sectionTitle: { fontSize: 10, fontWeight: 700, color: DS.textHint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp8 },
    btn: (active) => ({
        background: active ? DS.accentBg : "none",
        border: `1.5px solid ${active ? DS.accentBorder : DS.borderLight}`,
        borderRadius: DS.r8, padding: "7px 12px", fontSize: 12,
        color: active ? DS.accentText : DS.textMuted,
        cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
    }),
    navBtn: (active) => ({
        padding: `${DS.sp8} ${DS.sp12}`, borderRadius: DS.r8,
        background: active ? DS.accentBg : "transparent",
        color: active ? DS.accentText : DS.textMuted,
        border: "none", cursor: "pointer", fontWeight: active ? 600 : 500, fontSize: 13,
        transition: "all 0.15s",
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE FIELD COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ColorSwatch({ value, onChange, disabled }) {
    const inputRef = useRef();
    return (
        <div style={{ display: "flex", alignItems: "center", gap: DS.sp8 }}>
            <div
                onClick={() => !disabled && inputRef.current?.click()}
                style={{
                    width: 36, height: 36, borderRadius: DS.r8, background: isHex(value) ? value : "#cccccc",
                    border: `2px solid ${DS.borderLight}`, cursor: disabled ? "default" : "pointer", flexShrink: 0,
                }}
            />
            <input
                ref={inputRef} type="color" value={isHex(value) ? value : "#cccccc"}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
            />
            <input
                type="text" value={value} maxLength={7}
                onChange={(e) => { if (isHex(e.target.value) || e.target.value === "" || e.target.value.startsWith("#")) onChange(e.target.value); }}
                disabled={disabled}
                style={{
                    width: 90, padding: "6px 10px", borderRadius: DS.r6,
                    border: `1px solid ${DS.borderLight}`, fontSize: 13,
                    fontFamily: "monospace", color: DS.text,
                }}
            />
        </div>
    );
}

function Toggle({ value, onChange, disabled }) {
    return (
        <div
            onClick={() => !disabled && onChange(!value)}
            role="switch" aria-checked={value}
            style={{
                width: 40, height: 22, borderRadius: 11,
                background: value ? "#7c3aed" : DS.borderMid,
                position: "relative", cursor: disabled ? "default" : "pointer",
                transition: "background 0.18s", flexShrink: 0,
            }}
        >
            <div style={{
                position: "absolute", top: 2, left: value ? 20 : 2,
                width: 18, height: 18, borderRadius: 9, background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left 0.18s",
            }} />
        </div>
    );
}

function RangeField({ field, value, onChange, disabled }) {
    const display = field.displayValue ? field.displayValue(value) : value;
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: DS.sp4 }}>
                <span style={{ fontSize: 12, color: DS.textMuted }}>{field.min}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: DS.text }}>{display}{field.unit || ""}</span>
                <span style={{ fontSize: 12, color: DS.textMuted }}>{field.max}</span>
            </div>
            <input
                type="range" min={field.min} max={field.max} value={display}
                onChange={(e) => onChange(field.parseValue ? field.parseValue(e.target.value) : e.target.value)}
                disabled={disabled}
                style={{ width: "100%", accentColor: "#7c3aed" }}
            />
        </div>
    );
}

function SelectField({ field, value, onChange, disabled }) {
    return (
        <select
            value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
            style={{
                width: "100%", padding: "8px 10px", borderRadius: DS.r8,
                border: `1px solid ${DS.borderLight}`, fontSize: 13, color: DS.text,
                background: DS.bgCard,
            }}
        >
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAND COLORS — the only CSS section
// ─────────────────────────────────────────────────────────────────────────────

function BrandColorsPanel({ cssVars, onChange, presetKey, onPreset, disabled }) {
    const primary = cssVars["--nbl-primary"] || "#8b5cf6";
    const accept = cssVars["--nbl-accept"] || "#4ecba8";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: DS.sp12 }}>
            {/* Presets */}
            <div style={S.card}>
                <div style={S.sectionTitle}>Quick Presets</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: DS.sp8 }}>
                    {PRESETS.map((p) => (
                        <button
                            key={p.key} onClick={() => onPreset(p)} disabled={disabled}
                            style={{
                                display: "flex", alignItems: "center", gap: DS.sp6,
                                padding: "6px 12px", borderRadius: DS.r8,
                                border: `1.5px solid ${presetKey === p.key ? "#7c3aed" : DS.borderLight}`,
                                background: presetKey === p.key ? DS.accentBg : DS.bgCard,
                                cursor: disabled ? "default" : "pointer",
                                fontSize: 12, fontWeight: 500, color: DS.text,
                            }}
                        >
                            <span>{p.emoji}</span>
                            <span>{p.label}</span>
                            <div style={{ display: "flex", gap: 3 }}>
                                {p.swatches.map((s) => (
                                    <div key={s} style={{ width: 10, height: 10, borderRadius: 3, background: s }} />
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Primary color */}
            <div style={S.card}>
                <label style={S.label}>Primary color</label>
                <p style={S.hint}>Header, launcher, nav active state, focus rings</p>
                <ColorSwatch value={primary} onChange={(v) => onChange({ "--nbl-primary": v })} disabled={disabled} />
            </div>

            {/* Accept color */}
            <div style={S.card}>
                <label style={S.label}>Accept color</label>
                <p style={S.hint}>Action buttons, active reward highlights, positive states</p>
                <ColorSwatch value={accept} onChange={(v) => onChange({ "--nbl-accept": v })} disabled={disabled} />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAUNCHER PANEL
// ─────────────────────────────────────────────────────────────────────────────

const LAUNCHER_ICONS = ["🎁", "⭐", "🏆", "💎", "🎯", "✨", "🎊", "🎀"];

function LauncherPanel({ cssVars, onChange, disabled }) {
    const pos = cssVars["--nbl-launcher-position"] || "right";
    const bottom = cssVars["--nbl-launcher-bottom"] || "24px";
    const side = cssVars["--nbl-launcher-side-offset"] || "20px";
    const icon = (cssVars["--nbl-launcher-icon"] || "'🎁'").replace(/^'|'$/g, "");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: DS.sp12 }}>
            {/* Icon picker */}
            <div style={S.card}>
                <label style={S.label}>Button icon</label>
                <div style={{ display: "flex", gap: DS.sp8, flexWrap: "wrap" }}>
                    {LAUNCHER_ICONS.map((ic) => (
                        <button
                            key={ic} onClick={() => onChange({ "--nbl-launcher-icon": `'${ic}'` })} disabled={disabled}
                            style={{
                                width: 40, height: 40, fontSize: 20, borderRadius: DS.r8,
                                border: `2px solid ${ic === icon ? "#7c3aed" : DS.borderLight}`,
                                background: ic === icon ? DS.accentBg : DS.bgCard,
                                cursor: disabled ? "default" : "pointer",
                            }}
                        >{ic}</button>
                    ))}
                </div>
            </div>

            {/* Position */}
            <div style={S.card}>
                <label style={S.label}>Position</label>
                <div style={{ display: "flex", gap: DS.sp8 }}>
                    {["left", "right"].map((p) => (
                        <button
                            key={p} onClick={() => onChange({ "--nbl-launcher-position": p })} disabled={disabled}
                            style={S.btn(pos === p)}
                        >{p === "left" ? "← Left" : "Right →"}</button>
                    ))}
                </div>
            </div>

            {/* Offsets */}
            <div style={S.card}>
                <label style={S.label}>Distance from bottom</label>
                <input
                    type="text" value={bottom}
                    onChange={(e) => onChange({ "--nbl-launcher-bottom": e.target.value })}
                    disabled={disabled}
                    style={{ width: 100, padding: "6px 10px", borderRadius: DS.r6, border: `1px solid ${DS.borderLight}`, fontSize: 13 }}
                />
            </div>
            <div style={S.card}>
                <label style={S.label}>Side offset</label>
                <input
                    type="text" value={side}
                    onChange={(e) => onChange({ "--nbl-launcher-side-offset": e.target.value })}
                    disabled={disabled}
                    style={{ width: 100, padding: "6px 10px", borderRadius: DS.r6, border: `1px solid ${DS.borderLight}`, fontSize: 13 }}
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG SECTION PANEL  (behaviour + prize notifications + header effect)
// ─────────────────────────────────────────────────────────────────────────────

function getConfigValue(wc, configKey, fb) {
    if (configKey.startsWith("labels.")) return wc.labels?.[configKey.slice(7)] ?? fb;
    if (configKey.startsWith("prize.")) return wc.prize?.[configKey.slice(6)] ?? fb;
    return wc[configKey] ?? fb;
}

function ConfigField({ field, widgetConfig, onChange, disabled }) {
    const value = getConfigValue(widgetConfig, field.configKey, field.default);

    function handleChange(v) {
        if (field.configKey.startsWith("labels.")) {
            onChange({ labels: { ...widgetConfig.labels, [field.configKey.slice(7)]: v } });
        } else if (field.configKey.startsWith("prize.")) {
            onChange({ prize: { ...widgetConfig.prize, [field.configKey.slice(6)]: v } });
        } else {
            onChange({ [field.configKey]: v });
        }
    }

    return (
        <div style={S.card}>
            <label style={S.label}>{field.label}</label>
            {field.hint && <p style={S.hint}>{field.hint}</p>}
            {field.type === "toggle" && <div style={{ display: "flex", alignItems: "center", gap: DS.sp8 }}><Toggle value={!!value} onChange={handleChange} disabled={disabled} /><span style={{ fontSize: 12, color: DS.textMuted }}>{value ? "On" : "Off"}</span></div>}
            {field.type === "range" && <RangeField field={field} value={value} onChange={handleChange} disabled={disabled} />}
            {field.type === "select" && <SelectField field={field} value={value} onChange={handleChange} disabled={disabled} />}
            {field.type === "text" && <input type="text" value={value} onChange={(e) => handleChange(e.target.value)} disabled={disabled} style={{ width: "100%", padding: "8px 10px", borderRadius: DS.r8, border: `1px solid ${DS.borderLight}`, fontSize: 13 }} />}
            {field.type === "label" && <input type="text" value={value} onChange={(e) => handleChange(e.target.value)} disabled={disabled} style={{ width: "100%", padding: "8px 10px", borderRadius: DS.r8, border: `1px solid ${DS.borderLight}`, fontSize: 13, fontFamily: "monospace" }} />}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE TABS
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_TABS = [
    { key: "brand", label: "Brand" },
    { key: "launcher", label: "Launcher" },
    { key: "config", label: "Config" },
    { key: "labels", label: "Labels" },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomizePage() {
    const { savedCssVars, savedPresetKey, savedWidgetConfig } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const nav = useNavigation();

    // ── State ──────────────────────────────────────────────────────────────
    const [cssVars, setCssVars] = useState(() => buildInitialVars(savedCssVars));
    const [presetKey, setPresetKey] = useState(savedPresetKey);
    const [widgetConfig, setWidgetConfig] = useState(() => buildInitialWidgetConfig(savedWidgetConfig));
    const [pageTab, setPageTab] = useState("brand");
    const [activeConfigSection, setActiveConfigSection] = useState("behaviour");

    const savedVars = useMemo(() => buildInitialVars(savedCssVars), [savedCssVars]);
    const savedConfig = useMemo(() => buildInitialWidgetConfig(savedWidgetConfig), [savedWidgetConfig]);
    const deferredVars = useDeferredValue(cssVars);

    const hasChanges = !isEqual(cssVars, savedVars) || presetKey !== savedPresetKey || !isEqual(widgetConfig, savedConfig);
    const isSubmitting = nav.state !== "idle";

    // ── Handlers ───────────────────────────────────────────────────────────
    const handleVarsChange = useCallback((updates) => {
        setCssVars((prev) => ({ ...prev, ...updates }));
        setPresetKey(null); // custom change clears preset
    }, []);

    const handlePreset = useCallback((preset) => {
        setCssVars((prev) => ({ ...prev, ...preset.vars }));
        setPresetKey(preset.key);
    }, []);

    const handleConfigChange = useCallback((updates) => {
        setWidgetConfig((prev) => ({ ...prev, ...updates }));
    }, []);

    const handleSave = useCallback(() => {
        const fd = new FormData();
        fd.append("intent", "update");
        fd.append("cssVars", JSON.stringify(cssVars));
        fd.append("presetKey", presetKey || "");
        fd.append("widgetConfig", JSON.stringify(widgetConfig));
        submit(fd, { method: "post" });
    }, [cssVars, presetKey, widgetConfig, submit]);

    const handleDiscard = useCallback(() => {
        setCssVars(savedVars);
        setPresetKey(savedPresetKey);
        setWidgetConfig(savedConfig);
    }, [savedVars, savedPresetKey, savedConfig]);

    const handleResetAll = useCallback(() => {
        if (!window.confirm("Reset everything to defaults?")) return;
        const fd = new FormData();
        fd.append("intent", "resetAll");
        submit(fd, { method: "post" });
    }, [submit]);

    // ── Config sub-nav (exclude labels — has own tab) ─────────────────────
    const configSections = WIDGET_CONFIG_SECTIONS.filter((s) => s.key !== "labels");
    const labelsSection = WIDGET_CONFIG_SECTIONS.find((s) => s.key === "labels");
    const activeConfigDef = configSections.find((s) => s.key === activeConfigSection) ?? configSections[0];

    // ── Preview scene ──────────────────────────────────────────────────────
    const previewScene = pageTab === "brand" ? "home"
        : pageTab === "launcher" ? "home"
            : "home";

    return (
        <s-page>
            {/* ── Page header ── */}
            <s-box padding-block-end="400">
                <s-inline align="space-between">
                    <s-text as="h1" font-size="600" font-weight="700">Widget Customiser</s-text>
                    <button
                        onClick={handleResetAll} disabled={isSubmitting}
                        style={{ ...S.btn(false), color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
                    >🔄 Reset all</button>
                </s-inline>
            </s-box>

            {/* ── Page tab nav ── */}
            <div style={{ display: "flex", gap: DS.sp4, marginBottom: DS.sp16, borderBottom: `1px solid ${DS.borderLight}`, paddingBottom: DS.sp4 }}>
                {PAGE_TABS.map((t) => (
                    <button key={t.key} onClick={() => setPageTab(t.key)} style={S.navBtn(pageTab === t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Brand Colors ── */}
            {pageTab === "brand" && (
                <s-grid gridTemplateColumns="420px 1fr" gap="base">
                    <BrandColorsPanel
                        cssVars={cssVars} onChange={handleVarsChange}
                        presetKey={presetKey} onPreset={handlePreset}
                        disabled={isSubmitting}
                    />
                </s-grid>
            )}

            {/* ── Launcher ── */}
            {pageTab === "launcher" && (
                <s-grid gridTemplateColumns="420px 1fr" gap="base">
                    <LauncherPanel cssVars={cssVars} onChange={handleVarsChange} disabled={isSubmitting} />
                </s-grid>
            )}

            {/* ── Config ── */}
            {pageTab === "config" && (
                <s-grid gridTemplateColumns="200px 1fr" gap="base">
                    {/* Sub-nav */}
                    <div style={{ position: "sticky", top: 16 }}>
                        <s-section>
                            <div style={S.sectionTitle}>Sections</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {configSections.map((s) => (
                                    <button
                                        key={s.key}
                                        onClick={() => setActiveConfigSection(s.key)}
                                        style={{ ...S.navBtn(activeConfigSection === s.key), textAlign: "left" }}
                                    >{s.icon} {s.label}</button>
                                ))}
                            </div>
                        </s-section>
                    </div>
                    {/* Fields */}
                    <s-section>
                        <div style={{ marginBottom: DS.sp12 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: DS.text }}>{activeConfigDef.icon} {activeConfigDef.label}</div>
                            {activeConfigDef.description && <p style={{ fontSize: 12, color: DS.textMuted, margin: `${DS.sp4} 0 0` }}>{activeConfigDef.description}</p>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                            {activeConfigDef.fields.map((f) => (
                                <ConfigField key={f.key} field={f} widgetConfig={widgetConfig} onChange={handleConfigChange} disabled={isSubmitting} />
                            ))}
                        </div>
                    </s-section>
                </s-grid>
            )}

            {/* ── Labels ── */}
            {pageTab === "labels" && labelsSection && (
                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                    <s-section>
                        <div style={{ display: "flex", flexDirection: "column", gap: DS.sp8 }}>
                            {labelsSection.fields.slice(0, Math.ceil(labelsSection.fields.length / 2)).map((f) => (
                                <ConfigField key={f.key} field={f} widgetConfig={widgetConfig} onChange={handleConfigChange} disabled={isSubmitting} />
                            ))}
                        </div>
                    </s-section>
                    <s-section>
                        <div style={{ display: "flex", flexDirection: "column", gap: DS.sp8 }}>
                            {labelsSection.fields.slice(Math.ceil(labelsSection.fields.length / 2)).map((f) => (
                                <ConfigField key={f.key} field={f} widgetConfig={widgetConfig} onChange={handleConfigChange} disabled={isSubmitting} />
                            ))}
                        </div>
                    </s-section>
                </s-grid>
            )}

            {/* ── Live Preview (always mounted) ── */}
            <LivePreviewPanel
                cssVars={deferredVars}
                widgetConfig={widgetConfig}
                hidden={false}
                previewScene={previewScene}
            />

            {/* ── Save bar ── */}
            <SaveBar
                visible={hasChanges}
                position="bottom-center"
                message="Unsaved changes"
                primaryLabel={isSubmitting ? "Saving…" : "Save"}
                secondaryLabel="Discard"
                onPrimary={handleSave}
                onSecondary={handleDiscard}
                loading={isSubmitting}
                disabled={isSubmitting}
            />
        </s-page>
    );
}