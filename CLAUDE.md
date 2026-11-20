# CLAUDE.md: L'Oréal Brief Desk

Instructions for Claude when working on this repository.

## What this is

A web app for WPP Media Thailand's programmatic team (PBU) to brief, check, set up and QA L'Oréal DV360
campaigns. It replaces the Power Apps canvas app "L'Oréal Brief Desk" (SharePoint site
`programmaticcampaignbriefth`) and keeps the same data and business rules.

- **Live:** https://pbuthailandbriefdesk.github.io/ (GitHub Pages, branch `main`, repo root)
- **Repo:** `pbuthailandbriefdesk/pbuthailandbriefdesk.github.io` (public, in the team's free GitHub org)
- **Database:** Supabase project `gqzduxfqzzjmbbwisnvf` (Free plan, region ap-northeast-1)
- **Owner / Admins:** Warintorn Nakhowong (Lec), Thanasit Darasang (Kryst)
- Look and feel: see **DESIGN.md**. Write all user-facing text in **English**.

## Stack (no build step)

- Static site: `index.html` + `styles.css` + ES modules in `src/`. No bundler, no npm, no TypeScript.
- Preact 10.24.3 + htm 3.1.1 from jsDelivr via the import map in `index.html`; JSZip 3.10.1 for SDF zips.
  Pin exact versions when adding a library, and load it the same way.
- Supabase JS (ESM from CDN) in `src/data/backend-supabase.js`.
- Hash router (`src/router.js`), so GitHub Pages needs no rewrites. Routes: `#/` (queues), `#/brief/:id`
  (summary), `#/brief/:id/{edit,adops,gate,detail,qa}`, `#/score`, `#/admin`.

## Run locally

```bash
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

Serves the repo on http://localhost:5173 (also the `brief-desk` entry in `../.claude/launch.json`).
`src/config.js` points at the **real** Supabase project, so local testing reads and writes live data.
Create clearly named test briefs and delete them afterwards; never edit other people's briefs.
With an empty `config.js` the app runs in demo mode on `data/seed.json` (browser-only).

## Layout

```
src/
  main.js            app shell: sign-in (email lookup), sidebar, top bar, routes
  router.js          hash routes, briefPath(), go()
  config.js          Supabase URL + publishable key (public by design)
  data/
    store.js         tiny stores, useStore, profileFor (roles → permission flags), lookups, toast, notify
    actions.js       workflow actions (create, submit, Gate, set-up, QA, duplicate, AI fill)
    backend-*.js     same interface: session, signIn, signOut, list, insert, update, updateWhere, remove, removeWhere
  lib/               pure logic, no UI:
    checks.js        14 Gate checks        leadtime.js  working-day lead time
    naming.js        naming convention     sdf.js / sdf-templates.js  DV360 SDF v11 builder
    sdfparse.js      read SDF CSV/zip      qa.js        P2P QA comparison + decision
    adops.js         Ad Ops helpers        tree.js      structure rows
    queues.js        queues per role       aibrief.js   WPP Open AI prompt + answer parser
    constants.js     dropdown options, statuses, SLAs   util.js  dates (Bangkok), money, helpers
  screens/           one file per screen (home, brief, review, adops, gate, detail, qa, score, admin)
  ui/                shared components (ui.js), aiassist.js, duplicate.js, campaign.js
supabase/migrations/ 001–005 SQL, applied in order
reference/powerapp-src/  the original Power Fx source, for checking rules
scripts/             serve.ps1, convert-export.ps1, extract-sdf-templates.ps1
```

## Domain rules

- **Statuses:** Draft → (Returned) → With Ad Ops → With Gatekeeper → Locked → In set-up → In QA → Set up; Cancelled at any point.
- **Roles** (from the `desk_team` table, managed in Admin → User management):
  Admin and Gatekeeper can do everything; Planner creates briefs; Ad Ops does taxonomy only;
  Buyer does set-up (Set-up queue, Locked / set up); QA runs P2P QA. Flags come from `profileFor` in `store.js`
  (`isSuper`, `isAdmin`, `isGate`, `isAdOps`, `isBuyer`, `isQA`, `canPlan`, `canSdf`). Check flags, not role strings.
- **Structure:** IO → line items → ad groups (YouTube only) → ads; Non-YouTube line items hold creatives (`ag_no = 0`).
- **SLAs:** lead time ≥ 3 working days; Ad Ops 24 h; Buyer pick-up 24 h, set-up 72 h after Lock (`constants.js`).
- **P2P QA:** any FAIL means NOT READY TO LAUNCH and blocks "Set up"; Pass needs every Review / Manual item ticked.
- Behaviour ported from Power Fx keeps a comment naming its source control (e.g. `// scrHome.hmNew`).
  When changing a rule, check `reference/powerapp-src` first and say if you intentionally differ.

## Conventions

- Match the surrounding code: 2-space indent, single quotes, semicolons, small pure functions in `lib/`,
  screens render with `html\`...\`` (htm). Comments explain *why*, briefly.
- Every data write goes through the backend interface (`db()` or a brief store: `patchBrief`, `addRow`, `patchRow`,
  `removeWhere`) and records history with `store.event(...)` where the Power App did.
- Use existing components and classes before adding CSS. New CSS goes in `styles.css` using the tokens.
- Layout must work at 375px, 768px and desktop (see DESIGN.md → Responsive rules).
- New database columns or tables: add a numbered migration in `supabase/migrations/`, keep the "open" policy pattern
  from `003_open_access.sql`, and apply it to the project (Supabase MCP `apply_migration`).

## Deploy

1. Commit as the owner and push `main`:
   ```bash
   git -c user.name="Warintorn Nakhowong" -c user.email="warintorn.nakhowong@wppmedia.com" commit -m "…"
   git push
   ```
   End commit messages with the attribution line the session asks for.
2. Wait for the Pages build: `https://api.github.com/repos/pbuthailandbriefdesk/pbuthailandbriefdesk.github.io/actions/runs?per_page=1`
   until the run for your commit is `completed`.
3. Verify the live file (add `?x=<random>` to skip caches). Pages caches for ~10 minutes, so tell users to press Ctrl+Shift+R.

Other git remotes (`wppopen`, `old-personal`) are archived copies; don't push to them unless asked.

## Security and data (must follow)

- **Open access is a known, accepted decision:** there is no sign-in; people type a work email and their role comes
  from User management; database policies allow anon read/write. Don't "fix" this without the owner asking.
- Only the **publishable** Supabase key belongs in the code. Never use, request or commit the service-role key or any
  other secret (Wrike token, AI keys). Server-side secrets go in Supabase secrets, set by the owner.
- Never commit exported data: `/data/` and `/supabase/seed/` are git-ignored (anchored paths; an unanchored `data/`
  once hid `src/data/`). They contain staff emails, budgets and PO numbers.
- Don't send brief data to external AI or third-party services. "Fill with AI" works by copying a prompt to
  WPP Open AI and pasting the answer back; there is no API call.
- Creating repos, accounts, tokens or changing repo visibility is done by the owner, not by Claude.

## Operations

- Supabase Free pauses after ~7 days without activity. `.github/workflows/keepalive.yml` reads one row daily;
  if it fails, restore the project in the Supabase dashboard. GitHub disables scheduled workflows in public repos
  after 60 days without commits.
- Planned, not built: one-way Desk → Wrike sync (Supabase Edge Function), waiting for WPP Wrike admin to grant API access
  (EU data centre, `app-eu.wrike.com`).
- Open items: real DV360 SDF samples to tune `lib/qa.js`; add Ad Ops / Buyer / QA users; cancel test briefs
  BR-261019-134118 and BR-261019-150000.
