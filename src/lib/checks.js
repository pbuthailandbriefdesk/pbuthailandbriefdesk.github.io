// The Brief Gate check list (brChecks / gtChecks / rvOpen in the Power App).
// Takes the brief and its rows; returns 14 items with ok + gap text.
import { gt0, isBlank, round2, sum } from './util.js';

const YT_FORMATS = ['VRC', 'VVC', 'Non-skip', 'Bumper', 'Shorts'];
const NEEDS_ID = ['Update', 'Pause', 'No change'];
const missingAction = (r) => isBlank(r.action) || (NEEDS_ID.includes(r.action) && isBlank(r.dv360_id));
const startsHttps = (v) => !isBlank(v) && String(v).startsWith('https://');
const lt = (a, b) => !isBlank(a) && !isBlank(b) && a < b; // date strings compare as text
const gt = (a, b) => !isBlank(a) && !isBlank(b) && a > b;

export function computeChecks(b, I, L, G, A) {
  const io = (n) => I.find((x) => x.io_no === n) || {};
  const ext = ['Extension', 'Update'].includes(b.brief_type);

  return [
    {
      no: 0, item: 'Structure', rule: 'Required',
      ok: I.length > 0 &&
        I.every((x) => L.some((l) => l.io_no === x.io_no)) &&
        L.every((l) => {
          const yt = io(l.io_no).channel === 'YouTube';
          return yt ? YT_FORMATS.includes(l.format) : !YT_FORMATS.includes(l.format);
        }),
      gap: 'At least one IO, a line item in every IO, and line formats that match the IO channel',
    },
    {
      no: 1, item: 'PO', rule: 'Required',
      ok: !isBlank(b.po_number) && !isBlank(b.po_link) && gt0(b.po_amount) && round2(b.po_amount) >= round2(b.total_budget),
      gap: 'PO number, PO file link, and a PO amount that covers the total budget',
    },
    {
      no: 2, item: 'Budget & split', rule: 'Required',
      ok: gt0(b.total_budget) && I.length > 0 && round2(sum(I, 'budget')) === round2(b.total_budget) &&
        I.every((x) => gt0(x.budget)) && L.every((x) => gt0(x.budget)) &&
        I.every((x) => round2(sum(L.filter((l) => l.io_no === x.io_no), 'budget')) === round2(x.budget)),
      gap: 'IO budgets must add up to the campaign budget, and line budgets to each IO budget',
    },
    {
      no: 3, item: 'Flight', rule: 'Required',
      ok: !isBlank(b.launch_date) && !isBlank(b.end_date) && b.end_date >= b.launch_date &&
        I.every((x) => !isBlank(x.start_date) && !isBlank(x.end_date) && !(x.end_date < x.start_date) &&
          !lt(x.start_date, b.launch_date) && !gt(x.end_date, b.end_date)) &&
        L.every((l) => {
          const p = io(l.io_no);
          return !isBlank(l.start_date) && !isBlank(l.end_date) && !(l.end_date < l.start_date) &&
            !lt(l.start_date, p.start_date) && !gt(l.end_date, p.end_date);
        }) &&
        // Power Fx treats a blank segment end as earlier than the start, so a half-filled segment fails.
        I.every((x) => isBlank(x.segment_start) ||
          !(lt(x.segment_start, x.start_date) || gt(x.segment_end, x.end_date) ||
            isBlank(x.segment_end) || lt(x.segment_end, x.segment_start))) &&
        (b.brief_type === 'New' || isBlank(b.brief_type) || !isBlank(b.effective_date)),
      gap: 'Campaign dates; IOs inside the campaign, lines inside their IO, budget segment inside its IO; extensions need an effective date',
    },
    {
      no: 4, item: 'Objective & KPI', rule: 'Required',
      ok: !isBlank(b.objective) && !isBlank(b.kpi_model) && gt0(b.kpi_target) &&
        I.every((x) => !isBlank(x.kpi_model) && gt0(x.kpi_target)),
      gap: 'Campaign objective and KPI, and a KPI model and target on every IO',
    },
    {
      no: 5, item: 'Audience', rule: 'Required',
      ok: L.length > 0 &&
        L.every((l) => (io(l.io_no).channel === 'YouTube'
          ? G.some((g) => g.io_no === l.io_no && g.line_no === l.line_no)
          : !isBlank(l.audience))) &&
        G.every((g) => !isBlank(g.audience)),
      gap: 'YouTube: ad groups with an audience in every line item. Others: targeting on every line',
    },
    {
      no: 6, item: 'Buying type / deal ID', rule: 'Required',
      ok: I.length > 0 && I.every((x) => !isBlank(x.buying_type) && !(['PG', 'PMP'].includes(x.buying_type) && isBlank(x.deal_id))),
      gap: 'Buying type on every IO, and a deal ID for PG or PMP',
    },
    {
      no: 7, item: 'Creative', rule: 'Required',
      ok: A.length > 0 &&
        G.every((g) => A.some((a) => a.io_no === g.io_no && a.line_no === g.line_no && a.ag_no === g.ag_no)) &&
        L.every((l) => io(l.io_no).channel === 'YouTube' || A.some((a) => a.io_no === l.io_no && a.line_no === l.line_no)) &&
        A.every((a) => {
          const f = (L.find((l) => l.io_no === a.io_no && l.line_no === a.line_no) || {}).format;
          const len = Number(a.video_length);
          return startsHttps(a.landing_url) && !(f === 'Bumper' && len > 6) && !(f === 'Non-skip' && len > 15);
        }) &&
        A.every((a) => a.action === 'Pause' || !isBlank(a.asset_url)),
      gap: 'Ad per ad group, creative per non-YouTube line, video / creative link on every live ad, https:// URLs, length fits format',
    },
    { no: 8, item: 'Tracking', rule: 'Required', ok: !isBlank(b.tracking), gap: 'Floodlight / pixel / UTM / 3P tag' },
    { no: 9, item: 'Test design', rule: 'If a test', ok: b.is_test !== 'Yes' || !isBlank(b.test_design), gap: 'Test / control, variable and duration' },
    { no: 10, item: 'Handover', rule: 'If needed', ok: b.handover_needed !== 'Yes' || !isBlank(b.handover_notes), gap: 'Handover notes' },
    { no: 11, item: 'Brand safety', rule: 'Default if blank', ok: true, gap: '' },
    { no: 12, item: 'Reporting & brand lift', rule: 'If BLS', ok: b.brand_lift !== 'Yes' || !isBlank(b.bls_notes), gap: 'Brand lift is on: add the BLS budget, dates and questions' },
    {
      no: 13, item: 'DV360 actions & IDs', rule: 'Ad Ops',
      ok: ['Draft', 'Returned'].includes(b.status) ||
        ((!ext || !isBlank(b.dv360_campaign_id)) &&
          [I, L, G, A].every((rows) => rows.every((r) => !missingAction(r)))),
      gap: 'Ad Ops: an action on every IO, line, ad group and ad, and the DV360 ID for anything that already exists',
    },
  ];
}

export const openChecks = (checks) => checks.filter((c) => !c.ok).length;
