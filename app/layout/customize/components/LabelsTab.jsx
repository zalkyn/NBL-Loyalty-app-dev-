import { DS, LABEL_GROUPS } from "../constants/cssVarsConfig";
import { SidebarNavItem } from "./SidebarNavItem";
import { ConfigLabelField } from "./ConfigLabelField";

// ─────────────────────────────────────────────────────────────────────────────
// LABELS TAB
//
// Left group nav (LABEL_GROUPS — see cssVarsConfig.js) + right field editor
// for the active group, same shell pattern ConfigTab.jsx uses for the
// Widget Config tab. Previously this was one long undifferentiated list of
// ~40 fields in a single column.
// ─────────────────────────────────────────────────────────────────────────────

export function LabelsTab({ widgetConfig, onConfigChange, activeLabelGroup, onLabelGroupChange, labelGroupDirtyCount, isNetworkSubmitting }) {
    const activeGroup = LABEL_GROUPS.find((g) => g.key === activeLabelGroup) ?? LABEL_GROUPS[0];

    return (
        <s-grid gridTemplateColumns="280px 1fr 1fr" gap="base">
            {/* LEFT — label group nav */}
            <div>
                <div style={{ position: "sticky", top: 16 }}>
                    <s-section>
                        <div style={{
                            fontSize: 10, fontWeight: 700, color: DS.textHint,
                            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp8,
                        }}>Labels</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {LABEL_GROUPS.map((group) => (
                                <SidebarNavItem
                                    key={group.key}
                                    label={group.label}
                                    isActive={activeLabelGroup === group.key}
                                    badge={labelGroupDirtyCount(group)}
                                    onClick={() => onLabelGroupChange(group.key)}
                                    disabled={isNetworkSubmitting}
                                />
                            ))}
                        </div>
                    </s-section>
                </div>
            </div>

            {/* RIGHT — active group's fields */}
            <s-section>
                <div style={{ marginBottom: DS.sp20 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: DS.text, lineHeight: 1.2, marginBottom: DS.sp6 }}>{activeGroup.label}</div>
                    <div style={{ fontSize: 12, color: DS.textMuted }}>{activeGroup.description}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                    {activeGroup.fields.map((field) => (
                        <ConfigLabelField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onConfigChange} disabled={isNetworkSubmitting} />
                    ))}
                </div>
            </s-section>
        </s-grid>
    );
}
