/**
 * @file dev-config/points-backfill/components/EntriesTable.jsx
 * @description Browsable record of exactly which customers a rule has
 * awarded points to — the "keep a record of the people we're applying it
 * to" need (Bez Agency, Slack, 25 Jul 2026).
 *
 * Deliberately NOT a bulk-edit tool: each customer's name links straight
 * to their own detail page, where the existing Adjust Points feature
 * already covers "we want to correct one of these people". Building a
 * separate bulk-adjustment tool here would be a much bigger, higher-risk
 * feature with no confirmed need for it yet.
 *
 * The search commits on the Search button or the Enter key, never while
 * typing. Partly because it matches the Customers page, and partly
 * because an auto-firing search on a table this size means every
 * half-typed name is a real query — and a result set that reshuffles
 * under someone mid-word is hard to read and easy to mistrust.
 *
 * Search, sort and paging are all URL state resolved by the loader, not
 * local filtering — see _hooks.js and controller/jobs/pointsBackfill.js.
 * Only one page of a rule's entries is ever in this component, so anything
 * filtered here would be searching 25 rows out of several thousand and
 * reporting the result as if it were the whole set.
 *
 * The pager is the app-wide Pagination component, driven by explicit
 * props rather than by usePagination() — the same server-side arrangement
 * layout/customers/index/components/CustomerTable.jsx already uses.
 * usePagination() slices an array it's handed, which only works when the
 * whole dataset is in the browser; here it never is.
 */

import Pagination from "@app/components/pagination/Pagination";
import { ENTRY_SORT_OPTIONS, ALLOWED_PAGE_SIZES } from "../_data";

/**
 * The controls row.
 *
 * Rendered above the table AND above the no-matches state — a merchant
 * whose search found nothing needs the box holding that search in order
 * to undo it. Hiding the controls along with the results is the classic
 * shape of this bug: the screen offers no way back except editing the URL.
 */
function EntriesToolbar({
    queryInput,
    onQueryChange,
    onQuerySubmit,
    onQueryKeyDown,
    onClearQuery,
    sort,
    onSortChange,
    isNavigating,
    hasQuery,
}) {
    return (
        <s-box paddingBlockEnd="base">
            {/* alignItems="stretch", not "end". Stretch makes every child
                the full row height, which is what keeps the button the same
                height as the field beside it; "end" only lines their
                bottoms up and leaves a default-height button looking
                undersized next to a full-height input. Matches the toolbar
                in layout/customers/index/components/CustomerTable.jsx. */}
            <s-grid gridTemplateColumns="2fr auto 1fr auto" gap="base" alignItems="stretch">
                {/* s-search-field rather than s-text-field — it's the same
                    control with search affordances built in, and it's what
                    the Customers page uses for exactly this. Enter submits
                    as well as the button; a search box that ignores Enter
                    is the most reliable way to make someone think the
                    feature is broken. */}
                <s-search-field
                    label="Search customers"
                    labelAccessibilityVisibility="exclusive"
                    placeholder="Search by name or email"
                    value={queryInput}
                    disabled={isNavigating}
                    onInput={(e) => onQueryChange(e.target.value)}
                    onKeyDown={onQueryKeyDown}
                />

                <s-button variant="secondary" size="large" disabled={isNavigating} onClick={onQuerySubmit}>
                    Search
                </s-button>

                <s-select
                    label="Sort by"
                    labelAccessibilityVisibility="exclusive"
                    value={sort}
                    disabled={isNavigating}
                    onChange={(e) => onSortChange(e.target.value)}
                >
                    {ENTRY_SORT_OPTIONS.map((option) => (
                        <s-option key={option.value} value={option.value}>
                            {option.label}
                        </s-option>
                    ))}
                </s-select>

                {/* Keyed off the SUBMITTED query, not the input box, so it
                    appears only when there is actually a filter in force —
                    text sitting unsubmitted in the field isn't filtering
                    anything and has nothing to clear. */}
                {hasQuery ? (
                    <s-button variant="secondary" size="large" disabled={isNavigating} onClick={onClearQuery}>
                        Clear
                    </s-button>
                ) : (
                    <s-box />
                )}
            </s-grid>
        </s-box>
    );
}

export function EntriesTable({
    entries,
    totalCount,
    unfilteredCount,
    page,
    perPage,
    totalPages,
    ruleCurrency,
    onPageChange,
    onPerPageChange,
    onDownload,
    isDownloading,
    isNavigating,
    queryInput,
    query,
    onQueryChange,
    onQuerySubmit,
    onQueryKeyDown,
    onClearQuery,
    sort,
    onSortChange,
}) {
    const hasQuery = !!query;

    // Nothing has ever been awarded under this rule. No search could
    // change that, so there's nothing worth showing — not even controls.
    if (unfilteredCount === 0) {
        return null;
    }

    const toolbar = (
        <EntriesToolbar
            queryInput={queryInput}
            onQueryChange={onQueryChange}
            onQuerySubmit={onQuerySubmit}
            onQueryKeyDown={onQueryKeyDown}
            onClearQuery={onClearQuery}
            sort={sort}
            onSortChange={onSortChange}
            isNavigating={isNavigating}
            hasQuery={hasQuery}
        />
    );

    // A search that matched nobody. Entries do exist — this one query just
    // didn't find them — so say which is which and keep the way out.
    if (totalCount === 0) {
        return (
            <s-section heading="Backfilled Customers">
                {toolbar}
                <s-box paddingBlockStart="base">
                    <s-paragraph tone="subdued">
                        No customer matches <strong>{query}</strong>. This rule has awarded points to{" "}
                        {unfilteredCount.toLocaleString()} customer(s) in total.
                    </s-paragraph>
                </s-box>
                <s-box paddingBlockStart="small">
                    <s-button variant="secondary" onClick={onClearQuery}>
                        Clear search
                    </s-button>
                </s-box>
            </s-section>
        );
    }

    return (
        <s-section heading="Backfilled Customers">
            {toolbar}

            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                {/* Only the filtered count lives here. Unfiltered, the
                    pager below already says "Showing 26–50 of 5,842
                    customers", and two totals on one screen invite the
                    reader to work out why they differ when they don't. */}
                <s-text tone="subdued">
                    {hasQuery
                        ? `${totalCount.toLocaleString()} of ${unfilteredCount.toLocaleString()} customer(s) match`
                        : ""}
                </s-text>

                {/* Exports what's on screen — filter and ordering included —
                    which is why the label changes. A button reading "this
                    rule" above a table of twelve search results would be
                    read as one of the two, and it can't be both. */}
                <s-button
                    variant="secondary"
                    size="small"
                    disabled={isDownloading}
                    loading={isDownloading || undefined}
                    onClick={onDownload}
                >
                    {isDownloading
                        ? "Preparing CSV…"
                        : hasQuery
                            ? `Export these ${totalCount.toLocaleString()} results (CSV)`
                            : "Export this rule (CSV)"}
                </s-button>
            </s-stack>

            <s-box paddingBlockStart="base">
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Customer</s-table-header>
                        <s-table-header>Points Awarded</s-table-header>
                        <s-table-header>Amount Spent</s-table-header>
                        <s-table-header>Date</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {entries.map((entry) => (
                            <s-table-row key={entry.id}>
                                <s-table-cell>
                                    {/* Stacked, not bare siblings. s-text is
                                        inline, so with no block container the
                                        email ran straight on from the name —
                                        "Christopher Smithchristopher.smith@
                                        example.com" rendered as one string. */}
                                    <s-stack direction="block">
                                        <s-link href={`/app/customers/${entry.customer.id}`}>
                                            {entry.customer.name || entry.customer.email}
                                        </s-link>
                                        {entry.customer.name && (
                                            <s-text tone="subdued" variant="bodySm">
                                                {entry.customer.email}
                                            </s-text>
                                        )}
                                    </s-stack>
                                </s-table-cell>
                                <s-table-cell>{entry.pointsAwarded.toLocaleString()} pts</s-table-cell>
                                <s-table-cell>{Number(entry.amountSpent).toLocaleString()} {ruleCurrency}</s-table-cell>
                                <s-table-cell>{new Date(entry.createdAt).toLocaleDateString()}</s-table-cell>
                            </s-table-row>
                        ))}
                    </s-table-body>
                </s-table>
            </s-box>

            {/* Rendered even at one page: the "Showing 1–12 of 12" line and
                the per-page control are both still worth having, and a
                pager that appears and disappears as a search narrows is
                more distracting than one that stays put. */}
            <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                perPage={perPage}
                startIndex={(page - 1) * perPage}
                setCurrentPage={onPageChange}
                setPerPage={onPerPageChange}
                label="customers"
                perPageOptions={ALLOWED_PAGE_SIZES}
            />
        </s-section>
    );
}