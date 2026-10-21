/**
 * @file scripts/test/referralFraud.test.js
 * @description Unit tests for utils/referralFraud.js. Pure, no DB/network.
 * Names and addresses are invented; the first case mirrors the shape of the
 * real report (names reversed, near-identical billing address).
 */

import { assessReferral, similarAddress, sameName } from "../../app/utils/referralFraud.js";
import { suite, checkEqual } from "./lib/assert.js";

const addr = (address1, zip, city = "Sydney") => ({ address1, zip, city });

export async function run() {
    await suite("referralFraud", async () => {
        await checkEqual(
            "reversed names + near-identical address → HOLD",
            assessReferral({
                referrer: { firstName: "Imad", lastName: "Abdel" },
                referred: { firstName: "Abdel", lastName: "Imad" },
                referrerAddresses: [addr("12 Example Street", "2000")],
                referredAddresses: [addr("12 Example St.", "2000")],
            }),
            { decision: "HOLD", signals: ["same_name", "similar_address"] }
        );

        await checkEqual(
            "same surname + same address (household) → HOLD",
            assessReferral({
                referrer: { firstName: "Ana", lastName: "Lopez" },
                referred: { firstName: "Mia", lastName: "Lopez" },
                referrerAddresses: [addr("5 Hill Rd", "3000", "Melbourne")],
                referredAddresses: [addr("5 Hill Road, Unit 2", "3000", "Melbourne")],
            }).decision,
            "HOLD"
        );

        await checkEqual(
            "same name only (common name, different address) → FLAG, not held",
            assessReferral({
                referrer: { firstName: "John", lastName: "Smith" },
                referred: { firstName: "Smith", lastName: "John" },
                referrerAddresses: [addr("1 Alpha Street", "2000")],
                referredAddresses: [addr("90 Zulu Avenue", "4000", "Brisbane")],
            }).decision,
            "FLAG"
        );

        await checkEqual(
            "similar address only, unrelated names → FLAG, not held",
            assessReferral({
                referrer: { firstName: "Ana", lastName: "Lopez" },
                referred: { firstName: "Tom", lastName: "Baker" },
                referrerAddresses: [addr("7 Beach Rd", "2026", "Bondi")],
                referredAddresses: [addr("7 Beach Road", "2026", "Bondi")],
            }).decision,
            "FLAG"
        );

        await checkEqual(
            "unrelated people → CLEAR",
            assessReferral({
                referrer: { firstName: "Ana", lastName: "Lopez" },
                referred: { firstName: "Tom", lastName: "Baker" },
                referrerAddresses: [addr("7 Beach Rd", "2026", "Bondi")],
                referredAddresses: [addr("88 Other Lane", "6000", "Perth")],
            }).decision,
            "CLEAR"
        );

        await checkEqual("no address on file → falls back to name only", assessReferral({
            referrer: { firstName: "Ana", lastName: "Lopez" },
            referred: { firstName: "Lopez", lastName: "Ana" },
        }).decision, "FLAG");

        await checkEqual("accents and case are ignored", sameName({ name: "José Núñez" }, { firstName: "NUNEZ", lastName: "jose" }), true);
        await checkEqual("a single-word name never matches", sameName({ name: "Sam" }, { name: "Sam" }), false);
        await checkEqual("different postcode with similar street is not the same place", similarAddress(addr("12 Example Street", "2000", "Sydney"), addr("12 Example Street", "3000", "Melbourne")), false);
    });
}
