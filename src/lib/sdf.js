// DV360 SDF v11 builder, ported from scrReview.rvSdfBuild.
// Column layouts come from sdf-templates.js (generated from the Power App source);
// this file only computes the values that go into each {n} slot.
import { TPL } from './sdf-templates.js';
import { addDays, coalesce, fmt0d0h, fmtDate, isBlank, num, sortBy, txt } from './util.js';

const CRLF = '\r\n';
const q = (v) => '"' + txt(v).split('"').join('""') + '"';
const fill = (tpl, vals) => tpl.replace(/\{(\d+)\}/g, (_, n) => q(vals[Number(n)])) + CRLF;
const byId = (rows) => [...rows].sort((a, b) => num(a.id) - num(b.id)); // SharePoint item order
const mdy = (s) => fmtDate(s, 'mm/dd/yyyy');

export function buildSdf(b, ios, lines, groups, ads, defaults) {
  const D = (title) => (defaults.find((d) => d.title === title) || {}).value;
  const ext = 'ext' + String(b.brief_id).split('-').pop();
  const campId = coalesce(b.dv360_campaign_id, ext + 'c');
  const ioId = (i) => coalesce(i.dv360_id, ext + 'io' + txt(i.io_no));
  const liId = (l) => coalesce(l.dv360_id, ext + 'li' + txt(l.io_no) + 'x' + txt(l.line_no));
  const agId = (g) => coalesce(g.dv360_id, ext + 'ag' + txt(g.io_no) + 'x' + txt(g.line_no) + 'x' + txt(g.ag_no));
  const isNew = (r) => coalesce(r.action, 'New') === 'New';
  const newOrPause = (r) => ['New', 'Pause'].includes(coalesce(r.action, 'New'));

  const SI = sortBy(byId(ios), 'io_no');
  const SL = byId(lines);
  const SG = byId(groups);
  const SA = byId(ads);
  const po = txt(b.po_number);

  // Campaigns: only when the DV360 campaign does not exist yet.
  const kpiStd = ['CPM', 'CPA', 'CPC', 'CTR', 'CPIAVC'].includes(b.kpi_model);
  const camp = !isBlank(b.dv360_campaign_id) ? '' :
    TPL.campaignHeader + CRLF + fill(TPL.campaignRow, [
      campId,
      b.advertiser,
      coalesce(b.campaign_taxonomy, b.campaign_name),
      'Active',
      ['Consideration', 'Conversion'].includes(b.objective) ? 'Drive online action or visits' : 'Raise awareness of my brand or product',
      kpiStd ? b.kpi_model : 'Other',
      kpiStd ? txt(b.kpi_target) : txt(b.kpi_model) + ' ' + txt(b.kpi_target),
      txt(D('CMP_CreativeTypes')) + ';',
      txt(coalesce(b.total_budget, 0)),
      mdy(b.launch_date) + ' 00:00',
      mdy(b.end_date) + ' 23:59',
      D('CMP_FreqEnabled'), D('CMP_FreqExposures'), D('CMP_FreqPeriod'), D('CMP_FreqAmount'),
    ]);

  const segments = (i) =>
    (num(coalesce(i.prior_budget, 0)) > 0
      ? `(${fmt0d0h(i.prior_budget)}; ${mdy(i.start_date)}; ${mdy(addDays(coalesce(i.segment_start, i.start_date), -1))}; ; ${po.split('-')[0]};); `
      : '') +
    `(${fmt0d0h(i.budget)}; ${mdy(coalesce(i.segment_start, i.start_date))}; ${mdy(coalesce(i.segment_end, i.end_date))}; ; ${po.split('-').pop()};);`;

  const ioRow = (i) => fill(TPL.ioRow, [
    ioId(i), campId, coalesce(i.io_name, ''),
    isNew(i) ? D('NEW_IO_Status') : 'Active',
    D('IO_IoType'), D('IO_IoSubtype'), D('IO_IoObjective'), D('IO_Fees'),
    D('IO_Pacing'), D('IO_PacingRate'), D('IO_PacingAmount'),
    'True',
    coalesce(txt(i.freq_exposures), D('IO_FreqExposures')),
    D('IO_FreqPeriod'), D('IO_FreqAmount'),
    i.kpi_model, txt(i.kpi_target),
    D('IO_BudgetType'),
    segments(i),
    D('IO_AutoBudgetAllocation'), D('IO_Optimization'),
  ]);

  const ioRows = SI.filter(isNew).map(ioRow).join('');
  const ioEditRows = SI.filter((i) => i.action === 'Update').map(ioRow).join('');

  let liRows = '';
  for (const i of SI) {
    for (const l of SL.filter((x) => x.io_no === i.io_no && isNew(x))) {
      liRows += fill(TPL.lineItemRow, [
        liId(l), ioId(i), coalesce(i.io_name, ''),
        'TrueView',
        { VVC: 'View', Shorts: 'View', 'Non-skip': 'Non Skippable' }[l.format] || 'Reach',
        coalesce(l.line_item_name, ''),
        D('NEW_LI_Status'),
        'Same as Insertion Order', 'Same as Insertion Order', 'TrueView Budget',
        txt(coalesce(l.budget, 0)),
        D('LI_Pacing'), D('LI_PacingRate'),
        'False', 'False',
        D('LI_PartnerRevenueModel'), D('LI_PartnerRevenueAmount'), D('LI_ConversionCountingType'),
        D('LI_ConversionCountingPct'), D('LI_PrimaryAttributionModelId'), D('LI_Fees'),
        D('LI_ContainsEUPoliticalAds'), D('LI_GeoInclude'), D('LI_GeoExclude'),
        D('LI_KeywordListExclude'), D('LI_OptimizeFixedBidding'), D('LI_TVVideoAdFormats'),
        l.bid_strategy === 'Target CPV' || l.format === 'VVC' ? 'Target CPV' : 'Target CPM',
        D('LI_TVBidStrategyValue'), D('LI_TVCategoryExclusions'), D('LI_InventoryMode'),
        D('LI_TVInventorySource'), D('LI_TVVideoAdInventoryControl'),
      ]);
    }
  }

  const AGES = [['18-24', 18, 24], ['25-34', 25, 34], ['35-44', 35, 44], ['45-54', 45, 54], ['55-64', 55, 64], ['65+', 65, 200]];
  let agRows = '';
  let adRows = '';
  for (const i of SI) {
    for (const l of SL.filter((x) => x.io_no === i.io_no)) {
      for (const g of SG.filter((x) => x.io_no === i.io_no && x.line_no === l.line_no && newOrPause(x))) {
        const hi = isBlank(g.age_max) ? 65 : num(g.age_max);
        const lo = isBlank(g.age_min) ? 18 : num(g.age_min);
        agRows += fill(TPL.adGroupRow, [
          agId(g), liId(l), coalesce(l.line_item_name, ''), coalesce(g.ad_group_name, ''),
          g.action === 'Pause' ? 'Paused' : 'Active',
          D('AG_VideoAdFormat'),
          txt(coalesce(g.bid_cost, l.bid_target, i.kpi_target)),
          D('AG_CategoryExclude'),
          ({ W: 'Female;', M: 'Male;' }[g.gender] || 'Male; Female;') + (D('AG_GenderUnknown') === 'Yes' ? ' Unknown;' : ''),
          AGES.filter(([, a, z]) => a <= hi && z >= lo).map(([n]) => n + ';').join(' '),
          D('AG_HHIncome'), D('AG_Parental'), D('AG_OptimizedTargeting'),
          coalesce(g.sdf_aud_include, ''), coalesce(g.sdf_aud_exclude, ''),
          coalesce(g.sdf_affinity, ''), coalesce(g.sdf_custom_list, ''),
        ]);
      }
      for (const g of SG.filter((x) => x.io_no === i.io_no && x.line_no === l.line_no)) {
        for (const a of SA.filter((x) => x.io_no === i.io_no && x.line_no === l.line_no && x.ag_no === g.ag_no && newOrPause(x))) {
          const vid = (txt(a.asset_url).match(/(youtu\.be\/|v=|shorts\/)([A-Za-z0-9_\-]{11})/) || [])[2] || '';
          adRows += fill(TPL.adRow, [
            coalesce(a.dv360_id, ''), agId(g), coalesce(g.ad_group_name, ''), coalesce(a.ad_name, ''),
            a.action === 'Pause' ? 'Paused' : 'Active',
            D('AD_AdType'), vid,
            coalesce(a.landing_url, ''), coalesce(a.cta, ''), coalesce(a.headline, ''), coalesce(a.headline, ''),
            coalesce(a.description, ''), coalesce(a.description2, ''),
            D('AD_BusinessName'), D('AD_LogoAssetIds'),
          ]);
        }
      }
    }
  }

  const withHeader = (h, body) => (body ? h + CRLF + body : '');
  const files = [
    { name: 'SDF-Campaigns.csv', content: camp },
    { name: 'SDF-InsertionOrders.csv', content: withHeader(TPL.ioHeader, ioRows) },
    { name: 'SDF-LineItems.csv', content: withHeader(TPL.lineItemHeader, liRows) },
    { name: 'SDF-AdGroups.csv', content: withHeader(TPL.adGroupHeader, agRows) },
    { name: 'SDF-AdGroupAds.csv', content: withHeader(TPL.adHeader, adRows) },
    { name: 'EDIT-SDF-InsertionOrders.csv', content: withHeader(TPL.ioHeader, ioEditRows) },
  ].filter((f) => f.content);
  for (const f of files) f.rows = f.content.split('\n').length - 2;
  return files;
}

// rvSdfWarn: things to fix before uploading.
export function sdfWarnings(b, ios, lines, groups, ads, defaults) {
  const D = (title) => (defaults.find((d) => d.title === title) || {}).value;
  const nw = (r) => coalesce(r.action, 'New') === 'New';
  const I = ios.filter(nw);
  const L = lines.filter(nw);
  const G = groups.filter(nw);
  const A = ads.filter((r) => ['New', 'Pause'].includes(coalesce(r.action, 'New')));
  const out = [];
  if (isBlank(b.campaign_taxonomy) && isBlank(b.dv360_campaign_id)) out.push('Campaign name (taxonomy) is empty');
  const unnamed = I.filter((r) => isBlank(r.io_name)).length + L.filter((r) => isBlank(r.line_item_name)).length +
    G.filter((r) => isBlank(r.ad_group_name)).length + A.filter((r) => isBlank(r.ad_name)).length;
  if (unnamed > 0) out.push(`${unnamed} rows without a name`);
  const noLink = A.filter((r) => isBlank(r.asset_url)).length;
  if (noLink > 0) out.push(`${noLink} ads without a YouTube link`);
  if (isBlank(D('AD_BusinessName'))) out.push('Business name / logo not set: needed for YouTube responsive ads unless set on the advertiser');
  if (ios.some((r) => r.action === 'Update')) out.push('IO edits go in EDIT-SDF-InsertionOrders.csv: add the Timestamp from a fresh DV360 download before upload');
  return out;
}
