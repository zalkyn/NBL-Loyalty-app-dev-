import { str, num, bool } from "@app/hooks/useFormState";
import { minOrderAmountError } from "../../utils/minOrderAmount";

// ─────────────────────────────────────────────────────────────────────────────
// FORM SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export const EMPTY_RULE = {
    id: null,
    title: "Voucher {{currency_value}}",
    description: null,
    discountType: "fixed",       // "fixed" | "percentage"
    rewardValue: 5,
    rewardType: "orderDiscount", // "orderDiscount" | "productDiscount" | "freeProduct" | "freeShipping"
    pointsCost: 100,
    // null = "No minimum requirements". Any number = the minimum order
    // subtotal Shopify requires before the voucher can be applied (set on
    // the discount at creation time — see generateRewardVoucher.js).
    minOrderAmount: null,
    isActive: true,
    startDate: null,
    endDate: null,
};

export function buildFormShape(data) {
    return {
        id: data?.id ?? null,
        title: str(data?.title ?? EMPTY_RULE.title),
        description: str(data?.description),
        discountType: str(data?.discountType ?? EMPTY_RULE.discountType),
        rewardValue: num(data?.rewardValue ?? EMPTY_RULE.rewardValue),
        rewardType: str(data?.rewardType ?? EMPTY_RULE.rewardType),
        pointsCost: num(data?.pointsCost ?? EMPTY_RULE.pointsCost),
        // Deliberately not run through num() — null has to survive as null
        // (it's what tells the form "No minimum requirements" is selected),
        // and num(null) would flatten it to 0.
        minOrderAmount: data?.minOrderAmount == null ? null : num(data.minOrderAmount),
        isActive: bool(data?.isActive ?? true),
        startDate: data?.startDate ?? null,
        endDate: data?.endDate ?? null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export function validate(form) {
    const errors = {};
    if (!form.rewardType)
        errors.rewardType = "Please select a reward type.";
    if (!form.title?.trim())
        errors.title = "Display title is required.";
    if (!form.pointsCost || Number(form.pointsCost) <= 0)
        errors.pointsCost = "Points cost must be greater than 0.";
    if (form.rewardType === "orderDiscount" && !(Number(form.rewardValue) > 0))
        errors.rewardValue = "Discount value must be greater than 0.";
    const minError = minOrderAmountError(form.minOrderAmount, form.discountType, form.rewardValue);
    if (minError) errors.minOrderAmount = minError;
    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
//
// Pure — no server-only imports. Shared by client (_hooks.js, components/)
// and re-derived server-side at write-time (see _data.server.js).
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve `{{currency_value}}` in the title for display purposes. */
export const previewTitle = (title, discountType, rewardValue, symbol = "") => {
    if (!title) return "";
    const formatted = discountType === "percentage" ? `${rewardValue}%` : `${symbol}${rewardValue}`;
    return title.replace(/\{\{currency_value\}\}/gi, formatted);
};

export const formatDiscount = (discountType, rewardValue, symbol = "") =>
    discountType === "percentage" ? `${rewardValue}%` : `${symbol}${rewardValue}`;

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

export const PER_PAGE = 10;
