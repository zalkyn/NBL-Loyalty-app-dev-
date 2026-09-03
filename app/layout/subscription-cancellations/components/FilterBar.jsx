import { FILTER_TABS } from "../_data";

/**
 * Status tabs (backed by URL search params — see _hooks.js's updateParams)
 * plus the bulk "Reset Selected" bar, shown only when rows are selected.
 */
export function FilterBar({ stats, activeTab, onTabChange, selectedCount, isSubmitting, onBulkReset, onClearSelection }) {
    const countFor = (v) => ({
        ALL: stats.total, NEEDS_ACTION: stats.needsAction, APPLIED: stats.applied,
    }[v] ?? 0);

    return (
        <s-section>
            <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="small" alignItems="center">
                    <s-text tone="subdued" variant="bodySm">Filter:</s-text>
                    {FILTER_TABS.map(({ value, label }) => (
                        <s-button
                            key={value}
                            variant={activeTab === value ? "primary" : "secondary"}
                            onClick={() => onTabChange(value)}
                        >
                            {label} ({countFor(value)})
                        </s-button>
                    ))}
                </s-stack>

                {selectedCount > 0 && (
                    <s-stack direction="inline" gap="base" alignItems="center">
                        <s-text variant="bodySm">{selectedCount} selected</s-text>
                        <s-button variant="primary" disabled={isSubmitting} onClick={onBulkReset}>
                            Reset Selected to 0
                        </s-button>
                        <s-button variant="plain" disabled={isSubmitting} onClick={onClearSelection}>
                            Clear selection
                        </s-button>
                    </s-stack>
                )}
            </s-stack>
        </s-section>
    );
}
