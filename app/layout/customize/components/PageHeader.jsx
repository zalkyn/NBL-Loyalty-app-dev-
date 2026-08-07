import { DS, ADVANCED_MODE_ENABLED } from "../constants/cssVarsConfig";

const PAGE_TABS = [
    { key: "customize", label: "Customize" },
    { key: "config", label: "Widget Config" },
    { key: "labels", label: "Labels & Text" },
    // Gated by ADVANCED_MODE_ENABLED (constants/cssVarsConfig.js) — flip that
    // one constant to hide this tab everywhere, no other changes needed.
    ...(ADVANCED_MODE_ENABLED ? [{ key: "advanced", label: "Advanced" }] : []),
];

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW DEVICES
//
// Three entries, not two, because the widget genuinely has three renderings:
// the phone layout under ui.css's 749px breakpoint, the base size, and the
// 125% scale that ui.css applies above 1200x800 — which is what most desktop
// visitors actually see and which was previously impossible to preview at all
// (the preview iframe is 390px wide, so that block could never fire inside it).
//
// No tablet entry: nothing in the launcher or the panel changes shape between
// the base size and a tablet, so a fourth button would be a duplicate of
// "Desktop" and would only invite the question of what the difference is.
const PREVIEW_DEVICES = [
    { key: "mobile", label: "Mobile" },
    { key: "desktop", label: "Desktop" },
    { key: "wide", label: "Large desktop" },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAGE HEADER
//
// Title + status badges + Discard/Reset/Save actions, the "first setup"
// banner, and the customize/config/labels tab switcher.
// ─────────────────────────────────────────────────────────────────────────────

export function PageHeader({
    hasChanges,
    isFirstSave,
    totalDirtyVarCount,
    isNetworkSubmitting,
    isUpdating,
    activeIntent,
    pageTab,
    onTabChange,
    onDiscard,
    onResetAll,
    onSave,
    previewDevice,
    onPreviewDeviceChange,
}) {
    return (
        <>
            <s-section>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: DS.sp10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp10 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: DS.text, margin: 0, letterSpacing: "-0.02em" }}>
                            Customize Widget
                        </h1>
                        {hasChanges && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fffbeb", color: "#92400e", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: DS.r99, border: "1px solid #fde68a" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#92400e", flexShrink: 0 }} />
                                Unsaved changes
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
                        <s-button variant="plain" onClick={onDiscard} disabled={!hasChanges || isNetworkSubmitting}>Discard</s-button>
                        <s-button variant="plain" tone="critical" onClick={onResetAll} disabled={isNetworkSubmitting} loading={isNetworkSubmitting && activeIntent === "resetAll" ? true : undefined}>Reset all</s-button>
                        <s-button
                            variant="primary"
                            onClick={onSave}
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

            <s-section>
                <div style={{ display: "flex", gap: DS.sp4, background: DS.bg, borderRadius: DS.r10, padding: 4, width: "fit-content" }}>
                    {PAGE_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => onTabChange(tab.key)}
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

                {/* ── Preview device switcher ──────────────────────────────
                    Changes what the preview imitates, not what gets saved.
                    It's deliberately visually quieter than the tab switcher
                    above — smaller type, no raised card on the active item —
                    because the tabs navigate the merchant's actual work and
                    this only changes how they're looking at it. Reading as
                    equally important would make the page feel like it has two
                    competing navigations.

                    Hidden on the config tab, where the preview itself is
                    hidden and a control for it would do nothing visible. */}
                {pageTab !== "config" && (
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp8, marginTop: DS.sp10 }}>
                        <span style={{ fontSize: 12, color: DS.textMuted }}>Preview at</span>
                        <div style={{ display: "flex", gap: DS.sp4, background: DS.bg, borderRadius: DS.r8, padding: 3, width: "fit-content" }}>
                            {PREVIEW_DEVICES.map((device) => (
                                <button
                                    key={device.key}
                                    onClick={() => onPreviewDeviceChange(device.key)}
                                    aria-pressed={previewDevice === device.key}
                                    style={{
                                        padding: "5px 12px", fontSize: 12, fontWeight: previewDevice === device.key ? 700 : 500,
                                        borderRadius: DS.r6, border: "none",
                                        background: previewDevice === device.key ? DS.bgCard : "transparent",
                                        color: previewDevice === device.key ? DS.text : DS.textMuted,
                                        cursor: "pointer",
                                        transition: "all 0.15s",
                                    }}
                                >{device.label}</button>
                            ))}
                        </div>
                    </div>
                )}
            </s-section>
        </>
    );
}