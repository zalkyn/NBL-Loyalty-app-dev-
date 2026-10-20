import { useEffect } from "react";
import { useActionData, useNavigation, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

/**
 * "Retry failed orders": one submit + one toast, shared by the banner and the
 * failed-orders table so both behave the same and a click never feels ignored.
 */
export function useRetryFailedOrders() {
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const actionData = useActionData();
    const retrying = navigation.state === "submitting" && navigation.formData?.get("submitType") === "retryFailedOrders";

    useEffect(() => {
        if (actionData?.submitType !== "retryFailedOrders") return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
    }, [actionData, shopify]);

    const retry = () => {
        const fd = new FormData();
        fd.set("submitType", "retryFailedOrders");
        submit(fd, { method: "post" });
    };

    return { retrying, retry };
}
