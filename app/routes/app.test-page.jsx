import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server"
import afterAuthSetup from "app/controller/afterAuthSetup";
import { customerOrderCount } from "app/graphql/query/customers";
import { getPointRuleByEvent } from "../controller/pointsRule/getPointRuleByEvent"
import prisma from "db-server";

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    await afterAuthSetup({ session, admin });
    const customer = await customerOrderCount(admin, "9359217918202");
    const customer2 = await customerOrderCount(admin, "9361893785850");
    const rule = await getPointRuleByEvent("Referral")
    const customers = await prisma.customer.findMany({
        select: {
            id: true, email: true,
            referralsUsed: true,
            referralsSent: true
        }
    });

    return {
        rule, customer, customer2, session, customers
    }
}

export default function TestPage() {
    const loaderData = useLoaderData();
    return <s-page heading="Order Testing  page">
        <s-section>
            <h2>This is a test page</h2>
        </s-section>

        <s-section>
            <pre>{JSON.stringify(loaderData, null, 2)}</pre>
        </s-section>
    </s-page>
}