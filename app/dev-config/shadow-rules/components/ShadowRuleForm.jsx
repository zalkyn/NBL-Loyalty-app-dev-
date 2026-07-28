import { SaveBar } from "@app/components/saveBar/SaveBar";

/**
 * Create / edit form for a single points backfill rule. No file upload, so this
 * submits as a plain object (see _hooks.js) — no <form>/formRef needed,
 * unlike PrizeForm.jsx.
 *
 * When `hasEntries` is true (this rule has already awarded points to at
 * least one customer), the rate/currency fields are shown disabled with
 * an explanatory note — only name/description/active status stay
 * editable. This is a UX mirror of a real server-side rule (see
 * route.jsx's action): a rule's calculation must stay reproducible once
 * it's actually been used, so silently ignoring an edit here would be
 * misleading — the field is genuinely locked, not just discouraged.
 */
export function ShadowRuleForm({
    fs,
    isEdit,
    busy,
    hasEntries,
    entryCount,
    shopCurrencyCode,
    onPrimary,
    onDiscard,
}) {
    const rateLocked = hasEntries;

    return (
        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
            {/* ── Left ───────────────────────────────────────────── */}
            <s-box>
                <s-box paddingBlockEnd="base">
                    <s-section>
                        <s-text-field
                            label="Rule Name"
                            placeholder="e.g. Pre-install lifetime spend backfill"
                            value={fs.form.name}
                            disabled={busy}
                            error={fs.errorFor("name") ?? undefined}
                            onInput={(e) => fs.set("name", e.target.value)}
                            onBlur={() => fs.touchField("name")}
                        />
                        <s-box paddingBlockEnd="base" />
                        <s-text-area
                            label="Description / Notes (Optional)"
                            placeholder="e.g. One-time backfill for customers who joined before the app was installed."
                            value={fs.form.description}
                            rows={2}
                            disabled={busy}
                            onInput={(e) => fs.set("description", e.target.value)}
                        />
                    </s-section>
                </s-box>

                <s-box paddingBlockEnd="base">
                    <s-section>
                        <s-text variant="headingSm">Rate</s-text>
                        {rateLocked && (
                            <s-box paddingBlockStart="small" paddingBlockEnd="small">
                                <s-paragraph tone="subdued">
                                    This rule has already awarded points to {entryCount?.toLocaleString() ?? "some"} customer(s) —
                                    the rate and currency are locked so a completed run always stays explainable from its own
                                    records. Deactivate this rule and create a new one if you need a different rate.
                                </s-paragraph>
                            </s-box>
                        )}
                        <s-box paddingBlockStart="small" />

                        <s-select
                            label="Rate Type"
                            value={fs.form.rateType}
                            disabled={busy || rateLocked}
                            error={fs.errorFor("rateType") ?? undefined}
                            onChange={(e) => fs.set("rateType", e.target.value)}
                        >
                            <s-option value="FIXED">Fixed — same points for every qualifying customer</s-option>
                            <s-option value="PER_AMOUNT">Per amount spent — points scale with lifetime spend</s-option>
                        </s-select>

                        <s-box paddingBlockStart="base" />

                        {fs.form.rateType === "FIXED" ? (
                            <s-number-field
                                label="Fixed Points"
                                suffix="pts"
                                step={1} min={1}
                                value={fs.form.fixedPoints}
                                disabled={busy || rateLocked}
                                details="Awarded to every customer who matches the audience, regardless of how much they've spent."
                                error={fs.errorFor("fixedPoints") ?? undefined}
                                onInput={(e) => fs.set("fixedPoints", e.target.value)}
                                onBlur={() => fs.touchField("fixedPoints")}
                            />
                        ) : (
                            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                                <s-number-field
                                    label={`Amount (${shopCurrencyCode ?? "shop currency"})`}
                                    step={0.01} min={0.01}
                                    value={fs.form.perAmount}
                                    disabled={busy || rateLocked}
                                    details="e.g. 10 — every this-much spent earns the points below."
                                    error={fs.errorFor("perAmount") ?? undefined}
                                    onInput={(e) => fs.set("perAmount", e.target.value)}
                                    onBlur={() => fs.touchField("perAmount")}
                                />
                                <s-number-field
                                    label="Points"
                                    suffix="pts"
                                    step={1} min={1}
                                    value={fs.form.pointsPerUnit}
                                    disabled={busy || rateLocked}
                                    details="e.g. 1 — so 10 spent = 1 pt, 505 spent = 50 pts (rounded down)."
                                    error={fs.errorFor("pointsPerUnit") ?? undefined}
                                    onInput={(e) => fs.set("pointsPerUnit", e.target.value)}
                                    onBlur={() => fs.touchField("pointsPerUnit")}
                                />
                            </s-grid>
                        )}

                        <s-box paddingBlockStart="base" />

                        <s-number-field
                            label="Max Points Per Customer (Optional)"
                            suffix="pts"
                            step={1} min={1}
                            value={fs.form.maxPoints}
                            disabled={busy || rateLocked}
                            details="Leave blank for no ceiling."
                            error={fs.errorFor("maxPoints") ?? undefined}
                            onInput={(e) => fs.set("maxPoints", e.target.value)}
                            onBlur={() => fs.touchField("maxPoints")}
                        />

                        <s-box paddingBlockStart="base" />

                        <s-text-field
                            label="Currency"
                            value={fs.form.currencyCode ?? shopCurrencyCode ?? ""}
                            disabled
                            details="Always your shop's current currency — re-verified automatically on every save, cannot be edited here."
                        />

                        {/* The loader treats a failed shopCurrency() call as
                            best-effort and falls back to null, which is right
                            — one flaky Shopify call shouldn't take the page
                            down. But the field then renders empty, and the
                            save WILL be rejected, because route.jsx's action
                            re-verifies the currency and refuses to guess.
                            Saying so here turns a confusing rejection at the
                            end into a known condition at the start. */}
                        {!fs.form.currencyCode && !shopCurrencyCode && (
                            <s-box paddingBlockStart="small">
                                <s-banner tone="warning">
                                    <s-paragraph>
                                        Couldn't read your shop's currency just now. You can keep editing, but saving
                                        will fail until it loads — reload the page and try again.
                                    </s-paragraph>
                                </s-banner>
                            </s-box>
                        )}
                    </s-section>
                </s-box>

                <s-section>
                    <s-heading>Active Status</s-heading>
                    <s-box paddingBlockEnd="small" />
                    <s-switch
                        labelAccessibilityVisibility="exclusion"
                        label={fs.form.isActive ? "Active" : "Inactive"}
                        checked={fs.form.isActive}
                        disabled={busy}
                        onChange={(e) => fs.set("isActive", e.target.checked)}
                    />
                    <s-box paddingBlockStart="small">
                        <s-paragraph tone="subdued">
                            Must be active before a backfill run can use this rule — see the Points Backfill page.
                        </s-paragraph>
                    </s-box>
                </s-section>
            </s-box>

            {/* ── Right ──────────────────────────────────────────── */}
            <s-box padding="base" background="base" border-width="base" border-color="base" border-radius="base">
                <s-heading>Preview</s-heading>
                <s-box paddingBlockStart="small">
                    <s-paragraph tone="subdued">
                        {fs.form.rateType === "FIXED"
                            ? `Every matched customer gets ${Number(fs.form.fixedPoints || 0).toLocaleString()} pts, regardless of spend.`
                            : `Every ${Number(fs.form.perAmount || 0).toLocaleString()} ${shopCurrencyCode ?? ""} spent earns ${Number(fs.form.pointsPerUnit || 0).toLocaleString()} pt(s), rounded down.`}
                        {fs.form.maxPoints ? ` Capped at ${Number(fs.form.maxPoints).toLocaleString()} pts per customer.` : ""}
                    </s-paragraph>
                </s-box>
            </s-box>

            {/* ── SaveBar ──────────────────────────────────────────── */}
            <SaveBar
                visible={fs.isDirty || busy}
                position="bottom-center"
                message={isEdit ? "You have unsaved changes" : "New points backfill rule — not saved yet"}
                primaryLabel={isEdit ? "Update Rule" : "Save Rule"}
                secondaryLabel="Discard"
                loading={busy}
                disabled={busy}
                onPrimary={onPrimary}
                onSecondary={onDiscard}
            />
        </s-grid>
    );
}
