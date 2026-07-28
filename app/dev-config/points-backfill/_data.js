/**
 * @file dev-config/points-backfill/_data.js
 * @description Shared shape for the Backfilled Customers table's search
 * and sort controls.
 *
 * Lives in its own module because both sides need it and neither can
 * import the other: the dropdown is rendered in the browser, and the
 * query that honours it runs in controller/jobs/pointsBackfill.js, which
 * imports Prisma and can never reach a client bundle.
 *
 * The controller keeps its OWN whitelist of these keys rather than
 * trusting this one — same defence-in-depth split as shadow-rules'
 * _data.js validate() mirroring route.jsx's validateRate(). This file
 * decides what a merchant is OFFERED; the controller decides what it will
 * ACT on, and an unknown key there falls back to the default instead of
 * reaching orderBy.
 */

/**
 * Order matters — this is the dropdown, top to bottom. Date first because
 * it's the default and the one people reach for most; name last because
 * it's the tiebreaker people use when scanning for a specific person, and
 * by then they've usually typed in the search box instead.
 */
export const ENTRY_SORT_OPTIONS = [
    { value: "date_desc", label: "Date — newest first" },
    { value: "date_asc", label: "Date — oldest first" },
    { value: "points_desc", label: "Points — high to low" },
    { value: "points_asc", label: "Points — low to high" },
    { value: "spent_desc", label: "Amount spent — high to low" },
    { value: "spent_asc", label: "Amount spent — low to high" },
    { value: "name_asc", label: "Name — A to Z" },
    { value: "name_desc", label: "Name — Z to A" },
];

export const DEFAULT_ENTRY_SORT = "date_desc";

const VALID_SORTS = new Set(ENTRY_SORT_OPTIONS.map((o) => o.value));

/** Anything unrecognised — a hand-edited URL, an old bookmark — becomes the default. */
export function normalizeEntrySort(value) {
    return VALID_SORTS.has(value) ? value : DEFAULT_ENTRY_SORT;
}

/**
 * Long enough for a full email address, short enough that nobody pastes a
 * novel into an ILIKE. Trimmed here so the server, the URL and the
 * "showing results for" label can never disagree about what was searched.
 */
export const ENTRY_SEARCH_MAX_LENGTH = 100;

export function normalizeEntryQuery(value) {
    return String(value ?? "").trim().slice(0, ENTRY_SEARCH_MAX_LENGTH);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page size
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Choices in the shared Pagination component's "Per page" dropdown.
 *
 * Shared by BOTH paginated tables on this page — the preview's member
 * list and the post-run entries list. Same names as
 * layout/customers/index/_data.js uses for the same job.
 *
 * Starts at 10 rather than the component's own default of 5: this table is
 * read to answer "did this run do what I approved", and five rows at a
 * time turns that into scrolling instead of checking. 100 at the top end
 * because a rule with thousands of entries is 234 pages at 25, and someone
 * scanning for one name would rather have a quarter of the pages.
 */
export const ALLOWED_PAGE_SIZES = [10, 25, 50, 100];

/** Unchanged from the hardcoded value this replaced, so existing links behave. */
export const DEFAULT_PAGE_SIZE = 50;

export function normalizePageSize(value) {
    const n = parseInt(value, 10);
    return ALLOWED_PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}
