import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server"
// import afterAuthSetup from "app/controller/afterAuthSetup";
// import { customerOrderCount } from "app/graphql/query/customers";
// import { getPointRuleByEvent } from "../controller/pointsRule/getPointRuleByEvent"
// import prisma from "../db.server.js";
// import { getAppstleMetafield } from "@graphql/mutation/order/getAppstleMetafield"
import { sendPointsUpdate } from "../../server/webSocket/server.js";

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    // await afterAuthSetup({ session, admin });
    // const customer = await customerOrderCount(admin, "9359217918202");
    // const customer2 = await customerOrderCount(admin, "9361893785850");
    // const rule = await getPointRuleByEvent("Referral")
    // const customers = await prisma.customer.findMany({
    //     select: {
    //         id: true, email: true,
    //         referralsUsed: true,
    //         referralsSent: true
    //     }
    // });


    // const appstle = await getAppstleMetafield(admin, "gid://shopify/Order/6894469611770");

    // const existReferral = await prisma.referral.findFirst({
    //     where: {
    //         subscriptionContractId: "42706731258"
    //     }
    // });

    // const pointRuleByEvent = await getPointRuleByEvent("Referral");

    sendPointsUpdate(9441305526522, { points: 100, totalPoints: 1500 });

    return {
        pointRuleByEvent
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