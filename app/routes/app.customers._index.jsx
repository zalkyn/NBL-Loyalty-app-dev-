import { authenticate } from "../shopify.server";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import prisma from "../db.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import oldCustomerStoreFromShop from "../controller/customers/syncCustomersFromStore";
import { useEffect, useState } from "react";
import { syncCustomersConfig } from "@controller/metafieldsSync/syncCustomerConfig";
import Pagination from "@components/pagination/Pagination";
import { usePagination } from "../hooks/pagination/usePagination";

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const customers = await prisma.customer.findMany({
        where: { sessionId: session.id },
        include: { rewards: true, transactions: true },
    });

    return { customers, session };
};

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    if (submitType === "sync-customers") {
        try {
            const result = await oldCustomerStoreFromShop(admin, session);
            await syncCustomersConfig(admin, session);
            return Response.json({
                message: `Synced ${result.success} customers${result.failed ? `, ${result.failed} failed` : ""}`,
            });
        } catch (error) {
            console.error("Sync error:", error);
            return Response.json({ message: "Failed to sync customers", isError: true });
        }
    }
};

export default function Customers() {
    const { customers } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const shopify = useAppBridge();
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, {
                duration: 5000,
                isError: actionData.isError ?? false,
            });
        }
    }, [actionData]);

    const handleSync = () => {
        submit({ submitType: "sync-customers" }, { method: "POST" });
    };

    const handleSearch = (event) => {
        setSearchQuery(event.target.value.toLowerCase());
    };

    const filteredCustomers = customers.filter((c) =>
        c.name?.toLowerCase().includes(searchQuery) ||
        c.email?.toLowerCase().includes(searchQuery)
    );

    const pagination = usePagination(filteredCustomers, 25);

    return (
        <s-page title="Customers" inlineSize="base">
            <s-button onClick={handleSync} slot="primary-action" variant="primary">
                Sync Customers
            </s-button>
            <s-section>
                <s-grid gridTemplateColumns="1fr 1fr" alignItems="center" gap="base">
                    <h2>Customers</h2>
                    <s-search-field
                        label="Search customers"
                        labelAccessibilityVisibility="exclusive"
                        name="customerSearch"
                        placeholder="Search by name or email"
                        onInput={handleSearch}
                    />
                </s-grid>

                <s-box paddingBlock="base">
                    <s-divider />
                </s-box>

                <s-table>
                    <s-table-header-row>
                        <s-table-header>Customer</s-table-header>
                        <s-table-header>Activities</s-table-header>
                        <s-table-header>Points</s-table-header>
                        <s-table-header>Rewards</s-table-header>
                        <s-table-header>Enrolled At</s-table-header>
                        <s-table-header />
                    </s-table-header-row>
                    <s-table-body>
                        {pagination.paginatedData.length === 0 ? (
                            <s-table-row>
                                <s-table-cell colSpan={6} style={{ textAlign: "center", color: "var(--p-color-text-secondary, #6d7175)" }}>
                                    No customers found.
                                </s-table-cell>
                            </s-table-row>
                        ) : pagination.paginatedData.map((customer) => (
                            <s-table-row key={customer.id}>
                                <s-table-cell>
                                    <s-heading>{customer.name || "N/A"}</s-heading>
                                    <s-box />
                                    <s-text>{customer.email || "N/A"}</s-text>
                                </s-table-cell>
                                <s-table-cell>{customer?.transactions?.length ?? 0}</s-table-cell>
                                <s-table-cell>{customer?.points}</s-table-cell>
                                <s-table-cell>{customer?.rewards?.length ?? 0}</s-table-cell>
                                <s-table-cell>
                                    {customer.enrolledAt
                                        ? new Date(customer.enrolledAt).toLocaleDateString()
                                        : "N/A"}
                                </s-table-cell>
                                <s-table-cell>
                                    <s-button variant="text" href={`/app/customers/${customer.id}`}>
                                        Details
                                    </s-button>
                                </s-table-cell>
                            </s-table-row>
                        ))}
                    </s-table-body>
                </s-table>

                <Pagination {...pagination} label="customers" />
            </s-section>
        </s-page>
    );
}