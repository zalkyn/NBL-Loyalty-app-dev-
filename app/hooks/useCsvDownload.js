/**
 * @file hooks/useCsvDownload.js
 * @description Downloads a CSV from one of this app's own resource routes
 * from inside the embedded admin iframe.
 *
 * ── Why this exists rather than a plain <a href="…/export" download> ────
 * This app is embedded and authenticates every request with a Shopify
 * session token — App Bridge attaches that token as an Authorization
 * header, but ONLY to requests made with fetch(). An anchor is a
 * top-level browser navigation, not a fetch: the new tab has no App
 * Bridge instance, carries no Authorization header, and can't fall back
 * on a cookie either, because embedded apps can't use third-party
 * cookies at all in browsers that block cross-site data access.
 *
 * So authenticate.admin() on the far end never sees a session, throws its
 * redirect to the auth bounce path, and the merchant gets a login form or
 * a blank tab instead of a file. That is not a bug in the export route —
 * the request simply never reaches its loader authenticated.
 *
 * Fetching the CSV and handing the browser a Blob URL keeps the whole
 * round trip inside the iframe, where the session token exists.
 */

import { useState, useRef, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

/** RFC 5987 `filename*=UTF-8''…` first, plain `filename="…"` second. */
const FILENAME_PATTERN = /filename\*=UTF-8''([^;\r\n]+)|filename="?([^";\r\n]+)"?/i;

/**
 * The server names the file (it knows the rule/segment); this is only the
 * fallback for a response that somehow arrives without the header.
 */
function filenameFrom(dispositionHeader, fallback) {
    if (!dispositionHeader) return fallback;

    const match = FILENAME_PATTERN.exec(dispositionHeader);
    const raw = match?.[1] ?? match?.[2];
    if (!raw) return fallback;

    try {
        return decodeURIComponent(raw).trim() || fallback;
    } catch {
        return raw.trim() || fallback;
    }
}

export function useCsvDownload() {
    const shopify = useAppBridge();

    // Which button is busy, not just "a button is busy" — the backfill
    // page has three export buttons on screen at once and spinning all
    // three because one was clicked would be a lie about what's running.
    const [downloadingKey, setDownloadingKey] = useState(null);

    // A ref as well as the state, because state updates are async and two
    // fast clicks can both pass the check before either re-renders.
    const inFlightRef = useRef(false);

    const downloadCsv = useCallback(
        async (key, href, fallbackFilename = "export.csv") => {
            if (inFlightRef.current || !href) return;

            inFlightRef.current = true;
            setDownloadingKey(key);

            let objectUrl = null;

            try {
                const response = await fetch(href, { headers: { Accept: "text/csv" } });

                if (!response.ok) {
                    // The export routes answer failures in plain text, so
                    // the body is the message worth showing.
                    const detail = await response.text().catch(() => "");
                    throw new Error(
                        detail.trim().slice(0, 200) || `The export failed (HTTP ${response.status}).`
                    );
                }

                // An expired session doesn't fail — fetch follows the auth
                // redirect and comes back 200 with an HTML login page. Only
                // the content type tells the two apart, so an HTML body here
                // means "not signed in", not "empty export".
                const contentType = response.headers.get("Content-Type") ?? "";
                if (!contentType.toLowerCase().includes("csv")) {
                    throw new Error(
                        "Got a page instead of a file — your session may have expired. Reload and try again."
                    );
                }

                const blob = await response.blob();
                if (blob.size === 0) {
                    throw new Error("The export came back empty. Try again in a moment.");
                }

                const filename = filenameFrom(
                    response.headers.get("Content-Disposition"),
                    fallbackFilename
                );

                objectUrl = URL.createObjectURL(blob);

                const anchor = document.createElement("a");
                anchor.href = objectUrl;
                anchor.download = filename;
                anchor.rel = "noopener";
                anchor.style.display = "none";
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
            } catch (error) {
                shopify.toast.show(
                    error?.message || "Couldn't download the CSV. Try again in a moment.",
                    { isError: true }
                );
            } finally {
                // Revoked on a delay rather than immediately: Safari in
                // particular reads the blob asynchronously after the click,
                // and revoking straight away produces a zero-byte file.
                if (objectUrl) {
                    const url = objectUrl;
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }

                inFlightRef.current = false;
                setDownloadingKey(null);
            }
        },
        [shopify]
    );

    return { downloadCsv, downloadingKey };
}
