export default function AppNav() {
    // Deliberately NOT linked here: Background Jobs (/app/dev-config/queue-jobs)
    // and Version Tracking (/app/dev-config/version-tracking) — developer-only
    // tools with sensitive/destructive operations (bulk customer metafield
    // writes/deletes, raw job queue management). No normal admin — merchant,
    // support staff, or otherwise — should stumble into these; they're only
    // reachable by typing the exact URL. See app/routes.js's matching comment.
    return <s-app-nav>
        <s-link href="/app/dashboard">Dashboard</s-link>
        <s-link href="/app/customers">Customers</s-link>
        <s-link href="/app/points-rules">Points Earning Rules</s-link>
        <s-link href="/app/rewards-rules">Reward Rules</s-link>
        <s-link href="/app/physical-prizes-rules">Physical Prize Rules</s-link>
        <s-link href="/app/physical-prizes-claims-manage">Physical Prize Claims</s-link>
        <s-link href="/app/customize">Widget Customize</s-link>
        <s-link href="/app/loox-setup">Review Points Setup</s-link>
    </s-app-nav>
}