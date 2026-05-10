import { authenticate } from "shopify-server";
import prisma from "db-server"
import { useActionData, useLoaderData, useNavigate } from "react-router";
import { useAtom } from "jotai";
import { loaderDataAtom, actionDataAtom, toggleAtom } from "@atoms/customer";
import AddPointsModal from "@components/customers/addPointsModal";
import { useEffect } from "react";
import createTransaction from "@controller/transaction/createTransaction";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";
import { customerOrderCount } from "app/graphql/query/customers";
import Pagination from "@components/pagination/Pagination";
import { usePagination } from "../hooks/pagination/usePagination";

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
            },
            referralsSent: true,
            referralsUsed: true
        }
    })

    const orderCount = await customerOrderCount(admin, customer?.shopifyId);

    return {
        customer: {
            ...customer,
            orderCount,
        }
    };
};

export const action = async ({ request, params }) => {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const customerId = params.id;

    const formData = await request.formData();
    const submitType = formData.get("submitType");
    const input = JSON.parse(formData.get("input") || "{}");

    if (submitType === "addPoints") {
        try {
            await createTransaction({
                ...input,
                status: "APPROVED",
            }, session);
            await syncCustomerConfig(admin, input?.shopifyId)
            return { message: `Successfully added ${input.points} points to customer.`, status: "success", submitType };
        } catch (error) {
            console.error("Error adding points:", error);
            return { message: "An error occurred while adding points.", status: "error", submitType };
        }
    }
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

/**
 * Breadcrumb using Polaris web components (s-breadcrumbs + s-breadcrumb-item).
 * The parent item uses onClick with history.back() / navigate fallback so the
 * user returns to wherever they came from, not a hardcoded URL.
 *
 * @param {string} customerLabel  - Customer name or email shown as the last crumb
 * @param {Function} onBack       - Called when "Customers" crumb is clicked
 */
const Breadcrumb = ({ customerLabel, onBack }) => (
    <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-button onClick={() => onBack()} variant="secondary" size="small">
            Customers
        </s-button>
        <s-text tone="subdued">&rsaquo;</s-text>
        <s-text>{customerLabel}</s-text>
    </s-stack>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    const navigate = useNavigate();

    // Display name: prefer name, fall back to email
    const customerLabel = customer?.name || customer?.email || "Customer Details";

    // Go back to previous page; fall back to /app/customers if no history
    const handleBack = () => {
        try {
            navigate("/app/customers", {
                replace: true,
            });
        } catch {

        }
    };

    const txPagination = usePagination(customer?.transactions || [], 25);
    const rwPagination = usePagination(customer?.rewards || [], 25);

    return (
        <s-page>

            {/* ── Breadcrumb ─────────────────────────────────────────────── */}
            <s-section>
                <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                    <s-box>
                        <Breadcrumb customerLabel={customerLabel} onBack={() => handleBack()} />
                        <s-box paddingBlockEnd="small" />
                        <s-heading><s-badge>Details about: '{customerLabel}'</s-badge></s-heading>
                    </s-box>
                    <s-box>
                        <s-button
                            command="--show"
                            commandFor="add-points-modal"
                            icon="plus-circle"
                            variant="primary"
                            onClick={() => setToggle(prev => ({ ...prev, addPoints: true }))}
                        >
                            Adjust Points
                        </s-button>
                    </s-box>
                </s-grid>
                <AddPointsModal customer={customer} />
            </s-section>

            <s-grid gridTemplateColumns="1fr 2fr" gap="base">
                <s-box padding="base" border="base" borderRadius="base" background="base">
                    <h3 style={{ marginTop: '0' }}>Summary</h3>
                    <p><strong>Email:</strong> {customer?.email}</p>
                    <p><strong>Lifetime Points:</strong> {customer?.lifetimePoints || 0}</p>
                    <p><strong>Rewards claimed:</strong> {customer?.rewards?.length || 0}</p>
                    <p><strong>Referral Code:</strong> {customer?.referralCode}</p>
                    <p><strong>Referral Sent:</strong> {customer?.referralsSent?.length || 0}</p>
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
                            <h3 style={{ marginBlock: '0 0' }}>{customer?.transactions?.length || 0}</h3>
                        </s-box>
                        <s-box padding="base" border="base" borderRadius="base" background="base">
                            <s-heading>Rewards claimed</s-heading>
                            <h3 style={{ marginBlock: '0 0' }}>{customer?.rewards?.length || 0}</h3>
                        </s-box>
                        <s-box padding="base" border="base" borderRadius="base" background="base">
                            <s-heading>Total orders</s-heading>
                            <h3 style={{ marginBlock: '0 0' }}>{customer?.orderCount ?? 'N/A'}</h3>
                        </s-box>
                        <s-box padding="base" border="base" borderRadius="base" background="base">
                            <s-heading>Referrals Used</s-heading>
                            <h3 style={{ marginBlock: '0 0' }}>{customer?.referralsUsed?.status ?? 'N/A'}</h3>
                        </s-box>
                    </s-grid>
                </s-box>
            </s-grid>

            <s-box paddingBlockEnd="base" />

            {/* ── Transaction History ─────────────────────────────────────── */}
            <s-section>
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
                        {txPagination.paginatedData.length === 0 ? (
                            <s-table-row>
                                <s-table-cell colSpan={5} style={{ textAlign: 'center', color: 'var(--p-color-text-secondary, #6d7175)' }}>
                                    No transactions found.
                                </s-table-cell>
                            </s-table-row>
                        ) : txPagination.paginatedData.map(transaction => (
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
                <Pagination {...txPagination} label="transactions" />
            </s-section>

            <s-box paddingBlockEnd="base" />

            {/* ── Rewards History ─────────────────────────────────────────── */}
            <s-section>
                <h3 style={{ marginTop: '0' }}>Rewards History</h3>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Date</s-table-header>
                        <s-table-header>Event</s-table-header>
                        <s-table-header>Type</s-table-header>
                        <s-table-header>Points Cost</s-table-header>
                        <s-table-header>Status</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {rwPagination.paginatedData.length === 0 ? (
                            <s-table-row>
                                <s-table-cell colSpan={5} style={{ textAlign: 'center', color: 'var(--p-color-text-secondary, #6d7175)' }}>
                                    No rewards found.
                                </s-table-cell>
                            </s-table-row>
                        ) : rwPagination.paginatedData.map(transaction => (
                            <s-table-row key={transaction.id}>
                                <s-table-cell>{transaction.createdAt.toDateString()}</s-table-cell>
                                <s-table-cell>{transaction.event}</s-table-cell>
                                <s-table-cell>{transaction.type}</s-table-cell>
                                <s-table-cell>{transaction.pointsCost || 0}</s-table-cell>
                                <s-table-cell>{transaction?.status}</s-table-cell>
                            </s-table-row>
                        ))}
                    </s-table-body>
                </s-table>
                <Pagination {...rwPagination} label="rewards" />
            </s-section>

        </s-page>
    );
}