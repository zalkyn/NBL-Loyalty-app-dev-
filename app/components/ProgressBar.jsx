/**
 * @file dev-config/points-backfill/components/ProgressBar.jsx
 * @description The one progress bar this page uses, for both of its waits.
 *
 * This page makes a merchant wait twice — once while a preview is built,
 * once while a run works through it — and those two waits sit within a
 * screen's scroll of each other. Two bars drawn from two copies of the
 * same inline styles would drift apart the first time either is touched,
 * and land as two different-looking things happening to the same list of
 * customers.
 *
 * Plain HTML with inline styles rather than a Shopify web component, for
 * the reason documented at the top of SegmentSelector.jsx: those
 * components encapsulate their own styling and ignore decorative
 * overrides.
 *
 * Renders NOTHING without a usable total. A bar filling against an
 * unknown denominator is a guess dressed as a measurement — and here it
 * would be a guess about how much longer someone has to wait before real
 * points land in real customer balances.
 */

export function ProgressBar({ processed, total, label }) {
    const hasTotal = typeof total === "number" && total > 0;
    const done = Math.max(0, processed ?? 0);

    if (!hasTotal) return null;

    const percent = Math.min(100, Math.round((done / total) * 100));

    return (
        <div>
            <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label ?? "Progress"}
                style={{
                    height: "6px",
                    width: "100%",
                    borderRadius: "999px",
                    background: "#E3E5E7",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        height: "100%",
                        width: `${percent}%`,
                        borderRadius: "999px",
                        background: "#303030",
                        // Counts arrive in steps of one poll, so the fill is
                        // animated between them. Without it the bar jumps,
                        // which reads as a page reloading rather than work
                        // progressing.
                        transition: "width 400ms ease",
                    }}
                />
            </div>
        </div>
    );
}