import { authenticate } from "shopify-server";
import { useActionData, useLoaderData } from "react-router";

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const url = process.env.SHOPIFY_APP_URL;
    console.log("appUrl:", url)
    return null;
}

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);

    return null;
}

export default function DiscountPage() {
    const loaderData = useLoaderData();
    const actionData = useActionData()


    return <s-page heading="Discount Create UI Page">
        {/* write codes about discount create ui. like shopify admin discount create using polaris web components */}
        <s-section>
            <s-box>...</s-box>
        </s-section>

    </s-page>
}

