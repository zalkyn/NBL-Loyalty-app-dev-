export default function AppNav() {
    // Deliberately NOT linked here: Background Jobs (/app/dev-config/queue-jobs),
    // Customer Sync (/app/dev-config/customer-sync), and Version Tracking
    // (/app/dev-config/version-tracking) — developer-only tools with
    // sensitive/destructive operations (bulk customer metafield writes/
    // deletes, raw job queue management). No normal admin — merchant,
    // support staff, or otherwise — should stumble into these; they're only
    // reachable by typing the exact URL. See app/routes.js's matching comment.
    //
    // Points Backfill Rules / Points Backfill below ARE linked, even though
    // their route.jsx files also happen to live under dev-config/ and stay
    // reachable at /app/dev-config/points-backfill-rules /
    // /app/dev-config/points-backfill too — deciding to backfill points for
    // existing customers is a real merchant decision, not a dangerous dev
    // tool, so it belongs in normal navigation. See DevConfigNav.jsx's own
    // comment for how that page avoids leaking the OTHER dev-config links
    // onto this main-nav path.
    return <s-app-nav>
        <s-link href="/app/dashboard">Dashboard</s-link>
        <s-link href="/app/setup-guide">Setup Guide</s-link>
        <s-link href="/app/customers">Customers</s-link>
        <s-link href="/app/points-rules">Points Earning Rules</s-link>
        <s-link href="/app/rewards-rules">Reward Rules</s-link>
        <s-link href="/app/physical-prizes-rules">Physical Prize Rules</s-link>
        <s-link href="/app/physical-prizes-claims-manage">Physical Prize Claims</s-link>
        <s-link href="/app/subscription-cancellations">Subscription Cancellations</s-link>
        <s-link href="/app/points-backfill-rules">Points Backfill Rules</s-link>
        <s-link href="/app/points-backfill">Points Backfill</s-link>
        <s-link href="/app/customize">Widget Customize</s-link>
        <s-link href="/app/loox-setup">Review Points Setup</s-link>
    </s-app-nav>
}