import FixedPoints from "app/components/pointsRule/fixedPoints";
import { atom } from "jotai";

export const actionTypeAtom = atom(""); // e.g, edit | create

export const loaderDataAtom = atom(null);
export const actionDataAtom = atom(null);
export const selectedRuleAtom = atom(null);

// Default structure for a points rule
export const emptyNewRule = {
    id: null,
    eventId: null,
    name: "",
    description: "",
    priority: 1,
    startDate: null,
    endDate: null,
    conditions: "",
    metadata: "",
    isActive: true
};

// Default structure for order-based conditions
export const emptyConditions = {
    minAmount: null,
    maxAmount: null,

    earning: {
        type: "fixed", // "incremental" | "fixed"

        // for incremental
        rate: {
            amount: 10,   // e.g. $10
            points: 1     // = 1 point
        },

        // for fixed
        fixedPoints: 10
    },

    appliesTo: {
        type: "allProducts", // "allProducts" | "specificProducts" | "specificCollections"

        products: [],
        collections: [],
        excludedProducts: []
    },
    referredEarning: {
        info: "Referred customer get discount coupon/code",
        type: "fixed", // "fixed" | "percentage"
        amount: 10
    },
    referrerPoints: 100
};

export const toggleAtom = atom({
    addRule: false,
    editRule: false,
});

export const loadingButtonAtom = atom({
    addRule: false,
    editRule: false,
    deleteRule: false,
});




export const newRuleAtom = atom(emptyNewRule);
export const conditionsAtom = atom(emptyConditions);