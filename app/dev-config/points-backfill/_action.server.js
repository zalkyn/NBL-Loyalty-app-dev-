/**
 * @file dev-config/points-backfill/_action.server.js
 * @description Action for the Points Backfill page. Three intents,
 * matching the flow: optionally create a segment, build a preview from
 * one, then run it.
 *
 * None of them does real work inline — createSegment is a single Shopify
 * mutation, and the other two enqueue background jobs. See
 * server/jobs/snapshotBuildJob.js and server/jobs/pointsBackfillJob.js.
 */

import { authenticate } from "shopify-server";
import { enqueuePointsBackfill } from "@controller/jobs/pointsBackfill";
import { enqueueSnapshotBuild } from "@controller/backfillAudience/snapshot";
import createSegment, { buildTagQuery } from "@graphql/mutation/segments/createSegment.js";

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString() || "";

    if (intent === "createSegment") {
        const name = formData.get("segmentName")?.toString() || "";

        let tags = [];
        try {
            tags = JSON.parse(formData.get("segmentTags")?.toString() || "[]");
        } catch {
            return { ok: false, message: "Couldn't read the tag list. Reload the page and try again." };
        }

        // The ShopifyQL is built server-side, not accepted from the form.
        // The browser sends tag values; it does not get to send a raw
        // segment query, which would let anything at all through to
        // Shopify under this shop's token.
        const built = buildTagQuery(tags);
        if (built.error) {
            return { ok: false, message: built.error };
        }

        const result = await createSegment(admin, { name, query: built.query });

        // The new segment's id is returned so the page can select it
        // immediately — a merchant who just created something shouldn't
        // then have to hunt for it in a dropdown.
        return result.ok
            ? { ok: true, message: result.message, createdSegmentId: result.segment.id }
            : result;
    }

    if (intent === "buildPreview") {
        const shadowRuleId = parseInt(formData.get("shadowRuleId"));
        const segmentId = formData.get("segmentId")?.toString() || "";

        if (!shadowRuleId) {
            return { ok: false, message: "Choose a points backfill rule first." };
        }
        if (!segmentId) {
            return { ok: false, message: "Choose a customer segment first." };
        }

        // admin is passed through so the controller can re-validate the
        // segment against Shopify — the id arrived in a form field, and
        // the picker that produced it may be minutes stale.
        return enqueueSnapshotBuild({
            shop: session.shop,
            sessionId: session.id,
            admin,
            shadowRuleId,
            segmentId,
        });
    }

    if (intent === "startBackfill") {
        const snapshotId = parseInt(formData.get("snapshotId"));

        if (!snapshotId) {
            return { ok: false, message: "Build a preview before starting a run." };
        }

        return enqueuePointsBackfill({
            shop: session.shop,
            sessionId: session.id,
            snapshotId,
        });
    }

    return { ok: false, message: "Unknown action." };
};
