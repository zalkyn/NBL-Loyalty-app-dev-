import { str, num, bool } from "@app/hooks/useFormState";

// ─────────────────────────────────────────────────────────────────────────────
// FORM SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export const EMPTY_SHADOW_RULE_DATA = {
    id: null,
    name: null,
    description: null,
    rateType: "FIXED",
    fixedPoints: null,
    perAmount: null,
    pointsPerUnit: null,
    maxPoints: null,
    currencyCode: null,
    isActive: false,
};

export function buildFormShape(data) {
    return {
        id: data?.id ?? null,
        name: str(data?.name),
        description: str(data?.description),
        rateType: data?.rateType || "FIXED",
        fixedPoints: num(data?.fixedPoints),
        perAmount: num(data?.perAmount),
        pointsPerUnit: num(data?.pointsPerUnit),
        maxPoints: num(data?.maxPoints),
        currencyCode: data?.currencyCode ?? null,
        isActive: bool(data?.isActive ?? false),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION (client-side — mirrored server-side in route.jsx's action;
// see that file's validateRate() for why both exist, same defense-in-depth
// pattern as every other rule page in this codebase)
// ─────────────────────────────────────────────────────────────────────────────

export function validate(form) {
    const errors = {};

    if (!form.name?.trim()) errors.name = "Name is required.";

    if (form.rateType === "FIXED") {
        if (!form.fixedPoints || Number(form.fixedPoints) <= 0)
            errors.fixedPoints = "Fixed points must be greater than 0.";
    } else if (form.rateType === "PER_AMOUNT") {
        if (!form.perAmount || Number(form.perAmount) <= 0)
            errors.perAmount = "Amount must be greater than 0.";
        if (!form.pointsPerUnit || Number(form.pointsPerUnit) <= 0)
            errors.pointsPerUnit = "Points must be greater than 0.";
    } else {
        errors.rateType = "Choose a rate type.";
    }

    if (form.maxPoints !== null && form.maxPoints !== "" && Number(form.maxPoints) <= 0)
        errors.maxPoints = "Max points must be greater than 0 if set.";

    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

export const PER_PAGE = 10;
