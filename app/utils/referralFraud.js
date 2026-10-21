// Referral self-dealing signals. Pure functions — no DB, no network.
//
// Why this exists: a referral discount + points went to two accounts that
// were clearly one person (first/last names swapped, near-identical billing
// address). Nothing compared the two accounts before rewarding.
//
// Two outcomes, deliberately different in weight:
//   HOLD — strong evidence of the same person/household (similar address AND
//          same name or surname). The reward is held for the merchant to
//          approve or reject.
//   FLAG — a single weaker signal (same name only, or similar address only).
//          Rewarded as usual; recorded so the merchant can see it.
// Common names ("John Smith") and flatmates alone must not block real
// customers, which is why one signal never holds.

const ADDRESS_ABBREVIATIONS = {
    st: "street", str: "street", rd: "road", ave: "avenue", av: "avenue", blvd: "boulevard",
    dr: "drive", ln: "lane", ct: "court", pl: "place", hwy: "highway", pde: "parade",
    cres: "crescent", cl: "close", tce: "terrace", apt: "unit", flat: "unit",
};

/** Lowercase, strip accents/punctuation, collapse whitespace. */
function clean(text) {
    return String(text ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Name tokens, order-insensitive, so "Imad Abdennouri" equals "Abdennouri Imad". */
export function nameTokens(...parts) {
    return clean(parts.filter(Boolean).join(" ")).split(" ").filter(Boolean).sort();
}

const tokensOf = (p) =>
    nameTokens(p?.firstName || p?.lastName ? `${p.firstName ?? ""} ${p.lastName ?? ""}` : p?.name);

export function sameName(a, b) {
    const ta = tokensOf(a);
    const tb = tokensOf(b);
    // A single word ("Sam") says nothing about identity — need at least two.
    if (ta.length < 2 || tb.length < 2) return false;
    return ta.join(" ") === tb.join(" ");
}

export function sameSurname(a, b) {
    const la = clean(a?.lastName);
    const lb = clean(b?.lastName);
    return Boolean(la && lb && la === lb);
}

function normalizeStreet(address) {
    const text = clean([address?.address1, address?.address2].filter(Boolean).join(" "));
    return text
        .split(" ")
        .map((t) => ADDRESS_ABBREVIATIONS[t] ?? t)
        .filter((t) => t !== "unit")
        .join(" ");
}

function levenshtein(a, b) {
    if (a === b) return 0;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. */
export function textSimilarity(a, b) {
    if (!a || !b) return 0;
    const longest = Math.max(a.length, b.length);
    return 1 - levenshtein(a, b) / longest;
}

const SIMILAR_STREET = 0.8;

/**
 * Two addresses count as "the same place" when the postcode matches (spaces
 * and case ignored) and the street lines are near-identical (typos, "St" vs
 * "Street", a unit number added), or when street AND city match exactly.
 */
export function similarAddress(a, b) {
    if (!a || !b) return false;
    const streetA = normalizeStreet(a);
    const streetB = normalizeStreet(b);
    if (!streetA || !streetB) return false;

    const zipA = clean(a.zip).replace(/\s/g, "");
    const zipB = clean(b.zip).replace(/\s/g, "");
    const similarity = textSimilarity(streetA, streetB);

    if (zipA && zipB && zipA === zipB) return similarity >= SIMILAR_STREET;
    return similarity === 1 && clean(a.city) !== "" && clean(a.city) === clean(b.city);
}

/**
 * @param {Object} args
 * @param {{firstName?:string,lastName?:string,name?:string}} args.referrer
 * @param {{firstName?:string,lastName?:string,name?:string}} args.referred
 * @param {Object[]} args.referrerAddresses - addresses known for the referrer
 * @param {Object[]} args.referredAddresses - billing/shipping on the referred order
 * @returns {{ decision: "HOLD"|"FLAG"|"CLEAR", signals: string[] }}
 */
export function assessReferral({ referrer, referred, referrerAddresses = [], referredAddresses = [] }) {
    const signals = [];

    const nameMatch = sameName(referrer, referred);
    const surnameMatch = sameSurname(referrer, referred);
    const addressMatch = referredAddresses.some((x) => referrerAddresses.some((y) => similarAddress(x, y)));

    if (nameMatch) signals.push("same_name");
    else if (surnameMatch) signals.push("same_surname");
    if (addressMatch) signals.push("similar_address");

    if (addressMatch && (nameMatch || surnameMatch)) return { decision: "HOLD", signals };
    if (nameMatch || addressMatch) return { decision: "FLAG", signals };
    return { decision: "CLEAR", signals };
}

/** Plain-language reason shown to the merchant. */
export function describeSignals(signals) {
    const text = {
        same_name: "the two accounts have the same name (including reversed first/last name)",
        same_surname: "the two accounts share a surname",
        similar_address: "the referred order's billing or shipping address is the same as, or very close to, the referrer's address",
    };
    return signals.map((s) => text[s]).filter(Boolean).join("; ");
}
