// One flat, ordered list of every IO, line item, ad group and ad in a brief, with
// the label / detail text and suggested name. Same shape as the gallery Items in
// scrGate.gtLines, scrAdOps.aoLines and scrReview.rvTree.
import { adGroupName, adName, ioName, lineItemName } from './naming.js';
import { coalesce, fmtDate, fmtInt, isBlank, num, txt } from './util.js';

const act = (a) => (isBlank(a) ? '' : `[${a}] `);

export function buildRows(b, I, L, G, A, brands) {
  const rows = [];
  for (const i of I) {
    rows.push({
      lvl: 'IO', table: 'brief_ios', rec: i, ord: num(i.io_no) * 1e8,
      io_no: i.io_no, line_no: 0, ag_no: 0, ad_no: 0, indent: 0, bud: i.budget, act: i.action, dvId: i.dv360_id,
      label: `${act(i.action)}IO ${txt(i.io_no)} · ${txt(i.io_type)}${isBlank(i.io_format) ? '' : ' · ' + i.io_format} · THB ${fmtInt(i.budget)} · ${fmtDate(i.start_date, 'dd mmm')} – ${fmtDate(i.end_date)} · ${txt(i.buying_type)}${isBlank(i.deal_id) ? '' : ' ' + i.deal_id} · ${txt(i.kpi_model)} ${txt(i.kpi_target)}`,
      detail: `Pacing ${txt(i.pacing)}  ·  Freq cap ${isBlank(i.freq_exposures) ? coalesce(i.freq_cap, '–') : txt(i.freq_exposures) + ' / ' + txt(i.freq_period)}${isBlank(i.segment_start) ? '' : `  ·  Segment ${fmtDate(i.segment_start, 'dd mmm')} – ${fmtDate(i.segment_end)} (prior THB ${fmtInt(coalesce(i.prior_budget, 0))})`}  ·  Verification ${coalesce(i.verification, '–')}`,
      nm: i.io_name, sug: ioName(b, i, brands), nameField: 'io_name',
    });
  }
  for (const l of L) {
    rows.push({
      lvl: 'LI', table: 'brief_lines', rec: l, ord: num(l.io_no) * 1e8 + num(l.line_no) * 1e5,
      io_no: l.io_no, line_no: l.line_no, ag_no: 0, ad_no: 0, indent: 1, bud: l.budget, act: l.action, dvId: l.dv360_id,
      label: `${act(l.action)}Line item ${txt(l.io_no)}.${txt(l.line_no)} · ${txt(l.format)} · THB ${fmtInt(l.budget)} · ${fmtDate(l.start_date, 'dd mmm')} – ${fmtDate(l.end_date)} · ${txt(l.bid_strategy)} ${txt(l.bid_target)}`,
      detail: `${txt(l.inventory)}${isBlank(l.audience) ? '' : '  ·  Targeting: ' + l.audience}${isBlank(l.exclusions) ? '' : '  ·  Excl: ' + l.exclusions}`,
      nm: l.line_item_name, sug: lineItemName(l), nameField: 'line_item_name',
    });
  }
  for (const g of G) {
    rows.push({
      lvl: 'AG', table: 'brief_ad_groups', rec: g, ord: num(g.io_no) * 1e8 + num(g.line_no) * 1e5 + num(g.ag_no) * 100,
      io_no: g.io_no, line_no: g.line_no, ag_no: g.ag_no, ad_no: 0, indent: 2, bud: 0, act: g.action, dvId: g.dv360_id,
      label: `${act(g.action)}Ad group ${txt(g.io_no)}.${txt(g.line_no)}.${txt(g.ag_no)} · ${txt(g.audience)}`,
      detail: `${txt(g.demographics)}${isBlank(g.notes) ? '' : '  ·  ' + g.notes}`,
      nm: g.ad_group_name, sug: adGroupName(g), nameField: 'ad_group_name',
    });
  }
  for (const a of A) {
    const isCr = num(a.ag_no) === 0;
    rows.push({
      lvl: 'AD', table: 'brief_ads', rec: a, ord: num(a.io_no) * 1e8 + num(a.line_no) * 1e5 + num(a.ag_no) * 100 + num(a.ad_no),
      io_no: a.io_no, line_no: a.line_no, ag_no: a.ag_no, ad_no: a.ad_no, indent: isCr ? 2 : 3, bud: 0, act: a.action, dvId: a.dv360_id,
      label: `${act(a.action)}${isCr ? `Creative ${txt(a.io_no)}.${txt(a.line_no)} #` : `Ad ${txt(a.io_no)}.${txt(a.line_no)}.${txt(a.ag_no)} #`}${txt(a.ad_no)}${isBlank(a.ad_format) ? '' : ' · ' + a.ad_format}${isBlank(a.creative_size) ? '' : ' · ' + a.creative_size}${num(a.video_length) > 0 ? ` · ${txt(a.video_length)}s` : ''}`,
      detail: `${txt(a.asset_url)}  →  ${txt(a.landing_url)}${isBlank(a.cta) ? '' : '  ·  CTA ' + a.cta}${isBlank(a.headline) ? '' : '  ·  ' + a.headline}${isBlank(a.description) ? '' : '  ·  ' + a.description}`,
      nm: a.ad_name, sug: adName(a), nameField: 'ad_name',
    });
  }
  // Sort is stable, so ties keep SharePoint item order like Power Apps Sort().
  return rows.sort((x, y) => x.ord - y.ord);
}

// Key used for expand / collapse in the Review tree (colOpen.K).
export const rowKey = (r) =>
  r.lvl === 'IO' ? `IO${r.io_no}` : r.lvl === 'LI' ? `LI${r.io_no}.${r.line_no}` : r.lvl === 'AG' ? `AG${r.io_no}.${r.line_no}.${r.ag_no}` : '';

// What Ad Ops must finish on a row: a name and an action (DV360 IDs come later, from the Buyer).
export const needsFix = (r) => isBlank(r.nm) || isBlank(r.act);
