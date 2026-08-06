// =============================================================================
// scripts/check-widget-css.js
//
// Structural checks on app/widget-ui/ui/styles/ui.css, run before every
// widget build (see package.json's widget:build).
//
// These exist because two real bugs shipped from this file, and neither was
// the kind a person catches by reading a diff:
//
//   1. An edit left prose outside a comment. esbuild recovered with warnings
//      instead of failing, so the build "succeeded" with mangled CSS.
//
//   2. A bulk selector rewrite over-matched and attached the .nbl-page-wide
//      qualifier to page mode's STRUCTURAL rules — the ones that make the
//      scroll area static and the wrapper auto-height. Below the wide
//      threshold the scroll area stayed position:absolute inside an
//      auto-height container, so the widget rendered at zero height and
//      vanished entirely. Everything looked fine on a desktop viewport.
//
// The partition below is therefore explicit and exhaustive: a new page-mode
// rule fails this check until it is deliberately classified. That is the
// point — "is this rule structural or cosmetic" is exactly the question that
// went unasked.
// =============================================================================

import { readFileSync } from "node:fs";

const CSS_PATH = "app/widget-ui/ui/styles/ui.css";
const WIDE = ".nbl-page-wide";

// Page mode IS these rules. They must apply at every width — a narrow widget
// is still an in-flow block that needs a static scroll area and viewport-fixed
// overlays.
const STRUCTURAL = [
  ".nbl-widget-scroll-area",
  ".nbl-widget-wrapper",
  ".nbl-guest",
  ".nbl-sticky-top",
  ".nbl-notification-slot",
  ".nbl-image-preview-overlay",
  ".nbl-provision-overlay",
  ".nbl-notify-panel",
];

// The multi-column treatment. Only correct once the widget is actually wide;
// applied to a ~350px block it forces three shortcut cards into ~100px columns
// and breaks labels mid-word.
const WIDE_ONLY = [
  ".nbl-widget-wrapper > *", // expanded type scale
  ".nbl-nav__scroll",
  ".nbl-nav__item",
  ".nbl-nav__chevron",
  ".nbl-header__top",
  ".nbl-header__title",
  ".nbl-home-nav",
  ".nbl-home-nav__item",
  ".nbl-home-nav__label",
  ".nbl-item-list__empty",
  ".nbl-activity-table__empty",
  ".nbl-widget-body",
];

const css = readFileSync(CSS_PATH, "utf8");
const errors = [];

// ── 1. Comments balanced, and no prose stranded outside one ────────────────
let depth = 0;
let line = 1;
for (let i = 0; i < css.length - 1; i++) {
  if (css[i] === "\n") line++;
  if (css.startsWith("/*", i)) {
    if (depth > 0) errors.push(`nested /* at line ${line}`);
    depth++;
    i++;
  } else if (css.startsWith("*/", i)) {
    if (depth === 0) errors.push(`stray */ at line ${line}`);
    depth--;
    i++;
  }
}
if (depth !== 0) errors.push("unclosed /* comment at end of file");

const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

const open = (stripped.match(/{/g) || []).length;
const close = (stripped.match(/}/g) || []).length;
if (open !== close) errors.push(`unbalanced braces: ${open} { vs ${close} }`);

for (const raw of stripped.split("\n")) {
  const t = raw.trim();
  if (!t || "@.:*#[&>".includes(t[0])) continue;
  if (/[{};:,()]/.test(t)) continue;
  if (/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(t)) {
    errors.push(`prose outside a comment: ${JSON.stringify(t.slice(0, 60))}`);
  }
}

// ── 2. Page-mode selectors are classified, and classified correctly ────────
const pageSelectors = stripped
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith(".nbl-widget-container") && l.includes("--page"));

for (const sel of pageSelectors) {
  // Rules on the container itself (.active, .pos-left, the base block) carry
  // no descendant part and are neither structural nor cosmetic in this sense.
  const descendant = sel.split(" ").slice(1).join(" ").replace(/[,{]\s*$/, "").trim();
  if (!descendant) continue;

  const key = descendant.replace(/:has\([^)]*\)/g, "").replace(/::?[a-z-]+$/, "").trim();
  const isStructural = STRUCTURAL.includes(key);
  const isWideOnly = WIDE_ONLY.includes(key);
  const hasWide = sel.includes(WIDE);

  if (!isStructural && !isWideOnly) {
    errors.push(
      `unclassified page-mode rule: "${sel}"\n` +
      `      Add "${key}" to STRUCTURAL (applies at every width) or ` +
      `WIDE_ONLY (needs ${WIDE}) in ${CSS_PATH.replace(/.*\//, "")}'s checker.`
    );
  } else if (isStructural && hasWide) {
    errors.push(
      `structural rule is gated on ${WIDE}: "${sel}"\n` +
      `      This defines what page mode is; gating it hides the widget below the threshold.`
    );
  } else if (isWideOnly && !hasWide) {
    errors.push(
      `wide-layout rule is missing ${WIDE}: "${sel}"\n` +
      `      Applied to a narrow block this forces multi-column layout into ~100px columns.`
    );
  }
}

// ── 3. The app block's stretch rule ────────────────────────────────────────
// Page-mode sizing rests entirely on the block wrapper filling the section's
// content column, which rests entirely on these two declarations. `stretch`
// applies ONLY when the cross-size property is auto, so a `width` on the same
// rule silently disables both — the browser skips stretch for an item with a
// specified width, and the percentage then resolves against the same
// shrink-to-fit parent it was supposed to escape.
//
// That failure is invisible in the theme editor, which is what makes it worth
// a check: design mode also renders the setup notice, whose long text widens
// the wrapper by accident, so the editor showed a correctly sized widget
// while the live storefront collapsed it to its own content width.
const BLOCK_PATH = "extensions/theme-extension/blocks/loyalty-page.liquid";
const liquid = readFileSync(BLOCK_PATH, "utf8");

const ruleStart = liquid.indexOf(".nbl-page-block {");
if (ruleStart === -1) {
  errors.push(`${BLOCK_PATH}: .nbl-page-block rule not found`);
} else {
  const body = liquid.slice(ruleStart, liquid.indexOf("}", ruleStart));
  const decls = body.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const prop of ["align-self", "justify-self"]) {
    if (!new RegExp(`${prop}\\s*:\\s*stretch`).test(decls)) {
      errors.push(`${BLOCK_PATH}: .nbl-page-block is missing "${prop}: stretch"`);
    }
  }
  if (/(^|[;{]\s*)width\s*:/.test(decls)) {
    errors.push(
      `${BLOCK_PATH}: .nbl-page-block declares a width\n` +
      `      align-self/justify-self: stretch only apply when width is auto, so this ` +
      `disables both and the block collapses to its content width on the live storefront ` +
      `(the theme editor hides it — the design-mode notice widens the wrapper by accident).`
    );
  }
}

if (errors.length) {
  console.error(`\n${CSS_PATH} failed ${errors.length} check(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("");
  process.exit(1);
}

console.log(
  `${CSS_PATH}: ok — comments and braces balanced, ` +
  `${pageSelectors.length} page-mode selectors classified.\n` +
  `${BLOCK_PATH}: ok — block wrapper stretches with no competing width.`
);