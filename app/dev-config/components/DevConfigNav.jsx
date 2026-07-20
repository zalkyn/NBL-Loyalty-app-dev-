/**
 * @file dev-config/components/DevConfigNav.jsx
 * @description Shared nav bar shown at the top of every dev-config page —
 * lets a developer jump between the sub-tools without editing the URL by
 * hand each time. Mirrors the same "shared component across a group of
 * routes" pattern used elsewhere (e.g. rewards-rules/components,
 * points-rules/*.jsx), just for this one small nav bar instead of a full
 * page section.
 *
 * These pages are deliberately NOT linked from the main app nav (see
 * AppNav.jsx's own comment on that) — developer-only, reached by typing
 * the URL or via this nav bar once you're already on one of them. The
 * short entry point (`/app/dev-config` -> index/route.jsx) is the one
 * bookmarkable/typeable starting point.
 */

const LINKS = [
    { key: "index", label: "Overview", href: "/app/dev-config" },
    { key: "version-tracking", label: "Version Tracking", href: "/app/dev-config/version-tracking" },
    { key: "customer-sync", label: "Customer Sync", href: "/app/dev-config/customer-sync" },
    { key: "queue-jobs", label: "Background Jobs", href: "/app/dev-config/queue-jobs" },
];

/**
 * @param {Object} props
 * @param {"index"|"version-tracking"|"customer-sync"|"queue-jobs"} props.active - Which
 *   page this nav is rendered on, so that one shows as a badge instead of
 *   a clickable link (no point linking to the page you're already on).
 */
export function DevConfigNav({ active }) {
    return (
        <s-section>
            <s-stack direction="inline" gap="base" alignItems="center">
                {LINKS.map((link) =>
                    link.key === active ? (
                        <s-badge key={link.key} tone="info">{link.label}</s-badge>
                    ) : (
                        <s-link key={link.key} href={link.href}>{link.label}</s-link>
                    )
                )}
            </s-stack>
            <s-box paddingBlockStart="small">
                <s-paragraph tone="subdued">
                    Developer-only tools — deliberately not linked from the main app navigation. Bookmark
                    <s-text fontWeight="bold"> /app/dev-config </s-text>
                    to get back here, or type any of the URLs above directly.
                </s-paragraph>
            </s-box>
        </s-section>
    );
}
