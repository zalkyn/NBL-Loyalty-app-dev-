// ─────────────────────────────────────────────────────────────────────────────
// Feature Guide — "How to use it": click-by-click tasks in plain words.
//
// Merged into the topics by _content.js, per topic key:
//   howTo: [{ title, steps[] }]  – one small task each ("Add a reward", "Fix a customer's points")
//
// Write for someone who has never seen the app. Short sentences, everyday
// words, the exact button and field names as they appear on screen. Same rule
// as _content.js: every statement must match what the app does, so when a
// page's labels change, change them here too.
// ─────────────────────────────────────────────────────────────────────────────

export const HOW_TO = {
    start: [
        {
            title: "Set up your programme for the first time (about 15 minutes)",
            steps: [
                "Open Setup Guide from the side menu. Do step 1, \"Turn on the loyalty widget\". Without it customers see nothing in your store.",
                "Open Points Earning Rules and make the Order rule. This decides how many points a purchase earns.",
                "Open Reward Rules and make two or three rewards. This is what customers spend their points on.",
                "Place a test order in your own store, then open Customers and click your own name. You will see the points you earned and why.",
                "Open Program Health. If it says Healthy, you are done.",
            ],
        },
        {
            title: "Answer \"why don't I have my points?\"",
            steps: [
                "Open Customers and type the customer's name or email in the search box.",
                "Click their name to open their page.",
                "Look at the list of point movements. Each line shows the reason and the balance after it.",
                "If the order is missing, open Program Health and check the \"Orders that could not be processed\" table.",
            ],
        },
    ],

    widget: [
        {
            title: "Turn the widget on",
            steps: [
                "Open Setup Guide and find \"Turn on the loyalty widget (required)\".",
                "Press Open App embeds. Your Shopify theme editor opens in a new tab.",
                "Switch on the Loyalty points block, then press Save in the theme editor. A change only reaches customers after you press Save.",
                "Open your store in a new tab. A floating button should appear. Press it to see the widget.",
            ],
        },
        {
            title: "Change how the widget looks or what it says",
            steps: [
                "Open Widget Customize. The tabs are Customize, Widget Config, Labels & Text and Custom CSS.",
                "Customize: colours, sizes and style. A live preview shows each change.",
                "Widget Config: where the widget appears, what the expand button does, and other behaviour such as toast notifications.",
                "Labels & Text: change any wording customers read. Use this to match your brand's voice.",
                "Press Save when the bar at the bottom appears. Press Discard to throw your changes away.",
            ],
        },
    ],

    setup: [
        {
            title: "Work through the Setup Guide",
            steps: [
                "Open Setup Guide. Steps are numbered. Only step 1 is required. The rest are optional.",
                "Press the button inside a step (for example Open App embeds). It opens your theme editor.",
                "Make the change in the theme editor and press Save there.",
                "Check your live store to be sure it looks right.",
            ],
        },
        {
            title: "Show a Loyalty & Rewards page",
            steps: [
                "In Setup Guide open the step \"Add a Loyalty & Rewards page (optional)\".",
                "Add the Loyalty & Rewards block to a page in your theme editor and Save.",
                "In Widget Customize → Widget Config, set \"Expand button opens\" to \"Loyalty page\" and enter that page's address in \"Loyalty page URL\".",
            ],
        },
    ],

    settings: [
        {
            title: "Find and change a setting",
            steps: [
                "Open Settings from the side menu. It lists every setting in groups.",
                "Read the badge on a row. Green means on. Yellow means off or not set up. Grey is just information.",
                "Press the button on the row. It opens the page where that setting is changed.",
                "Change it there and save. When you come back to Settings, the row shows the new value.",
            ],
        },
        {
            title: "Check your store details",
            steps: [
                "At the top, \"Your store\" shows your name, address, currency and time zone, read from Shopify.",
                "If something is wrong, change it in Shopify, not here. This page only shows it.",
            ],
        },
    ],

    earning: [
        {
            title: "Create the order rule (customers earn points when they buy)",
            steps: [
                "Open Points Earning Rules and press Add New Rule. Choose the event \"Direct Purchase\".",
                "Under Order Trigger, choose which orders earn: one-time purchase only, subscription orders only, or both.",
                "Under Earning Method, choose Incremental (points depend on how much is spent) or Fixed (every order earns the same).",
                "Under Global Earning Points, fill in the numbers. Example: 20 points for every 1 spent.",
                "Leave Active switched on in the right-hand column, then press Save Rule.",
            ],
        },
        {
            title: "Give some products a different rate",
            steps: [
                "On the order rule, find Product Groups and press + Add Group.",
                "Give the group a name, pick its products and set its own rate.",
                "These products now use the group's rate instead of the global one.",
                "Press Update Rule to save.",
            ],
        },
        {
            title: "Stop some products earning points",
            steps: [
                "On the order rule, find Excluded Products (Optional).",
                "Press Select Excluded Products and tick the products.",
                "Press Update Rule. These products never earn points, whatever else is set.",
            ],
        },
        {
            title: "Give each subscription frequency its own rate",
            steps: [
                "On the order rule, find Subscription Interval Overrides (it appears when the rule covers subscriptions).",
                "Press + Add Interval, choose the frequency (for example monthly) and enter the rate.",
                "Press Update Rule.",
            ],
        },
        {
            title: "Switch a rule off without losing it",
            steps: [
                "Open the rule and switch Active off, then press Update Rule.",
                "Nobody earns from it until you switch it on again.",
            ],
        },
    ],

    rewards: [
        {
            title: "Add a reward (a voucher customers buy with points)",
            steps: [
                "Open Reward Rules and press Create New Rule.",
                "Reward Type: choose \"Order Discount\".",
                "Discount Type: choose Fixed Amount (for example 20 off) or Percentage (for example 10%).",
                "Value: type the amount or the percent.",
                "Points Cost: how many points the customer pays for it. Example: 4,000.",
                "Display Title: the name customers see. Type {{currency_value}} to insert the amount automatically, for example \"Voucher {{currency_value}}\".",
                "Keep Active switched on and press Save Rule.",
            ],
        },
        {
            title: "Change or stop a reward",
            steps: [
                "Open Reward Rules and click the rule in the list.",
                "Change the fields, or switch Active off to hide it from customers. Press Update Rule.",
                "Vouchers customers already redeemed keep working. Only new redemptions follow the new rule.",
            ],
        },
        {
            title: "Cancel a voucher a customer already redeemed",
            steps: [
                "Open Customers and click the customer.",
                "Find the voucher in their Rewards list and press the cancel button. A box named Cancel Reward opens.",
                "Confirm. The voucher code stops working at once and the points go back to the customer.",
            ],
        },
    ],

    referrals: [
        {
            title: "Turn referrals on",
            steps: [
                "Open Points Earning Rules, press Add New Rule and choose the Referral event.",
                "Under \"When should rewards be given?\" choose one-time orders only, subscription orders only, or both.",
                "Under Referrer, set the points the person who shared gets. Under Referred, set the discount the friend gets (Fixed amount or Percentage off).",
                "Optional: switch on the Renewal bonus and set Renewal Points. The referrer earns these each time the friend's subscription renews.",
                "Keep Active switched on and press Save Rule.",
            ],
        },
        {
            title: "Decide on a reward that was held",
            steps: [
                "Open Referral Reviews. Program Health and the dashboard tell you when something is waiting.",
                "The \"Waiting for decision\" tab lists referrals the app wasn't sure about. Each row shows the referrer, the friend, the order and the points.",
                "Look at the two people. If they are really different customers, press Approve. The points are paid at once.",
                "If it looks like one person using two accounts, press Reject. No points are paid and both customers get a neutral message.",
                "To do many at once, tick the rows and use the buttons that appear at the top.",
            ],
        },
        {
            title: "Check a reward that was paid but flagged",
            steps: [
                "Open Referral Reviews and open the \"Rewarded, flagged\" tab.",
                "These were paid already because the match was weak. They are listed so you can look.",
                "Nothing needs doing unless you think the points were wrong. In that case open the referrer's page and use Adjust Points to take them back.",
            ],
        },
    ],

    reviews: [
        {
            title: "Give points for product reviews (Loox)",
            steps: [
                "Open Loox Review Points Setup and follow the numbered steps on the page. They show the exact URL and settings to paste into Shopify Flow.",
                "Open Points Earning Rules, press Add New Rule and choose the Review event.",
                "Under Reward Mode choose: Once per product, Once per review type, or Every submission.",
                "Under Review Types & Points, switch on each type (text, photo, video) and enter its points.",
                "Keep Active switched on and press Save Rule.",
                "Test with a real review and check the customer's page for the points.",
            ],
        },
        {
            title: "Reconnect if reviews stop earning",
            steps: [
                "Open Loox Review Points Setup.",
                "Check the Shopify Flow workflow is still on and the URL matches the one shown on the page.",
                "If the link was ever shared by mistake, go to \"Reset connection\" and press Generate a new URL. The old workflow stops working until you paste the new URL into Shopify Flow.",
            ],
        },
    ],

    prizes: [
        {
            title: "Add a physical prize",
            steps: [
                "Open Physical Prize Rules and press Add New Prize.",
                "Prize Title: the name customers see. Prize image: upload a clear picture.",
                "Points Cost: how many points the prize costs. If you want the cost based on the product's value, use the Multiplier calculator on that page.",
                "Description / Notes (Optional): anything customers should know.",
                "Keep Active switched on and save.",
            ],
        },
        {
            title: "Handle a claim from start to finish",
            steps: [
                "Open Prize Claims. New claims show a New badge until you open them. Click a row to see Claim Details.",
                "Send the prize to the customer yourself (post it, email a licence key, and so on).",
                "Press Mark as Fulfilled. You can add \"Notes / License key / Download link (optional)\" for the customer.",
                "When the customer has received it, press Mark as Completed.",
                "Tick several rows to use Bulk Mark Fulfilled, Bulk Mark Completed or Cancel All & Refund.",
            ],
        },
        {
            title: "Cancel a claim and give the points back",
            steps: [
                "Open the claim in Prize Claims (click the row). It can be cancelled while it is Pending or Fulfilled.",
                "Press Cancel & Refund. A message says \"Points will be refunded\". Confirm.",
                "The customer's points are returned.",
            ],
        },
    ],

    subscriptions: [
        {
            title: "Choose what happens to points when a subscription is cancelled",
            steps: [
                "Open Subscription Cancellations.",
                "Switch \"Auto-reset points on cancellation\" on or off. On means points are reset to 0 when someone cancels.",
                "\"When the automatic reset happens\": choose \"Immediately when the subscription is cancelled\" or \"When the paid period ends\".",
                "\"When you reset manually\": choose \"Reset the whole balance to 0\" or \"Keep points earned after cancelling\". This is what a manual Reset Now removes.",
                "A message confirms the change. It only affects cancellations that happen from now on.",
            ],
        },
        {
            title: "Reset one customer's points by hand",
            steps: [
                "Open Subscription Cancellations and open the Needs Action tab.",
                "Find the customer and press Reset Now. A box tells you exactly how many points will be removed. Confirm.",
                "To do many, tick the rows and use the bulk reset button.",
            ],
        },
        {
            title: "Give points back after a mistake",
            steps: [
                "Find the cancellation in the list and press Restore Points.",
                "Check or change \"Points to restore\" and confirm.",
                "You cannot restore more than was reset, and you cannot restore the same reset twice.",
            ],
        },
    ],

    backfill: [
        {
            title: "Reward your existing customers once (a launch bonus)",
            steps: [
                "Open Points Backfill Rules and create a rule: choose Fixed (same points for everyone) or Per amount spent (points scale with lifetime spend).",
                "Check the Currency matches your store, and optionally set Max Points Per Customer.",
                "Open Points Backfill and select your rule under \"Select a rule\".",
                "Choose a segment of customers (from Shopify, or create one from tags).",
                "Press Build preview. Wait for it to finish, then read the numbers: who will be awarded, who will be skipped, total points.",
                "If it looks right, press \"Award points to N customers\" and confirm. A progress bar shows the run.",
            ],
        },
        {
            title: "Check the result afterwards",
            steps: [
                "On Points Backfill, the Awarded, Skipped and Failed numbers show the totals for every run of that rule.",
                "Download the CSV to see each customer and the points they got.",
                "A customer can only ever receive one backfill award per rule, so running it again does not pay anyone twice.",
            ],
        },
    ],

    customers: [
        {
            title: "Find a customer",
            steps: [
                "Open Customers and use the \"Search customers\" box (name or email).",
                "Use \"Sort by\" to put the biggest balances or newest members first.",
                "Click a name to open the customer's page.",
            ],
        },
        {
            title: "Add or remove points by hand",
            steps: [
                "Open the customer's page and press Adjust Points.",
                "Choose Add points or Remove points and type the amount.",
                "Write a short reason. It is saved in their history so you remember why.",
                "Confirm. You cannot remove more points than they have.",
            ],
        },
        {
            title: "Bring in customers who are missing",
            steps: [
                "On the Customers page press Sync Customers and confirm.",
                "Wait for the progress bar. Nothing is deleted and no points change: customers already here keep their balances and history.",
            ],
        },
    ],

    events: [
        {
            title: "Rename an event",
            steps: [
                "Open Points Events and click the event.",
                "Change the name or description and save.",
                "This only changes the label. To change how many points are earned, use Points Earning Rules.",
            ],
        },
    ],

    health: [
        {
            title: "Read the page in 10 seconds",
            steps: [
                "Look at the top box. A green Healthy means nothing needs you. Yellow means there is something to decide. Red means points are not reaching customers.",
                "Read the banners under the title. Each one says what happened and gives a button to fix it.",
                "\"Also waiting\" lists normal day-to-day work such as prize requests. They are not faults.",
                "Press Check again to refresh the numbers.",
            ],
        },
        {
            title: "Fix orders that could not be processed",
            steps: [
                "Press Retry failed orders on the banner or above the table.",
                "Wait a few minutes. Retrying is safe: nobody is paid twice.",
                "If an order fails again, copy its ID and the note under \"Why\" and send them to support.",
                "Press View order on a row to open that order in Shopify.",
            ],
        },
        {
            title: "Pay a referrer who was missed",
            steps: [
                "Find the table \"Referral rewards that were not paid\".",
                "Press Open referrer on the row.",
                "On their page press Adjust Points, choose Add points and enter the referral points. Write a reason such as \"Referral reward missed\".",
            ],
        },
        {
            title: "Finish setup",
            steps: [
                "Look at the Setup checklist. Rows marked To do or Switched off need attention.",
                "Press the button on the row. It opens the right page to fix it.",
                "Optional rows only matter if you want that feature.",
            ],
        },
    ],

    messages: [
        {
            title: "Turn customer pop-up messages on or off",
            steps: [
                "Open Widget Customize → Widget Config.",
                "Find \"Show toast notifications on page load\" and switch it as you like.",
                "Save.",
            ],
        },
        {
            title: "Change the words of a message",
            steps: [
                "Open Widget Customize → Labels & Text.",
                "Search for the text you want, change it, and Save.",
            ],
        },
    ],

    currency: [
        {
            title: "Make sure everything uses your store's currency",
            steps: [
                "Open Settings and look at \"Your store\". Note the currency shown.",
                "Open Program Health. If a yellow banner says a backfill rule is in a different currency, open Points Backfill Rules.",
                "Open that rule and save it again, or create a new rule if it was already used.",
                "Everything else (reward values, prize values, the widget) follows your store currency on its own.",
            ],
        },
    ],
};
