// Client-safe constants and pure helpers (the loader and the page both import this).

export const TABS = [
    { key: "waiting", label: "Waiting for decision" },
    { key: "flagged", label: "Rewarded, flagged" },
    { key: "rejected", label: "Rejected" },
];
export const DEFAULT_TAB = "waiting";

export const DEFAULT_PER_PAGE = 10;
export const MAX_PER_PAGE = 50;
export const PER_PAGE_OPTIONS = [10, 25, 50];

/** Most referrals one bulk action will touch. */
export const BULK_LIMIT = 25;

export const personName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.name || "—";

/** "the two accounts…" → "The two accounts…." */
export const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? "" : ".") : "—");

/** The numeric id at the end of a Shopify GID, or null (e.g. test data). */
export const gidNumber = (gid) => String(gid ?? "").match(/\/(\d+)$/)?.[1] ?? null;

/** Points a decision would award for a set of held referrals. */
export const totalPoints = (rows) =>
    rows.reduce(
        (sum, r) => ({
            referrer: sum.referrer + (r.metadata?.hold?.referrerPoints ?? 0),
            friend: sum.friend + (r.metadata?.hold?.referredPoints ?? 0),
        }),
        { referrer: 0, friend: 0 }
    );
