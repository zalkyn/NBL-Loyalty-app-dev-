// =============================================================================
// public/widget/preview-bridge.js
// Loaded ONLY inside app/widget-routes/preview.jsx — never in production.
//
// Two jobs:
//   1. Intercept fetch() so api.js calls never hit a real backend.
//   2. Translate postMessage from the customize panel (parent window) into
//      direct calls on window.NBL_v1.__bridge — the imperative API that
//      App.jsx exposes after mounting. (Purono code e bus.emit() use hoto,
//      new Preact widget-e kono bus nei — sob state App-er useState-e.)
// =============================================================================

(function () {
    "use strict";

    // ── 1. Mock fetch() for any widget API call (App Proxy /apps/widget/*,
    //      or the legacy /api/* pattern kept for safety) ─────────────────────
    //
    // The real widget's API routes moved from /api/* to the App Proxy path
    // (/apps/widget/*, via widget-data/* in app/routes.js) a while back —
    // this intercept condition was never updated to match, so every preview
    // session was silently firing a REAL, unmocked fetch('/apps/widget')
    // (from useConfigResync — isMember is true in the mock data) straight at
    // the customize page's own origin, which 404s there (no such route
    // outside Shopify's actual App Proxy tunnel). Matching both patterns
    // here keeps this working regardless of which path style is current.
    var originalFetch = window.fetch;

    // Shared shape for any mock response that needs a customer config —
    // matches syncCustomerConfig.js's real shape (id/shopifyId/points/
    // referralCode/transactions/rewards/prizeClaims/lastSyncedVersionKey).
    // Kept intentionally small/generic rather than mirroring the full
    // preview-moc-config.js fixture — these are POST/GET responses simulating
    // a fresh sync, not the initial page-load data, so callers only need
    // enough here to confirm "the call succeeded and returned something
    // usable", not full fidelity with the boot-time mock customer.
    function mockConfig() {
        return {
            id: 1,
            shopifyId: "gid://shopify/Customer/9441305526522",
            points: 2563545,
            referralCode: "NBL_3D3E3MBMOTOIN2S",
            transactions: [],
            rewards: [],
            prizeClaims: [],
            lastSyncedVersionKey: null,
        };
    }

    window.fetch = function (url, opts) {
        var isApiCall = typeof url === "string" &&
            (url.indexOf("/apps/widget") !== -1 || url.indexOf("/api/") !== -1);
        if (!isApiCall) return originalFetch.call(this, url, opts);

        var mockResponse = { success: true };
        if (url.indexOf("get-reward-voucher") !== -1) {
            mockResponse = { voucherCode: "PREVIEW15OFF" };
        } else if (url.indexOf("claim-prize") !== -1) {
            mockResponse = { success: true, claimId: "preview-claim-1" };
        } else if (url.indexOf("get-referral-discount") !== -1) {
            mockResponse = {
                success: true,
                referralDiscountCode: "PREVIEW-REF15",
            };
        } else if (url.indexOf("provision-customer") !== -1) {
            // useCustomerProvision.js checks data.config specifically.
            mockResponse = { success: true, created: false, config: mockConfig() };
        } else if (url.indexOf("join-program") !== -1) {
            // useJoinProgram.js checks data.success && data.config.
            mockResponse = { success: true, alreadyJoined: true, config: mockConfig() };
        } else {
            // Plain GET /apps/widget — requestConfigResync (useConfigResync.js
            // / useAutoUpdateSync.js / the Update banner's manual click all
            // check data.config). Without this branch every one of those
            // silently "fails" in preview even though nothing is actually
            // wrong — see useUpdateBanner.js's error path, which is exactly
            // what surfaced this gap.
            mockResponse = { success: true, config: mockConfig() };
        }

        return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
    };

    // ── 2. scene name -> bridge method call ───────────────────────────────────
    // New Preact widget-e kono bus nei. App.jsx boot-er pore
    // window.NBL_v1.__bridge object-e imperative functions inject kore.
    // Amra shei functions call kori.
    function whenBridgeReady(fn) {
        if (
            window.NBL_v1 &&
            window.NBL_v1.__bridge &&
            typeof window.NBL_v1.__bridge.setScene === "function"
        ) {
            fn();
            return;
        }
        var tries = 0;
        var poll = setInterval(function () {
            if (
                window.NBL_v1 &&
                window.NBL_v1.__bridge &&
                typeof window.NBL_v1.__bridge.setScene === "function"
            ) {
                clearInterval(poll);
                fn();
            }
            if (++tries > 200) clearInterval(poll); // ~10s timeout
        }, 50);
    }

    // ── 3. postMessage listener — only accept our own protocol ───────────────
    window.addEventListener("message", function (e) {
        var msg = e.data;
        if (!msg || msg.source !== "nbl-customize") return;

        whenBridgeReady(function () {
            var bridge = window.NBL_v1.__bridge;

            if (msg.type === "cssVars") {
                bridge.setCssVars(msg.payload || {});
            }

            if (msg.type === "widgetConfig") {
                bridge.setWidgetConfig(msg.payload || {});
            }

            if (msg.type === "scene") {
                bridge.setScene(msg.payload);
            }
        });
    });

    // ── 4. Tell the parent we're alive ───────────────────────────────────────
    whenBridgeReady(function () {
        // Default: widget open on home tab, same as LivePreview default prop.
        window.NBL_v1.__bridge.setScene("home");
        parent.postMessage({ source: "nbl-preview", type: "ready" }, "*");
    });
})();