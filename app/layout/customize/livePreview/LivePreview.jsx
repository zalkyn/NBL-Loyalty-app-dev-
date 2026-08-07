import { useState, useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { DS } from "../constants/cssVarsConfig";

// ─────────────────────────────────────────────────────────────────────────────
// LivePreview.jsx
// Renders the REAL widget bundle (public/widget/modules-main) inside an
// isolated <iframe src="/widget/preview.html">, instead of a hand-built
// JSX mock. Same props/signature as before — route.jsx needs no changes.
//
// preview.html is a STATIC file (not a React Router route) — this is
// intentional. An SSR route gets caught by Shopify's embedded-app session
// proxy and tries to bounce the nested iframe to admin.shopify.com, which
// the browser blocks ("admin.shopify.com refused to connect"). A static
// file served straight from /public never touches that pipeline, exactly
// like main.css / main.js already don't.
//
// Props:
//   cssVars       {object}  CSS variable map (--nbl-* keys)
//   previewScene  {string}  "home" | "earn" | "rewards" | "notification-reward"
//                           "notification-info" | "notification-toast" |
//                           "notification-update-banner" | "join-program" |
//                           "launcher" | "referral" | "modal"
//   widgetConfig  {object}  widgetConfig state (labels, behaviour toggles)
//   hidden        {bool}    true on the "config" tab — render nothing
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_SRC = "/widget/preview.html";
const POST_TARGET = "nbl-customize";
const CSS_VARS_DEBOUNCE_MS = 80;

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE PRESETS
//
// The preview is an <iframe>, and media queries inside it resolve against the
// frame's own viewport, not the merchant's monitor. At the historical fixed
// 390px that meant the widget was permanently on a "phone": every
// max-width:749px rule fired, and ui.css's min-width:1200px zoom block — the
// rendering most desktop visitors actually get — could never be seen at all.
//
// Widening the iframe to a real 1280px and scaling it down would emulate a
// desktop honestly, but at the ~0.3 scale needed to fit the admin's corner
// the widget would be unreadable, which defeats the point of a preview. So
// the frame stays close to the widget's own footprint and the widget is told
// which viewport to imitate instead (postMessage -> data-nbl-preview on the
// shadow host -> the override block at the end of ui.css).
//
// width/height: the frame only ever has to contain the widget, so these track
// ui.css's real footprint — 390px wide by (88px bottom offset + 520px panel)
// tall, plus headroom for shadow and glow.
//
// scale: chosen so all three presets occupy roughly the same area of the
// admin page. Without it, switching to "wide" would visibly grow the preview
// panel and shove the customize form around.
//
// wide: 390 x 1.25 and 630 x 1.25, matching the zoom factor the override
// applies inside the frame. Undersizing here would simply clip the zoomed
// widget at the frame's edge.
const DEVICE_PRESETS = {
    mobile: { width: 390, height: 630, scale: 0.92 },
    desktop: { width: 390, height: 630, scale: 0.92 },
    wide: { width: 488, height: 788, scale: 0.74 },
};

const DEFAULT_DEVICE = "desktop";

const LivePreviewPanel = memo(function LivePreviewPanel({
    cssVars,
    previewScene = "home",
    previewDevice = DEFAULT_DEVICE,
    widgetConfig = null,
    hidden = false,
}) {
    const iframeRef = useRef(null);
    const [iframeReady, setIframeReady] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const cssVarsDebounceRef = useRef(null);

    useEffect(() => { setIsMounted(true); }, []);

    // ── Listen for the iframe's "ready" signal ─────────────────────────────
    useEffect(() => {
        function onMessage(e) {
            if (e.data?.source === "nbl-preview" && e.data.type === "ready") {
                setIframeReady(true);
            }
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    const post = (type, payload) => {
        iframeRef.current?.contentWindow?.postMessage(
            { source: POST_TARGET, type, payload },
            window.location.origin
        );
    };

    // ── cssVars -> debounced postMessage (slider drags fire fast) ──────────
    useEffect(() => {
        if (!iframeReady) return;
        if (cssVarsDebounceRef.current) clearTimeout(cssVarsDebounceRef.current);
        cssVarsDebounceRef.current = setTimeout(() => {
            post("cssVars", cssVars);
        }, CSS_VARS_DEBOUNCE_MS);
        return () => clearTimeout(cssVarsDebounceRef.current);
    }, [cssVars, iframeReady]);

    // ── widgetConfig -> immediate postMessage (label edits aren't high-frequency) ─
    useEffect(() => {
        if (!iframeReady) return;
        post("widgetConfig", widgetConfig);
    }, [widgetConfig, iframeReady]);

    // ── previewScene -> immediate postMessage ───────────────────────────────
    // Also re-fires on widgetConfig changes (Reset all, Save, any field
    // edit) — not just when previewScene's own value changes. Without this,
    // an action that resets widgetConfig while sitting on a section whose
    // scene is unchanged (e.g. "Header", scene="home", before and after
    // Reset all) never re-sends the scene message at all — so the iframe's
    // bridgeRef.setScene() never re-runs, and any active preview override
    // (e.g. previewJoinProgram from a PREVIOUS visit to "New Customer
    // Onboarding") stays stuck instead of being cleared. Re-sending the
    // scene alongside every widgetConfig change guarantees the preview's
    // override state always reflects the currently active section, not
    // just the section that was active the last time it literally changed.
    useEffect(() => {
        if (!iframeReady) return;
        post("scene", previewScene);
    }, [previewScene, widgetConfig, iframeReady]);

    // ── previewDevice -> immediate postMessage ──────────────────────────────
    // Re-sent on every cssVars change as well as when the device itself
    // changes, for the same reason the scene message is re-sent on every
    // widgetConfig change (see the note above): a Reset all replaces the
    // cssVars wholesale, and the widget re-derives its launcher mode from
    // that payload. Without a fresh device message alongside it, the frame
    // would keep whatever data-nbl-preview it had while the mode underneath
    // changed — the two have to be re-applied together or the preview shows
    // a combination the merchant never selected.
    //
    // Fires on mount too, so the widget starts in "desktop" rather than in
    // the mobile rendering the 390px frame would otherwise force.
    useEffect(() => {
        if (!iframeReady) return;
        post("previewDevice", previewDevice);
    }, [previewDevice, cssVars, iframeReady]);

    // if (hidden) return null;

    const isLeft = (cssVars?.["--nbl-launcher-position"] || "right") === "left";

    // The admin preview is intentionally shown a bit smaller than the real
    // storefront widget — purely so it sits comfortably inside the
    // customize page without dominating the screen. Scaling the <iframe>
    // element itself (rather than anything inside preview.html) means this
    // is a compositing-level transform: it can never conflict with the
    // widget's own open/close `transform: scale(...)` animation, and it
    // automatically tracks ui.css's real dimensions — no hardcoded pixel
    // values to keep in sync by hand.
    //
    // Falls back to the desktop preset rather than trusting the prop: this is
    // a display dimension, and an unrecognised value would collapse the frame
    // to zero and make the preview vanish with no obvious cause.
    const device = DEVICE_PRESETS[previewDevice] || DEVICE_PRESETS[DEFAULT_DEVICE];

    return (
        <>
            {/* <div style={{ marginTop: 8, fontSize: 11, color: DS.textHint, textAlign: "center" }}>
                Launcher (bottom-{isLeft ? "left" : "right"}) · click to open/close
            </div> */}

            {isMounted && createPortal(
                <iframe
                    ref={iframeRef}
                    src={PREVIEW_SRC}
                    title="Widget Live Preview"
                    sandbox="allow-scripts allow-same-origin"
                    style={{
                        position: "fixed",
                        bottom: 0,
                        ...(isLeft ? { left: 0 } : { right: 0 }),
                        // Per-device footprint — see DEVICE_PRESETS.
                        width: device.width,
                        height: device.height,
                        transform: `scale(${device.scale})`,
                        transformOrigin: isLeft ? "bottom left" : "bottom right",
                        border: "none",
                        background: "transparent",
                        zIndex: 9999999999998,
                        // iframe stays click-through everywhere except where the
                        // real widget paints something (launcher / popup) — the
                        // widget's own CSS sizes those, so no per-pixel overlay
                        // logic is needed here.
                        pointerEvents: "auto",
                    }}
                />,
                document.body
            )}
        </>
    );
});

export default LivePreviewPanel;