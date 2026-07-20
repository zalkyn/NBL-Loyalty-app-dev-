/**
 * @file dev-config/customer-sync/components/SingleCustomerSyncSection.jsx
 * @description Look up one customer by email, then sync/re-sync, or
 * empty their config / delete their record entirely — fixing one
 * specific account without touching anyone else.
 */

import { MODAL_ID } from "../_hooks";

export function SingleCustomerSyncSection({
    emailInput, setEmailInput, handleEmailSearch, handleEmailKeyDown,
    customerFetcher, customerActionSubmitting,
    searchedEmail, foundCustomer, toolFlags,
    requestSyncCustomer, requestEmptyOneCustomerConfig, requestDeleteCustomerRecord,
}) {
    return (
        <s-section heading="Single Customer Sync">
            <s-paragraph tone="subdued">
                Fix or test one specific customer without affecting anyone
                else. Search by email to pull up their account, then act on
                just that person. Use "Sync" / "Resync" to refresh their
                loyalty data from the database (safe, the everyday fix if one
                customer's numbers look wrong). The red buttons — only shown if
                you've enabled them under Dev Config &gt; Maintenance tools —
                delete that customer's data and can't be undone, so they're for
                testing, not routine use.
            </s-paragraph>

            <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="base">
                    <s-text-field
                        label="Customer email"
                        labelAccessibilityVisibility="exclusive"
                        placeholder="customer@example.com"
                        value={emailInput}
                        disabled={customerActionSubmitting}
                        onInput={(e) => setEmailInput(e.target.value)}
                        onKeyDown={handleEmailKeyDown}
                    />
                    <s-button
                        variant="secondary"
                        disabled={customerActionSubmitting || !emailInput.trim()}
                        onClick={handleEmailSearch}
                    >
                        Search
                    </s-button>
                </s-stack>
            </s-box>

            {customerFetcher.data?.message && (
                <s-box paddingBlockStart="base">
                    <s-paragraph tone={customerFetcher.data.ok ? "success" : "critical"}>
                        {customerFetcher.data.message}
                    </s-paragraph>
                </s-box>
            )}

            {searchedEmail && !foundCustomer && (
                <s-box paddingBlockStart="base">
                    <s-paragraph tone="subdued">No customer found for "{searchedEmail}".</s-paragraph>
                </s-box>
            )}

            {foundCustomer && (
                <s-box paddingBlockStart="base">
                    <s-text fontWeight="bold">{foundCustomer.name || foundCustomer.email}</s-text>
                    <s-box>
                        <s-text tone="subdued">
                            {foundCustomer.email} — {foundCustomer.points.toLocaleString()} pts — {foundCustomer.lastSyncedVersionKey ? "synced" : "never synced"}
                        </s-text>
                    </s-box>
                    <s-box paddingBlockStart="base">
                        <s-stack direction="inline" gap="base">
                            {foundCustomer.lastSyncedVersionKey ? (
                                <s-button
                                    variant="secondary"
                                    disabled={customerActionSubmitting}
                                    commandFor={MODAL_ID}
                                    command="--show"
                                    onClick={() => requestSyncCustomer(foundCustomer, "resync")}
                                >
                                    Resync
                                </s-button>
                            ) : (
                                <s-button
                                    variant="secondary"
                                    disabled={customerActionSubmitting}
                                    commandFor={MODAL_ID}
                                    command="--show"
                                    onClick={() => requestSyncCustomer(foundCustomer, "sync")}
                                >
                                    Sync
                                </s-button>
                            )}
                            {toolFlags.showEmptyConfigButton && foundCustomer.lastSyncedVersionKey && (
                                <s-button
                                    variant="secondary"
                                    tone="critical"
                                    disabled={customerActionSubmitting}
                                    commandFor={MODAL_ID}
                                    command="--show"
                                    onClick={() => requestEmptyOneCustomerConfig(foundCustomer)}
                                >
                                    Empty config
                                </s-button>
                            )}
                            {toolFlags.showDeleteCustomerButton && (
                                <s-button
                                    variant="secondary"
                                    tone="critical"
                                    disabled={customerActionSubmitting}
                                    commandFor={MODAL_ID}
                                    command="--show"
                                    onClick={() => requestDeleteCustomerRecord(foundCustomer)}
                                >
                                    Delete record entirely
                                </s-button>
                            )}
                        </s-stack>
                    </s-box>
                </s-box>
            )}
        </s-section>
    );
}
