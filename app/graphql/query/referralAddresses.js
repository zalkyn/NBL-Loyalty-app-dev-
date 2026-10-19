import { shopifyGraphqlWithRetry } from "../../utils/shopifyGraphql.js";

const MODULE = "graphql/query/referralAddresses.js";

const ADDRESS_FIELDS = "address1 address2 city zip countryCodeV2";

/**
 * Addresses used by the referral self-dealing check: the referrer's default
 * address and every address on the referred customer's order / profile.
 * Throws on failure (after retries) so the caller can retry the job instead of
 * skipping the check.
 *
 * @param {Object} admin
 * @param {Object} args
 * @param {string} args.referrerGid - Shopify Customer GID of the referrer
 * @param {string} args.referredGid - Shopify Customer GID of the referred customer
 * @param {string} args.orderGid
 * @returns {Promise<{ referrerAddresses: Object[], referredAddresses: Object[] }>}
 */
export default async function getReferralAddresses(admin, { referrerGid, referredGid, orderGid }) {
    const json = await shopifyGraphqlWithRetry(
        admin,
        `#graphql
        query ReferralAddresses($referrer: ID!, $referred: ID!, $order: ID!) {
            referrer: customer(id: $referrer) { defaultAddress { ${ADDRESS_FIELDS} } }
            referred: customer(id: $referred) { defaultAddress { ${ADDRESS_FIELDS} } }
            order(id: $order) {
                billingAddress { ${ADDRESS_FIELDS} }
                shippingAddress { ${ADDRESS_FIELDS} }
            }
        }`,
        { referrer: referrerGid, referred: referredGid, order: orderGid },
        { context: { module: MODULE, orderId: orderGid } }
    );

    const data = json?.data ?? {};
    const present = (list) => list.filter(Boolean);

    return {
        referrerAddresses: present([data.referrer?.defaultAddress]),
        referredAddresses: present([
            data.order?.billingAddress,
            data.order?.shippingAddress,
            data.referred?.defaultAddress,
        ]),
    };
}
