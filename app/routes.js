import { route, layout } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

export default [
    ...(await flatRoutes()),

    layout("./layout/index.jsx", [
        // dashboard
        route("app/dashboard", "./layout/dashboard/route.jsx"),

        // customer
        route("app/customers", "./layout/customers/index/route.jsx"),
        route("app/customers/:id", "./layout/customers/$id/route.jsx"),

        // customize
        route("app/customize", "./layout/customize/route.jsx"),

        // point earning rule
        route("app/points-rules", "./layout/points-rules/index/route.jsx"),
        route("app/points-rules/order", "./layout/points-rules/order/route.jsx"),
        route("app/points-rules/referral", "./layout/points-rules/referral/route.jsx"),
        route("app/points-rules/review", "./layout/points-rules/review/route.jsx"),

        // reward rule
        route("app/rewards-rules", "./layout/rewards-rules/route.jsx"),

        // physical prize
        route("app/physical-prizes-rules", "./layout/physical-prizes-rules/route.jsx"),
        route("app/physical-prizes-claims-manage", "./layout/physical-prizes-claims-manage/route.jsx"),

        // point events
        route("app/points-events", "./layout/points-events/route.jsx"),

        // ── Developer-only tools ────────────────────────────────────────────
        // Deliberately NOT linked from AppNav.jsx (see that file's comment) —
        // sensitive/destructive operations (bulk customer metafield writes/
        // deletes, raw job queue management) that only someone with direct
        // codebase + database access should ever touch. Reachable by exact
        // URL only.
        route("app/dev-config/queue-jobs", "./layout/dev-config/queue-jobs/route.jsx"),
        route("app/dev-config/version-tracking", "./layout/dev-config/version-tracking/route.jsx"),

        // Loox review points — Shopify Flow setup guide
        route("app/loox-setup", "./layout/loox-setup/route.jsx"),

        // widget preview
        // route("widget/preview", "./widget-routes/preview.jsx"),

    ]),

    // API Routes
    // NOTE: claim-prize / get-reward-voucher / get-referral-discount /
    // provision-customer / join-program used to live here as plain `api/*`
    // routes, trusting a client-supplied shop/customerId/customerIndex in
    // the request body — spoofable from devtools with no proof the request
    // came from that customer's actual storefront session. Migrated below to
    // the App Proxy (widget-data/*), where identity comes only from
    // Shopify's signed `logged_in_customer_id`. Do not re-add them here.
    route("api/loox-new-review-trigger/:token", "./api-routes/loox-new-review-trigger.jsx"),

    // Widget App Proxy — storefront calls /apps/widget, Shopify proxies it here.
    // Backend code lives in app/widget-ui/ (not app/routes/), kept grouped
    // with the rest of the widget-related code.
    route("widget-data", "./widget-ui/route.jsx"),
    route("widget-data/notifications/mark-seen", "./widget-ui/notifications-mark-seen.jsx"),
    route("widget-data/provision-customer", "./widget-ui/provision-customer.jsx"),
    route("widget-data/join-program", "./widget-ui/join-program.jsx"),
    route("widget-data/get-reward-voucher", "./widget-ui/reward-claim.jsx"),
    route("widget-data/claim-prize", "./widget-ui/prize-claim.jsx"),
    route("widget-data/get-referral-discount", "./widget-ui/referral-claim.jsx"),

    // Webhooks
    route("webhooks/app/orders_paid", "./webhook-routes/order-paid.jsx"),
    route("webhooks/app/orders_cancelled", "./webhook-routes/order-cancelled.jsx"),
    route("webhooks/app/refunds_create", "./webhook-routes/refund-created.jsx"),
    route("webhooks/app/customers_create", "./webhook-routes/customer-create.jsx"),
    route("webhooks/app/customers_delete", "./webhook-routes/customer-delete.jsx"),
    route("webhooks/app/uninstalled", "./webhook-routes/app-uninstalled.jsx"),
    route("webhooks/app/scopes_update", "./webhook-routes/scopes-update.jsx"),
];