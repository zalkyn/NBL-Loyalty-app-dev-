import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue } from "react";
import LivePreviewPanel from "@components/livePreview/LivePreview";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "../controller/metafieldsSync/syncAppConfig";
import SaveBar from "@components/saveBar/SaveBar";

import {
    LABEL_DEFAULTS, WIDGET_CONFIG_DEFAULTS, WIDGET_CONFIG_SECTIONS,
    SIMPLE_SECTIONS, PRESETS, CSS_DEFAULTS,
    deepClone, isEqual, buildInitialVars, buildInitialWidgetConfig,
    HEX_RE, isHex, DS, SECTION_TO_SCENE,
} from "@app/presets/widgetPresets";
// ─────────────────────────────────────────────────────────────────────────────
// LOADER / ACTION
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
    const formData = await request.formData();
    const intent = formData.get("intent");

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
            const cssVars = JSON.parse(formData.get("cssVars") || "{}");
            const presetKey = formData.get("presetKey") || null;
            const rawWidgetConfig = formData.get("widgetConfig");
            const widgetConfig = rawWidgetConfig ? JSON.parse(rawWidgetConfig) : null;
            await upsertAndSync(cssVars, presetKey, widgetConfig);
            return { ok: true, intent, message: "Widget styles saved successfully.", savedCssVars: cssVars, savedPresetKey: presetKey, savedWidgetConfig: widgetConfig };
        }
        if (intent === "resetAll") {
            const fresh = { ...CSS_DEFAULTS };
            await upsertAndSync(fresh, null, null);
            return { ok: true, intent, message: "All styles reset to defaults.", savedCssVars: fresh, savedPresetKey: null, savedWidgetConfig: null };
        }
        if (intent === "clearAll") {
            await prisma.style.upsert({
                where: { shop: session.shop },
                update: { cssVars: null, presetKey: null, widgetConfig: null },
                create: { shop: session.shop, sessionId: session.id, cssVars: null, presetKey: null, widgetConfig: null },
            });
            await syncAppConfig(admin, session);
            return { ok: true, intent, message: "Custom styles cleared. Widget is now using default CSS.", savedCssVars: null, savedPresetKey: null, savedWidgetConfig: null };
        }
        return { ok: false, message: "Unknown intent." };
    } catch (err) {
        console.error("[customize-new] action error:", err);
        return { ok: false, intent, message: "Something went wrong. Please try again." };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE MODE FIELD COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FieldWrapper({ isDirty, children, onRevert, disabled }) {
    return (
        <div style={{
            background: isDirty ? DS.warnBg : DS.bgCard,
            border: `1.5px solid ${isDirty ? DS.warnBorder : DS.borderLight}`,
            borderRadius: DS.r12,
            padding: `${DS.sp14} ${DS.sp16}`,
            transition: "all 0.18s",
        }}>
            {children}
            {isDirty && (
                <div style={{ marginTop: DS.sp10, display: "flex", justifyContent: "flex-end" }}>
                    <button
                        disabled={disabled}
                        onClick={onRevert}
                        style={{
                            background: "none", border: `1px solid ${DS.warnBorder}`, borderRadius: DS.r6,
                            padding: "3px 10px", fontSize: 11, color: DS.warnText,
                            cursor: disabled ? "default" : "pointer", fontWeight: 500,
                            display: "flex", alignItems: "center", gap: 4,
                        }}
                    >↩ Revert to default</button>
                </div>
            )}
        </div>
    );
}

function FieldLabel({ label, hint, isDirty }) {
    return (
        <div style={{ marginBottom: DS.sp10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp8, marginBottom: DS.sp2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: DS.text }}>{label}</span>
                {isDirty && (
                    <span style={{
                        background: "#fef3c7", color: "#92400e",
                        fontSize: 10, fontWeight: 600, padding: "1px 7px",
                        borderRadius: DS.r99, border: "1px solid #fde68a",
                    }}>Modified</span>
                )}
            </div>
            {hint && <p style={{ fontSize: 12, color: DS.textMuted, margin: 0, lineHeight: 1.4 }}>{hint}</p>}
        </div>
    );
}

function SimpleColorField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const displayHex = isHex(rawValue) ? rawValue : (field.resolvedDefault ?? "#cccccc");
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(hex) {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = hex; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp12 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: DS.r10,
                        border: `2px solid ${isDirty ? DS.warnBorder : DS.borderMid}`,
                        background: displayHex, overflow: "hidden",
                        cursor: disabled ? "default" : "pointer",
                        boxShadow: `0 2px 8px ${displayHex}55`,
                    }}>
                        {!disabled && (
                            <input
                                type="color"
                                value={displayHex}
                                onChange={(e) => handleChange(e.target.value)}
                                style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", padding: 0 }}
                            />
                        )}
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <s-text-field
                        value={isHex(rawValue) ? rawValue : displayHex}
                        onInput={(e) => { if (isHex(e.target.value)) handleChange(e.target.value); }}
                        disabled={disabled}
                        auto-complete="off"
                        placeholder="#000000"
                        style={{ fontFamily: "monospace", maxWidth: 140 }}
                    />
                    {/* When the stored value is a CSS var() ref, tell the user what it resolved to */}
                    {!isHex(rawValue) && rawValue && rawValue.startsWith("var(") && (
                        <div style={{ fontSize: 10, color: DS.textHint, marginTop: 4 }}>
                            Using theme default ({displayHex}). Pick a color to override.
                        </div>
                    )}
                </div>
            </div>
        </FieldWrapper>
    );
}

function SimpleRangeField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const numValue = field.displayValue ? field.displayValue(rawValue) : parseInt(rawValue);
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(num) {
        const cssVal = field.parseValue ? field.parseValue(num) : `${num}px`;
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = cssVal; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    const safeNum = isNaN(numValue) ? field.min : numValue;

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp12 }}>
                <div style={{ flex: 1 }}>
                    <input
                        type="range" min={field.min} max={field.max} step={1} value={safeNum}
                        disabled={disabled}
                        onChange={(e) => handleChange(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#6d28d9", height: 4 }}
                    />
                </div>
                <div style={{
                    minWidth: 52, textAlign: "center",
                    background: DS.accentBg, borderRadius: DS.r8,
                    padding: "4px 10px", fontSize: 13, fontWeight: 700, color: DS.accentText,
                    border: `1px solid ${DS.accentBorder}`,
                }}>
                    {safeNum}{field.unit}
                </div>
            </div>
        </FieldWrapper>
    );
}

function SimpleTextField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const display = field.displayValue ? field.displayValue(rawValue) : rawValue;
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(val) {
        const cssVal = field.parseValue ? field.parseValue(val) : val;
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = cssVal; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <s-text-field
                value={display}
                onInput={(e) => handleChange(e.target.value)}
                disabled={disabled}
                auto-complete="off"
            />
        </FieldWrapper>
    );
}

function SimpleEmojiField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const current = field.displayValue ? field.displayValue(rawValue) : rawValue;
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handlePick(emoji) {
        const cssVal = field.parseValue ? field.parseValue(emoji) : emoji;
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = cssVal; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", gap: DS.sp8, flexWrap: "wrap" }}>
                {field.options.map((emoji) => (
                    <button
                        key={emoji}
                        disabled={disabled}
                        onClick={() => handlePick(emoji)}
                        style={{
                            fontSize: 22, width: 46, height: 46,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            borderRadius: DS.r10,
                            border: current === emoji ? "2.5px solid #7c3aed" : `1.5px solid ${DS.borderLight}`,
                            background: current === emoji ? "#f5f3ff" : DS.bgCard,
                            cursor: disabled ? "default" : "pointer",
                            transform: current === emoji ? "scale(1.08)" : "scale(1)",
                        }}
                    >{emoji}</button>
                ))}
            </div>
        </FieldWrapper>
    );
}


function SimpleSelectField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(val) {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = val; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", gap: DS.sp8 }}>
                {field.options.map((opt) => {
                    const isActive = rawValue === opt.value;
                    return (
                        <button
                            key={opt.value}
                            disabled={disabled}
                            onClick={() => handleChange(opt.value)}
                            style={{
                                flex: 1, padding: "9px 16px", fontSize: 13, fontWeight: isActive ? 700 : 500,
                                borderRadius: DS.r10,
                                border: `2px solid ${isActive ? "#7c3aed" : DS.borderLight}`,
                                background: isActive ? "#f5f3ff" : DS.bgCard,
                                color: isActive ? "#5b21b6" : DS.textSub,
                                cursor: disabled ? "default" : "pointer",
                                transition: "all 0.15s",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: DS.sp6,
                            }}
                        >
                            <span style={{
                                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                                border: `2px solid ${isActive ? "#7c3aed" : DS.borderMid}`,
                                background: isActive ? "#7c3aed" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                {isActive && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
                            </span>
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </FieldWrapper>
    );
}

function SimpleSectionPanel({ section, cssVars, onChange, disabled, notificationPreviewType, onNotificationPreviewChange }) {
    return (
        <div>
            <div style={{ marginBottom: DS.sp20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: DS.sp10, marginBottom: DS.sp6 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: DS.r10,
                        background: DS.accentBg, border: `1px solid ${DS.accentBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>{section.icon}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: DS.text, lineHeight: 1.2 }}>{section.label}</div>
                        <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 1 }}>{section.description}</div>
                    </div>
                </div>
                {/* Notification preview toggle — shown below header when in Notifications section */}
                {section.key === "notifications" && onNotificationPreviewChange && (
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp8, marginTop: DS.sp10 }}>
                        <span style={{ fontSize: 12, color: DS.textMuted, fontWeight: 500 }}>Preview:</span>
                        <div style={{ display: "flex", background: "#ede9fe", borderRadius: DS.r8, padding: 3, gap: 2 }}>
                            {[["reward", "🟢 Reward"], ["info", "⚫ Info"]].map(([val, lbl]) => (
                                <button
                                    key={val}
                                    onClick={() => onNotificationPreviewChange(val)}
                                    style={{
                                        padding: "5px 14px", borderRadius: DS.r6, border: "none", fontSize: 12,
                                        background: notificationPreviewType === val ? "#ffffff" : "transparent",
                                        color: notificationPreviewType === val ? DS.text : DS.textMuted,
                                        fontWeight: notificationPreviewType === val ? 600 : 400,
                                        cursor: "pointer",
                                        boxShadow: notificationPreviewType === val ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                        whiteSpace: "nowrap",
                                    }}
                                >{lbl}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                {section.fields
                    .filter((field) => {
                        if (section.key !== "notifications") return true;
                        const commonKeys = ["notifyBgFrom", "notifyBgTo", "notifyColor"];
                        if (commonKeys.includes(field.key)) return true;
                        if (notificationPreviewType === "reward") return field.key.startsWith("notifyReward");
                        if (notificationPreviewType === "info") return field.key.startsWith("notifyInfo");
                        return true;
                    })
                    .map((field) => {
                        if (field.type === "color") return <SimpleColorField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        if (field.type === "range") return <SimpleRangeField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        if (field.type === "emoji") return <SimpleEmojiField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        if (field.type === "select") return <SimpleSelectField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        return <SimpleTextField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                    })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR NAV ITEM
// ─────────────────────────────────────────────────────────────────────────────

function SidebarNavItem({ label, icon, isActive, badge, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: `${DS.sp8} ${DS.sp12}`, borderRadius: DS.r10,
                border: isActive ? `1.5px solid ${DS.accentBorder}` : "1.5px solid transparent",
                background: isActive ? DS.accentBg : "transparent",
                cursor: disabled ? "default" : "pointer", textAlign: "left", transition: "all 0.15s",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp8 }}>
                <span style={{ fontSize: 15 }}>{icon}</span>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? DS.accentText : DS.textSub }}>{label}</span>
            </div>
            {badge > 0 && (
                <span style={{
                    background: isActive ? DS.accentText : "#f59e0b", color: "#fff",
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: DS.r99, minWidth: 18, textAlign: "center",
                }}>{badge}</span>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESET CARD — compact card in the sidebar
// ─────────────────────────────────────────────────────────────────────────────

function PresetCard({ preset, isActive, onApply, disabled }) {

    return (
        <div style={{
            background: isActive ? DS.accentBg : DS.bgCard,
            border: `2px solid ${isActive ? "#7c3aed" : DS.borderLight}`,
            borderRadius: DS.r12,
            overflow: "hidden",
            transition: "all 0.18s",
            boxShadow: isActive ? "0 0 0 3px #ede9fe" : "none",
        }}>
            {/* Card header / apply row */}
            <div style={{
                padding: `${DS.sp10} ${DS.sp12}`,
                display: "flex", alignItems: "center", gap: DS.sp8,
                cursor: disabled ? "default" : "pointer",
            }}
                onClick={() => !disabled && onApply(preset)}
            >
                {isActive && (
                    <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#fff", fontWeight: 700, flexShrink: 0,
                        boxShadow: "0 0 0 2px #fff, 0 0 0 4px #7c3aed",
                    }}>✓</div>
                )}
                {!isActive && (
                    <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        border: `2px solid ${DS.borderMid}`,
                        flexShrink: 0,
                    }} />
                )}
                <span style={{ fontSize: 16 }}>{preset.emoji}</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? "#5b21b6" : DS.text }}>{preset.label}</div>
                    <div style={{ fontSize: 10, color: isActive ? "#7c3aed" : DS.textHint }}>{preset.tagline}</div>
                </div>
                {/* swatches */}
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {preset.swatches.map((color, i) => (
                        <div key={i} style={{
                            width: 12, height: 12, borderRadius: "50%", background: color,
                            border: "1px solid rgba(0,0,0,0.1)",
                        }} />
                    ))}
                </div>
            </div>

        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET CONFIG COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ConfigToggleField({ field, widgetConfig, onChange, disabled }) {
    const value = widgetConfig[field.configKey] ?? field.default;
    const isDirty = value !== WIDGET_CONFIG_DEFAULTS[field.configKey];

    function handleRevert() { onChange(field.configKey, WIDGET_CONFIG_DEFAULTS[field.configKey]); }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
                <button
                    disabled={disabled}
                    onClick={() => onChange(field.configKey, !value)}
                    style={{
                        flexShrink: 0, width: 44, height: 24, borderRadius: DS.r99,
                        background: value ? "#7c3aed" : DS.borderMid,
                        border: "none", cursor: disabled ? "default" : "pointer",
                        position: "relative", transition: "background 0.2s", marginLeft: DS.sp12,
                    }}
                >
                    <span style={{
                        position: "absolute", top: 3, left: value ? 22 : 2,
                        width: 18, height: 18, borderRadius: "50%", background: "#fff",
                        transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    }} />
                </button>
            </div>
        </FieldWrapper>
    );
}

function ConfigSelectField({ field, widgetConfig, onChange, disabled }) {
    const value = widgetConfig[field.configKey] ?? field.default;
    const isDirty = value !== WIDGET_CONFIG_DEFAULTS[field.configKey];

    function handleRevert() { onChange(field.configKey, WIDGET_CONFIG_DEFAULTS[field.configKey]); }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", gap: DS.sp6, flexWrap: "wrap" }}>
                {field.options.map((opt) => {
                    const isActive = value === opt.value;
                    return (
                        <button
                            key={opt.value}
                            disabled={disabled}
                            onClick={() => onChange(field.configKey, opt.value)}
                            style={{
                                padding: "7px 14px", fontSize: 12, fontWeight: isActive ? 700 : 500,
                                borderRadius: DS.r10,
                                border: `2px solid ${isActive ? "#7c3aed" : DS.borderLight}`,
                                background: isActive ? "#f5f3ff" : DS.bgCard,
                                color: isActive ? "#5b21b6" : DS.textSub,
                                cursor: disabled ? "default" : "pointer",
                                transition: "all 0.15s",
                            }}
                        >{opt.label}</button>
                    );
                })}
            </div>
        </FieldWrapper>
    );
}

function ConfigRangeField({ field, widgetConfig, onChange, disabled }) {
    const raw = widgetConfig[field.configKey] ?? field.default;
    const display = field.displayValue ? field.displayValue(raw) : Number(raw);
    const isDirty = raw !== WIDGET_CONFIG_DEFAULTS[field.configKey];

    function handleChange(v) {
        onChange(field.configKey, field.parseValue ? field.parseValue(v) : v);
    }
    function handleRevert() { onChange(field.configKey, WIDGET_CONFIG_DEFAULTS[field.configKey]); }

    const safeNum = isNaN(display) ? field.min : display;

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp12 }}>
                <div style={{ flex: 1 }}>
                    <input
                        type="range" min={field.min} max={field.max} step={1} value={safeNum}
                        disabled={disabled}
                        onChange={(e) => handleChange(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#6d28d9", height: 4 }}
                    />
                </div>
                <div style={{
                    minWidth: 52, textAlign: "center",
                    background: DS.accentBg, borderRadius: DS.r8,
                    padding: "4px 10px", fontSize: 13, fontWeight: 700, color: DS.accentText,
                    border: `1px solid ${DS.accentBorder}`,
                }}>
                    {safeNum}{field.unit}
                </div>
            </div>
        </FieldWrapper>
    );
}

function ConfigLabelField({ field, widgetConfig, onChange, disabled }) {
    const labelKey = field.configKey.startsWith("labels.") ? field.configKey.slice(7) : field.configKey;
    const value = (widgetConfig.labels?.[labelKey]) ?? field.default;
    const isDirty = value !== field.default;

    function handleRevert() { onChange(field.configKey, field.default); }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <s-text-field
                value={value}
                onInput={(e) => onChange(field.configKey, e.target.value)}
                disabled={disabled}
                auto-complete="off"
                placeholder={field.default}
            />
        </FieldWrapper>
    );
}

function ConfigSectionPanel({ section, widgetConfig, onChange, disabled }) {
    return (
        <div>
            <div style={{ marginBottom: DS.sp20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: DS.sp10, marginBottom: DS.sp6 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: DS.r10,
                        background: DS.accentBg, border: `1px solid ${DS.accentBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>{section.icon}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: DS.text, lineHeight: 1.2 }}>{section.label}</div>
                        <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 1 }}>{section.description}</div>
                    </div>
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                {section.fields.map((field) => {
                    if (field.type === "toggle") return <ConfigToggleField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    if (field.type === "select") return <ConfigSelectField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    if (field.type === "range") return <ConfigRangeField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    if (field.type === "label") return <ConfigLabelField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    return null;
                })}
            </div>
        </div>
    );
}

// PAGE
// ─────────────────────────────────────────────────────────────────────────────


export default function CustomizeNew() {
    const { savedCssVars, savedPresetKey, savedWidgetConfig } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();

    const isNetworkSubmitting = navigation.state === "submitting";

    // ── CSS vars state ────────────────────────────────────────────────────────
    const initialVars = useMemo(() => buildInitialVars(savedCssVars), []);
    const [cssVars, setCssVars] = useState(() => deepClone(initialVars));
    const [persistedVars, setPersistedVars] = useState(() => deepClone(initialVars));

    // ── Widget config state ───────────────────────────────────────────────────
    const [widgetConfig, setWidgetConfig] = useState(() => buildInitialWidgetConfig(savedWidgetConfig));
    const [persistedWidgetConfig, setPersistedWidgetConfig] = useState(() => buildInitialWidgetConfig(savedWidgetConfig));

    // ── Other persisted state ─────────────────────────────────────────────────
    // persistedPresetKey tracks what was last saved — needed for correct Discard
    const [persistedPresetKey, setPersistedPresetKey] = useState(savedPresetKey ?? null);
    const [hasSavedCustomStyles, setHasSavedCustomStyles] = useState(savedCssVars !== null);

    // ── UI-only state (never sent to server, never dirty-tracked) ────────────
    const [activeSimpleSection, setActiveSimpleSection] = useState(SIMPLE_SECTIONS[0].key);
    const [activeConfigSection, setActiveConfigSection] = useState(WIDGET_CONFIG_SECTIONS[0].key);
    const [pageTab, setPageTab] = useState("customize");
    const [activePreset, setActivePreset] = useState(savedPresetKey ?? null);
    const [activeIntent, setActiveIntent] = useState(null);
    const [notificationPreviewType, setNotificationPreviewType] = useState("reward");

    // ── Post-action sync ──────────────────────────────────────────────────────
    //
    // React Router's actionData never goes back to null after first
    // response, so a simple [actionData] effect fires only on the *first* save.
    // Subsequent saves with the same object reference are silently ignored,
    // leaving persistedVars stale → hasChanges stays true forever.
    //
    // track the last-processed response by reference. When actionData is a
    // new object (every successful POST creates a new one) we run the sync.
    // This is a ref comparison, not value comparison — zero extra renders.
    const lastSyncedActionRef = useRef(null);

    useEffect(() => {
        if (!actionData) return;
        // Already processed this exact response object — skip.
        if (actionData === lastSyncedActionRef.current) return;
        lastSyncedActionRef.current = actionData;

        shopify.toast.show(actionData.message, { isError: !actionData.ok });
        setActiveIntent(null);
        if (!actionData.ok) return;

        if (["update", "resetAll"].includes(actionData.intent)) {
            const freshVars = buildInitialVars(actionData.savedCssVars);
            const freshPreset = actionData.savedPresetKey ?? null;
            const freshWc = buildInitialWidgetConfig(actionData.savedWidgetConfig ?? null);
            // Sync both live + persisted state to the fresh server values
            setCssVars(freshVars);
            setPersistedVars(freshVars);
            setWidgetConfig(freshWc);
            setPersistedWidgetConfig(freshWc);
            setActivePreset(freshPreset);
            setPersistedPresetKey(freshPreset);
            setHasSavedCustomStyles(true);
        }

        if (actionData.intent === "clearAll") {
            const freshVars = deepClone(CSS_DEFAULTS);
            const freshWc = buildInitialWidgetConfig(null);
            setCssVars(freshVars);
            setPersistedVars(freshVars);
            setWidgetConfig(freshWc);
            setPersistedWidgetConfig(freshWc);
            setActivePreset(null);
            setPersistedPresetKey(null);
            setHasSavedCustomStyles(false);
        }
    }, [actionData]);

    // ── Dirty tracking ────────────────────────────────────────────────────────
    const hasStyleChanges = useMemo(() => !isEqual(cssVars, persistedVars), [cssVars, persistedVars]);

    // BUG FIX: was comparing widgetConfig vs WIDGET_CONFIG_DEFAULTS (always-dirty
    // if user saved non-default values). Must compare vs persistedWidgetConfig.
    const hasConfigChanges = useMemo(
        () => JSON.stringify(widgetConfig) !== JSON.stringify(persistedWidgetConfig),
        [widgetConfig, persistedWidgetConfig]
    );

    const hasChanges = hasStyleChanges || hasConfigChanges;
    const isUpdating = isNetworkSubmitting && activeIntent === "update";
    // Use loader's savedCssVars (not hasSavedCustomStyles) so clearAll doesn't show "First setup"
    const isFirstSave = savedCssVars === null && !hasChanges;

    const totalDirtyVarCount = useMemo(
        () => Object.keys(cssVars).filter((k) => cssVars[k] !== persistedVars[k]).length,
        [cssVars, persistedVars]
    );

    // ── Sidebar dirty badge counts ────────────────────────────────────────────
    const simpleSectionDirtyCount = useCallback((section) => {
        return section.fields.filter((f) => f.maps.some((v) => cssVars[v] !== persistedVars[v])).length;
    }, [cssVars, persistedVars]);

    // BUG FIX: compare vs persistedWidgetConfig, not WIDGET_CONFIG_DEFAULTS.
    // Using defaults meant badge never cleared after saving non-default values.
    const configSectionDirtyCount = useCallback((section) => {
        return section.fields.filter((f) => {
            if (f.configKey.startsWith("labels.")) {
                const labelKey = f.configKey.slice(7);
                return widgetConfig.labels?.[labelKey] !== persistedWidgetConfig.labels?.[labelKey];
            }
            return widgetConfig[f.configKey] !== persistedWidgetConfig[f.configKey];
        }).length;
    }, [widgetConfig, persistedWidgetConfig]);

    // ── Deferred vars for live preview ────────────────────────────────────────
    const deferredCssVars = useDeferredValue(cssVars);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSimpleChange = useCallback((updates) => {
        setCssVars((prev) => ({ ...prev, ...updates }));
        setActivePreset(null);
    }, []);

    const handleConfigChange = useCallback((key, value) => {
        if (key.startsWith("labels.")) {
            const labelKey = key.slice(7);
            setWidgetConfig((prev) => ({ ...prev, labels: { ...prev.labels, [labelKey]: value } }));
        } else {
            setWidgetConfig((prev) => ({ ...prev, [key]: value }));
        }
    }, []);

    function handlePresetApply(preset) {
        setCssVars((prev) => ({ ...prev, ...preset.vars }));
        setActivePreset(preset.key);
    }

    function handleDiscard() {
        // BUG FIX: was using stale `savedPresetKey` from loader closure.
        // Now uses persistedPresetKey which tracks the last-saved value.
        setCssVars(deepClone(persistedVars));
        setWidgetConfig(deepClone(persistedWidgetConfig));
        setActivePreset(persistedPresetKey);
    }

    function handleSave() {
        setActiveIntent("update");
        const fd = new FormData();
        fd.set("intent", "update");
        fd.set("cssVars", JSON.stringify(cssVars));
        // Always send presetKey — empty string signals "clear" to the action
        fd.set("presetKey", activePreset ?? "");
        fd.set("widgetConfig", JSON.stringify(widgetConfig));
        submit(fd, { method: "post" });
    }

    function handleResetAll() {
        setActiveIntent("resetAll");
        const fd = new FormData();
        fd.set("intent", "resetAll");
        submit(fd, { method: "post" });
    }

    function handleClearAll() {
        setActiveIntent("clearAll");
        const fd = new FormData();
        fd.set("intent", "clearAll");
        submit(fd, { method: "post" });
    }

    // ── Convenience ───────────────────────────────────────────────────────────
    const activeSimpleSectionDef = SIMPLE_SECTIONS.find((s) => s.key === activeSimpleSection) ?? SIMPLE_SECTIONS[0];

    return (
        <s-page inlineSize="large">
            {/* ══ PAGE HEADER ══ */}
            <s-section>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: DS.sp10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp10 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: DS.text, margin: 0, letterSpacing: "-0.02em" }}>
                            Customize Widget
                        </h1>
                        {hasChanges && (
                            <span style={{ background: "#fffbeb", color: "#92400e", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: DS.r99, border: "1px solid #fde68a" }}>
                                ● Unsaved changes
                            </span>
                        )}
                        {isFirstSave && (
                            <span style={{ background: "#eff6ff", color: "#1e40af", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: DS.r99, border: "1px solid #bfdbfe" }}>
                                First setup
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: 13, color: DS.textMuted, margin: 0 }}>
                        Personalize your loyalty widget to match your store's brand. Changes show instantly in the preview.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp8 }}>
                        <s-button variant="plain" onClick={handleDiscard} disabled={!hasChanges || isNetworkSubmitting}>Discard</s-button>
                        <s-button variant="plain" tone="critical" onClick={handleResetAll} disabled={isNetworkSubmitting} loading={isNetworkSubmitting && activeIntent === "resetAll" ? true : undefined}>Reset all</s-button>
                        <s-button
                            variant="primary"
                            onClick={handleSave}
                            disabled={!hasChanges || isNetworkSubmitting}
                            loading={isUpdating ? true : undefined}
                        >
                            {hasChanges ? `Save changes${totalDirtyVarCount > 0 ? ` (${totalDirtyVarCount})` : ""}` : "Save changes"}
                        </s-button>
                    </div>
                </div>
            </s-section>

            {isFirstSave && (
                <s-section>
                    <s-banner tone="info">
                        <p>No custom styles saved yet. The widget is using default values. Edit any value below and save to apply your brand.</p>
                    </s-banner>
                </s-section>
            )}

            {/* ══ PAGE TAB SWITCHER ══ */}
            <s-section>
                <div style={{ display: "flex", gap: DS.sp4, background: DS.bg, borderRadius: DS.r10, padding: 4, width: "fit-content" }}>
                    {[{ key: "customize", label: "🎨 Customize" }, { key: "config", label: "⚙️ Widget Config" }, { key: "labels", label: "✏️ Labels & Text" }].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setPageTab(tab.key)}
                            style={{
                                padding: "7px 18px", fontSize: 13, fontWeight: pageTab === tab.key ? 700 : 500,
                                borderRadius: DS.r8, border: "none",
                                background: pageTab === tab.key ? DS.bgCard : "transparent",
                                color: pageTab === tab.key ? DS.text : DS.textMuted,
                                cursor: "pointer",
                                boxShadow: pageTab === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                                transition: "all 0.15s",
                            }}
                        >{tab.label}</button>
                    ))}
                </div>
            </s-section>

            {/* ══ CUSTOMIZE ══ */}
            {pageTab === "customize" && <s-grid gridTemplateColumns="280px 1fr" gap="base">

                {/* LEFT SIDEBAR */}
                <div>
                    <div style={{ position: "sticky", top: 16 }}>
                        <s-section>
                            {/* ── Quick Themes ── */}
                            <div style={{ marginBottom: DS.sp14 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: DS.textHint,
                                    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp10,
                                }}>Quick Themes</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: DS.sp6 }}>
                                    {PRESETS.map((preset) => (
                                        <PresetCard
                                            key={preset.key}
                                            preset={preset}
                                            isActive={activePreset === preset.key}
                                            onApply={handlePresetApply}
                                            disabled={isNetworkSubmitting}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div style={{ borderTop: `1px solid ${DS.borderLight}`, margin: `${DS.sp14} 0` }} />

                            {/* ── Section Nav ── */}
                            <div style={{ marginBottom: DS.sp10 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: DS.textHint,
                                    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp8,
                                }}>Customize</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {SIMPLE_SECTIONS.map((section) => (
                                        <SidebarNavItem
                                            key={section.key}
                                            label={section.label}
                                            icon={section.icon}
                                            isActive={activeSimpleSection === section.key}
                                            badge={simpleSectionDirtyCount(section)}
                                            onClick={() => setActiveSimpleSection(section.key)}
                                            disabled={isNetworkSubmitting}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div style={{ borderTop: `1px solid ${DS.borderLight}`, marginTop: DS.sp14, paddingTop: DS.sp12 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: DS.sp6 }}>
                                    <button
                                        disabled={isNetworkSubmitting}
                                        onClick={handleResetAll}
                                        style={{
                                            background: DS.dangerBg, border: `1px solid #fecaca`, borderRadius: DS.r8,
                                            padding: "7px 12px", fontSize: 12, color: DS.dangerText,
                                            cursor: isNetworkSubmitting ? "default" : "pointer", fontWeight: 500, width: "100%",
                                        }}
                                    >🔄 Reset all to defaults</button>
                                    <button
                                        disabled={isNetworkSubmitting}
                                        onClick={handleClearAll}
                                        style={{
                                            background: "none", border: `1px solid ${DS.borderLight}`, borderRadius: DS.r8,
                                            padding: "7px 12px", fontSize: 12, color: DS.textMuted,
                                            cursor: isNetworkSubmitting ? "default" : "pointer", fontWeight: 500, width: "100%",
                                        }}
                                    >Clear (use CSS file)</button>
                                </div>
                            </div>
                        </s-section>
                    </div>
                </div>

                {/* CENTER — section editor */}
                <s-section>
                    <SimpleSectionPanel
                        section={activeSimpleSectionDef}
                        cssVars={cssVars}
                        onChange={handleSimpleChange}
                        disabled={isNetworkSubmitting}
                        notificationPreviewType={notificationPreviewType}
                        onNotificationPreviewChange={setNotificationPreviewType}
                    />
                </s-section>

            </s-grid>}

            {/* ══ WIDGET CONFIG ══ */}
            {pageTab === "config" && (
                <s-grid gridTemplateColumns="280px 1fr" gap="base">
                    {/* LEFT — config section nav */}
                    <div>
                        <div style={{ position: "sticky", top: 16 }}>
                            <s-section>
                                <div style={{ marginBottom: DS.sp8 }}>
                                    <div style={{
                                        fontSize: 10, fontWeight: 700, color: DS.textHint,
                                        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp8,
                                    }}>Config</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                        {WIDGET_CONFIG_SECTIONS.filter((s) => s.key !== "labels").map((section) => (
                                            <SidebarNavItem
                                                key={section.key}
                                                label={section.label}
                                                icon={section.icon}
                                                isActive={activeConfigSection === section.key}
                                                badge={configSectionDirtyCount(section)}
                                                onClick={() => setActiveConfigSection(section.key)}
                                                disabled={isNetworkSubmitting}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div style={{ borderTop: `1px solid ${DS.borderLight}`, marginTop: DS.sp14, paddingTop: DS.sp12 }}>
                                    <button
                                        disabled={isNetworkSubmitting}
                                        onClick={() => setWidgetConfig({ ...WIDGET_CONFIG_DEFAULTS })}
                                        style={{
                                            background: DS.dangerBg, border: `1px solid #fecaca`, borderRadius: DS.r8,
                                            padding: "7px 12px", fontSize: 12, color: DS.dangerText,
                                            cursor: isNetworkSubmitting ? "default" : "pointer", fontWeight: 500, width: "100%",
                                        }}
                                    >🔄 Reset config to defaults</button>
                                </div>
                            </s-section>
                        </div>
                    </div>

                    {/* RIGHT — config section editor */}
                    <s-section>
                        <ConfigSectionPanel
                            section={WIDGET_CONFIG_SECTIONS.filter((s) => s.key !== "labels").find((s) => s.key === activeConfigSection) ?? WIDGET_CONFIG_SECTIONS.find((s) => s.key !== "labels")}
                            widgetConfig={widgetConfig}
                            onChange={handleConfigChange}
                            disabled={isNetworkSubmitting}
                        />
                    </s-section>
                </s-grid>
            )}

            {/* ══ LABELS & TEXT ══ */}
            {pageTab === "labels" && (() => {
                const labelsSection = WIDGET_CONFIG_SECTIONS.find((s) => s.key === "labels");
                return (
                    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                        {/* Column 1 — first half of fields */}
                        <s-section>
                            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                                {labelsSection && labelsSection.fields.slice(0, Math.ceil(labelsSection.fields.length / 2)).map((field) => (
                                    <ConfigLabelField key={field.key} field={field} widgetConfig={widgetConfig} onChange={handleConfigChange} disabled={isNetworkSubmitting} />
                                ))}
                            </div>
                        </s-section>
                        {/* Column 2 — second half of fields */}
                        <s-section>
                            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                                {labelsSection && labelsSection.fields.slice(Math.ceil(labelsSection.fields.length / 2)).map((field) => (
                                    <ConfigLabelField key={field.key} field={field} widgetConfig={widgetConfig} onChange={handleConfigChange} disabled={isNetworkSubmitting} />
                                ))}
                            </div>
                        </s-section>
                    </s-grid>
                );
            })()}

            {/* ══ LIVE PREVIEW — always mounted so portal persists across tabs ══ */}
            <LivePreviewPanel
                cssVars={deferredCssVars}
                widgetConfig={widgetConfig}
                hidden={pageTab === "config"}
                previewScene={
                    pageTab === "customize" && activeSimpleSection === "notifications"
                        ? (notificationPreviewType === "reward" ? "notification-reward" : "notification-info")
                        : pageTab === "customize"
                            ? (SECTION_TO_SCENE[activeSimpleSection] ?? "home")
                            : "home"
                }
            />

            {/* ══ FLOATING SAVE BAR ══ */}
            <SaveBar
                visible={hasChanges}
                position="bottom-center"
                message={
                    totalDirtyVarCount > 0
                        ? `${totalDirtyVarCount} unsaved change${totalDirtyVarCount !== 1 ? "s" : ""}`
                        : "Unsaved changes"
                }
                primaryLabel={isUpdating ? "Saving…" : "Save changes"}
                secondaryLabel="Discard"
                onPrimary={handleSave}
                onSecondary={handleDiscard}
                loading={isUpdating}
                disabled={isNetworkSubmitting}
            />

        </s-page>
    );
}