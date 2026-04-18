import { authenticate } from "../shopify.server";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import prisma from "../db.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import syncAllCustomerFromStore from "../controller/customers/syncCustomersFromStore";
import { useEffect, useState } from "react";
import AddPointsModal from "app/components/customers/addPointsModal";
import { syncCustomersConfig } from "@controller/metafieldsSync/syncCustomerConfig"

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const customers = await prisma.customer.findMany({
        where: {
            sessionId: session.id,
        },
    });

    return { customers, session };
}


export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    if (submitType === "sync-customers") {
        const response = await syncAllCustomerFromStore(admin, session);
        await syncCustomersConfig(admin)
        return Response.json({ message: response?.message || "Sync completed" });
    }
}


export default function Customers() {
    const { customers, session } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const shopify = useAppBridge();
    const [filteredCustomers, setFilteredCustomers] = useState(customers);


    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, { duration: 5000 });
        }
    }, [actionData]);


    const syncAllCustomerFromStore = async () => {
        try {
            submit({
                submitType: "sync-customers",
            }, { method: "POST" });
        } catch (error) {
            console.error("Error syncing customers from store:", error);
            shopify.toast.show("Error syncing customers from store", { duration: 5000, isError: true });
        }

    }

    const handleSearch = (event) => {
        const query = event.target.value.toLowerCase();
        // Implement search filtering logic here

        const filtered = customers.filter(customer => {
            const nameMatch = customer.name?.toLowerCase().includes(query);
            const emailMatch = customer.email?.toLowerCase().includes(query);
            return nameMatch || emailMatch;
        });
        setFilteredCustomers(filtered);

    }

    return <s-page title="Customers" inlineSize="base">
        <s-button onClick={() => syncAllCustomerFromStore()} slot="primary-action" variant="primary">Sync Customers</s-button>
        <s-section>
            <s-grid gridTemplateColumns="1fr 1fr" alignItems="center" gap="base">
                <h2>Customers</h2>
                <s-search-field
                    label="Search orders"
                    labelAccessibilityVisibility="exclusive"
                    name="orderSearch"
                    placeholder="Search by name or email"
                    onInput={(event) => handleSearch(event)}
                ></s-search-field>
            </s-grid>

            <s-box paddingBlock="base">
                <s-divider />
            </s-box>

            <s-table>
                <s-table-header-row>
                    <s-table-header>Customer</s-table-header>
                    <s-table-header>Activities</s-table-header>
                    <s-table-header>Points</s-table-header>
                    <s-table-header>Reward</s-table-header>
                    <s-table-header>Enrolled At</s-table-header>
                    <s-table-header></s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {filteredCustomers?.map((customer) => (
                        <s-table-row key={customer.id}>
                            <s-table-cell>
                                <s-heading>{customer.name || "N/A"}</s-heading>
                                <s-box />
                                <s-text>{customer.email || "N/A"}</s-text>
                            </s-table-cell>
                            <s-table-cell>{customer.activities || 0}</s-table-cell>
                            <s-table-cell>{customer?.points}</s-table-cell>
                            <s-table-cell>{customer.rewards || 0}</s-table-cell>
                            <s-table-cell>{customer.enrolledAt?.toDateString()}</s-table-cell>
                            <s-table-cell>
                                <s-button variant="text" href={`/app/customers/${customer.id}`}>Details</s-button>
                            </s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>

        </s-section>
        {/* <s-section>
            <pre>{JSON.stringify(customers, null, 2)}</pre>
        </s-section> */}
    </s-page>
}