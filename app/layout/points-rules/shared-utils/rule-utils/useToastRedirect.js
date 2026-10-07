import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { isErrorResult } from "@app/utils/formFeedback";

// ─────────────────────────────────────────────────────────────────────────────
// useToastRedirect
//
// Watches actionData after a form submit. On every change:
//   - Shows a toast (success or error tone)
//   - Redirects to redirectTo if status === "success"
//
// Usage:
//   useToastRedirect(actionData, "/app/points-rules");
// ─────────────────────────────────────────────────────────────────────────────

export function useToastRedirect(actionData, redirectTo = "/app/points-rules") {
    const shopify = useAppBridge();
    const navigate = useNavigate();

    useEffect(() => {
        if (!actionData) return;
        // isErrorResult also covers syncFailed: saved, but the storefront
        // copy wasn't updated.
        shopify.toast.show(actionData.message, { isError: isErrorResult(actionData) });
        if (actionData.status === "success") {
            navigate(redirectTo);
        }
    }, [actionData, shopify, navigate, redirectTo]);
}
