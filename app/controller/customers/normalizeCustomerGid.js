/**
 * Normalizes a customer identifier into a full Shopify GID.
 * Passes through already-normalized GIDs unchanged.
 *
 * @param {string|number} customerId - Numeric Shopify customer ID or an existing GID
 * @returns {string|null} e.g. "gid://shopify/Customer/123", or null if customerId is falsy
 */
export const normalizeCustomerGid = (customerId) => {
    if (!customerId) return null;

    if (
        typeof customerId === "string" &&
        customerId.startsWith("gid://shopify/Customer/")
    ) {
        return customerId;
    }

    return `gid://shopify/Customer/${customerId}`;
};
