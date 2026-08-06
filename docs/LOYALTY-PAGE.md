# Dedicated loyalty page

The widget can now render **inline inside a merchant's own page**, so the page
can carry explainer videos, FAQs, "how it works", terms and anything else
around it — content that would crowd the floating widget but has room on a
page. The floating widget stays the entry point; its header expand control
becomes a link into the page.

Nothing changes for a shop that doesn't set one up.

---

## 1. How it works

Three pieces, and the third is the only new mechanism:

| Piece | Role |
| --- | --- |
| `blocks/loyalty.liquid` (app **embed**) | Unchanged. Loads the bundle and supplies `appConfig` / `customer` / `routes` on every storefront page. |
| `blocks/loyalty-page.liquid` (app **block**, new) | Merchant drops this on their page in the theme editor. Renders an empty target element and registers it on `NBL_v1.pageMount`. No script, no data. |
| `main.preact.jsx` → `findPageMount()` | At boot, looks for that target. Found → mount the shadow host there in `page` mode. Not found → `document.body` in `floating` mode, exactly as before. |

**One bundle, one boot, two possible mount targets.** The page block
deliberately loads no javascript of its own — a second `<script src>` pointing
at the same file would execute the bundle twice and mount two widgets, each
with its own resync timers and toast state. `NBL_v1.__booted` guards that
anyway.

The block's inline script runs during HTML parsing (the app embed's bundle is
`defer`red and injected at end of `<body>`), so the registration is always in
place before `boot()` reads it. Ordering is not a race.

### Mode is decided once

`initialData.mode` is computed in `boot()`, before the first render — not
derived later — so there's never a frame where a floating launcher paints on
a page that's about to render the widget inline. `App.jsx` treats it as
immutable, which it is: it's a function of which DOM node we mounted into.

---

## 2. What changed, and why

### `page` is a third mode, not a full-screen variant

`WidgetShell` already emitted exactly one `nbl-widget-container--<mode>` class
and reserved `'page'` for this. The split in `ui.css` follows the same line:

- **Shared with full screen** — everything about how the view looks when it's
  wide: type scale, nav rail (all tabs visible, centred, no chevrons), header
  content alignment, Home shortcut cards as columns, the 860px content column,
  empty-state sizing. These are paired selectors on the existing rules, not
  copies, so the two wide modes can't drift apart.
- **Page-specific** — positioning, flow and stacking only. That's the real
  difference: the other two modes are overlays sized against the viewport;
  this one is a block in someone else's document.

### Flow, not a nested scrollport

The overlay modes absolutely position `.nbl-widget-scroll-area` inside a
fixed-height container and scroll `.nbl-widget-wrapper` internally. Page mode
undoes that: the container has no height of its own, content sets it, and the
**page** scrolls.

Nested scrolling would have been the smaller diff and the wrong call — a tall
inner scroller inside a scrolling page is a known touch-device trap, where a
flick is swallowed by whichever scroller happens to be under the thumb.

Consequences, all deliberate:

- **Header is not sticky.** It has no scrollport to stick within, and pinning
  it to the viewport would collide with the theme's own sticky header
  directly above. Tab switches keep the rail in view by scrolling to it
  instead (`revealPageWidget()`, which only ever scrolls *up*, never down).
- **Compact header never engages.** `useCompactHeader` watches
  `wrapper.scrollTop`, which is permanently 0 here. `WidgetShell` gates it on
  `mode === 'floating'` regardless, so it's correct by construction.
- **`min-height`** (merchant setting) stops a nearly-empty tab from collapsing
  the block to a header and two lines, which reads as broken rather than empty.
- **Optional internal scrolling** is available per breakpoint, off by default.
  When on, the wrapper gets a `max-height` and becomes a real scrollport, and
  the header switches to `sticky` in the same breath — the liquid sets both
  from one setting so they can't get out of step.

### Width must be a length, not a percentage

`width: 100%; max-width: <setting>` looks like the obvious way to size the
block and is wrong. A percentage width resolves against the containing block;
when an ancestor is shrink-to-fit — a grid item in an auto-sized column, which
is what a modern theme's section layout gives us — the percentage is treated
as auto for intrinsic sizing and then resolves to whatever the content needed.
The block sized itself to its own contents, so **every tab was a different
width** (Home has three shortcut cards side by side, Referral a single
column), and the merchant's width setting never applied at all, because
max-width only caps a width already smaller than it.

Page mode therefore uses `width: var(--nbl-page-max-width)` with
`max-width: 100%`, and the mobile setting is a plain percentage — which is
safe only because the host's width is measured and pinned (below). `vw` was
tried first and is wrong: it measures the whole viewport, so 100% came out
wider than the theme's content column and overflowed the right gutter. The length is definite, so it survives a shrink-to-fit
ancestor and the ancestor sizes to it instead. `max-width: 100%` still shrinks
it correctly on narrow screens, because shrink-to-fit is
`min(max-content, available)` — the ancestor can never exceed the space it has.

### The block wrapper must override the section's item alignment

Two CSS declarations in `loyalty-page.liquid` carry the entire page-mode
sizing model:

```css
.nbl-page-block {
  align-self: stretch;    /* flex sections */
  justify-self: stretch;  /* grid sections */
}
```

Theme sections lay their blocks out in a flex or grid container and expose the
theme's own content-alignment setting on it. Horizon's page sections are the
flex case — `.layout-panel-flex--column` carrying
`--horizontal-alignment: flex-start`, which drives `align-items`. In a
**column** flex container the cross axis is horizontal, so `align-items:
flex-start` sizes every item to its own content instead of filling the
container. The block wrapper therefore collapsed to exactly the width of the
widget inside it, and from there:

- the widget had nothing real to resolve a percentage against, so each tab
  rendered at whatever its content needed — Home (three shortcut cards side by
  side) wider than Referral (one column)
- `max-width` had nothing to clamp, so a full-width mobile setting spilled past
  the theme's right gutter
- `margin: auto` had no free space to distribute, so the **Alignment setting
  did nothing**

`align-self` overrides `align-items` for this one item; `justify-self` does the
same for `justify-items` in grid-based themes. The wrapper then fills the
section's content column — gutters included, because that column *is* the
theme's own — while the rest of the section keeps the merchant's chosen
alignment.

With that in place the widget's own sizing is two ordinary percentages:

```css
width: 100%;
max-width: var(--nbl-page-max-width, 1100px);   /* mobile overrides the cap */
```

which gives responsive behaviour in both directions for free: a 1100px desktop
setting simply doesn't apply on a 700px screen, because 100% is already
smaller than the cap.

**`align-self` only applies when the cross-size property is `auto`.** An
earlier revision also set `width: 100%` on the wrapper, which silently
disabled both stretch declarations — and the failure was invisible in the
theme editor, because design mode renders the setup notice whose long text
widened the wrapper by accident. The live storefront had no notice and
collapsed. `scripts/check-widget-css.js` now fails the build on a `width` in
that rule.

### The width is also measured, because CSS alone was not enough

Even with the stretch in place, whether it takes effect depends on how a
particular theme lays sections out, and section layouts vary more than any
single assumption survives. Six CSS-only approaches were tried and each traded
one theme's layout for another's — the full list is in the table below,
preserved so they aren't retried.

`main.preact.jsx`'s `installPageWidthSync` therefore reads the width off the
element the theme itself uses to bound content: Horizon's
`.section-content-wrapper`, or failing that the enclosing `.shopify-section`,
`<section>` or `<main>`. The **narrowest** match wins, not the nearest — a
page nests several, and the full-bleed `.shopify-section` matches as readily
as the padded column inside it. A `ResizeObserver` on that element keeps it
current, and each measurement releases the previously written width first so
it can shrink as well as grow.

`NBL_v1.__debugPageWidth()` in the console prints the whole ancestor chain with
widths, paddings and layout properties — the first thing to run if a block
ever fails to line up.

**Approaches that failed**, kept as a record:

| Attempt | Why it failed |
| --- | --- |
| `width: 100%` on the container | Resolved against a collapsed wrapper — content-sized, so every tab differed. |
| Definite `width: <setting>` | Grid sections size an auto track to max-content and let it overflow; 1100px on a 390px screen went past the right edge. |
| JS walk to the first *wider* ancestor | On a full-bleed grid whose content column is a track, that ancestor is the full-bleed grid. Rendered at viewport width. |
| `width: 100vw` + `max-width: 100%` | Starved fr-track gutters to zero — edge-to-edge past the theme's margins. |
| `width: stretch` / `-webkit-fill-available` | Fills the containing block's available space, which in a collapsed chain is nothing. Rendered as a 0px sliver. |
| CSS container query | `container-type` containment zeroed the ancestors' only sizing input; same 0px collapse, and it would have trapped the fixed overlays. |

### Wide layout is a container query, not a media query

Full screen can take the wide layout unconditionally — it is, by definition,
the whole viewport. Page mode cannot: it has a merchant-set width that may be
400px on a 1600px monitor, and on a phone it gets roughly the same ~345px the
floating panel does. Sharing the full-screen rules with it outright forced the
Home shortcuts into three ~100px columns with labels breaking mid-word, and
told the nav rail to centre content that didn't fit.

A media query is the wrong instrument here: the viewport being 1600px wide
says nothing about a widget set to 400px. The question is only ever "how much
room does *this widget* have", which is what a container query asks. Page mode
therefore restates the wide rules inside
`@container nblpage (min-width: 620px)` rather than sharing the full-screen
ones; below that width the base 390px-panel layout is simply left alone, which
is already correct.

The container context is `.nbl-widget-wrapper` — not the container, not the
scroll area — and that choice is load-bearing. `container-type` applies
`contain: layout`, which makes the element a containing block for
fixed-position descendants. The notification slot and image preview are
`position: fixed` in page mode *precisely* so they can escape a tall block and
pin to the viewport; putting the containment on any ancestor of theirs would
trap them again. The wrapper holds the header, nav, body and guest panel, and
none of those overlays.

Type-scale tokens land on `.nbl-widget-wrapper > *` rather than the wrapper
itself, since an element can't be styled by its own container query — they're
inherited custom properties, so one level down reaches everything below.

### Settings cross the shadow boundary as custom properties

The widget is built by Preact inside a shadow root and knows nothing about
theme settings; `ui.css` lives inside that root and can't see the light DOM.
Custom properties are the one thing that crosses in that direction, so every
block setting is plumbed that way — including the on/off ones, which pass
their off state as the CSS value that *means* off (`none`, `visible`,
`static`) rather than as a flag `ui.css` would have to branch on.

### Stacking — the subtle one

The floating container sits at `z-index: 1000000002` with
`isolation: isolate`. Both are wrong here, and the second is the dangerous one:
`isolation` creates a stacking context, which would **trap** the notification
sheet and image preview inside the widget's own layer. A theme header at
`z-index: 100` would then paint over a modal that is supposed to be covering
it. Page mode uses `z-index: auto` and no isolation, so those overlays
participate in the root stacking context and their own high z-indexes work.

### Overlays are pinned to the viewport

The notification sheet and image preview are absolute children of the
container. In the overlay modes "bottom of the container" and "bottom of what
the customer can see" are the same thing. Here they are not — this block can
be taller than the viewport, so unchanged rules would open a claim
confirmation below the fold.

Fixed is applied to the **slot**, not to each overlay: the slot then provides
a viewport-sized containing block and the absolutely-positioned children keep
working off it unchanged, including the shared full-screen sizing for
`.nbl-notify-panel`. A dimming scrim is added (page mode only, via `:has()`,
purely visual) because here the sheet opens over the merchant's own content
and needs to say the rest of the page isn't the thing to look at.

### `?nbl=` means two different things

| Mode | Meaning | Behaviour |
| --- | --- | --- |
| floating | one-shot "open the widget here" | read, then **stripped**, so back-navigation and refresh don't force the panel open again |
| page | the page's own view state | read and **kept**, and rewritten on every tab change |

Page mode uses `replaceState`, not `pushState`: pushing would make each tab
click a history entry, so a customer who browsed four tabs would need five
Back presses to leave. `home` writes no param at all rather than
`?nbl=home`.

`TAB_URL_NAMES` is an explicit inverse of `DEEP_LINK_TABS` rather than a
runtime inversion — `DEEP_LINK_TABS` is deliberately many-to-one (`earn` and
`points` both resolve to the Earn tab), so inverting it would pick a winner by
key order. Not something to leave to chance for a URL customers see and share.

### Header: one expand control, one meaning

**Customize → Behaviour → "Expand button opens"** is the single explicit
choice:

| Setting | Expand control |
| --- | --- |
| Full screen (default) | toggles the floating panel to a full-screen view |
| Loyalty page | **link** to `display.pageUrl`, carrying the current tab |

The two destinations get different icons — corner arrows (`expand`) for "this
grows to fill the screen", box-with-outgoing-arrow (`open-page`) for "this
takes you somewhere else". They're mutually exclusive, so a customer only ever
learns one, but the mark should still match the promise.
| Nothing | no expand control |
| — (page mode) | not shown; neither is Close |

One setting rather than a toggle plus an "if this other field happens to be
filled in" rule — a control whose behaviour changes based on whether an
unrelated text box is empty is not something a merchant can predict by looking
at it.

Shops that saved a config before this existed have only the legacy
`allowFullscreen` toggle, so `App.jsx` falls back to it: on → `fullscreen`,
off → `none`. Their widget behaves exactly as it did, with no migration.

`buildPageLink()` returns `''` for anything that isn't a relative path, so
picking "Loyalty page" and then pasting a full `https://` URL — or not filling
the field in yet — hides the control rather than shipping one that 404s.

It's a real `<a href>`, not a button with a location assignment —
middle-click, cmd-click and "copy link address" are things customers do with a
control that navigates, and all of them silently do nothing on a `<button>`.

### The stored full-screen preference has to be gated

`isFullscreen` is a per-device `localStorage` value, so it arrives already
true for any customer who expanded the widget before — including after the
merchant has since switched the expand button to "Loyalty page" or "Nothing".
Those configurations render no collapse control, so honouring the stored
preference opened the widget full screen **with no way out of it**: tap the
launcher, and the widget owns the screen permanently.

`App.jsx` therefore derives `fullscreenActive = isFullscreen &&
showFullscreenToggle` and routes the rendered mode, the launcher's hidden
state and the body scroll lock through it. The stored value is left alone
rather than cleared, so the customer's preference is still there if the
merchant switches back to "Full screen".

### The page link must not navigate the admin preview

The Customize screen renders this same widget inside an iframe on
`preview.html`. A relative `href` there resolves against the admin origin, so
clicking expand navigated the iframe off the preview document — widget,
launcher and preview all gone, recoverable only by reloading the settings
page.

The control still renders in the preview (a button that's absent there but
present on the storefront is its own kind of wrong); `App.jsx` passes an
`onPageLinkClick` that calls `preventDefault`, gated on `bridgeRef`, which is
only ever defined in the preview.

### One real bug found and fixed on the way

`isFullscreen` is seeded from a per-device `localStorage` preference. Without
an `isPage` guard on the body-scroll-lock effect, a customer who had once
expanded the floating widget would arrive at the loyalty page with it already
`true` — and the page would silently lock its own scroll on load. Nothing
would look wrong; the page would just refuse to move.

### Theme-editor remount

Adding an app block re-renders only that section (Section Rendering API), with
no page reload — so the bundle never runs again and the merchant sees an empty
box with no reason to suspect a refresh would fix it. The block's inline
script (design mode only) calls `NBL_v1.__remount()`, which unmounts properly
via `render(null, ...)` — that's what runs the effect cleanups owning the
resync interval, scroll/wheel listeners and toast timers — then boots again
against the element that now exists.

---

## 3. Files touched

| File | Change |
| --- | --- |
| `extensions/theme-extension/blocks/loyalty-page.liquid` | **new** — the app block, and every merchant-facing setting |
| `app/widget-ui/ui/main.preact.jsx` | `findPageMount()`, boot guard, mount target, `mode` in `initialData`, `__remount` |
| `app/widget-ui/ui/App.jsx` | `isPage`; launcher/toasts skipped; toasts disabled; scroll-lock guard; mode-aware deep link; `syncPageUrl` / `revealPageWidget`; `pageUrl` + control flags |
| `app/widget-ui/ui/components/WidgetShell.jsx` | `page` branch, compact gate, `role="region"` |
| `app/widget-ui/ui/components/Header.jsx` | page link vs full-screen toggle; no controls in page mode |
| `app/widget-ui/ui/components/Nav.jsx` | `role="tablist"` + `aria-selected` |
| `app/widget-ui/ui/utils.js` | `buildPageLink()` |
| `app/widget-ui/ui/styles/ui.css` | 12 full-screen rules shared with page mode; type scale split out; page-mode block |
| `app/layout/customize/constants/cssVarsConfig.js` | `display.pageUrl` default + Behaviour field |

No database, metafield, scope, webhook or API change. No new dependency. The
page block adds no bytes to storefront pages that don't have it.

---

## 4. Build and deploy

```bash
npm run widget:build     # checks ui.css, then rebuilds both bundles
npm run deploy           # ships the theme extension (both blocks)
```

`widget:build` runs `scripts/check-widget-css.js` first, and fails the build
rather than shipping a broken stylesheet. It exists because two real bugs got
through here, neither visible in a diff:

- an edit left prose outside a comment; esbuild recovered with *warnings* and
  produced mangled CSS from a "successful" build
- a bulk selector rewrite over-matched and gated page mode's **structural**
  rules on `.nbl-page-wide`, so below ~620px the scroll area stayed
  `position: absolute` inside an auto-height container and the widget rendered
  at zero height — invisible, with nothing in the page to say why, and fine on
  a desktop viewport

The checker holds an explicit, exhaustive partition of every page-mode
selector into STRUCTURAL (applies at all widths) and WIDE_ONLY (needs
`.nbl-page-wide`). A new page-mode rule fails the build until it is
classified, which forces the question that went unasked. Run it alone with
`npm run widget:check`.

`widget:build` emits `extensions/theme-extension/assets/nbl-loyalty-ui.min.js`
and `public/widget/preview.min.js` from the same source, with `ui.css`
inlined as `__NBL_CSS_TEXT__`. Both outputs must be rebuilt — the admin live
preview shares the source.

---

## 5. Merchant setup

**Prerequisite:** the *NB Loyalty* app embed must stay enabled (Theme editor →
App embeds). The page block renders an empty box without it; in the theme
editor it shows a notice saying so.

1. **Check the theme accepts app blocks.** Dawn and most OS 2.0 themes ship an
   **Apps** section (`sections/apps.liquid`) for exactly this. If the theme
   has no such section, add `"blocks": [{ "type": "@app" }]` to the page
   template's main section schema — or use the escape hatch in §7.
2. **Online Store → Pages → Add page**, e.g. *Rewards* (`/pages/rewards`).
3. **Customize** that page in the theme editor → **Add section → Apps** →
   **Add block → Loyalty & Rewards**.
4. Add the surrounding content as ordinary theme sections — video, rich text,
   collapsible content for the FAQ, terms. Order them around the block.
5. **App admin → Customize → Behaviour → Loyalty page URL** → `/pages/rewards`.
   This is what turns the widget's expand control into a link to the page.
6. Add the page to a navigation menu.

### Block settings

| Setting | Notes |
| --- | --- |
| Heading | Optional; skip it if the page already has a title above the block |
| Alignment | Left / Centre / Right — applies to the block and its heading |
| **Desktop** — Width | Narrows automatically when the page has less room |
| **Desktop** — Minimum height | Floor, so a sparse tab doesn't collapse the block |
| **Desktop** — Scroll inside the block | Off by default. On caps the height and pins the tab bar |
| **Desktop** — Height when scrolling | Only used when the above is on |
| **Mobile** — Width | A **percentage** of the space the theme gives the block, not pixels — a phone's usable width isn't a number the merchant can guess. 100% lines up with the page's other sections |
| **Mobile** — Minimum height, Scroll, Height when scrolling | Independent of the desktop values, applied below 749px |
| Top / bottom spacing | Clamped down on mobile |

Desktop and mobile are separate settings rather than one scaled value: a
merchant picks numbers looking at a desktop preview, and 1100px wide / 560px
tall / scrolling-off are each wrong on a phone in a different direction.

**Internal scrolling is off by default and should usually stay off**,
especially on mobile — a scrolling area inside a scrolling page sends a swipe
to whichever of the two is under the thumb. It's there for merchants whose
page has a lot of content below the widget and who want a fixed-height panel.
When it's on, the widget header becomes sticky *within the block*, so the tab
rail stays reachable without ever escaping into the theme's own sticky
header.

### Deep links

`/pages/rewards?nbl=rewards` opens the page on a given tab — useful for email
campaigns and menu items. Valid values: `home`, `earn`, `rewards`, `prizes`,
`referral`, `my-rewards`, `my-prizes`, `activity`.

---

## 6. Content lives in the theme, on purpose

FAQ / video / terms are theme sections, not app config. This was a decision,
not an omission:

- **Indexable.** Widget content is inside a shadow root behind javascript and
  is not crawled. Theme sections are ordinary HTML, so the FAQ actually earns
  search traffic — which is most of the point of having a page.
- **Merchant-editable** without touching the app, and without a content editor
  needing to be built and maintained inside it.
- **No metafield pressure.** `nbl_config_v1` is already the shop's whole
  widget config against a 128KB JSON ceiling — the same ceiling that forced
  the customer metafield split. FAQ prose and video URLs do not belong in it.

The trade-off: this content appears on the page only, never inside the
floating widget.

---

## 7. Known limitations

**Themes without `@app` block support.** Escape hatch: add a Custom Liquid
section containing `<div data-nbl-page-mount></div>`. `findPageMount()` falls
back to that attribute. The theme-editor settings (width, min height,
spacing) won't apply — the CSS defaults do.

**`position: fixed` and transformed ancestors.** Fixed resolves against the
nearest ancestor with a `transform` / `filter` / `perspective` / `contain`, not
the viewport. A theme that animates the section wrapping the block (Dawn's
scroll-triggered section animations do) will anchor the notification sheet and
image preview to that section instead. It degrades to "anchored to the bottom
of the widget" — usable, not broken. Fix, if it bites:

```css
/* theme CSS — the section containing the loyalty block */
.section-<id> .nbl-page-block { transform: none !important; }
```

or turn that section's animation off in the theme editor.

**Admin live preview shows the floating widget only.** The Customize preview
renders `preview.html` in a 390px iframe; there's no page-mode scene. Colours,
labels and tab settings all still preview correctly and apply to both modes.

**Toasts are off on the loyalty page.** The widget is already open in front of
the customer with the same activity listed in it. Unseen transactions stay
unseen and surface normally on the next storefront page.

---

## 8. QA checklist

Storefront, page mode:

- [ ] Logged-out → guest panel, full height, Create Account / Sign In return
      to the page
- [ ] Logged-in, not yet joined → Join panel (both `autoProvisionCustomer`
      settings)
- [ ] Every tab renders; tab rail shows all enabled tabs, no chevrons
- [ ] Tab change updates `?nbl=`; refresh and a shared link land on that tab
- [ ] Scroll to below the widget, change tab → scrolls back up to it
- [ ] **Page scrolls normally after previously using full screen** (the
      `localStorage` case)
- [ ] Claim a reward → sheet is centred over the viewport with a scrim, not
      stranded at the bottom of the block
- [ ] Image preview and referral modal cover the theme header
- [ ] No floating launcher, no toasts, no close/expand buttons
- [ ] **Every tab is the same width** (the shrink-to-fit regression)
- [ ] Block never overflows its section — compare its right edge against the
      footer/other sections on the same page, desktop and mobile
- [ ] Mobile width 100% lines up with the theme's other content, not the
      screen edge; 50% is visibly half
- [ ] Set the desktop width to ~400px: the Home shortcuts **stack** rather
      than squeezing into three columns, and the nav rail scrolls with
      chevrons instead of centring
- [ ] Width / minimum height settings visibly apply, desktop and mobile
      independently
- [ ] Alignment left / centre / right moves both the block and its heading
      (needs the width setting to be narrower than the page to be visible)
- [ ] Mobile width is a screen percentage: 100% fills to the theme's gutters
      without overflowing, 50% is half the screen
- [ ] Scroll-inside-block on: block is capped, scrolls internally, tab bar
      pins within it and never escapes into the theme header
- [ ] Scroll-inside-block off: block grows to its tallest tab, no inner
      scrollbar on either axis
- [ ] Mobile at 100% width: fills the column, **no horizontal overflow**
- [ ] Resize the window across 749px, and toggle the theme editor's mobile
      preview — the block re-measures both ways, and shrinks as well as grows
- [ ] Mobile: single page scroll, no inner scroll trap

Floating mode (regression):

- [ ] Expand action "Full screen" → unchanged behaviour, `?nbl=` still
      stripped
- [ ] Expand action "Loyalty page" → expand is a link, opens the page on the
      current tab, cmd-click opens a new tab
- [ ] Expand action "Loyalty page" with an empty or `https://` URL → no expand
      control at all
- [ ] Expand action "Nothing" → no expand control
- [ ] A shop whose saved config predates `expandAction` still gets full screen
- [ ] With expand set to "Loyalty page" or "Nothing", a device that previously
      used full screen opens the widget as a **normal floating panel**, not
      full screen with no way out
- [ ] In the admin live preview, clicking expand does nothing — the preview
      and launcher stay put
- [ ] Toasts, launcher, deep links, referral flow all unchanged

Theme editor:

- [ ] Adding the block renders the widget immediately, no manual refresh
- [ ] Changing width / min height / spacing re-renders correctly
- [ ] App embed disabled → setup notice appears