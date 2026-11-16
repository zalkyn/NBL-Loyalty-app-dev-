/**
 * @file scripts/test/referralApproval.test.js
 * @description Unit tests for the manual-approval helpers (utils/referralApproval.js). Pure, no DB.
 */

import { requiresClaimApproval, isClaimPending, isClaimRejected, canApproveClaim, CLAIM_STATUS } from "../../app/utils/referralApproval.js";
import { suite, checkEqual } from "./lib/assert.js";

export async function run() {
    await suite("referralApproval", async () => {
        await checkEqual("off when the rule has no setting (every existing shop)", requiresClaimApproval({ referral: { trigger: "both" } }), false);
        await checkEqual("off when there are no conditions at all", requiresClaimApproval(null), false);
        await checkEqual("off when explicitly false", requiresClaimApproval({ referral: { requireApproval: false } }), false);
        await checkEqual("on only when explicitly true", requiresClaimApproval({ referral: { requireApproval: true } }), true);
        await checkEqual("a truthy string does not switch it on", requiresClaimApproval({ referral: { requireApproval: "true" } }), false);

        await checkEqual("pending claim is recognised", isClaimPending({ status: CLAIM_STATUS.PENDING_APPROVAL }), true);
        await checkEqual("an ACTIVE referral is not pending", isClaimPending({ status: "ACTIVE" }), false);

        await checkEqual("REJECTED without a code is a rejected claim", isClaimRejected({ status: "REJECTED", discountCode: null }), true);
        await checkEqual("REJECTED with a code is the older rejected reward, not a claim", isClaimRejected({ status: "REJECTED", discountCode: "NBL_X" }), false);
        await checkEqual("HELD is not a rejected claim", isClaimRejected({ status: "HELD", discountCode: null }), false);

        await checkEqual("can approve a customer with no orders", canApproveClaim(0).ok, true);
        await checkEqual("cannot approve once they have ordered", canApproveClaim(1).ok, false);
        await checkEqual("cannot approve when the order count is unknown", canApproveClaim(undefined).ok, false);
    });
}
