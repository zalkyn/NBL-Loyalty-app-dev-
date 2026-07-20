/**
 * @file dev-config/version-tracking/_hooks.js
 * @description Client-side state + handlers for the Version Tracking
 * page — just the "publish a new version" form and its shared confirm
 * modal now. Customer sync (bulk and single) moved out to its own page —
 * see dev-config/customer-sync/_hooks.js.
 */

import { useState } from "react";
import { useFetcher } from "react-router";

// Shared id for the single confirmation modal — every trigger button on
// this page references this via commandFor to open it declaratively.
export const MODAL_ID = "version-tracking-confirm-modal";

export function useVersionTrackingPage() {
    // ── Shared confirm-modal flow ────────────────────────────────────────────
    const [pendingAction, setPendingAction] = useState(null);

    function confirmPendingAction() {
        if (pendingAction) pendingAction.run();
        setPendingAction(null);
        // Closing the modal itself is handled declaratively — the Confirm
        // button also carries commandFor={MODAL_ID} command="--hide".
    }

    // ── "Announce a new update" section ──────────────────────────────────────
    const fetcher = useFetcher();
    const busy = fetcher.state !== "idle";
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");

    function requestPublish() {
        if (!title.trim() || busy) return;
        setPendingAction({
            confirmHeading: "Publish this update?",
            confirmText:
                "This is a sensitive, shop-wide action — please read carefully before confirming. " +
                "Publishing makes this the new active version immediately. If the update banner is turned on " +
                "(Customize > Update Notifications), every customer whose account hasn't synced yet will start " +
                "seeing it — this can mean a large portion of your customer base, right away. " +
                "Double-check the title/description are correct before continuing; this cannot be undone, only superseded by publishing another version.",
            run: () => {
                fetcher.submit({ intent: "publishVersion", title, description }, { method: "post" });
                setTitle("");
                setDescription("");
            },
        });
    }

    return {
        pendingAction, setPendingAction, confirmPendingAction,
        fetcher, busy, title, setTitle, description, setDescription, requestPublish,
    };
}
