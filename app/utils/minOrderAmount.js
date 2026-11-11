/**
 * @file utils/minOrderAmount.js
 * @description Pure validation for the "minimum purchase amount" on reward
 * and referral discounts. No imports, so the forms, the server handlers and
 * the unit tests can all share it.
 */

/**
 * Why a minimum purchase amount is not acceptable, or null when it is fine.
 * Shared by the form (validate) and the server handlers, so the rule cannot
 * be bypassed by posting directly.
 *
 * A fixed discount must stay below the minimum, otherwise an order exactly at
 * the minimum is still free ($20 voucher with a $20 minimum leaves $0 to pay).
 * Percentage discounts cannot be checked this way, so they only need a
 * positive amount. null means "No minimum requirements" and is always valid.
 */
export function minOrderAmountError(minOrderAmount, discountType, discountValue) {
    if (minOrderAmount == null) return null;
    const min = Number(minOrderAmount);
    if (!Number.isFinite(min) || min <= 0)
        return "Enter a minimum amount greater than 0, or choose No minimum requirements.";
    if (discountType === "fixed" && Number(discountValue) > 0 && min <= Number(discountValue))
        return "The minimum purchase must be higher than the discount amount, otherwise small orders still get the product free.";
    return null;
}
