// Shared, dependency-free currency helpers — safe to import from admin UI,
// server code and the storefront widget bundle alike.
//
// The store's currency is never hardcoded anywhere: it comes from Shopify
// (shop.currencyCode) and is turned into a symbol here with Intl. "en-US" +
// currencyDisplay "symbol" keeps currencies distinguishable ($ for USD,
// A$ for AUD, £, €) — the same form used in merchant-facing copy.

const symbolCache = new Map();

/**
 * Display symbol for an ISO 4217 code ("USD" → "$", "AUD" → "A$").
 * Returns "" for a missing/invalid code so callers render nothing rather
 * than a wrong currency.
 *
 * @param {string|null|undefined} code
 * @returns {string}
 */
export function currencySymbol(code) {
    if (!code || typeof code !== "string") return "";
    const key = code.toUpperCase();
    if (symbolCache.has(key)) return symbolCache.get(key);

    let symbol = "";
    try {
        symbol =
            new Intl.NumberFormat("en-US", { style: "currency", currency: key, currencyDisplay: "symbol" })
                .formatToParts(0)
                .find((p) => p.type === "currency")?.value ?? "";
    } catch {
        symbol = "";
    }
    symbolCache.set(key, symbol);
    return symbol;
}

/**
 * "20" + "AUD" → "A$20". Falls back to the bare number when the currency is
 * unknown, never to a guessed symbol.
 */
export function formatMoney(amount, code) {
    return `${currencySymbol(code)}${amount}`;
}
