import { useEffect, useRef, useCallback, useState } from "react";
import { useNavigate, useNavigation, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { usePagination } from "@app/hooks/pagination/usePagination";

export function useCustomerDetailsPage(loaderData, actionData) {
    const navigate = useNavigate();
    const navigation = useNavigation();
    const submit = useSubmit();
    const shopify = useAppBridge();

    const customer = loaderData?.customer ?? {};
    const customerLabel = customer?.name || customer?.email || "Customer Details";

    const isSubmitting = navigation.state === "submitting";
    const pendingSubmit = navigation.formData?.get("submitType");
    const isAdjusting = isSubmitting && pendingSubmit === "adjustPoints";
    const isCancellingReward = isSubmitting && pendingSubmit === "cancelReward";

    // ── Toast on action result ────────────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
    }, [actionData, shopify]);

    // ── Navigation ────────────────────────────────────────────────────────────
    const handleBack = () => navigate("/app/customers", { replace: true });

    // ── Adjust points submit ──────────────────────────────────────────────────
    const handleAdjustPoints = ({ mode, amount, reason }) => {
        submit({
            submitType: "adjustPoints",
            customerId: String(customer.id),
            shopifyId: customer.shopifyId,
            mode,
            amount: String(amount),
            reason: reason || "",
        }, { method: "POST" });
    };

    // ── Cancel reward confirm modal ────────────────────────────────────────────
    // Same show/hide-via-ref + target-state pattern as
    // physical-prizes-claims-manage/_hooks.js's confirm modal.
    const cancelRewardModalRef = useRef(null);
    const [cancelTarget, setCancelTarget] = useState(null);

    const openCancelReward = useCallback((reward) => {
        setCancelTarget(reward);
        requestAnimationFrame(() => cancelRewardModalRef.current?.showOverlay());
    }, []);

    const closeCancelRewardModal = useCallback(() => {
        cancelRewardModalRef.current?.hideOverlay();
        setCancelTarget(null);
    }, []);

    const handleConfirmCancelReward = useCallback(() => {
        if (!cancelTarget) return;
        cancelRewardModalRef.current?.hideOverlay();
        submit({ submitType: "cancelReward", rewardId: String(cancelTarget.id) }, { method: "POST" });
        setCancelTarget(null);
    }, [cancelTarget, submit]);

    // ── Pagination ────────────────────────────────────────────────────────────
    const txPagination = usePagination(customer?.transactions ?? [], 25);
    const rwPagination = usePagination(customer?.rewards ?? [], 25);
    const prizeClaimPagination = usePagination(customer?.prizeClaims ?? [], 25);

    return {
        customer, customerLabel,
        isAdjusting,
        isCancellingReward,
        handleBack,
        handleAdjustPoints,
        cancelRewardModalRef,
        cancelTarget,
        openCancelReward,
        closeCancelRewardModal,
        handleConfirmCancelReward,
        txPagination,
        rwPagination,
        prizeClaimPagination,
    };
}
