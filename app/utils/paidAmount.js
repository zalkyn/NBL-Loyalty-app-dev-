// What a line item actually cost the customer, for earning order points.
// Pure functions — no DB, no network.
//
// Why this exists: points used to be worked out from each line's LIST price
// (before any discount), so an order paid at A$0.00 with a 100% discount code
// still earned thousands of points. Shipping is never part of this: it is not
// on a product line, so it can't be split across per-product rules, and it is
// always left out.
//
// Two merchant choices (stored on the order rule's conditions.order.basis):
//   discounts: "after"   (default) — price after every discount, order-level ones included
//              "before"            — list price, the old behaviour
//   tax:       "include" (default) — tax counts as money received, nothing is taken off
//              "exclude"           — tax is taken off, but only when the store's prices
//                                    already include tax (otherwise there is nothing in
//                                    the line to take off)
//
// Fixed rule, not an option: a line that was paid for nothing earns 0 points,
// including under a "fixed points" rule.

export const DISCOUNT_MODES = ["after", "before"];
export const TAX_MODES = ["include", "exclude"];
export const DEFAULT_BASIS = { discounts: "after", tax: "include" };

/** Reads the order rule's basis, falling back to the defaults for anything missing or unknown. */
export function readBasis(orderConditions) {
    const basis = orderConditions?.basis ?? {};
    return {
        discounts: DISCOUNT_MODES.includes(basis.discounts) ? basis.discounts : DEFAULT_BASIS.discounts,
        tax: TAX_MODES.includes(basis.tax) ? basis.tax : DEFAULT_BASIS.tax,
    };
}

const money = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round2 = (value) => Math.round(value * 100) / 100;

/**
 * @param {Object} item
 * @param {string|number} item.price        - list price of one unit (before discounts)
 * @param {string|number|null} [item.paid_price] - price of one unit after all discounts; missing = no discount info
 * @param {number} [item.quantity]
 * @param {string|number} [item.tax]        - total tax on this line
 * @param {boolean} [item.taxes_included]   - the store's prices already include tax
 * @param {{ discounts: string, tax: string }} basis - from readBasis()
 * @returns {number} Never negative, rounded to cents. 0 means the line was free.
 */
export function lineItemAmount(item, basis = DEFAULT_BASIS) {
    const quantity = item?.quantity || 1;
    const listTotal = money(item?.price) * quantity;
    const hasPaid = item?.paid_price !== undefined && item?.paid_price !== null;
    const paidTotal = hasPaid ? money(item.paid_price) * quantity : listTotal;

    let amount = basis.discounts === "before" ? listTotal : paidTotal;

    if (basis.tax === "exclude" && item?.taxes_included) {
        const tax = money(item?.tax);
        // The tax on the line was worked out on what was paid. When counting
        // the list price instead, scale it up so the same share is removed.
        const scaled = basis.discounts === "before" && paidTotal > 0 ? tax * (listTotal / paidTotal) : tax;
        amount -= scaled;
    }

    return Math.max(0, round2(amount));
}
