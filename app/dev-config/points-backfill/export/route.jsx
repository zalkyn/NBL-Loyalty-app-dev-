/**
 * @file dev-config/points-backfill/export/route.jsx
 * @description Resource route — no page component, just a loader that
 * returns a CSV file: every customer this shop has already been awarded
 * points for by a backfill run.
 *
 * Reached with fetch() from useCsvDownload(), NOT with a plain <a href>.
 * That distinction is load-bearing rather than stylistic — see that
 * hook's header for why an anchor cannot authenticate against this route
 * from inside the embedded admin.
 *
 * Usage:
 *   /app/points-backfill/export                          -> every backfilled customer, every rule
 *   /app/points-backfill/export?ruleId=3                 -> just that rule's backfilled customers
 *   /app/points-backfill/export?ruleId=3&q=ann&sort=…    -> exactly what the table is showing
 *
 * The q/sort pair exists so "Export" means "give me this, as a file"
 * rather than "give me something adjacent to this". A merchant looking at
 * twelve search results who receives 5,842 rows has been handed a file
 * they now have to re-filter by hand, and no label on the button would
 * have made that the obviously correct outcome.
 *
 * Single URL regardless of whether the linking page was
 * /app/points-backfill or /app/dev-config/points-backfill — this is a
 * plain authenticated data export, not something that needs hiding from
 * normal admin users the way the rest of dev-config's tools do.
 */

import { authenticate } from "shopify-server";
import { getBackfilledCustomersForExport } from "@controller/jobs/pointsBackfill";
import { buildCsv, csvDownloadResponse, csvErrorResponse } from "@utils/csv.server";
import { normalizeEntrySort, normalizeEntryQuery } from "../_data";

const HEADER = [
    "Customer Name",
    "Email",
    "Rule",
    "Points Awarded",
    "Amount Spent",
    "Currency",
    "Date Awarded",
];

function toRows(entries) {
    return entries.map((row) => [
        row.customer?.name ?? "",
        row.customer?.email ?? "",
        row.shadowRule?.name ?? "",
        row.pointsAwarded,
        row.amountSpent,
        row.shadowRule?.currencyCode ?? "",
        new Date(row.createdAt).toISOString(),
    ]);
}

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const url = new URL(request.url);
    const ruleIdParam = url.searchParams.get("ruleId");

    // Parsed strictly rather than with a bare parseInt: "3abc" would
    // otherwise silently become rule 3, and a caller who meant nothing in
    // particular deserves a straight answer instead of another rule's data.
    let shadowRuleId;
    if (ruleIdParam != null && ruleIdParam !== "") {
        const parsed = Number(ruleIdParam);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return csvErrorResponse("That rule id isn't valid.", 400);
        }
        shadowRuleId = parsed;
    }

    // Normalised through the same helpers the page uses, so the file can
    // never be built from a term or an ordering the table wouldn't accept.
    const q = normalizeEntryQuery(url.searchParams.get("q"));
    const sort = normalizeEntrySort(url.searchParams.get("sort"));

    // A thrown error here would reach the ErrorBoundary as a full page
    // replacement, which for a background fetch() means the merchant sees
    // nothing happen at all. Answering in text lets the hook toast it.
    let entries;
    try {
        entries = await getBackfilledCustomersForExport({
            sessionId: session.id,
            shadowRuleId,
            q,
            sort,
        });
    } catch (error) {
        console.error("Points backfill export failed:", error);
        return csvErrorResponse("Couldn't build the export. Try again in a moment.", 500);
    }

    // "-filtered" in the name so a partial export can't be mistaken for a
    // complete one three weeks later in a downloads folder.
    const suffix = q ? "-filtered" : "";
    const filename = shadowRuleId
        ? `backfilled-customers-rule-${shadowRuleId}${suffix}.csv`
        : `backfilled-customers-all${suffix}.csv`;

    return csvDownloadResponse(buildCsv(HEADER, toRows(entries)), filename);
};
