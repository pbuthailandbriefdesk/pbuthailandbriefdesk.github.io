// Pieces shared by the Gate, Ad Ops, Detail and Review screens.
import { useMemo } from 'preact/hooks';
import { app, useStore } from '../data/store.js';
import { computeChecks, openChecks } from '../lib/checks.js';
import { leadTimeWD } from '../lib/leadtime.js';
import { buildRows } from '../lib/tree.js';
import { coalesce, fmtDate, fmtInt, isBlank, txt } from '../lib/util.js';
import { briefPath } from '../router.js';
import { html, StatusPill } from '../ui/ui.js';

// gtSumBrand / gtSumLine / gtSumDraft
export function BriefSummary({ st, extra }) {
  const { b, I } = st;
  return html`<div class="card"><div class="card-body">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div>
        <div class="strong" style="font-size:16px">${coalesce(b.brand, '—')}  ·  ${coalesce(b.team, '—')}</div>
        <div class="muted small" style="margin-top:2px">${txt(b.advertiser_name)}${isBlank(b.advertiser) ? '' : ` (${b.advertiser})`}</div>
      </div>
      <${StatusPill} status=${b.status} />
    </div>
    <div class="grid g4" style="margin-top:16px">
      <div><div class="label">Planner</div><div>${b.planner_name}</div></div>
      <div><div class="label">Flight</div><div>${fmtDate(b.launch_date)} – ${fmtDate(b.end_date)}</div></div>
      <div><div class="label">Budget</div><div>THB ${fmtInt(b.total_budget)}</div></div>
      <div><div class="label">Objective / KPI</div><div>${txt(b.objective)} / ${txt(b.kpi_model)} ${txt(b.kpi_target)}  ·  ${I.length} IO</div></div>
    </div>
    <div class="small" style="margin-top:14px;white-space:pre-wrap"><span class="label">Notes </span>${isBlank(b.notes) ? '–' : b.notes}</div>
    ${extra}
  </div></div>`;
}

// Derived data most screens need.
export function useDerived(st) {
  const { brands, holidays } = useStore(app);
  return useMemo(() => {
    if (!st.b) return {};
    const checks = computeChecks(st.b, st.I, st.L, st.G, st.A);
    return {
      checks,
      open: openChecks(checks),
      lead: leadTimeWD(st.b, holidays.map((x) => x.holiday_date)),
      rows: buildRows(st.b, st.I, st.L, st.G, st.A, brands),
    };
  }, [st, brands, holidays]);
}

export const briefCrumbs = (b, here) => [
  { label: 'Briefs', href: '#/' },
  { label: b ? b.brief_id : '…', href: b ? briefPath(b.brief_id) : undefined },
  ...(here ? [{ label: here }] : []),
];
