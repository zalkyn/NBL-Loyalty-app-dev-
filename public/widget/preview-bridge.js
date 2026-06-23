// =============================================================================
// public/widget/preview-bridge.js
// Loaded ONLY inside app/widget-routes/preview.jsx — never in production.
//
// Two jobs:
//   1. Intercept fetch() so api.js calls never hit a real backend.
//   2. Translate postMessage from the customize panel (parent window) into
//      the SAME bus events the real widget already listens for — so we
//      reuse the widget's own behaviour instead of reimplementing it.
// =============================================================================

(function () {
    "use strict";

    // ── 1. Mock fetch() for any /api/* call api.js makes ────────────────────
    var originalFetch = window.fetch;
    window.fetch = function (url, opts) {
        var isApiCall = typeof url === "string" && url.indexOf("/api/") !== -1;
        if (!isApiCall) return originalFetch(url, opts);

        var body = {};
        try { body = JSON.parse((opts && opts.body) || "{}"); } catch (e) { /* noop */ }

        var mockResponse = { success: true };
        if (url.indexOf("get-reward-voucher") !== -1) {
            mockResponse = { voucherCode: "PREVIEW15OFF" };
        } else if (url.indexOf("claim-prize") !== -1) {
            mockResponse = { success: true, claimId: "preview-claim-1" };
        } else if (url.indexOf("referral") !== -1) {
            mockResponse = {
                success: true,
                referralDiscountCode: "PREVIEW-REF15",
            };
        }

        return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
    };

    // ── 2. nav scene → real bus event map ────────────────────────────────────
    // "earn"/"rewards"/"referral" etc are LivePreview's scene names;
    // data-nav values come from html.js (home / points / rewards / referral …)
    var SCENE_TO_NAV = {
        home: "home",
        earn: "points",
        rewards: "rewards",
    };

    function whenBusReady(fn) {
        if (window.NBL_v1 && window.NBL_v1.bus) { fn(); return; }
        var tries = 0;
        var poll = setInterval(function () {
            if (window.NBL_v1 && window.NBL_v1.bus) { clearInterval(poll); fn(); }
            if (++tries > 200) clearInterval(poll); // ~10s timeout
        }, 50);
    }

    function applyScene(scene) {
        var loyaltyApp = window.NBL_v1;
        if (!loyaltyApp || !loyaltyApp.bus) return;
        var bus = loyaltyApp.bus;

        // Always ensure the widget is open before switching scenes, except
        // the two scenes that are specifically about the closed/overlay state.
        if (scene === "launcher") {
            bus.emit("widget:close");
            return;
        }

        if (loyaltyApp.openWidget) loyaltyApp.openWidget();

        if (scene === "modal") {
            bus.emit("referralModal:open");
            return;
        }

        if (scene === "notification-reward") {
            bus.emit("notify:reward:open", { code: "PREVIEW15OFF" });
            return;
        }

        if (scene === "notification-info") {
            bus.emit("notify:info:open", {
                payload: { rewardRuleId: 1, title: "Preview Reward" },
            });
            return;
        }

        var navTab = SCENE_TO_NAV[scene] || "home";
        bus.emit("nav:change", { tab: navTab });
    }

    // ── 3. postMessage listener — only accept our own protocol ──────────────
    window.addEventListener("message", function (e) {
        var msg = e.data;
        if (!msg || msg.source !== "nbl-customize") return;

        whenBusReady(function () {
            var loyaltyApp = window.NBL_v1;
            var bus = loyaltyApp.bus;

            if (msg.type === "cssVars") {
                var root = document.documentElement;
                Object.keys(msg.payload || {}).forEach(function (k) {
                    if (k.indexOf("--") === 0) root.style.setProperty(k, msg.payload[k]);
                });

                var savedPos = (msg.payload["--nbl-launcher-position"] || "").toLowerCase();
                if (savedPos === "left" || savedPos === "right") {
                    var wrapper = document.querySelector(".nbl-wo-wrapper-v1");
                    var container = document.querySelector(".nbl-widget-container-v1");
                    [wrapper, container].forEach(function (el) {
                        if (!el) return;
                        el.classList.remove("pos-left", "pos-right");
                        el.classList.add("pos-" + savedPos);
                    });
                }
            }

            if (msg.type === "widgetConfig" && loyaltyApp.appConfig) {
                loyaltyApp.appConfig.styles.widgetConfig = msg.payload || {};
                // Re-broadcast so any module reading labels/config re-renders text.
                /** @fires theme:applied */
                bus.emitSticky("theme:applied", { styles: loyaltyApp.appConfig.styles });
                loyaltyApp?.updateConfig(loyaltyApp.appConfig.styles.widgetConfig)
            }

            if (msg.type === "scene") {
                applyScene(msg.payload);
            }
        });
    });

    // ── 4. Tell the parent we're alive ───────────────────────────────────────
    whenBusReady(function () {
        // Default to the home scene open, same as LivePreview's default prop.
        applyScene("home");
        parent.postMessage({ source: "nbl-preview", type: "ready" }, "*");
    });
})();