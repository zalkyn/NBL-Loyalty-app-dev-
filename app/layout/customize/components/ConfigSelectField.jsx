import { DS } from "../constants/cssVarsConfig";
import { getConfigValue, getConfigDefault } from "../_data";
import { FieldWrapper } from "./FieldWrapper";
import { FieldLabel } from "./FieldLabel";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG SELECT FIELD
// ─────────────────────────────────────────────────────────────────────────────

export function ConfigSelectField({ field, widgetConfig, onChange, disabled }) {
    const value = getConfigValue(widgetConfig, field.configKey, field.default);
    const isDirty = value !== getConfigDefault(field.configKey);

    function handleRevert() { onChange(field.configKey, getConfigDefault(field.configKey)); }

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

            {/* Nested sub-field — only rendered inside this same card when
                the select's current value matches `nested.showWhen` (e.g.
                Loyalty page URL, only relevant once "Loyalty page" is
                picked). See cssVarsConfig.js's `nested` comment. */}
            {field.nested && value === field.nested.showWhen && (
                <ConfigNestedTextField field={field.nested} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />
            )}
        </FieldWrapper>
    );
}

function ConfigNestedTextField({ field, widgetConfig, onChange, disabled }) {
    const value = getConfigValue(widgetConfig, field.configKey, field.default);
    const isDirty = value !== getConfigDefault(field.configKey);

    function handleRevert() { onChange(field.configKey, getConfigDefault(field.configKey)); }

    return (
        <div style={{ marginTop: DS.sp14, paddingTop: DS.sp14, borderTop: `1px solid ${DS.borderLight}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp8, marginBottom: DS.sp2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: DS.textSub }}>{field.label}</span>
                {isDirty && (
                    <span style={{
                        background: "#fef3c7", color: "#92400e",
                        fontSize: 10, fontWeight: 600, padding: "1px 7px",
                        borderRadius: DS.r99, border: "1px solid #fde68a",
                    }}>Modified</span>
                )}
            </div>
            {field.hint && <p style={{ fontSize: 12, color: DS.textMuted, margin: "0 0 8px 0", lineHeight: 1.4 }}>{field.hint}</p>}
            <s-text-field
                value={value ?? ""}
                onInput={(e) => onChange(field.configKey, e.target.value)}
                disabled={disabled}
                auto-complete="off"
                placeholder={field.default ?? ""}
            />
            {isDirty && (
                <div style={{ marginTop: DS.sp10, display: "flex", justifyContent: "flex-end" }}>
                    <button
                        disabled={disabled}
                        onClick={handleRevert}
                        style={{
                            background: "none", border: `1px solid ${DS.warnBorder}`, borderRadius: DS.r6,
                            padding: "3px 10px", fontSize: 11, color: DS.warnText,
                            cursor: disabled ? "default" : "pointer", fontWeight: 500,
                        }}
                    >Revert to default</button>
                </div>
            )}
        </div>
    );
}