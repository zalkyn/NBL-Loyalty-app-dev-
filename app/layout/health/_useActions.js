import { useEffect } from "react";
import { useActionData, useNavigation, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

const TYPES = ["snoozeItem", "unsnoozeItem", "markReferralHandled"];

/**
 * "Hide for 7 days", "Show again" and "Mark as handled": one submit + one toast
 * each, shared by the banners, the hidden list and the unpaid-referrals table.
 */
export function useHealthActions() {
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const actionData = useActionData();

    useEffect(() => {
        if (!TYPES.includes(actionData?.submitType)) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
    }, [actionData, shopify]);

    const send = (fields) => {
        const fd = new FormData();
        Object.entries(fields).forEach(([k, v]) => fd.set(k, String(v)));
        submit(fd, { method: "post" });
    };

    const busyType = navigation.state === "submitting" ? navigation.formData?.get("submitType") : null;
    const busyKey = busyType ? (navigation.formData?.get("key") ?? navigation.formData?.get("referralId")) : null;

    return {
        busy: (type, key) => busyType === type && String(busyKey) === String(key),
        hide: (item) => send({ submitType: "snoozeItem", key: item.key, count: item.count }),
        show: (item) => send({ submitType: "unsnoozeItem", key: item.key }),
        markHandled: (referralId) => send({ submitType: "markReferralHandled", referralId }),
    };
}
