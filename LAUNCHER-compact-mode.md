# Launcher: compact mode, float toggle, preview device switcher

Client request (Slack, Shuvo): a smaller icon-only launcher on mobile, and a
global switch for the button's swing animation. Everything below the first two
sections is the surrounding work needed to make those two land without leaving
obvious gaps for a follow-up request.

## What a merchant sees

Customize → Launcher Button gains eight settings:

| Setting | Values | Default |
|---|---|---|
| Compact icon-only button | Off / Mobile only / Always | Off |
| Points badge on compact button | Points / Dot / Hidden | Points |
| Compact button size | 40–72px | 48px |
| Distance from bottom (mobile) | length, empty = use desktop | empty |
| Side offset (mobile) | length, empty = use desktop | empty |
| Floating animation | Float / None | Float |
| Points badge background | colour | `#ffffff` |
| Points badge text colour | colour | launcher background |

The customize page header gains a **Preview at: Mobile / Desktop / Large
desktop** switcher. It changes what the preview imitates only — it is not part
of the saved config, does not count towards unsaved changes, and is untouched
by Discard and Reset all.

## Backward compatibility

**No migration, no backfill.** Every new variable has a CSS-level fallback
equal to the launcher's existing value, so a shop whose saved `cssVars`
predates these keys renders byte-identically to before. That is why the whole
feature is expressed as additive variables rather than as changes to the
existing rules.

The two mobile offsets are deliberately **not** declared in `ui.css`'s `:host`
block. They only exist if a merchant sets one, and `ui.css` reads them as
`var(--nbl-launcher-bottom-mobile, var(--nbl-launcher-bottom))`. Their default
in `CSS_DEFAULTS` is the empty string, which CSSOM defines as a call to
`removeProperty` — so "unset" is genuinely reachable rather than being stored
as an empty value that would invalidate the declaration it feeds.

## How the compact switch works

Every property that differs between expanded and compact is read from a
`--nbl-lc-*` variable, declared once with its expanded value in the `:host`
token block. Turning compact on reassigns those eleven variables; the rules
themselves are written once.

That structure exists because there are three ways in:

```
:host([data-nbl-compact="always"])         every viewport
@media (max-width: 749px) + ="mobile"      phones only
:host([data-nbl-preview="..."])            admin preview override
```

A rule-set-per-entry-point version would be the same forty lines copied three
times, and any future launcher tweak would have to be applied to all three or
silently diverge.

`data-nbl-compact` and `data-nbl-badge` are mirrored onto the shadow host from
the `cssVars` payload — the same treatment `--nbl-launcher-position` and
`--nbl-launcher-icon` already get, since none of them is a real CSS property.
See `app/widget-ui/ui/launcherMode.js`.

## Why the preview needed a device switcher

The preview is a fixed 390px `<iframe>`, and media queries resolve against the
frame's own viewport rather than the merchant's monitor. From inside it the
widget is permanently on a phone: every `max-width: 749px` rule fires, and
`ui.css`'s `min-width: 1200px` zoom block — the rendering most desktop
visitors actually get — never fires at all.

So "Mobile only" compact mode would have shown as icon-only in the preview no
matter what, with no way to check the desktop rendering. The large-desktop
blind spot predates this work; the switcher closes it too.

**These overrides cannot reach a storefront.** `data-nbl-preview` is set by
exactly one function, `bridge.setPreviewDevice`, whose only caller is
`public/widget/preview-bridge.js` — loaded solely by `preview.html` and never
bundled into the theme extension. With the attribute absent every override
selector fails to match and the storefront resolves through the normal media
queries. Nothing in the existing responsive CSS was removed or rewritten.

## Files changed

**Widget**
- `app/widget-ui/ui/styles/ui.css` — switch variables, compact rules, badge,
  mobile offsets, `prefers-reduced-motion`, preview override block
- `app/widget-ui/ui/components/LauncherButton.jsx` — badge, accessible label
- `app/widget-ui/ui/launcherMode.js` — **new**, mirrors modes onto the host
- `app/widget-ui/ui/App.jsx` — mode mirroring in `setCssVars`, new
  `setPreviewDevice` bridge method
- `app/widget-ui/ui/main.preact.jsx` — applies modes at boot, before the
  stylesheet is attached, so the first paint is already correct

**Admin**
- `app/layout/customize/constants/cssVarsConfig.js` — fields + `CSS_DEFAULTS`
- `app/layout/customize/livePreview/LivePreview.jsx` — device presets, wiring
- `app/layout/customize/components/PageHeader.jsx` — device switcher
- `app/layout/customize/route.jsx` — `previewDevice` state

**Preview harness**
- `public/widget/preview-bridge.js` — `previewDevice` message

No new dependencies, no new network calls, no database migration, and no new
JS execution path on the storefront.

## Build — required before deploy

`ui.css` is inlined into both bundles as `__NBL_CSS_TEXT__`, so a CSS-only
change still needs a rebuild:

```
npm run widget:build     # runs check-widget-css.js, then build.js
npm run deploy
```

Regenerates `extensions/theme-extension/assets/nbl-loyalty-ui.min.js` and
`public/widget/preview.min.js`. `scripts/check-widget-css.js` passes against
these changes.

## Testing checklist

Storefront:
- [ ] Default config renders identically to the current production widget
- [ ] Compact "Always" — circle button, badge, widget opens on tap
- [ ] Compact "Mobile only" — full pill above 749px, circle below
- [ ] Badge shows the balance; "Dot" hides the number; "Hidden" removes it
- [ ] Guest (logged out) never shows a badge
- [ ] Tap the badge itself — the widget must still open (`pointer-events: none`)
- [ ] `pointsPending` shows a spinner in the badge, not a stale number
- [ ] Mobile offsets move launcher, toast stack and panel together
- [ ] Floating animation "None" — button rests flat, no mid-cycle freeze
- [ ] OS-level reduced motion — no float regardless of the setting
- [ ] Screen reader announces the programme name and balance in compact mode

Admin:
- [ ] Device switcher changes the preview; Save/Discard/Reset ignore it
- [ ] "Large desktop" shows the 125% rendering without clipping
- [ ] "Desktop" with compact set to "Mobile only" shows the full pill
- [ ] "Desktop" with compact set to "Always" still shows the circle
- [ ] Reset all returns the preview to the default launcher

Regression:
- [ ] Page mode and full-screen mode unaffected
- [ ] Toast stack still sits directly above the launcher
- [ ] Left and right launcher positions both correct
