# DESIGN.md: L'Oréal Brief Desk

How the Brief Desk looks and behaves. It follows the **WPP Media design system**
(`../WPP_Media_Design_System/project/tokens.json`). All styles live in one file, `styles.css`;
there is no CSS framework and no build step.

## Principles

1. **Navy type on white.** WPP navy `#000050` is the ink colour for text, borders and dark surfaces.
2. **One lime accent per screen.** Lime `#b0f467` marks the single most important action (the primary button)
   or the current item (active nav, active tile). Don't use it for decoration.
3. **Square, flat, no shadows.** Corners are square everywhere except pills, badges and avatars (fully round).
   Depth comes from 1px rules, tinted surfaces and the soft radial glows, never from `box-shadow`.
4. **Work first.** This is an internal tool used all day: dense but calm, clear labels, every
   state visible (status pills, Gate checks, counts), nothing hidden behind hover only.
5. **Plain English.** Short labels and sentences. Say what happens ("Send to P2P QA"), not what the system is.

## Colour tokens

Defined on `:root` in `styles.css`. Always use the variable, not the hex.

| Token | Value | Use |
|---|---|---|
| `--wpp-navy` / `--ink` | `#000050` | Text, borders, dark buttons, sidebar |
| `--white` / `--surface` | `#ffffff` | Page and card background |
| `--surface-2` | `#f7f8fb` | Read-only inputs, callouts, tree pane |
| `--surface-3` | `#eef0f7` | Hover, chips, neutral pills |
| `--lime` / `--accent` | `#b0f467` | Primary button, active item, highlight |
| `--ink-muted` | `#4a4a7e` | Secondary text, labels (8:1 on white) |
| `--ink-faint` | `#7a7aa0` | Hints, empty values |
| `--rule` | navy at 14% | Card and table borders |
| `--rule-strong` | navy | Section-title underline, footbar border |
| `--cornflower` | `#5465ff` | Links, section numbers |
| `--aqua`, `--periwinkle`, `--teal`, `--yellow` | brand secondaries | Status pill dots, charts, glows |
| `--danger` / `--danger-tint` | `#c4002b` / `#fdecef` | Errors, delete, FAIL |
| `--ok` | `#2c7a00` | Success text |
| `--gradient-card` | cornflower → aqua, 8° | The one hero tile per screen |
| `--glow-lime`, `--glow-aqua`, `--glow-cornflower` | radial glows | Background depth behind the top bar and sidebar |

## Typography

- Font stack: `"WPP", Arial, sans-serif`. The WPP font is **not loaded** (no `@font-face`), so Arial renders today.
  If the font files are added, declare them once in `styles.css`.
- Base: 14px / 1.35. Page title (`.page-head h1`): 28px bold, 24px on phones.
- Eyebrow (`.eyebrow`): 11px, uppercase, 3px letter-spacing, with a lime `.dot`. Use it above page titles.
- Labels (`.field > label`, `.label`): small uppercase, muted.
- IDs, taxonomy names, SDF values: monospace (`.mono`, `.code-chip`), Consolas.
- Numbers: `THB 1,500,000` (`fmtInt`); dates `dd mmm yy` (`fmtDate`); Bangkok time zone (`TZ` in `util.js`).

## Layout

- **Shell:** sidebar (256px, navy) + main column. The top bar is sticky (60px, frosted white) with breadcrumbs,
  the save indicator and the notification bell.
- **Page:** `.page` with 28px side padding (16px under 900px), max width 1440px, 120px bottom padding so the
  fixed footbar never covers content.
- **Page header:** `PageHead` gives an eyebrow, title, one-line sub and actions on the right.
- **Two-column screens:** `.split` (content + 360px aside). The aside is sticky on desktop and stacks under 1180px.
- **Grids:** `.grid g2 / g3 / g4` for forms; `.span2`, `.span-all` to widen a field. Always use `minmax(0, 1fr)`
  columns so long text can't push the page wider.
- **Footbar:** `.footbar` is fixed at the bottom for the main action of a step (submit, send to QA…).

## Components

Reusable pieces are in `src/ui/ui.js` (Preact + htm). Prefer them over raw markup.

| Component / class | Notes |
|---|---|
| `.btn` | 36px, navy border, white. Variants: `.btn-primary` (lime, **one per screen**), `.btn-dark` (navy), `.btn-ghost`, `.btn-danger`; sizes `.btn-sm` 28px, `.btn-lg` 44px; `.btn-arrow` adds the navy circle with a lime arrow for "go forward" actions. |
| `ActionButton` | Async button: disables itself and shows progress while `onClick` runs. |
| `ConfirmButton` | Destructive actions need a second click ("Click again to confirm"). |
| `TextInput`, `NumberInput`, `DateInput`, `Select` | Autosave on blur via `onSave`; `money` formats THB; `readOnly` uses `--surface-2`. |
| `.card` / `.card-head` / `.card-body` | White, 1px rule, no shadow. `.section-title` = bold title with a navy underline; `.num` shows brief-item numbers in cornflower. |
| `.tiles` / `.tile` | KPI tiles: uppercase key, big value, small note. `.tile.hero` = gradient (one per screen); `.tile.accent` = lime top bar for the active filter. |
| `StatusPill` | Round pill with a coloured dot per workflow status (see below). |
| `.callout` | Left-border notice: default navy, `.warn` yellow, `.err` red, `.ok` green. |
| `ChecksList` / `CheckSummary` | The 14 Gate checks with ✓ / ✗ and a progress summary. |
| `Modal` | Navy-bordered dialog; Esc and backdrop click close it. |
| `.table` in `.table-wrap` | Data tables. Wide tables scroll inside the wrap, never the page. |
| `.tabs` | Underlined tabs; scroll sideways on small screens. |
| `.seg` | Segmented filter (navy outline, active = navy fill). |
| `Icon` | Iconoir-style line icons (24px grid, 1.5 stroke, round joins) by name: `home`, `inbox`, `gate`, `wrench`, `lock`, `list`, `chart`, `settings`, `bell`, `copy`, `menu`, `collapse`, `expand`… Add new paths to the `P` map at the top of `ui.js`. |
| Toasts | `toast(msg, 'success' | 'error' | 'warning' | 'info')` from `store.js`. |

### Workflow status colours

| Status | Class | Dot |
|---|---|---|
| Draft | `s-draft` | grey |
| Returned | `s-returned` | olive on pale yellow |
| With Ad Ops | `s-adops` | cornflower |
| With Gatekeeper | `s-gate` | teal |
| Locked | `s-locked` | green |
| In set-up | `s-setup-in` | periwinkle |
| In QA | `s-qa` | amber |
| Set up | `s-setup` | lime dot on navy (the only dark pill = finished) |
| Cancelled | `s-cancelled` | outlined, struck through |

P2P QA results use `PASS` (green) · `FAIL` (red) · `REVIEW` (yellow) · `REMINDER` (neutral).

## Responsive rules

| Width | Behaviour |
|---|---|
| > 1180px | Full layout; `.split` side by side; sidebar can collapse to a 72px icon rail (choice kept in `localStorage`). |
| ≤ 1180px | `.split` stacks; `g4` becomes 2 columns. |
| ≤ 900px | Sidebar becomes a slide-in drawer opened by the ☰ button; brief lists turn into cards (4 columns); forms go to 1 column. |
| ≤ 640px | Tiles 2-up and compact; search full width and filters 2 per row; brief and QA cards 2 columns; footbar message above the buttons; only the last breadcrumb shows. |

Test at 375px, 768px and desktop. Nothing may scroll the whole page sideways; only `.table-wrap`, `.tabs` and `.seg` may scroll.

## Content and tone

- Buttons are verbs: "Review & submit", "Send to P2P QA", "Fill the brief".
- Explain blocked states in the UI ("Pass is only possible with no failures…") rather than hiding buttons silently.
- Statuses and role names are proper nouns: Planner, Ad Ops, Gatekeeper, Buyer, QA, Admin.
- Money in THB including fee; say so in labels ("Budget incl. fee (THB)").

## Accessibility

- Visible focus: 2px navy outline (`:focus-visible`). Don't remove it.
- Every input has a label (use `Field` / the input components). Icon-only buttons need `aria-label` and `title`.
- Keep text contrast at AA or better: muted text is `--ink-muted`, never lighter for body copy.
- Tables with clickable rows also support Enter (`tabindex="0"`).
