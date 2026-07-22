// =============================================================================
// loox-setup/components/SetupSteps.jsx
// Plain-language, click-by-click instructions for connecting Loox review
// submissions to this app's points system via Shopify Flow. Written for a
// non-technical merchant — every step names the exact button/label they'll
// see on screen.
// =============================================================================

import { CopyField } from "./CopyField.jsx";

const BODY_TEMPLATE = `{
  "author": "{{author}}",
  "email": "{{email}}",
  "rating": "{{rating}}",
  "review_body": "{{reviewBody}}",
  "review_date": "{{reviewDate}}",
  "product_title": "{{productTitle}}",
  "product_id": "{{productId}}",
  "product_url": "{{productUrl}}",
  "photo_url": "{{photoUrl}}",
  "order_id": "{{orderId}}"
}`;

function Step({ number, title, children }) {
    return (
        <s-box paddingBlockEnd="large">
            <s-text variant="headingSm">Step {number}: {title}</s-text>
            <s-box paddingBlockStart="small-200">
                {children}
            </s-box>
        </s-box>
    );
}

export function SetupSteps({ webhookUrl }) {
    return (
        <s-section heading="Setup guide">
            <s-paragraph>
                This connects <strong>Loox Product Reviews</strong> to your loyalty
                program using <strong>Shopify Flow</strong> — a free, built-in Shopify
                automation tool. Once set up, every customer who leaves a Loox review
                will automatically earn the points you've configured on the{" "}
                <s-link href="/app/points-rules/review">Review Points</s-link> page.
            </s-paragraph>

            <s-box paddingBlock="base">
                <s-banner tone="info" heading="Before you start">
                    <s-paragraph>
                        Make sure the <strong>Loox ‑ Product Reviews</strong> app is
                        already installed on your store, and that you've turned on at
                        least one review type (text, photo, or video) on the{" "}
                        <s-link href="/app/points-rules/review">Review Points</s-link> page.
                    </s-paragraph>
                </s-banner>
            </s-box>

            <s-divider />

            <Step number="1" title="Open Shopify Flow">
                <s-paragraph>
                    From your Shopify admin, go to{" "}
                    <strong>Settings {"->"} Apps and sales channels</strong>, then open{" "}
                    <strong>Shopify Flow</strong>. If you don't see it listed, search
                    for "Flow" in your Shopify admin search bar — it's a free app by
                    Shopify and installs in one click.
                </s-paragraph>
            </Step>

            <Step number="2" title="Create a new workflow">
                <s-paragraph>
                    Inside Flow, click <strong>Create workflow</strong> (top right).
                    Give it a name you'll recognize later, e.g.{" "}
                    <strong>"Loox review {"->"} Loyalty points"</strong>.
                </s-paragraph>
            </Step>

            <Step number="3" title='Set the trigger to "New review"'>
                <s-paragraph>
                    Click <strong>Select trigger</strong>, then search for{" "}
                    <strong>"New review"</strong>. Choose the one that says{" "}
                    <strong>"Loox Reviews ‑ New review received."</strong>
                </s-paragraph>
            </Step>

            <Step number="4" title='Add a "Send HTTP request" action'>
                <s-paragraph>
                    Click the <strong>+</strong> button below the trigger to add an
                    action. Search for <strong>"Send HTTP request"</strong> and select
                    it.
                </s-paragraph>
            </Step>

            <Step number="5" title="Configure the request">
                <s-paragraph>Fill in the action exactly as follows:</s-paragraph>

                <s-box paddingBlockStart="small">
                    <s-text tone="subdued">HTTP method</s-text>
                    <s-paragraph>Choose <strong>POST</strong>.</s-paragraph>
                </s-box>

                <s-box paddingBlockStart="base">
                    <CopyField label="URL — paste this exactly" value={webhookUrl} />
                </s-box>

                <s-box paddingBlockStart="base">
                    <s-text tone="subdued">Headers</s-text>
                    <s-paragraph>
                        Click <strong>Add variable</strong> under Headers and add one
                        row:
                    </s-paragraph>
                    <s-stack direction="inline" gap="base">
                        <CopyField label="Key" value="Content-Type" />
                        <CopyField label="Value" value="application/json" />
                    </s-stack>
                </s-box>

                <s-box paddingBlockStart="base">
                    <s-text tone="subdued">Body</s-text>
                    <s-paragraph>
                        Click into the Body box and paste the block below exactly
                        as-is — the <code>{"{{ }}"}</code> placeholders are recognized
                        automatically by Flow and filled in from the review data.
                    </s-paragraph>
                    <CopyField value={BODY_TEMPLATE} multiline />
                </s-box>
            </Step>

            <Step number="6" title="Save and turn the workflow on">
                <s-paragraph>
                    Click <strong>Apply changes</strong> (or{" "}
                    <strong>Turn on workflow</strong> if this is a brand new one) in
                    the top-right corner. The workflow needs to be <strong>Active</strong>{" "}
                    — not "Draft" — for it to actually run.
                </s-paragraph>
            </Step>

            <Step number="7" title="Test it">
                <s-paragraph>
                    Use the <strong>Test your workflow</strong> panel on the right
                    side of the Flow editor to send a sample event through. Under the{" "}
                    <strong>Send HTTP request</strong> step, you should see it change
                    from <strong>Stopped</strong> to <strong>Success</strong>. If it
                    shows an error, see Troubleshooting below.
                </s-paragraph>
            </Step>

            <s-divider />

            <s-box paddingBlockStart="base">
                <s-text variant="headingSm">Troubleshooting</s-text>
                <s-box paddingBlockStart="small-200">
                    <s-ordered-list>
                        <s-list-item>
                            <strong>Test shows an error / "Unauthorized":</strong> the
                            URL was probably copied incorrectly, or cut off. Use the
                            Copy button above rather than typing it by hand, and
                            double-check nothing got pasted twice.
                        </s-list-item>
                        <s-list-item>
                            <strong>Reviews aren't earning points at all:</strong>{" "}
                            confirm the workflow shows <strong>Active</strong> (not
                            Draft) on the Flow workflows list, and that the matching
                            review type is turned on and has a positive point value on
                            the <s-link href="/app/points-rules/review">Review Points</s-link> page.
                        </s-list-item>
                        <s-list-item>
                            <strong>A customer says they didn't get points:</strong>{" "}
                            they need to already be enrolled in the loyalty program
                            (logged in and joined) under the same email address they
                            left the review with.
                        </s-list-item>
                    </s-ordered-list>
                </s-box>
            </s-box>
        </s-section>
    );
}
