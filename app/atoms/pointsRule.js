import { atom } from "jotai";


export const loaderDataAtom = atom(null);
export const actionDataAtom = atom(null);
export const selectedRuleAtom = atom(null);
export const pointsRuleFormAtom = atom(null)

export const emptyRuleAtom = atom({
    eventId: null,
    name: "",
    description: "",
    points: 0,
    multiplier: 1,
    minAmount: 0,
    priority: "0",
    startDate: "",
    endDate: "",
    conditions: "",
    metadata: "",
    isActive: true
});

export const toggleAtom = atom({
    addRule: false,
    editRule: false,
});

export const loadingButtonAtom = atom({
    addRule: false,
    editRule: false,
    deleteRule: false,
});