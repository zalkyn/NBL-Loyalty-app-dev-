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
//                           "notification-info" | "launcher" | "referral" | "modal"
//   widgetConfig  {object}  widgetConfig state (labels, behaviour toggles)
//   hidden        {bool}    true on the "config" tab — render nothing
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_SRC = "/widget/preview.html";
const POST_TARGET = "nbl-customize";
const CSS_VARS_DEBOUNCE_MS = 80;

const LivePreviewPanel = memo(function LivePreviewPanel({
    cssVars,
    previewScene = "home",
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

    // ── cssVars → debounced postMessage (slider drags fire fast) ──────────
    useEffect(() => {
        if (!iframeReady) return;
        if (cssVarsDebounceRef.current) clearTimeout(cssVarsDebounceRef.current);
        cssVarsDebounceRef.current = setTimeout(() => {
            post("cssVars", cssVars);
        }, CSS_VARS_DEBOUNCE_MS);
        return () => clearTimeout(cssVarsDebounceRef.current);
    }, [cssVars, iframeReady]);

    // ── widgetConfig → immediate postMessage (label edits aren't high-frequency) ─
    useEffect(() => {
        if (!iframeReady) return;
        post("widgetConfig", widgetConfig);
    }, [widgetConfig, iframeReady]);

    // ── previewScene → immediate postMessage ───────────────────────────────
    useEffect(() => {
        if (!iframeReady) return;
        post("scene", previewScene);
    }, [previewScene, iframeReady]);

    // if (hidden) return null;

    const isLeft = (cssVars?.["--nbl-launcher-position"] || "right") === "left";

    return (
        <>
            <div style={{ marginTop: 8, fontSize: 11, color: DS.textHint, textAlign: "center" }}>
                Launcher (bottom-{isLeft ? "left" : "right"}) · click to open/close
            </div>

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
                        width: 390,
                        height: 620,
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