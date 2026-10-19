import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import AppNav from "./navigation/AppNav"
import getShopCurrencyCached from "../utils/shopCurrencyCache.server.js";
import { ShopCurrencyProvider } from "../hooks/useShopCurrency.jsx";

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);

    // Live store currency for every admin page (see useShopCurrency). A failed
    // lookup must never take the app down — pages just render no symbol.
    const shopCurrencyCode = await getShopCurrencyCached(admin, session.shop).catch(() => null);

    // eslint-disable-next-line no-undef
    return { apiKey: process.env.SHOPIFY_API_KEY || "", shopCurrencyCode };
};

export default function AppIndex() {
    const { apiKey, shopCurrencyCode } = useLoaderData();

    return (
        <AppProvider embedded apiKey={apiKey}>
            <AppNav />
            <ShopCurrencyProvider code={shopCurrencyCode}>
                <Outlet />
            </ShopCurrencyProvider>
        </AppProvider>
    );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};

