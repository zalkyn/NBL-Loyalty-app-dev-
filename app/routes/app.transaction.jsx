import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "shopify-server";
import prisma from "db-server";
// import createPointsTransaction from "@controller/pointsTransaction/createPointTransaction";


// ====================== LOADER ======================
export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    const type = url.searchParams.get("type");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const transactions = await prisma.pointsTransaction.findMany({
        where: {
            customer: {
                sessionId: session.id,
            },
            ...(customerId && { customerId: parseInt(customerId) }),
            ...(type && { type }),
        },
        include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    points: true,
                    shopifyId: true
                }
            },
            event: {
                select: {
                    id: true,
                    name: true,
                    type: true
                }
            }
        },
        orderBy: { createdAt: "desc" },
        take: limit,
    });

    const customers = await prisma.customer.findMany({
        where: { sessionId: session.id },
        select: {
            id: true,
            name: true,
            email: true,
            points: true,
            shopifyId: true
        },
        orderBy: { points: "desc" },
        take: 20,
    });

    return {
        transactions,
        customers
    };
};

// ====================== ACTION ======================
export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    if (submitType === "adjustPoints") {
        const customerId = parseInt(formData.get("customerId"));
        const points = parseInt(formData.get("points"));
        const reason = formData.get("reason")?.toString() || "Manual Adjustment";

        let metadata = {};
        try {
            if (formData.get("metadata")) {
                metadata = JSON.parse(formData.get("metadata"));
            }
        } catch (e) {
            metadata = {};
        }

        if (!customerId || isNaN(points)) {
            return {
                message: "Customer and valid Points amount are required.",
                status: "error",
                submitType
            };
        }

        try {
            // const transaction = await createPointsTransaction({
            //     customerId,
            //     type: "ADJUST",
            //     points: points,
            //     referenceId: `manual_${Date.now()}`,
            //     metadata: {
            //         ...metadata,
            //         reason: reason,
            //         adjustedBy: "admin"
            //     }
            // }, session);

            return {
                message: `Successfully ${points > 0 ? "added" : "deducted"} ${Math.abs(points)} points.`,
                status: "success",
                submitType
            };

        } catch (error) {
            console.error("Points Adjustment Error:", error);
            return {
                message: error.message || "Failed to adjust points.",
                status: "error",
                submitType
            };
        }
    }

    return {
        message: "Invalid action.",
        status: "error",
        submitType
    };
};

// ====================== COMPONENT ======================
export default function PointsTransactions() {
    const { transactions, customers } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const shopify = useAppBridge();
    const navigation = useNavigation();

    const [formData, setFormData] = useState({
        customerId: "",
        points: "",
        reason: "",
        metadata: ""
    });

    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, {
                isError: actionData.status === "error"
            });
        }
    }, [actionData]);

    const handleAdjustPoints = () => {
        if (!formData.customerId || !formData.points) {
            shopify.toast.show("Please select a customer and enter points amount.");
            return;
        }

        submit({
            submitType: "adjustPoints",
            customerId: formData.customerId,
            points: formData.points,
            reason: formData.reason,
            metadata: formData.metadata || "{}"
        }, { method: "post" });
    };

    return (
        <s-page inlineSize="full">
            <s-section>
                <h2>Points Transactions & Manual Adjustment</h2>
            </s-section>

            {/* Manual Adjustment Form */}
            <s-section>
                <h3>Manual Points Adjustment</h3>
                <s-card>
                    <s-select
                        label="Select Customer"
                        value={formData.customerId}
                        onChange={(e) => setFormData(prev => ({ ...prev, customerId: e.target.value }))}
                    >
                        <s-option value="">Select Customer...</s-option>
                        {customers.map((c) => (
                            <s-option key={c.id} value={c.id}>
                                {c.name || c.email} — {c.points} pts
                            </s-option>
                        ))}
                    </s-select>

                    <s-grid gridTemplateColumns="1fr 1fr" gap="base" paddingBlockStart="base">
                        <s-text-field
                            label="Points (+ add, - deduct)"
                            type="number"
                            value={formData.points}
                            onInput={(e) => setFormData(prev => ({ ...prev, points: e.target.value }))}
                            placeholder="e.g. 150 or -50"
                        />
                        <s-text-field
                            label="Reason / Note"
                            value={formData.reason}
                            onInput={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                            placeholder="Birthday bonus, Compensation etc."
                        />
                    </s-grid>

                    <s-button
                        variant="primary"
                        onClick={handleAdjustPoints}
                        loading={navigation.state === "submitting"}
                        disabled={!formData.customerId || !formData.points}
                    >
                        Adjust Points
                    </s-button>
                </s-card>
            </s-section>

            {/* Transactions Table */}
            <s-section>
                <h3>Recent Points Transactions</h3>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Date</s-table-header>
                        <s-table-header>Customer</s-table-header>
                        <s-table-header>Type</s-table-header>
                        <s-table-header>Points</s-table-header>
                        <s-table-header>Balance After</s-table-header>
                        <s-table-header>Reference</s-table-header>
                        <s-table-header>Event</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {transactions.length === 0 ? (
                            <s-table-row>
                                <s-table-cell colSpan="7" style={{ textAlign: "center", padding: "3rem" }}>
                                    No transactions found yet.
                                </s-table-cell>
                            </s-table-row>
                        ) : (
                            transactions.map((tx) => (
                                <s-table-row key={tx.id}>
                                    <s-table-cell>{new Date(tx.createdAt).toLocaleString()}</s-table-cell>
                                    <s-table-cell>{tx.customer.name || tx.customer.email}</s-table-cell>
                                    <s-table-cell><strong>{tx.type}</strong></s-table-cell>
                                    <s-table-cell style={{
                                        color: tx.points > 0 ? "green" : "red",
                                        fontWeight: "bold"
                                    }}>
                                        {tx.points > 0 ? "+" : ""}{tx.points}
                                    </s-table-cell>
                                    <s-table-cell>{tx.balanceAfter}</s-table-cell>
                                    <s-table-cell>{tx.referenceId || "—"}</s-table-cell>
                                    <s-table-cell>{tx.event?.name || "—"}</s-table-cell>
                                </s-table-row>
                            ))
                        )}
                    </s-table-body>
                </s-table>
            </s-section>
        </s-page>
    );
}