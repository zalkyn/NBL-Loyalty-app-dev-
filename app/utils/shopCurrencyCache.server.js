import shopCurrency from "../graphql/query/shop/shopCurrency.js";

// Short per-shop cache so the app layout can show the live store currency on
// every admin page without an extra Shopify call per navigation. Short TTL so
// a store currency switch shows up within minutes. Failures are NOT cached.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

/**
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} shop  - shop domain (cache key)
 * @returns {Promise<string|null>} ISO currency code or null
 */
export default async function getShopCurrencyCached(admin, shop) {
    const hit = cache.get(shop);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.code;

    const code = await shopCurrency(admin);
    if (code) cache.set(shop, { code, at: Date.now() });
    return code;
}
