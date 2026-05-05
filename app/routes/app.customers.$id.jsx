import { authenticate } from "shopify-server";
import prisma from "db-server"
import { useActionData, useLoaderData } from "react-router";
import { useAtom } from "jotai";
import { loaderDataAtom, actionDataAtom, toggleAtom } from "@atoms/customer";
import AddPointsModal from "@components/customers/addPointsModal";
import { useEffect } from "react";
import createPointsTransaction from "@controller/pointsTransaction/createPointTransaction";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";

export const loader = async ({ request, params }) => {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const customerId = params.id;

    const customer = await prisma.customer.findFirst({
        where: {
            sessionId: session.id,
            id: customerId ? parseInt(customerId) : undefined,
        },
        include: {
            transactions: {
                orderBy: { createdAt: "desc" },
                include: {
                    event: true
                }
            },
            rewards: {
                orderBy: { createdAt: "desc" }
            }
        }
    })

    return {
        customer
    };
};

export const action = async ({ request, params }) => {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const customerId = params.id;

    const formData = await request.formData();
    const submitType = formData.get("submitType");
    const input = JSON.parse(formData.get("input") || "{}");

    console.log("customer adjust inputs")
    console.log(JSON.stringify(input, null, 2))


    if (submitType === "addPoints") {
        try {
            await createPointsTransaction(input, session);
            await syncCustomerConfig(admin, input?.shopifyId)
            return { message: `Successfully added ${input.points} points to customer.`, status: "success", submitType };
        } catch (error) {
            console.error("Error adding points:", error);
            return { message: "An error occurred while adding points.", status: "error", submitType };
        }
    }
}



export default function CustomerDetails() {
    const __loaderData = useLoaderData();
    const __actionData = useActionData();

    const [loaderData, setLoaderData] = useAtom(loaderDataAtom);
    const [actionData, setActionData] = useAtom(actionDataAtom);
    const [toggle, setToggle] = useAtom(toggleAtom);

    useEffect(() => {
        setLoaderData(__loaderData);
    }, [__loaderData, setLoaderData]);

    useEffect(() => {
        setActionData(__actionData);

        if (__actionData?.submitType === 'addPoints') {
            shopify.toast.show("Points successfully adjusted")
        }
    }, [__actionData, setActionData]);

    const customer = loaderData?.customer || {};

    return (<s-page>
        <s-section>
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                <s-box>
                    <h2 style={{ marginBlock: '0 10px' }}>Customer Details</h2>
                    <s-heading><s-badge>{customer?.name || customer?.email}</s-badge></s-heading>
                </s-box>
                <s-box>
                    <s-button command="--show" commandFor="add-points-modal" icon="plus-circle" variant="primary" onClick={() => setToggle(prev => ({ ...prev, addPoints: true }))}>Adjust Points</s-button>
                </s-box>
            </s-grid>
            <AddPointsModal customer={customer} />
        </s-section>
        {/* <s-section> */}
        <s-grid gridTemplateColumns="1fr 2fr" gap="base">
            <s-box padding="base" border="base" borderRadius="base" background="base">
                <h3 style={{ marginTop: '0' }}>Summary</h3>
                <p><strong>Email:</strong> {customer?.email}</p>
                <p><strong>Phone:</strong> {customer?.phone || "N/A"}</p>
                <p><strong>Total Points:</strong> {customer?.points}</p>
                <p><strong>Rewards Earned:</strong> {customer?.rewards?.length || 0}</p>
            </s-box>
            <s-box>
                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                    <s-box padding="base" border="base" borderRadius="base" background="base">
                        <s-heading>Current Points</s-heading>
                        <h3 style={{ marginBlock: '0 0' }}>{customer?.points || 0}</h3>
                    </s-box>
                    <s-box padding="base" border="base" borderRadius="base" background="base">
                        <s-heading>Lifetime Points</s-heading>
                        <h3 style={{ marginBlock: '0 0' }}>{customer?.lifetimePoints}</h3>
                    </s-box>
                    <s-box padding="base" border="base" borderRadius="base" background="base">
                        <s-heading>Activities Completed</s-heading>
                        <h3 style={{ marginBlock: '0 0' }}>0</h3>
                    </s-box>
                    <s-box padding="base" border="base" borderRadius="base" background="base">
                        <s-heading>Rewards claimed</s-heading>
                        <h3 style={{ marginBlock: '0 0' }}>{customer?.rewards?.length || 0}</h3>
                    </s-box>
                    <s-box padding="base" border="base" borderRadius="base" background="base">
                        <s-heading>Total revenue</s-heading>
                        <h3 style={{ marginBlock: '0 0' }}>0</h3>
                    </s-box>
                    <s-box padding="base" border="base" borderRadius="base" background="base">
                        <s-heading>Referrals</s-heading>
                        <h3 style={{ marginBlock: '0 0' }}>0</h3>
                    </s-box>
                </s-grid>
            </s-box>
        </s-grid>
        {/* </s-section> */}
        <s-box paddingBlockEnd="base" />
        <s-section>
            {/* Transaction History represents with table  */}
            <h3 style={{ marginTop: '0' }}>Transaction History</h3>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Date</s-table-header>
                    <s-table-header>Event</s-table-header>
                    <s-table-header>Points</s-table-header>
                    <s-table-header>Balance after</s-table-header>
                    <s-table-header>Note</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {customer?.transactions?.map(transaction => (
                        <s-table-row key={transaction.id}>
                            <s-table-cell>{transaction.createdAt.toDateString()}</s-table-cell>
                            <s-table-cell>{transaction.event?.type ?? transaction?.type}</s-table-cell>
                            <s-table-cell>{transaction.points}</s-table-cell>
                            <s-table-cell>{transaction.balanceAfter}</s-table-cell>
                            <s-table-cell>{transaction.reason}</s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>
        </s-section>
        <s-box paddingBlockEnd="base" />
        <s-section>
            {/* Reward History represents with table  */}
            <h3 style={{ marginTop: '0' }}>Rewards History</h3>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Date</s-table-header>
                    <s-table-header>Event</s-table-header>
                    <s-table-header>Type</s-table-header>
                    <s-table-header>Points Cost</s-table-header>
                    <s-table-header>Balance after</s-table-header>
                    <s-table-header>Status</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {customer?.rewards?.map(transaction => (
                        <s-table-row key={transaction.id}>
                            <s-table-cell>{transaction.createdAt.toDateString()}</s-table-cell>
                            <s-table-cell>{transaction.event}</s-table-cell>
                            <s-table-cell>{transaction.type}</s-table-cell>
                            <s-table-cell>{transaction.pointsCost || 0}</s-table-cell>
                            <s-table-cell>{customer?.points || 0}</s-table-cell>
                            <s-table-cell>
                                {transaction?.status === "COMPLETED" ? <s-badge tone="success">{transaction?.status}</s-badge> : ""}
                                {transaction?.status === "PENDING" ? <s-badge tone="warning">{transaction?.status}</s-badge> : ""}
                                {transaction?.status === "CANCELLED" ? <s-badge tone="danger">{transaction?.status}</s-badge> : ""}

                            </s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>
        </s-section>
        {/* <s-section>
            <pre>{JSON.stringify(customer, null, 2)}</pre>
        </s-section> */}
    </s-page>)
}