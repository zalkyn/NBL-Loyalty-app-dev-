/**
 * @file dev-config/points-backfill/preview-export/route.jsx
 * @description Resource route — no page component, just a loader that
 * returns the PRE-RUN CSV: the frozen customer list a merchant is being
 * asked to approve, before any points exist.
 *
 * Distinct from ../export/route.jsx, which exports what a run ALREADY
 * awarded. Both exist deliberately — one is the approval, the other is
 * the receipt, and being able to diff them is the entire audit story.
 *
 * Reached with fetch() from useCsvDownload(), not a plain <a href>; see
 * that hook's header for why an anchor can't authenticate here.
 *
 * Usage:
 *   /app/points-backfill/preview-export?snapshotId=12
 *
 * The snapshotId is scoped to the caller's own session inside
 * getSnapshotForExport(), not trusted from the query string — this
 * endpoint returns customer names, emails and phone numbers, so an id
 * that happens to exist is not the same as an id this shop may read.
 */

import { authenticate } from "shopify-server";
import { getSnapshotForExport } from "@controller/backfillAudience/snapshot";
import { buildCsv, csvDownloadResponse, csvErrorResponse } from "@utils/csv.server";

/**
 * Column order is chosen for reviewing, not for completeness: identity
 * first (who is this), then the number being decided (what do they get),
 * then the evidence behind it (what did they spend), then the exception
 * (why would they get nothing). A reviewer scanning left to right hits
 * the decision before the justification, which is the order they're
 * actually thinking in.
 *
 * "Points To Be Awarded" rather than "Points": a column named for the
 * customer's current balance would be read as one, and for most people in
 * a backfill that balance is zero because they've never been enrolled.
 */
const HEADER = [
    "Customer ID",
    "Name",
    "Email",
    "Phone",
    "Points To Be Awarded",
    "Amount Spent",
    "Currency",
    "Will Be Skipped Because",
];

function toRows(members) {
    return members.map((member) => [
        member.shopifyId,
        member.displayName ?? "",
        member.email ?? "",
        member.phone ?? "",
        member.projectedPoints,
        member.amountSpent,
        member.currencyCode ?? "",
        member.skipReason ?? "",
    ]);
}

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const url = new URL(request.url);
    const snapshotId = Number(url.searchParams.get("snapshotId"));

    if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
        return csvErrorResponse("Missing or invalid snapshotId.", 400);
    }

    let result;
    try {
        result = await getSnapshotForExport({ sessionId: session.id, snapshotId });
    } catch (error) {
        console.error("Backfill preview export failed:", error);
        return csvErrorResponse("Couldn't build the preview export. Try again in a moment.", 500);
    }

    if (!result) {
        return csvErrorResponse("Preview not found.", 404);
    }

    // Segment name in the filename, sanitised — a merchant who exports
    // three previews in a row needs to tell the files apart in their
    // downloads folder without opening them.
    const slug =
        (result.snapshot.segmentName || "segment")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "segment";

    const filename = `backfill-preview-${slug}-${snapshotId}.csv`;

    return csvDownloadResponse(buildCsv(HEADER, toRows(result.members)), filename);
};
