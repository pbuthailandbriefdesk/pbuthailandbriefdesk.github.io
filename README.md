# L'Oréal Brief Desk

The programmatic brief workflow for L'Oréal Thailand: **Planner → Ad Ops → Gate → Buyer**.
It replaces the Power Apps canvas app *L'Oréal Brief Desk* and its SharePoint lists on
`sites/programmaticcampaignbriefth`. The data and rules are the same; the interface follows the WPP Media design system.

**Live:** https://scaling-guide-lk89ygq.pages.github.io/ (private GitHub Pages of [WPPOpen/wppmedia-th-pbu-briefdesk](https://github.com/WPPOpen/wppmedia-th-pbu-briefdesk); sign in to GitHub with your WPP account to open it)

> **No sign-in (open access).** People pick their name on the first screen; nothing checks who they are.
> Anyone who has the link can read and change every brief, budget and PO number.
> This was chosen on 2026-10-15 because email sign-in links were consumed by Outlook's link scanner.
> To restore sign-in later: connect an email sender (SMTP) in Supabase, drop the "open" policies from
> `supabase/migrations/003_open_access.sql`, re-run the policy section of `001_schema.sql`, and revert the
> name picker in `src/data/backend-supabase.js`.

- **Front end:** static site (Preact + htm from a CDN, no build step), hosted on GitHub Pages from `main`.
- **Back end:** Supabase (Postgres, email sign-in, row level security).

## What carried over

| Power App | Here |
|---|---|
| 10 SharePoint lists | 10 Postgres tables, same rows and IDs (`supabase/migrations/001_schema.sql`) |
| `field_1`…`field_48` columns | Real names, e.g. `field_10` → `launch_date` (mapping in the schema comments) |
| Home tabs (My briefs, Ad Ops queue, …) | Sidebar queues with live counts |
| Brief form, Structure galleries | Campaign tab in sections; Structure as a tree (IO → line → ad group → ad) with an editor |
| 14-item Brief Gate check | `src/lib/checks.js`, same rules |
| Working-day lead time, 15:00 cut-off | `src/lib/leadtime.js` |
| L'Oréal naming convention | `src/lib/naming.js` |
| DV360 SDF v11 build | `src/lib/sdf.js`; column layouts are generated from the Power App source |
| Ad Ops fill names, paste DV360 IDs | `src/lib/adops.js` |
| Scorecards | Same eight measures and targets |
| Outlook emails | In-app notifications (bell) plus a pre-filled email draft link |
| "Email SDF files to me" | Download each file, or all as a .zip |
| Editing lists in SharePoint | Admin page (desk team, brands, holidays, SDF defaults) |
| Microsoft sign-in | No sign-in: pick your name (see the note at the top) |

The Power App source is kept in `reference/powerapp-src/` for comparison.

Known differences, on purpose:
- A new line item saves the format shown in its dropdown (the Power App showed it but saved blank, which failed the Structure check).
- Deleting an IO, line, ad group or ad asks for a second click.
- The brief form is read-only unless the brief is Draft or Returned and you are its planner or an Admin.

## Try it locally (demo mode)

With `src/config.js` left empty, the app runs on `data/seed.json` in your browser only.

```bash
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

Open http://localhost:5173 and pick a desk team member. Admin → **Reset demo data** restores the seed.

## Set up Supabase

1. Create a project at supabase.com (region: Southeast Asia / Singapore).
2. **SQL editor:** run `supabase/migrations/001_schema.sql`, then `002_api_grants.sql` (newer projects don't expose new tables to the API until they are granted).
   If Supabase warns "creates tables without enabling Row Level Security", choose **Run without RLS**: the script turns RLS on itself.
3. Load the data. In the SQL editor run the files in `supabase/seed/` in order, `01_desk_team.sql` to `10_brief_ads.sql`.
   These files are not in git. To recreate them from a fresh SharePoint export, save it as `data/sharepoint_export.json` and run
   `powershell -ExecutionPolicy Bypass -File scripts/convert-export.ps1`.
4. **Authentication → Providers:** keep Email on (magic link).
5. **Authentication → URL configuration:** set *Site URL* to your GitHub Pages address and add it plus `http://localhost:5173` to *Redirect URLs*.
6. **Authentication → SMTP:** Supabase's built-in mailer sends only a few emails an hour. Before the team uses it, set up a custom SMTP sender (ask WPP IT for an approved one).
7. **Project settings → API:** copy the *Project URL* and *anon public* key into `src/config.js`. The anon key is meant to be public; the database rules protect the data.

### Roles

Roles come from the `desk_team` table (Admin page). Anyone not listed is a Planner.

| Role | Can |
|---|---|
| Planner | Create, edit, submit, pull back, request changes on their own briefs |
| Ad Ops | Ad Ops taxonomy screen, SDF export |
| Gatekeeper / Buyer | Gate review, accept / take over set-ups, SDF export |
| Admin | Everything, plus the Admin page and test mode |

The current desk team has no one with the **Ad Ops** or **Buyer** role, so nobody is notified at those steps. Add them on the Admin page.

## Publish on GitHub

```bash
git remote add origin https://github.com/<org>/loreal-brief-desk.git
```

```bash
git push -u origin main
```

Then in the repository: **Settings → Pages → Deploy from a branch → main / (root)**.
GitHub Pages on a private repository needs a paid GitHub plan (Team or Enterprise). If the repository must be private on a free plan, Cloudflare Pages or Netlify can host the same folder.

## Project layout

```
index.html, styles.css      page shell and WPP Media styles
src/config.js               Supabase URL + anon key
src/main.js                 sign-in, sidebar, routing
src/screens/                home, brief, review, adops, gate, detail, score, admin
src/lib/                    business rules ported from the Power App
src/data/                   Supabase and demo backends, workflow actions
supabase/migrations/        database schema and security rules
scripts/                    export converter, SDF template extractor, local server
reference/powerapp-src/     original Power App source (YAML)
```
