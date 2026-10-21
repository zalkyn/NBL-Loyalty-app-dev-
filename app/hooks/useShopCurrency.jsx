import { createContext, useContext } from "react";
import { currencySymbol } from "../utils/currency.js";

const ShopCurrencyContext = createContext(null);

export function ShopCurrencyProvider({ code, children }) {
    return <ShopCurrencyContext.Provider value={code ?? null}>{children}</ShopCurrencyContext.Provider>;
}

/**
 * The store's live currency for admin UI: `{ code, symbol }`.
 * `symbol` is "" when the currency couldn't be read — render nothing
 * rather than a guessed "$".
 */
export function useShopCurrency() {
    const code = useContext(ShopCurrencyContext);
    return { code, symbol: currencySymbol(code) };
}
