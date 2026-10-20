// ─────────────────────────────────────────────────────────────────────────────
// Feature Guide content — plain data, client-safe.
//
// Every statement here describes what the app actually does (checked against
// the code: orderPaidJob, reversal job, reward/voucher generation, referral
// handling, subscription-cancel job, prize claims, backfill). When behaviour
// changes, change the matching topic here.
//
// Shape of a topic:
//   key, title, summary         – what it is, one or two sentences
//   where: { label, href }      – the page to go to
//   steps: string[]             – "How it works", in order
//   example: { title, lines[] } – a worked example with real numbers
//   (customerSees, more examples, moreSteps, more faq live in _details.js)
//   notes: { tone, text }[]     – things to watch for (info / warning)
//   faq: { q, a }[]             – the questions admins actually ask
// ─────────────────────────────────────────────────────────────────────────────

import { TOPIC_DETAILS, EXTRA_TOPICS } from "./_details.js";

const BASE_TOPICS = [
    // ── 0. Start here ─────────────────────────────────────────────────────────
    {
        key: "start",
        title: "Start here",
        summary:
            "Customers earn points for what they do (buy, refer a friend, review a product). They spend points on rewards you define. This app keeps every balance, creates the discount codes, and tells you when something needs a decision.",
        where: { label: "Open the dashboard", href: "/app/dashboard" },
        steps: [
            "Turn the widget on in your theme (Setup Guide, step 1). Without it customers can't see anything.",
            "Decide how points are earned: Points Earning Rules (orders, referrals, reviews).",
            "Decide what points buy: Reward Rules (vouchers) and, optionally, Physical Prizes.",
            "Check Program Health now and then. It shows what needs your attention and why, in plain words.",
            "When a customer asks \"why don't I have my points?\", open their page under Customers: every point movement is listed with the reason.",
        ],
        example: {
            title: "A typical programme",
            lines: [
                "Earn: 20 points for every $1 spent.",
                "Spend: 4,000 points → a $20 voucher.",
                "Refer: the referrer gets 2,500 points, the friend gets $20 off their first order.",
                "So a customer who spends $200 earns 4,000 points and can turn them into a $20 voucher.",
            ],
        },
        notes: [
            { tone: "info", text: "Lifetime points only ever go up. Current points go down when a customer spends them, or when points are reversed or reset." },
        ],
        faq: [
            { q: "Where do I see everything a customer did?", a: "Customers → click the customer. The history lists every earn, spend, adjustment and reversal with its reason and the balance after it." },
            { q: "Does the app send emails?", a: "No. Customers are told through short messages in the loyalty widget (see \"What customers are told\")." },
        ],
    },

    // ── 1. Earning from orders ────────────────────────────────────────────────
    {
        key: "earning",
        title: "Earning points from orders",
        summary:
            "The Order rule decides how many points a paid order earns. It runs automatically after each paid order.",
        where: { label: "Open Points Earning Rules", href: "/app/points-rules" },
        steps: [
            "Choose which orders earn points: one-time purchases only, subscription orders only, or both.",
            "Choose the rate: a fixed number of points per order, or points per amount spent (for example 20 points for every $1).",
            "Points are worked out for each product in the order from its price and quantity, before discounts. Shipping is not counted. The result is rounded down for each product.",
            "Optional: give a subscription plan interval (weekly, monthly, yearly…) its own rate.",
            "Optional: create product groups with their own rate, and exclude products that should never earn points.",
            "If a product matches more than one setting, the most specific one wins: product group + plan interval, then product group, then plan interval, then the global rate.",
        ],
        example: {
            title: "20 points for every $1",
            lines: [
                "A customer buys one $12.50 item twice → $25 → 500 points.",
                "With \"1 point for every $10\": a $59 product → 5 points (rounded down).",
                "An excluded product in the same order adds nothing.",
            ],
        },
        notes: [
            { tone: "warning", text: "If an order is cancelled or refunded, the matching share of its points is taken back. If the customer already spent those points their balance can go below zero, and they can't claim new rewards until it is paid back." },
            { tone: "info", text: "If the rule is set to \"subscription orders only\", a one-time order earns nothing — by design. Choose \"All orders\" to reward both." },
        ],
        faq: [
            { q: "A customer says they didn't get points for an order.", a: "Open the customer: if the order isn't in their history, check the rule's order type (one-time vs subscription), whether the products were excluded, and Program Health for orders that couldn't be processed." },
            { q: "Are points based on the total paid or on product prices?", a: "On product prices and quantities, before discounts. Shipping is not included." },
            { q: "If I change the rate, do old orders change?", a: "No. Only new orders use the new rate. To give past customers points, use Points Backfill." },
        ],
    },

    // ── 2. Rewards ────────────────────────────────────────────────────────────
    {
        key: "rewards",
        title: "Rewards customers can redeem",
        summary:
            "A reward rule says: spend this many points, get this discount. When a customer redeems, the app creates a discount code in Shopify just for them.",
        where: { label: "Open Reward Rules", href: "/app/rewards-rules" },
        steps: [
            "Create a rule: its points cost, and a fixed amount off or a percentage off.",
            "The title can contain {{currency_value}}; it becomes the amount automatically (\"Voucher {{currency_value}}\" → \"Voucher $20\").",
            "When a customer redeems, their points are taken first, then the code is created in Shopify. If the code can't be created, the points are given back.",
            "The code works only for that customer, can be used once, and has no expiry date. It applies to the whole order, one-time or subscription.",
            "Once the code is used at checkout, the reward is marked as used.",
        ],
        example: {
            title: "Five voucher levels",
            lines: [
                "4,000 points → $20 off",
                "8,000 points → $50 off",
                "10,000 points → $100 off",
                "A customer with 9,000 points can redeem the $50 voucher and is left with 1,000.",
            ],
        },
        notes: [
            { tone: "info", text: "A reward a customer has already claimed keeps the title and code it was created with, even if you later change the rule." },
            { tone: "info", text: "Fixed amounts are plain numbers in your store currency. If you change your store currency, check the amounts still make sense." },
        ],
        faq: [
            { q: "A customer redeemed by mistake — can I undo it?", a: "Yes, if they haven't used the code: open the customer, find the reward in Rewards History and press Cancel. The points go back to them." },
            { q: "Can a voucher be shared?", a: "No. The code is tied to the customer it was created for." },
            { q: "Do vouchers expire?", a: "No. They stay valid until used or cancelled." },
        ],
    },

    // ── 3. Referrals ──────────────────────────────────────────────────────────
    {
        key: "referrals",
        title: "Referrals and referral protection",
        summary:
            "A member shares their referral code. When a friend places their first order with it, the member earns points and the friend gets a discount (and optionally points). The app checks the two accounts first, so the same person can't reward themselves.",
        where: { label: "Open the Referral rule", href: "/app/points-rules/referral" },
        steps: [
            "Every member has a referral code. A new customer enters it in the widget before their first order.",
            "The friend receives a one-time discount code for that first order (a fixed amount or a percentage). A customer who has already ordered, or who uses their own code, can't claim.",
            "When the friend's first order is paid, the app compares the two accounts: names (including first and last name swapped), surnames and addresses.",
            "Clearly different people: the referrer earns their points and the friend earns theirs.",
            "A weaker match (for example the same name but different addresses): both are rewarded as normal, and the referral is flagged so you can look.",
            "A strong match (similar address and the same name or surname): the points are held and wait for you in Referral Reviews. You approve or reject, one by one or in bulk.",
            "Optionally, the referrer earns more each time the friend renews a subscription.",
        ],
        example: {
            title: "What a held referral looks like",
            lines: [
                "Referrer: Noah Young. Friend: Young Noah, with almost the same address.",
                "The friend's $20 discount was already applied by Shopify, but the 2,500 + 1,000 points are held.",
                "You open Referral Reviews, see why it was held, and press Approve (points are awarded) or Reject (nothing is awarded).",
                "Both customers are told in their widget: \"Your referral reward is being reviewed\", and later the outcome.",
            ],
        },
        notes: [
            { tone: "warning", text: "The referred customer's discount is a Shopify discount code, so it is applied at checkout even when the points are held or rejected. Rejecting only withholds points." },
            { tone: "info", text: "If your referral rule is \"subscription orders only\" and the friend's first order is a one-time order, no points are given. The referrer is told why, and the referral is closed." },
            { tone: "info", text: "A flagged or approved referral stays listed under \"Rewarded, flagged\" so you have a record." },
        ],
        faq: [
            { q: "The friend got the discount but the referrer got no points. Why?", a: "Check Referral Reviews (held for your decision), then the rule's order type (a one-time order under a subscription-only rule earns nothing), then Program Health (an order that couldn't be processed, or a reward that was never recorded). Each case tells you what to do." },
            { q: "Can I turn the protection off?", a: "Held rewards always wait for you; that is the protection. You approve in one click, or select several and approve them together." },
            { q: "Is a flagged referral a problem?", a: "No. The points were paid. It only means one weak signal was noticed, so you can look if you want to." },
        ],
    },

    // ── 4. Reviews ────────────────────────────────────────────────────────────
    {
        key: "reviews",
        title: "Review points (Loox)",
        summary:
            "Customers earn points for product reviews written in Loox. Loox tells the app through a Shopify Flow workflow.",
        where: { label: "Open Review Points Setup", href: "/app/loox-setup" },
        steps: [
            "Follow Review Points Setup once to connect Loox and Shopify Flow. It gives you a private URL to paste into Flow.",
            "In the Review rule, set the points for a text review, a photo review and a video review, and switch off any you don't want to reward.",
            "Choose how often a customer can earn: once per product, once per review type, or for every review.",
        ],
        example: {
            title: "Once per review type",
            lines: [
                "Text review 50 points, photo review 100, video review 200.",
                "A customer reviews a product with text, then adds a photo review: 50 + 100 = 150 points.",
                "A second text review of the same product earns nothing.",
            ],
        },
        notes: [
            { tone: "warning", text: "Generating a new Flow URL stops the old one working. Paste the new URL into your Flow workflow straight away." },
        ],
        faq: [
            { q: "Points for reviews aren't arriving.", a: "Check the Flow workflow is switched on and uses the current URL from Review Points Setup, and that the Review rule is active." },
        ],
    },

    // ── 5. Prizes ─────────────────────────────────────────────────────────────
    {
        key: "prizes",
        title: "Physical prizes and prize claims",
        summary:
            "Physical prizes are real products customers can claim with points. Each claim is a request you fulfil and deliver.",
        where: { label: "Open Physical Prize Claims", href: "/app/physical-prizes-claims-manage" },
        steps: [
            "Create prizes under Physical Prize Rules: a title, a product value, and a points cost.",
            "A customer claims a prize in the widget. Their points are taken straight away and a request appears under Physical Prize Claims (marked New).",
            "You move it forward: Pending → Fulfilled (you've dealt with it, for example shipped) → Completed (delivered).",
            "You can cancel a request at any time before it's done: the points go back to the customer automatically.",
            "A cancelled request can be reverted, if the customer still has enough points.",
        ],
        example: {
            title: "A 12,000-point prize",
            lines: [
                "Customer has 15,000 points and claims it → 3,000 left, request is Pending.",
                "You post it → Fulfilled. It arrives → Completed.",
                "If you can't supply it → Cancel: 12,000 points are returned.",
            ],
        },
        notes: [
            { tone: "info", text: "Use the Points calculator on the prize form to work out a points cost from the product's value." },
        ],
        faq: [
            { q: "How do I see a customer's prize requests?", a: "On the customer's page there's a Physical Prize Claims table; the full management (fulfil, complete, cancel) is on the Physical Prize Claims page." },
        ],
    },

    // ── 6. Subscriptions ──────────────────────────────────────────────────────
    {
        key: "subscriptions",
        title: "When a subscription is cancelled",
        summary:
            "When Appstle reports a cancellation, the app records it and, if auto-reset is on, resets the customer's current points to 0 (lifetime points never change). You choose when.",
        where: { label: "Open Subscription Cancellations", href: "/app/subscription-cancellations" },
        steps: [
            "Every cancellation is recorded on the Subscription Cancellations page, whether or not points were reset.",
            "Auto-reset ON: points reset. Choose when under \"When the automatic reset happens\": immediately, or when the paid period ends.",
            "Immediately: the balance becomes 0 the moment the cancellation is reported.",
            "When the paid period ends: the customer keeps their points until the date they've paid up to (their next billing date). The customer is told, and the row shows Scheduled with the date.",
            "On that date the app checks again: if they subscribed again, nothing is reset (shown as Kept).",
            "Auto-reset OFF: nothing is reset automatically; the row waits under Needs Action and you reset it yourself with Reset Now.",
            "Made a mistake? Restore Points gives back what the reset removed, in full or in part.",
        ],
        example: {
            title: "A yearly member cancels after one month",
            lines: [
                "Immediately: points drop to 0 today, although the member has paid for 11 more months.",
                "When the paid period ends: they keep their 4,000 points for those 11 months. On the billing date the balance resets to 0.",
                "If they re-subscribe before that date, the points stay.",
            ],
        },
        notes: [
            { tone: "warning", text: "The setting applies to all plans. With \"when the paid period ends\", a monthly member who cancels also keeps their points until their next billing date (up to about a month)." },
            { tone: "info", text: "\"Subscribed again\" is detected from a subscription order that earned points. A subscription order that earned no points can't be seen; use Restore Points if that happens." },
            { tone: "info", text: "A customer with a negative balance (points owed from a refund) is never reset, so the debt isn't forgiven by accident." },
        ],
        faq: [
            { q: "Can I change the setting later?", a: "Yes. It only affects new cancellations. Ones already recorded keep what happened to them, and scheduled resets still run on their date." },
            { q: "Which date is used?", a: "The next billing date Appstle sends with the cancellation: the date the next payment would have been taken. If it is missing or already past, the reset happens straight away." },
        ],
    },

    // ── 7. Backfill ───────────────────────────────────────────────────────────
    {
        key: "backfill",
        title: "Points Backfill (existing customers)",
        summary:
            "A one-time way to give points to customers who bought before the app started tracking orders, based on what they've spent so far.",
        where: { label: "Open Points Backfill Rules", href: "/app/points-backfill-rules" },
        steps: [
            "Create a Points Backfill Rule: a flat number of points, or points per amount spent. Switch it Active.",
            "Choose a Shopify customer segment (built under Customers → Segments in Shopify), for example \"customers added before I installed the app\".",
            "Build a preview. It reads only; nothing changes. It shows who would be awarded, how many points in total, and who would be skipped and why.",
            "Download the CSV and check it.",
            "Start the run. Points go to exactly the customers in that preview.",
        ],
        example: {
            title: "1 point for every $10 spent",
            lines: [
                "A customer who has spent $1,254 in total gets 125 points (rounded down).",
                "A max per customer of 500 caps a $9,000 spender at 500 points.",
            ],
        },
        notes: [
            { tone: "warning", text: "A backfill awards real points to real customers. Check the preview and the CSV before you start the run." },
            { tone: "info", text: "A rule is saved in your store's currency and is checked against it. A rule not yet used refreshes to your current currency when you save it; a rule already used keeps its original currency, and you should create a new one." },
        ],
        faq: [
            { q: "Customers were skipped with \"currency mismatch\".", a: "Their spend is in a different currency from the rule. Save the rule again (if it hasn't been used) or create a new rule in your current currency." },
        ],
    },

    // ── 8. Customers ──────────────────────────────────────────────────────────
    {
        key: "customers",
        title: "Customers and Adjust Points",
        summary:
            "Each customer has a page with their balance, referral connections and a full history, and you can fix a balance by hand.",
        where: { label: "Open Customers", href: "/app/customers" },
        steps: [
            "Search by name or email, open a customer.",
            "At the top: current points, lifetime points, orders and rewards. Banners point out anything that needs you: a negative balance, a cancelled subscription still to be reset, a referral waiting for your decision.",
            "The Profile shows their referral code (with a Copy button), who referred them and who they've referred, each with its current state.",
            "Transaction history can be filtered to Earned, Spent or Adjusted. Short messages sent to the customer (such as \"your reward is being reviewed\") are folded away; show them with the button.",
            "Adjust Points adds or removes points with an optional reason. The customer sees \"Admin added/removed N points\".",
        ],
        example: {
            title: "Making good on a late delivery",
            lines: [
                "Adjust Points → Add points → quick amount +500 → reason \"Goodwill gesture\".",
                "The card shows 3,000 pts → 3,500 pts before you confirm.",
            ],
        },
        notes: [
            { tone: "info", text: "You can't remove more points than the customer has. Use a reason: it's saved with the entry so your team can see why." },
        ],
        faq: [
            { q: "A customer's balance is negative.", a: "Points from an order were reversed after they'd spent them. Use Adjust Points to correct it, or leave it: they'll earn it back with future orders. New reward and prize claims are blocked while it's negative." },
        ],
    },

    // ── 9. Health ─────────────────────────────────────────────────────────────
    {
        key: "health",
        title: "Program Health and the banners",
        summary:
            "Program Health is the one place that tells you whether the programme is working and what to do. The dashboard shows a short banner when something needs you.",
        where: { label: "Open Program Health", href: "/app/health" },
        steps: [
            "Red (critical): points or rewards aren't flowing. For example orders that couldn't be processed, or a referral reward that was never recorded.",
            "Yellow (warning): a decision or check is waiting. For example referrals held for you, a backfill rule in the wrong currency, or the referral rule switched off.",
            "Blue (info): nothing to do. For example orders being retried automatically.",
            "Green (success): everything is healthy.",
            "\"Retry failed orders\" tries again for orders that failed in the last 30 days. It's safe: points are never paid twice.",
        ],
        example: {
            title: "\"2 orders could not be processed\"",
            lines: [
                "Press Retry failed orders. A message says how many were queued.",
                "The banner changes to \"Some orders are being retried\", then disappears once they succeed.",
                "If it comes back, contact support and quote the order IDs it shows.",
            ],
        },
        notes: [
            { tone: "info", text: "Orders waiting for subscription details from Appstle are retried by themselves. You don't need to do anything." },
        ],
        faq: [
            { q: "Why does the dashboard show a banner?", a: "Because something in Program Health needs you. Open it for the details and the button to fix it." },
        ],
    },

    // ── 10. What customers see ────────────────────────────────────────────────
    {
        key: "messages",
        title: "What customers are told",
        summary:
            "Customers learn about changes through short pop-ups in the loyalty widget and in their Activity list. The app does not send emails.",
        where: { label: "Open Widget Customize", href: "/app/customize" },
        steps: [
            "Points added (orders, referrals, reviews, backfill, admin adjustments) and points taken away (reversals, resets) each show a message the next time the customer visits.",
            "Referral outcomes are explained: reward held for review, reward not approved, or no reward because of the rule settings.",
            "When a subscription is cancelled and you keep points until the paid period ends, the customer is told the date.",
            "Things a customer does themselves (redeeming, claiming a prize) don't pop up again; they already saw the result.",
            "You can switch pop-ups on page load off under Widget Customize → \"Show toast notifications on page load\". Activity still lists everything.",
        ],
        example: {
            title: "A referral held for review",
            lines: [
                "Referrer sees: \"Your referral reward is being reviewed. We'll update you as soon as it's confirmed.\"",
                "After you approve: \"+2,500 points for successful referral\". After you reject: \"Your referral reward wasn't approved, so no points were added for this referral.\"",
            ],
        },
        notes: [
            { tone: "info", text: "The wording is deliberately neutral. A held reward never accuses the customer of anything." },
        ],
        faq: [
            { q: "Can I edit these messages?", a: "The widget's labels and texts are editable under Widget Customize. The referral messages above are fixed." },
        ],
    },

    // ── 11. Currency ──────────────────────────────────────────────────────────
    {
        key: "currency",
        title: "Your store currency",
        summary:
            "Amounts in the admin and in the widget use your store's currency symbol, and follow it if you change it.",
        where: { label: "Open Reward Rules", href: "/app/rewards-rules" },
        steps: [
            "The symbol you see (for example $ or A$) comes straight from your store's currency, not from a setting in this app.",
            "Points earned per amount spent are calculated on the order's amount in your store currency. Nothing is converted.",
            "Reward and referral discounts are plain numbers. If your currency changes from USD to AUD, a \"$20\" reward becomes A$20, and codes already issued change with it.",
            "A Points Backfill rule saves a currency. Save an unused rule again after a currency change so it uses the new one.",
            "Refunds in another currency (stores selling in several currencies) are converted to your store currency before points are taken back.",
        ],
        example: {
            title: "Changing from USD to AUD",
            lines: [
                "Earning 20 points per 1 (store currency) keeps working; it now applies to the AUD amount.",
                "A 4,000-point $20 voucher becomes a 4,000-point A$20 voucher. Check that's what you want.",
            ],
        },
        notes: [
            { tone: "warning", text: "Because the value of a point changes when the currency changes, review your reward and referral amounts after switching." },
        ],
        faq: [
            { q: "The widget still shows the old symbol.", a: "The widget reads your store currency each time it loads. Refresh the page; if it still shows the old one, tell support." },
        ],
    },
];

// Topics read in this order. Each base topic gets its extra detail from
// _details.js (what customers see, more examples, more steps and questions).
const ORDER = ["start", "widget", "setup", "earning", "rewards", "referrals", "reviews", "prizes", "subscriptions", "backfill", "customers", "events", "health", "messages", "currency"];

const byKey = Object.fromEntries([...BASE_TOPICS, ...EXTRA_TOPICS].map((t) => [t.key, t]));

export const GUIDE_TOPICS = ORDER.map((key) => {
    const topic = byKey[key];
    const extra = TOPIC_DETAILS[key] ?? {};
    return {
        ...topic,
        customerSees: extra.customerSees ?? topic.customerSees ?? [],
        examples: [topic.example, ...(extra.examples ?? [])].filter(Boolean),
        moreSteps: extra.moreSteps ?? [],
        faq: [...(topic.faq ?? []), ...(extra.moreFaq ?? [])],
    };
});

export const DEFAULT_TOPIC = "start";

export const topicByKey = (key) => GUIDE_TOPICS.find((t) => t.key === key) ?? GUIDE_TOPICS[0];
