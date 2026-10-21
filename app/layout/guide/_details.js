// ─────────────────────────────────────────────────────────────────────────────
// Feature Guide — the extra detail for each topic in _content.js.
//
// Merged into the topics by _content.js, per topic key:
//   customerSees – what the customer sees in the store (widget and theme blocks)
//   examples     – more worked examples, shown after the main example
//   moreSteps    – further steps shown under "More detail"
//   moreFaq      – further questions
//
// Same rule as _content.js: every statement must match what the app does.
// ─────────────────────────────────────────────────────────────────────────────

export const TOPIC_DETAILS = {
    start: {
        customerSees: [
            "A floating button on your store opens the loyalty widget. A logged-out visitor sees \"Earn & Redeem Rewards\" with Create Account and Sign In buttons.",
            "A logged-in customer who has not joined sees \"You're Almost In!\" with a Join Our Program button. Most customers are enrolled automatically when their account is created.",
            "A member sees tabs: Home, Referral, Earn, Rewards and Prizes. My Rewards, My Prizes and Activity are extra tabs you can switch on under Widget Customize. Home is an overview: shortcuts to the other tabs, plus active rewards, prize requests and recent activity.",
            "The text on every tab is editable under Widget Customize → Labels.",
        ],
        examples: [
            {
                title: "A customer's first month, start to finish",
                lines: [
                    "Day 1: Mia creates an account. She is enrolled and can open the widget.",
                    "Day 3: she orders $60 of products. At 20 points per $1 she earns 1,200 points.",
                    "Day 10: she orders $140 → 2,800 more points. Balance: 4,000.",
                    "She opens Rewards, redeems the 4,000-point $20 voucher and gets a code. Balance: 0 (lifetime points stay 4,000).",
                    "She uses the code at checkout. Her voucher now shows as used.",
                ],
            },
        ],
        moreSteps: [
            "Your first week: do Setup Guide step 1, create one Order rule and two or three Reward rules, then place a test order yourself and check it on your own customer page.",
            "Every later change is safe to try with one test customer: the history on the customer page shows exactly what happened and why.",
        ],
        moreFaq: [
            { q: "What is the difference between current and lifetime points?", a: "Current points are what the customer can spend now. Lifetime points are everything ever earned, and never go down, so they suit tiers or rankings." },
            { q: "Where do I start if something looks wrong?", a: "Program Health first (it names the problem and the fix), then the customer's own page, where every point movement is listed with its reason." },
        ],
    },

    earning: {
        customerSees: [
            "Earn tab: one line per way to earn, for example \"Get 20 pts for every $1 spent\". The symbol is your store currency's.",
            "Activity: each paid order appears as points earned, with the points added and the new balance.",
            "A pop-up tells them about new points the next time they visit the store.",
        ],
        examples: [
            {
                title: "A plan with its own rate",
                lines: [
                    "Global rate: 20 points per $1. Monthly subscription plan: 30 points per $1. Order type: all orders.",
                    "An order has a $20 monthly-plan item and a $15 one-time item.",
                    "$20 × 30 = 600 points, and $15 × 20 = 300 points. Total 900 points.",
                ],
            },
            {
                title: "A partial refund",
                lines: [
                    "A $100 order earned 2,000 points. The customer is refunded $25 of it (a quarter).",
                    "A quarter of the points is taken back: 500 points.",
                    "If the customer has already spent them, the balance can go below zero. It is paid back by their future orders, or you can correct it with Adjust Points.",
                ],
            },
            {
                title: "A cancelled order",
                lines: [
                    "An order that earned 600 points is cancelled.",
                    "All 600 points are taken back, unless part of the order was already refunded and reversed. Only what is still left is taken, so points are never taken twice.",
                ],
            },
        ],
        moreSteps: [
            "Points are added after Shopify reports the order as paid.",
            "If something stops an order from being processed it is retried automatically. What still fails is shown on Program Health.",
        ],
        moreFaq: [
            { q: "Do points depend on the discount code or on shipping?", a: "No. They are worked out from product price and quantity, before discounts. Shipping is not counted." },
            { q: "Can one order be paid points twice?", a: "No. Each order is recorded once. A retried order can't earn twice." },
        ],
    },

    rewards: {
        customerSees: [
            "Rewards tab (Available Rewards): each reward with its points cost. Titles read like \"Voucher $20\" or \"Voucher 10%\", using your store currency's symbol.",
            "Rewards the customer can't afford yet are still listed, marked \"Not enough points\", so they know what to aim for. Tapping an affordable one asks \"Spend N points for this reward?\" before anything is taken.",
            "After redeeming they get their discount code to copy. The code is also listed under their active rewards, and shows as used once spent at checkout.",
        ],
        examples: [
            {
                title: "A percentage reward",
                lines: [
                    "A reward rule: 2,000 points → 10% off.",
                    "The customer redeems: 2,000 points are taken and a code for 10% off the order is created.",
                    "The code can be used once.",
                ],
            },
            {
                title: "A reward that could not be created",
                lines: [
                    "The customer presses Redeem. Their points are taken, then the app asks Shopify for the code.",
                    "If Shopify can't create the code, the points are given back straight away and the customer sees an error to try again.",
                ],
            },
        ],
        moreSteps: [
            "You can have as many rules as you like. A good spread gives customers something to aim for: a small voucher for quick wins and larger ones for loyal members.",
            "Reward rules can be changed at any time. Rewards already claimed keep the title and amount they were created with.",
        ],
        moreFaq: [
            { q: "Can a customer use two vouchers on one order?", a: "That depends on your Shopify discount combination settings, not on this app." },
            { q: "Can customers pick their own amount?", a: "No. They choose from the rules you create." },
        ],
    },

    referrals: {
        customerSees: [
            "Referral tab: their personal referral link with a Copy button, and share buttons (WhatsApp, email, Messenger, SMS), plus a plain description of what they and their friend get.",
            "A new customer can enter a friend's code and receive a discount code for their first order.",
            "After the friend's first paid order the referrer sees \"+2,500 points for successful referral\" (your own numbers), or a short, neutral message if the reward is held, not approved, or not due.",
        ],
        examples: [
            {
                title: "A clean referral",
                lines: [
                    "Referrer Sam (2,500 points for a referral). Friend Alex (gets $20 off and 1,000 points).",
                    "Alex enters Sam's code, gets a $20 code and pays for the first order.",
                    "Names and addresses are clearly different, so Sam gets 2,500 points and Alex 1,000, straight away. Nothing for you to do.",
                ],
            },
            {
                title: "A flagged referral",
                lines: [
                    "Referrer \"Jo Park\", friend \"Jo Park\", at clearly different addresses (a common name can simply be a coincidence).",
                    "The same full name alone is a single weak signal: both are paid as normal and the referral is listed under Rewarded, flagged. You can look at it, but nothing is waiting for you.",
                    "A shared surname alone (\"Jo Park\" and \"Lee Park\") is not flagged at all. Only a surname together with a similar address holds the reward.",
                ],
            },
            {
                title: "A renewal reward",
                lines: [
                    "The referral rule allows renewal rewards: 200 points for each renewal. The friend renews their subscription in month 2.",
                    "The referrer earns 200 points once for that order. A repeated notification for the same order can't pay twice.",
                ],
            },
        ],
        moreSteps: [
            "When you press Approve on a held referral, the points are awarded right then and the customers are told. Reject records the decision and awards nothing.",
            "You can select several held referrals and approve or reject them together (up to 25 at a time).",
        ],
        moreFaq: [
            { q: "Can customers use their own code?", a: "No. Using your own code, or being an existing customer, doesn't qualify." },
            { q: "Does the friend have to be a subscriber?", a: "Only if your referral rule is set to subscription orders only. The rule's order type decides." },
            { q: "What does a customer see when a reward is held?", a: "A neutral pop-up that the reward is being reviewed, and later the outcome. They are never told it looked suspicious." },
        ],
    },

    reviews: {
        customerSees: [
            "Earn tab: one line listing the review types you reward, for example \"50 points for text review. 100 points for photo review\".",
            "After a review, the points appear in Activity and in a pop-up on their next visit.",
        ],
        examples: [
            {
                title: "Every review rewarded",
                lines: [
                    "Rule: text 50, photo 100, video 200, \"every review\".",
                    "A customer leaves 3 text reviews on different products: 150 points.",
                ],
            },
        ],
        moreSteps: [
            "Test once: leave a review on a product using a customer account and check that points arrive on the customer's page.",
        ],
        moreFaq: [
            { q: "Do I need Loox?", a: "Yes. Review points come from Loox, through the Flow workflow described in Review Points Setup." },
        ],
    },

    prizes: {
        customerSees: [
            "Prizes tab (Available Prizes): each prize with its image, title and points cost. Claiming shows the prize value in your store currency's symbol.",
            "Claiming opens a confirmation showing Prize value, Points cost, Your balance and Balance after, so nothing is a surprise.",
            "My Prizes (or Prize Requests on Home): each request with its status. Pending: \"Your request is being reviewed.\" Fulfilled: \"Your prize is on its way.\" Completed: \"Your prize has been delivered.\" Cancelled: \"This request was cancelled.\"",
        ],
        examples: [
            {
                title: "A cancelled request",
                lines: [
                    "Customer has 5,000 points and claims a 4,000-point prize → 1,000 left.",
                    "You are out of stock, so you press Cancel with a note.",
                    "4,000 points are returned: balance 5,000. The customer sees \"This request was cancelled.\"",
                ],
            },
        ],
        moreSteps: [
            "The points cost is up to you. The Multiplier Calculator on the prize form suggests one from the product value.",
            "Customers with a negative balance can't claim until it is back to zero or above.",
        ],
        moreFaq: [
            { q: "Does the app ship the prize?", a: "No. The app records the request and the status. You fulfil and deliver it yourself, then mark it." },
        ],
    },

    subscriptions: {
        customerSees: [
            "With \"when the paid period ends\": a message saying they keep their points until the date, with the date.",
            "On the reset: a message that their points were reset because the subscription ended, and the balance shows 0.",
        ],
        examples: [
            {
                title: "A monthly member cancels",
                lines: [
                    "Billing date is the 20th. The member cancels on the 5th.",
                    "Immediately: points reset on the 5th.",
                    "When the paid period ends: they keep the points until the 20th and the reset happens then.",
                ],
            },
            {
                title: "Restoring by mistake",
                lines: [
                    "A reset removed 3,000 points from someone who had really renewed.",
                    "Open the row, press Restore Points and restore all 3,000, or only part of it.",
                ],
            },
        ],
        moreSteps: [
            "Open Subscription Cancellations whenever you want a record: every cancellation shows its date, what happened and what is scheduled.",
        ],
        moreFaq: [
            { q: "Does this change lifetime points?", a: "No. Only current points are reset." },
            { q: "What if I switch auto-reset off?", a: "Cancellations stay under Needs Action until you press Reset Now yourself." },
        ],
    },

    backfill: {
        customerSees: [
            "Backfilled points appear in the customer's Activity like any other earn.",
        ],
        examples: [
            {
                title: "A flat welcome gift",
                lines: [
                    "Rule: 500 points flat. Segment: customers created before launch.",
                    "Preview: 1,200 customers would get 500 each = 600,000 points.",
                    "Download the CSV, check a few rows, then start. Each customer gets exactly 500.",
                ],
            },
        ],
        moreSteps: [
            "Run it once per segment and keep the CSV as your record of who was awarded.",
        ],
        moreFaq: [
            { q: "Can I run it twice for the same customers?", a: "Check the preview first: it shows who would be awarded and who would be skipped and why, so you can see before anything is paid." },
        ],
    },

    customers: {
        customerSees: [
            "Points you add or remove with Adjust Points appear in the customer's Activity as \"Admin added/removed N points\", with the new balance.",
        ],
        examples: [
            {
                title: "Correcting a wrong adjustment",
                lines: [
                    "You added 500 points to the wrong customer.",
                    "Open them, Adjust Points → Remove points → 500, reason \"Added by mistake\".",
                    "Both entries stay in their history.",
                ],
            },
        ],
        moreSteps: [
            "Use the filters on the history (Earned, Spent, Adjusted) when a customer asks about one kind of movement.",
        ],
        moreFaq: [
            { q: "Can I delete a history entry?", a: "No. History is a record. To correct a balance, add another entry with Adjust Points." },
        ],
    },

    health: {
        customerSees: [
            "Nothing directly. Health is for you. The effect is that points and rewards reach customers properly.",
        ],
        examples: [
            {
                title: "A referral that was never recorded",
                lines: [
                    "Banner: \"A referral reward was never recorded.\" It lists the customers and what is owed.",
                    "Check the order, then add the points with Adjust Points on the referrer's page (reason \"Referral reward\").",
                ],
            },
        ],
        moreSteps: [
            "A banner on the dashboard just points to this page. The page has the details and the buttons.",
        ],
        moreFaq: [
            { q: "Should I contact support for every red banner?", a: "Press Retry failed orders first. If it comes back, contact support with the order IDs shown." },
        ],
    },

    messages: {
        customerSees: [
            "Pop-ups appear after the widget loads and are marked as seen, so they don't repeat. Activity keeps the full list.",
        ],
        examples: [
            {
                title: "Two events while away",
                lines: [
                    "A customer's order earned 600 points and an admin added 100.",
                    "On their next visit they see both messages, then the pop-ups don't repeat.",
                ],
            },
        ],
        moreSteps: [],
        moreFaq: [],
    },

    currency: {
        customerSees: [
            "Everything with an amount in the widget uses your store currency's symbol: reward titles, \"for every $1 spent\", the referral discount and a prize's value.",
            "The symbol is read from your store each time the widget loads, so a currency change shows without any action from you.",
        ],
        examples: [
            {
                title: "A store selling in several currencies",
                lines: [
                    "Store currency AUD. A customer pays in USD.",
                    "Points are based on the order's amount in your store currency (AUD), so every customer earns on the same basis.",
                ],
            },
        ],
        moreSteps: [],
        moreFaq: [],
    },
};

// New topics that have no page of their own to hang a "Guide" button on.
export const EXTRA_TOPICS = [
    {
        key: "widget",
        title: "The widget customers see",
        summary:
            "The loyalty widget is the customer's window into the programme. It lives in your theme, reads each customer's balance, and is where they earn, redeem and claim.",
        where: { label: "Open Widget Customize", href: "/app/customize" },
        steps: [
            "Turn it on once (Setup Guide, step 1: App embeds → NB Loyalty).",
            "Visitors who aren't logged in see a welcome with Create Account and Sign In.",
            "Logged-in customers who haven't joined see Join Our Program. Members see their tabs.",
            "Tabs: Home (overview), Referral, Earn (how to earn), Rewards (redeem), Prizes (claim). My Rewards, My Prizes and Activity can be switched on.",
            "In Widget Customize you can change labels and colours, and choose which tabs show.",
        ],
        example: {
            title: "Making the widget match your brand",
            lines: [
                "Widget Customize → Labels: rename the Rewards tab \"Treats\".",
                "Widget Customize: change the colours and styles to match your brand.",
                "Reload your store to see the change.",
            ],
        },
        customerSees: [
            "A floating button, bottom of the screen, that opens a panel. On the Loyalty page block it is shown inside the page instead.",
        ],
        notes: [
            { tone: "info", text: "Amounts always use your store currency's symbol. You don't set it anywhere." },
        ],
        faq: [
            { q: "The widget doesn't appear on my store.", a: "Check Setup Guide step 1: the NB Loyalty App embed must be switched on in the theme editor and saved." },
            { q: "Can I show the balance somewhere else on the page?", a: "Yes: add the Loyalty points block in the theme editor. It shows the logged-in customer's current points as plain text, and you can set text for visitors who aren't members." },
        ],
    },
    {
        key: "setup",
        title: "Theme setup (Setup Guide)",
        summary:
            "Setup Guide lists, in order, what to add to your theme so customers can see the programme. Only the first step is required.",
        where: { label: "Open Setup Guide", href: "/app/setup-guide" },
        steps: [
            "Step 1 (required): switch on the NB Loyalty App embed. This puts the widget on every page.",
            "Step 2 (optional): add a Loyalty & Rewards page with the Loyalty & Rewards block, for the full widget inside your own page. Set \"Expand button opens\" to Loyalty page in Widget Customize and enter the page's path.",
            "Step 3 (optional): text size for the page block, separately for desktop and mobile.",
            "Step 4 (optional): a custom font for the widget and the page.",
            "Step 5 (optional): your own CSS, in Widget Customize → Custom CSS.",
            "The Loyalty points block shows the logged-in customer's balance as plain text anywhere your theme accepts app blocks.",
        ],
        example: {
            title: "Adding a rewards page",
            lines: [
                "Online Store → Pages → create \"Loyalty & Rewards\" (path /pages/loyalty-rewards).",
                "Setup Guide step 2 → Add the Loyalty & Rewards block, then Save in the theme editor.",
                "Widget Customize → Display & Placement: Expand button opens = Loyalty page, Loyalty page URL = /pages/loyalty-rewards.",
            ],
        },
        customerSees: [
            "Once step 1 is saved, the floating loyalty button appears on every page of your store.",
            "If you added the Loyalty & Rewards page, customers see the full widget inside that page instead of a pop-up panel when they press expand.",
        ],
        notes: [
            { tone: "warning", text: "Theme editor links open in a new tab. Check the change there and press Save, or nothing changes on your store." },
        ],
        faq: [
            { q: "I changed something in the theme editor and my store doesn't show it.", a: "Press Save in the theme editor. A theme change only reaches customers once saved." },
        ],
    },
    {
        key: "settings",
        title: "Settings overview",
        summary:
            "One page that lists every setting of the programme, what it controls and what it is set to now. It only shows and links: each setting is changed on the page of its own feature.",
        where: { label: "Open Settings", href: "/app/settings" },
        steps: [
            "Settings are grouped: Earning points, Spending points, Subscriptions, What customers see, Store.",
            "Each row has a badge: green means on, yellow means off or not set up, grey is information such as a count.",
            "Press the button on a row to open the page where that setting is changed.",
            "\"Your store\" at the top shows details read from Shopify (name, address, currency, other selling currencies, time zone). They are for reference; change them in Shopify.",
        ],
        example: {
            title: "Checking before a sale",
            lines: [
                "Open Settings. Orders: On. Referrals: On — all orders. Cancellations: On — immediately.",
                "You decide yearly members should keep points until their paid period ends, so you press Open cancellations and change the timing there.",
                "Back on Settings, the row now reads \"On — when the paid period ends\".",
            ],
        },
        customerSees: [
            "Nothing directly. These settings decide what customers earn, what they can redeem and which messages they get. The Settings page itself is for you.",
        ],
        notes: [
            { tone: "info", text: "A yellow badge isn't an error. It means the feature is switched off or not set up yet, which may be exactly what you want." },
        ],
        faq: [
            { q: "Why can't I change settings on this page?", a: "Each setting sits beside the feature it affects, with its explanation, so you can see what a change does. This page is the map." },
        ],
    },
    {
        key: "events",
        title: "Points Events",
        summary:
            "Points Events are the kinds of action that can earn points: a direct purchase, a referral, a product review. The earning rules are attached to them.",
        where: { label: "Open Points Events", href: "/app/points-events" },
        steps: [
            "The standard events (Direct Purchase, Refer a Friend, Product Review) already exist.",
            "You can edit an event's name and description.",
            "An event's type is fixed once created, and each type can exist only once, so the list can't contain duplicates.",
            "You normally don't need to change anything here. Earning amounts are set on Points Earning Rules.",
        ],
        example: {
            title: "Renaming an event",
            lines: [
                "Edit \"Direct Purchase\" and change the description to \"Points for every paid order\".",
                "Earning amounts are set on Points Earning Rules, so this changes only how the event is labelled.",
            ],
        },
        customerSees: [
            "Nothing directly. Customers see the earning lines on the Earn tab, which are built from your earning rules.",
        ],
        notes: [
            { tone: "info", text: "To change how many points an action earns, use Points Earning Rules, not this page." },
        ],
        faq: [
            { q: "Why can't I add a second event of the same type?", a: "Each type can exist only once, so rules always attach to a single event." },
        ],
    },
];
