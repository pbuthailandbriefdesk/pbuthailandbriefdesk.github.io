// P2P QA: compares the DV360 set-up (SDF export) with the brief, which is the source of truth.
// Rules follow the team's "Senior Programmatic Campaign QA" prompt:
//   PASS     the DV360 value matches the brief / rule
//   FAIL     a direct mismatch
//   REVIEW   cannot be validated reliably, or needs a person to judge
//   REMINDER the export does not contain the field; check it in the DV360 UI
// YouTube and Non-YouTube rules are applied separately, per IO channel. Nothing is changed in DV360.
import { coalesce, isBlank } from './util.js';

const norm = (v) => String(v ?? '').trim().toLowerCase();
const blank = (v) => v === null || v === undefined || String(v).trim() === '';
const toNum = (v) => (blank(v) ? null : Number(String(v).replace(/[, ]/g, '')));
const sameNum = (a, b, tol = 0.01) => a !== null && b !== null && !Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) <= tol;
const pad = (n) => String(n).padStart(2, '0');
// "10/01/2026 00:00" or "10/01/2026" (DV360 SDF, US order) → "2026-10-01"
export function sdfDate(v) {
  const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad(m[1])}-${pad(m[2])}` : null;
}
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const videoId = (url) => (String(url || '').match(/(youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_\-]{11})/) || [])[2] || null;
const cleanUrl = (u) => String(u || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
// Same page once tracking parameters (utm_*, gclid, …) are removed.
const stripTracking = (u) => {
  const [base, query = ''] = String(u || '').split('?');
  const kept = query.split('&').filter((p) => p && !/^(utm_[^=]*|gclid|dclid|fbclid)=/i.test(p));
  return cleanUrl(kept.length ? `${base}?${kept.join('&')}` : base);
};
const tokens = (v) => String(v || '').split(/[;,]/).map((t) => t.trim()).filter(Boolean);

// Google geo / language IDs used by DV360
const GEO_THAILAND = '2764';
const LANG_IDS = { Thai: '1044', English: '1000', Chinese: '1017', Japanese: '1005', Korean: '1012', Vietnamese: '1040', Malay: '1102', Indonesian: '1025', Burmese: '1084', Cambodian: '1120', Laothian: '1121' };

const AGE_BANDS = [['18-24', 18, 24], ['25-34', 25, 34], ['35-44', 35, 44], ['45-54', 45, 54], ['55-64', 55, 64], ['65+', 65, 200]];
const plannedAges = (min, max) => {
  const lo = isBlank(min) ? 18 : Number(min);
  const hi = isBlank(max) ? 65 : Number(max);
  return AGE_BANDS.filter(([, a, z]) => a <= hi && z >= lo).map(([n]) => n);
};
const plannedGenders = (g) => (g === 'W' ? ['female'] : g === 'M' ? ['male'] : ['female', 'male']);
const actualGenders = (v) => [...new Set(tokens(v).map(norm).filter((t) => t === 'male' || t === 'female'))];
const actualAges = (v) => tokens(v).map((t) => t.replace(/\s/g, '')).filter((t) => /^\d/.test(t));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export function runQa(b, I, L, G, A, sdf) {
  const findings = [];
  const add = (f) => findings.push({ risk: 'Low', action: '', ...f });
  const ext = 'ext' + String(b.brief_id).split('-').pop();
  const used = { ios: new Set(), lines: new Set(), adGroups: new Set(), ads: new Set() };

  const find = (kind, idCol, { id, extId, name, filter }) => {
    const rows = (sdf[kind] || []).filter((r) => !filter || filter(r));
    const hit = (id && rows.find((r) => r[idCol] === String(id)))
      || (extId && rows.find((r) => r[idCol] === extId))
      || (name && rows.find((r) => norm(r.Name) === norm(name)));
    if (hit && used[kind]) used[kind].add(hit);
    return hit || null;
  };

  const nameCheck = (scope, entity, planned, actual) => {
    if (blank(planned)) return add({ scope, entity, parameter: 'Name / taxonomy', planned: '–', actual, status: 'REVIEW', risk: 'Low', reason: 'The brief has no name for this item yet.', action: 'Ad Ops fills the name in the Desk.' });
    if (String(planned).trim() === String(actual).trim()) return add({ scope, entity, parameter: 'Name / taxonomy', planned, actual, status: 'PASS', reason: 'Exact match.' });
    if (norm(planned) === norm(actual)) return add({ scope, entity, parameter: 'Name / taxonomy', planned, actual, status: 'PASS', reason: 'Same name, different upper/lower case.' });
    return add({ scope, entity, parameter: 'Name / taxonomy', planned, actual, status: 'FAIL', risk: 'Medium', reason: 'The DV360 name differs from the taxonomy in the brief.', action: 'Rename in DV360 (or fix the brief) so both match.' });
  };

  const statusCheck = (scope, entity, plannedAction, actual) => {
    const a = norm(actual);
    if (blank(actual)) return add({ scope, entity, parameter: 'Status', planned: plannedAction || 'Active', actual: '–', status: 'REMINDER', risk: 'High', reason: 'Status is not in the export.', action: 'Check the status in DV360.' });
    if (plannedAction === 'Pause') {
      return a === 'paused' || a === 'archived'
        ? add({ scope, entity, parameter: 'Status', planned: 'Paused (action Pause)', actual, status: 'PASS', reason: 'Paused as planned.' })
        : add({ scope, entity, parameter: 'Status', planned: 'Paused (action Pause)', actual, status: 'FAIL', risk: 'Critical', reason: 'The brief pauses this item but it is still running.', action: 'Pause it in DV360.' });
    }
    if (a === 'active') return add({ scope, entity, parameter: 'Status', planned: 'Active', actual, status: 'PASS', reason: 'Active.' });
    if (a === 'archived') return add({ scope, entity, parameter: 'Status', planned: 'Active', actual, status: 'FAIL', risk: 'Critical', reason: 'Archived items never deliver.', action: 'Use an active item in DV360.' });
    return add({ scope, entity, parameter: 'Status', planned: 'Active', actual, status: 'REVIEW', risk: 'High', reason: `${actual}: it will not deliver until activated.`, action: 'Confirm it will be activated for launch.' });
  };

  const isYt = (io) => io.channel === 'YouTube';
  const anyYt = I.some(isYt);
  const anyNonYt = I.some((i) => !isYt(i));

  // ------------------------------------------------------------------ Campaign
  const campaign = (sdf.campaigns || []).length === 1 ? sdf.campaigns[0]
    : (sdf.campaigns || []).find((r) => (b.dv360_campaign_id && r['Campaign Id'] === String(b.dv360_campaign_id)) || r['Campaign Id'] === ext + 'c' || norm(r.Name) === norm(b.campaign_taxonomy));
  const cName = b.campaign_taxonomy || b.campaign_name || 'Campaign';
  if (!campaign) {
    add({ scope: 'Campaign', entity: cName, parameter: 'Campaign', planned: b.dv360_campaign_id || cName, actual: (sdf.campaigns || []).length ? 'not matched' : 'no campaign file uploaded', status: 'REMINDER', risk: 'High', reason: 'The campaign row is not in the export, so its name, status and flight cannot be checked here.', action: 'Add the Campaigns SDF file, or check the campaign in DV360.' });
  } else {
    const ce = campaign.Name || cName;
    nameCheck('Campaign', ce, b.campaign_taxonomy, campaign.Name);
    if (!blank(campaign['Advertiser Id']) && !blank(b.advertiser)) {
      add(campaign['Advertiser Id'] === String(b.advertiser)
        ? { scope: 'Campaign', entity: ce, parameter: 'Advertiser', planned: `${b.advertiser_name || ''} (${b.advertiser})`, actual: campaign['Advertiser Id'], status: 'PASS', reason: 'Same DV360 advertiser.' }
        : { scope: 'Campaign', entity: ce, parameter: 'Advertiser', planned: `${b.advertiser_name || ''} (${b.advertiser})`, actual: campaign['Advertiser Id'], status: 'FAIL', risk: 'Critical', reason: 'The campaign is under a different advertiser.', action: 'Set up under the brief\'s advertiser.' });
    }
    if (!isBlank(b.dv360_campaign_id) && !blank(campaign['Campaign Id']) && !campaign['Campaign Id'].startsWith('ext')) {
      add(campaign['Campaign Id'] === String(b.dv360_campaign_id)
        ? { scope: 'Campaign', entity: ce, parameter: 'DV360 Campaign ID', planned: b.dv360_campaign_id, actual: campaign['Campaign Id'], status: 'PASS', reason: 'Same campaign as recorded in the Desk.' }
        : { scope: 'Campaign', entity: ce, parameter: 'DV360 Campaign ID', planned: b.dv360_campaign_id, actual: campaign['Campaign Id'], status: 'FAIL', risk: 'High', reason: 'The export is for a different campaign than the one recorded.', action: 'Check the right campaign was exported, or fix the Campaign ID in the Desk.' });
    }
    statusCheck('Campaign', ce, null, campaign.Status);
    const cs = sdfDate(campaign['Campaign Start Date']);
    const cend = sdfDate(campaign['Campaign End Date']);
    const extension = ['Extension', 'Update'].includes(b.brief_type);
    if (cs || cend) {
      const okStart = extension ? (!cs || cs <= b.launch_date) : cs === b.launch_date;
      const okEnd = !cend ? false : extension ? cend >= b.end_date : cend === b.end_date;
      add({ scope: 'Campaign', entity: ce, parameter: 'Campaign flight', planned: `${b.launch_date} → ${b.end_date}${extension ? ' (extension: may start earlier, must run to the end)' : ''}`,
        actual: `${cs || '–'} → ${cend || 'no end date'}`, status: okStart && okEnd ? 'PASS' : 'FAIL', risk: 'Critical',
        reason: okStart && okEnd ? 'Campaign dates cover the brief.' : 'Campaign dates do not match the brief flight.', action: okStart && okEnd ? '' : 'Fix the campaign start / end date in DV360.' });
    }
  }

  // ------------------------------------------------------------------ Insertion orders
  const ioRow = new Map();
  for (const io of I) {
    const entity = io.io_name || `IO ${io.io_no}`;
    const row = find('ios', 'Io Id', { id: io.dv360_id, extId: `${ext}io${io.io_no}`, name: io.io_name });
    ioRow.set(io.id, row);
    if (!row) {
      add({ scope: 'Insertion order', entity, parameter: 'Found in DV360', planned: entity, actual: 'not in the export', status: 'FAIL', risk: 'Critical', reason: 'This IO from the brief is not in the uploaded export.', action: 'Create it in DV360, or upload the Insertion orders file that contains it.' });
      continue;
    }
    const e = row.Name || entity;
    nameCheck('Insertion order', e, io.io_name, row.Name);
    statusCheck('Insertion order', e, io.action, row.Status);

    // Budget: the segment for this brief's period must carry the planned amount.
    const segs = [...String(row['Budget Segments'] || '').matchAll(/\(([^)]*)\)/g)].map((m) => {
      const p = m[1].split(';').map((x) => x.trim());
      return { amount: toNum(p[0]), start: sdfDate(p[1]), end: sdfDate(p[2]) };
    });
    const pStart = coalesce(io.segment_start, io.start_date);
    const pEnd = coalesce(io.segment_end, io.end_date);
    const seg = segs.find((s) => s.start === pStart && s.end === pEnd);
    if (segs.length === 0) {
      add({ scope: 'Insertion order', entity: e, parameter: 'Budget segment', planned: `THB ${io.budget} · ${pStart} → ${pEnd}`, actual: '–', status: 'REMINDER', risk: 'Critical', reason: 'Budget segments are not in the export.', action: 'Check the IO budget in DV360.' });
    } else if (!seg) {
      add({ scope: 'Insertion order', entity: e, parameter: 'Budget segment', planned: `THB ${io.budget} · ${pStart} → ${pEnd}`, actual: segs.map((s) => `${s.amount} · ${s.start} → ${s.end}`).join(' | '), status: 'FAIL', risk: 'Critical', reason: 'No budget segment with the planned dates.', action: 'Fix the segment dates / amount in DV360.' });
    } else {
      add({ scope: 'Insertion order', entity: e, parameter: 'Budget segment', planned: `THB ${io.budget} · ${pStart} → ${pEnd}`, actual: `${seg.amount} · ${seg.start} → ${seg.end}`,
        status: sameNum(seg.amount, toNum(io.budget)) ? 'PASS' : 'FAIL', risk: 'Critical',
        reason: sameNum(seg.amount, toNum(io.budget)) ? 'Amount and dates match.' : 'Segment amount differs from the planned IO budget (the brief budget includes fees).',
        action: sameNum(seg.amount, toNum(io.budget)) ? '' : 'Correct the segment amount in DV360.' });
    }
    if (toNum(io.prior_budget) > 0) {
      const prior = segs.find((s) => s.end === addDays(pStart, -1));
      add({ scope: 'Insertion order', entity: e, parameter: 'Earlier budget segment', planned: `THB ${io.prior_budget} ending ${addDays(pStart, -1)}`, actual: prior ? `${prior.amount} · ${prior.start} → ${prior.end}` : 'not found',
        status: prior && sameNum(prior.amount, toNum(io.prior_budget)) ? 'PASS' : 'REVIEW', risk: 'Medium',
        reason: prior && sameNum(prior.amount, toNum(io.prior_budget)) ? 'Earlier booking matches.' : 'The earlier booking in the brief does not match a segment.', action: 'Confirm the earlier segment in DV360.' });
    }
    if (!blank(io.pacing)) {
      const actual = row['Pacing Rate'] || row.Pacing;
      add(blank(actual) ? { scope: 'Insertion order', entity: e, parameter: 'Pacing', planned: io.pacing, actual: '–', status: 'REMINDER', risk: 'High', reason: 'Pacing is not in the export.', action: 'Check pacing in DV360.' }
        : { scope: 'Insertion order', entity: e, parameter: 'Pacing', planned: io.pacing, actual, status: norm(actual).includes(norm(io.pacing)) ? 'PASS' : 'FAIL', risk: 'High', reason: norm(actual).includes(norm(io.pacing)) ? 'Matches.' : 'Pacing differs from the brief.', action: 'Set the planned pacing in DV360.' });
    }
    if (!blank(io.kpi_model)) {
      const t = row['Kpi Type'];
      const v = toNum(row['Kpi Value']);
      const typeOk = norm(t).replace(/[^a-z%]/g, '').includes(norm(io.kpi_model).replace(/[^a-z%]/g, ''));
      add({ scope: 'Insertion order', entity: e, parameter: 'KPI', planned: `${io.kpi_model} ${io.kpi_target ?? ''}`, actual: `${t || '–'} ${row['Kpi Value'] || ''}`,
        status: typeOk && (isBlank(io.kpi_target) || sameNum(v, toNum(io.kpi_target))) ? 'PASS' : 'FAIL', risk: 'High',
        reason: typeOk ? (sameNum(v, toNum(io.kpi_target)) || isBlank(io.kpi_target) ? 'KPI type and value match.' : 'KPI value differs.') : 'KPI type differs.', action: 'Set the planned KPI in DV360.' });
    }
    if (!isBlank(io.freq_exposures)) {
      const per = { Day: 'day', Week: 'week', Month: 'month', Lifetime: 'lifetime' }[io.freq_period] || norm(io.freq_period);
      const on = norm(row['Frequency Enabled']) === 'true';
      const ok = on && sameNum(toNum(row['Frequency Exposures']), toNum(io.freq_exposures)) && norm(row['Frequency Period']).startsWith(per.slice(0, 3));
      add({ scope: 'Insertion order', entity: e, parameter: 'Frequency cap', planned: `${io.freq_exposures} / ${io.freq_period}`, actual: on ? `${row['Frequency Exposures']} per ${row['Frequency Amount'] || 1} ${row['Frequency Period']}` : 'off',
        status: ok ? 'PASS' : 'FAIL', risk: 'High', reason: ok ? 'Matches.' : 'Frequency cap differs from the brief.', action: 'Set the planned frequency cap on the IO.' });
    } else if (!isBlank(io.freq_cap)) {
      add({ scope: 'Insertion order', entity: e, parameter: 'Frequency cap', planned: io.freq_cap, actual: norm(row['Frequency Enabled']) === 'true' ? `${row['Frequency Exposures']} per ${row['Frequency Period']}` : 'off', status: 'REVIEW', risk: 'High', reason: 'The brief describes the cap in words only.', action: 'Confirm the cap matches the brief.' });
    }
  }

  // ------------------------------------------------------------------ Line items
  const liRow = new Map();
  for (const l of L) {
    const io = I.find((x) => x.io_no === l.io_no) || {};
    const yt = isYt(io);
    const entity = l.line_item_name || `Line item ${l.io_no}.${l.line_no}`;
    const row = find('lines', 'Line Item Id', { id: l.dv360_id, extId: `${ext}li${l.io_no}x${l.line_no}`, name: l.line_item_name });
    liRow.set(l.id, row);
    if (!row) {
      add({ scope: 'Line item', entity, parameter: 'Found in DV360', planned: entity, actual: 'not in the export', status: 'FAIL', risk: 'Critical', reason: 'This line item from the brief is not in the uploaded export.', action: 'Create it in DV360, or upload the Line items file that contains it.' });
      continue;
    }
    const e = row.Name || entity;
    nameCheck('Line item', e, l.line_item_name, row.Name);
    statusCheck('Line item', e, l.action, row.Status);
    const ior = ioRow.get(io.id);
    if (ior && !blank(row['Io Id']) && row['Io Id'] !== ior['Io Id']) {
      add({ scope: 'Line item', entity: e, parameter: 'Parent IO', planned: io.io_name, actual: row['Io Name'] || row['Io Id'], status: 'FAIL', risk: 'High', reason: 'The line item sits under a different IO than planned.', action: 'Move / recreate it under the planned IO.' });
    }
    const type = norm(row.Type);
    const ytType = type.includes('trueview') || type.includes('youtube');
    if (!blank(row.Type)) {
      add(yt === ytType ? { scope: 'Line item', entity: e, parameter: 'Line item type', planned: yt ? 'YouTube (TrueView)' : 'Non-YouTube', actual: row.Type, status: 'PASS', reason: 'Type matches the IO channel.' }
        : { scope: 'Line item', entity: e, parameter: 'Line item type', planned: yt ? 'YouTube (TrueView)' : 'Non-YouTube', actual: row.Type, status: 'FAIL', risk: 'Critical', reason: 'Wrong line item type for the planned channel: it would buy the wrong inventory.', action: 'Recreate with the planned type.' });
    }
    if (yt && !blank(row.Subtype)) {
      const expected = { VVC: 'view', Shorts: 'view', 'Non-skip': 'non skippable' }[l.format] || 'reach';
      add({ scope: 'Line item', entity: e, parameter: 'YouTube line item subtype', planned: `${l.format} (${expected})`, actual: row.Subtype, status: norm(row.Subtype).includes(expected) ? 'PASS' : 'REVIEW', risk: 'Medium', reason: norm(row.Subtype).includes(expected) ? 'Subtype fits the planned format.' : 'Subtype may not fit the planned format.', action: 'Confirm the YouTube line item type.' });
    }
    // Flight
    const same = (v) => norm(v).includes('same as');
    const ls = same(row['Start Date']) ? 'same as IO' : sdfDate(row['Start Date']);
    const le = same(row['End Date']) ? 'same as IO' : sdfDate(row['End Date']);
    let flightOk;
    let flightNote;
    if (ls === 'same as IO' && le === 'same as IO') {
      flightOk = l.start_date === coalesce(io.segment_start, io.start_date) && l.end_date === coalesce(io.segment_end, io.end_date) || (l.start_date === io.start_date && l.end_date === io.end_date);
      flightNote = flightOk ? 'Follows the IO, and the brief plans the same dates.' : 'DV360 follows the IO flight but the brief plans different line dates.';
    } else {
      flightOk = ls === l.start_date && le === l.end_date;
      flightNote = flightOk ? 'Dates match.' : 'Line item dates differ from the brief.';
    }
    add({ scope: 'Line item', entity: e, parameter: 'Flight', planned: `${l.start_date} → ${l.end_date}`, actual: `${ls || '–'} → ${le || '–'}`, status: flightOk ? 'PASS' : 'FAIL', risk: 'Critical', reason: flightNote, action: flightOk ? '' : 'Fix the line item flight in DV360.' });
    // Budget
    if (!isBlank(l.budget)) {
      const bt = norm(row['Budget Type']);
      if (bt.includes('unlimited')) add({ scope: 'Line item', entity: e, parameter: 'Budget', planned: `THB ${l.budget}`, actual: 'Unlimited (IO controls spend)', status: 'REVIEW', risk: 'High', reason: 'The line has no own budget; spend is only limited by the IO.', action: 'Confirm this is intended.' });
      else add({ scope: 'Line item', entity: e, parameter: 'Budget', planned: `THB ${l.budget}`, actual: row['Budget Amount'] || '–', status: sameNum(toNum(row['Budget Amount']), toNum(l.budget)) ? 'PASS' : 'FAIL', risk: 'Critical', reason: sameNum(toNum(row['Budget Amount']), toNum(l.budget)) ? 'Matches.' : 'Line budget differs from the brief.', action: 'Correct the line item budget.' });
    }
    // Bidding
    if (!blank(l.bid_strategy) || !isBlank(l.bid_target)) {
      const st = yt ? row['TrueView Bid Strategy Type'] : row['Bid Strategy Type'];
      const sv = toNum(yt ? row['TrueView Bid Strategy Value'] : row['Bid Strategy Value']);
      const stOk = blank(l.bid_strategy) || norm(st).replace(/\s/g, '').includes(norm(l.bid_strategy).replace(/\s/g, '').replace('target', '')) ;
      const svOk = isBlank(l.bid_target) || sameNum(sv, toNum(l.bid_target));
      add({ scope: 'Line item', entity: e, parameter: 'Bid strategy / target', planned: `${l.bid_strategy || '–'} ${l.bid_target ?? ''}`, actual: `${st || '–'} ${sv ?? ''}`,
        status: blank(st) ? 'REMINDER' : stOk && svOk ? 'PASS' : 'FAIL', risk: 'High', reason: blank(st) ? 'Bid strategy is not in the export.' : stOk && svOk ? 'Matches.' : 'Bid strategy or target differs.', action: 'Set the planned bid strategy and target.' });
    }
    // Geography
    const geo = row['Geography Targeting - Include'];
    if (/thai/i.test(b.geo || 'Thailand')) {
      add(blank(geo) ? { scope: 'Line item', entity: e, parameter: 'Geography', planned: b.geo || 'Thailand', actual: 'none set', status: 'FAIL', risk: 'Critical', reason: 'No geography targeting: the line could serve outside Thailand.', action: 'Target Thailand on the line item.' }
        : { scope: 'Line item', entity: e, parameter: 'Geography', planned: b.geo || 'Thailand', actual: geo, status: tokens(geo).every((t) => t.replace(/\D/g, '') === GEO_THAILAND) ? 'PASS' : 'REVIEW', risk: 'Critical',
          reason: tokens(geo).every((t) => t.replace(/\D/g, '') === GEO_THAILAND) ? 'Thailand only.' : 'Other locations are targeted as well, or regions instead of the country.', action: 'Confirm the geography matches the brief.' });
    } else {
      add({ scope: 'Line item', entity: e, parameter: 'Geography', planned: b.geo, actual: geo || 'none set', status: 'REVIEW', risk: 'Critical', reason: 'Geography IDs cannot be matched to the brief text automatically.', action: 'Check the geography in DV360.' });
    }
    // Language
    if (!blank(l.language)) {
      const lang = row['Language Targeting - Include'];
      const want = LANG_IDS[l.language];
      const ok = l.language === 'ALL' ? blank(lang) : want && tokens(lang).some((t) => t.replace(/\D/g, '') === want);
      add({ scope: 'Line item', entity: e, parameter: 'Language', planned: l.language, actual: lang || 'all languages', status: ok ? 'PASS' : 'REVIEW', risk: 'Medium', reason: ok ? 'Matches.' : 'Language targeting may not match the brief.', action: 'Check language targeting.' });
    }
    // Device / environment
    if (!blank(l.device) && l.device !== 'All') add({ scope: 'Line item', entity: e, parameter: 'Device', planned: l.device, actual: row['Device Targeting - Include'] || 'all devices', status: 'REVIEW', risk: 'Medium', reason: 'Device IDs cannot be matched to the brief automatically.', action: 'Check device targeting.' });
    if (!yt && !blank(l.environment) && l.environment !== 'All') add({ scope: 'Line item', entity: e, parameter: 'Environment', planned: l.environment, actual: row['Environment Targeting'] || 'all', status: norm(row['Environment Targeting']).includes(norm(l.environment)) ? 'PASS' : 'REVIEW', risk: 'Medium', reason: 'Compared by name.', action: 'Check environment targeting.' });
    if (yt) {
      // YouTube inventory (mandatory)
      const inv = row['TrueView Inventory Source Targeting'];
      const planInv = l.inventory || 'YouTube';
      const partners = /partner/i.test(inv || '');
      const ytOnlyPlanned = /youtube/i.test(planInv) && !/partner|gvp/i.test(planInv);
      add(blank(inv) ? { scope: 'Line item', entity: e, parameter: 'YouTube inventory', planned: planInv, actual: '–', status: 'REMINDER', risk: 'Critical', reason: 'Enabled inventory is not in the export.', action: 'Check Inventory source (YouTube / Google Video Partners) in DV360.' }
        : partners && ytOnlyPlanned ? { scope: 'Line item', entity: e, parameter: 'YouTube inventory', planned: planInv, actual: inv, status: 'REVIEW', risk: 'High', reason: 'Google Video Partners is enabled; the brief names YouTube only.', action: 'Confirm partners are allowed, or turn them off.' }
          : { scope: 'Line item', entity: e, parameter: 'YouTube inventory', planned: planInv, actual: inv, status: 'PASS', reason: 'Enabled inventory fits the brief.' });
    } else {
      // Non-YouTube supply: deals
      const incl = `${row['Inventory Source Targeting - Include'] || ''};${row['Private Deal Group Targeting Include'] || ''}`;
      if (['PG', 'PMP'].includes(io.buying_type) && !blank(io.deal_id)) {
        const ok = norm(incl).includes(norm(io.deal_id));
        add({ scope: 'Line item', entity: e, parameter: 'Deal', planned: `${io.buying_type} ${io.deal_id}`, actual: incl.replace(/^;|;$/g, '') || 'none', status: ok ? 'PASS' : 'FAIL', risk: 'Critical', reason: ok ? 'The planned deal is targeted.' : 'The planned deal ID is not targeted.', action: 'Target the planned deal.' });
      } else {
        add({ scope: 'Line item', entity: e, parameter: 'Inventory', planned: io.buying_type || 'Open auction', actual: incl.replace(/^;|;$/g, '') || 'all exchanges', status: 'REVIEW', risk: 'Medium', reason: 'Exchanges cannot be compared with the brief automatically.', action: 'Confirm exchanges / sites in DV360.' });
      }
      // Non-YouTube audience and demographics live on the line
      if (!blank(l.audience)) {
        const cols = ['Audience Targeting - Include', 'Affinity & In Market Targeting - Include', 'Custom List Targeting', 'Combined Audience Targeting', 'Category Targeting - Include', 'Keyword Targeting - Include'];
        const set = cols.filter((c) => !blank(row[c]));
        add({ scope: 'Line item', entity: e, parameter: 'Audience', planned: l.audience, actual: set.map((c) => `${c}: ${row[c]}`).join(' | ') || 'none', status: set.length ? 'REVIEW' : 'FAIL', risk: 'High',
          reason: set.length ? 'Audience IDs are set; they cannot be matched to the brief\'s description automatically.' : 'The brief plans targeting but none is set.', action: set.length ? 'Confirm the IDs are the planned audiences.' : 'Add the planned audiences.' });
      }
      const g = row['Demographic Targeting Gender'];
      if (!blank(l.gender) && !blank(g)) {
        const ok = sameSet(plannedGenders(l.gender), actualGenders(g));
        add({ scope: 'Line item', entity: e, parameter: 'Gender', planned: l.gender, actual: g, status: ok ? 'PASS' : 'FAIL', risk: 'High', reason: ok ? 'Matches.' : 'Gender differs.', action: 'Fix gender targeting.' });
      }
      const ag = row['Demographic Targeting Age'];
      if ((!isBlank(l.age_min) || !isBlank(l.age_max)) && !blank(ag)) {
        const ok = sameSet(plannedAges(l.age_min, l.age_max), actualAges(ag));
        add({ scope: 'Line item', entity: e, parameter: 'Age', planned: `${l.age_min ?? 18}-${l.age_max ?? '65+'}`, actual: ag, status: ok ? 'PASS' : 'FAIL', risk: 'High', reason: ok ? 'Matches.' : 'Age ranges differ.', action: 'Fix age targeting.' });
      }
      // Creatives are not listed per line in SDF ads (those are YouTube only)
      const planned = A.filter((a) => a.io_no === l.io_no && a.line_no === l.line_no && Number(a.ag_no) === 0).length;
      add({ scope: 'Creative', entity: e, parameter: 'Creative assignment', planned: `${planned} creatives`, actual: row['Creative Assignments'] ? `${tokens(row['Creative Assignments']).length} assigned` : 'not in export', status: row['Creative Assignments'] ? 'REVIEW' : 'REMINDER', risk: 'High', reason: 'The export cannot prove which creatives are the planned ones.', action: 'Check creative assignment, sizes and landing pages in DV360.' });
    }
    // Verification
    if (/ias|integral|dv\b|doubleverify|moat/i.test(io.verification || '')) {
      const v = yt ? (row['TrueView Third-Party Brand Safety Vendor'] || row['TrueView Third-Party Viewability Vendor']) : row['Third Party Verification Services'];
      add({ scope: 'Line item', entity: e, parameter: 'Verification', planned: io.verification, actual: v || 'none', status: !blank(v) && !/none/i.test(v) ? 'PASS' : yt ? 'REVIEW' : 'FAIL', risk: 'High', reason: !blank(v) && !/none/i.test(v) ? 'A verification vendor is set.' : 'The brief asks for verification but none is set.', action: 'Add the planned verification vendor.' });
    }
    if (!blank(l.exclusions)) {
      const cols = ['Channel Targeting - Exclude', 'Site Targeting - Exclude', 'App Targeting - Exclude', 'Keyword Targeting - Exclude', 'Keyword List Targeting - Exclude', 'Category Targeting - Exclude', 'TrueView Category Exclusions Targeting'];
      const set = cols.filter((c) => !blank(row[c]));
      add({ scope: 'Line item', entity: e, parameter: 'Exclusions', planned: l.exclusions, actual: set.map((c) => `${c}: ${row[c]}`).join(' | ') || 'none', status: set.length ? 'REVIEW' : 'FAIL', risk: 'High', reason: set.length ? 'Exclusions are set; confirm they are the planned ones.' : 'The brief plans exclusions but none are set.', action: 'Check exclusions in DV360.' });
    }
  }

  // ------------------------------------------------------------------ Ad groups (YouTube)
  const agRow = new Map();
  for (const g of G) {
    const l = L.find((x) => x.io_no === g.io_no && x.line_no === g.line_no) || {};
    const entity = g.ad_group_name || `Ad group ${g.io_no}.${g.line_no}.${g.ag_no}`;
    const lr = liRow.get(l.id);
    const row = find('adGroups', 'Ad Group Id', { id: g.dv360_id, extId: `${ext}ag${g.io_no}x${g.line_no}x${g.ag_no}`, name: g.ad_group_name, });
    agRow.set(g.id, row);
    if (!row) {
      add({ scope: 'Ad group', entity, parameter: 'Found in DV360', planned: entity, actual: 'not in the export', status: 'FAIL', risk: 'High', reason: 'This ad group from the brief is not in the uploaded export.', action: 'Create it in DV360, or upload the Ad groups file.' });
      continue;
    }
    const e = row.Name || entity;
    nameCheck('Ad group', e, g.ad_group_name, row.Name);
    statusCheck('Ad group', e, g.action, row.Status);
    if (lr && row['Line Item Id'] !== lr['Line Item Id']) add({ scope: 'Ad group', entity: e, parameter: 'Parent line item', planned: l.line_item_name, actual: row['Line Item Name'] || row['Line Item Id'], status: 'FAIL', risk: 'High', reason: 'The ad group sits under a different line item.', action: 'Move it under the planned line item.' });
    const gen = row['Demographic Targeting Gender'];
    if (!blank(g.gender)) {
      const ok = !blank(gen) && sameSet(plannedGenders(g.gender), actualGenders(gen));
      add({ scope: 'Ad group', entity: e, parameter: 'Gender', planned: g.gender, actual: gen || '–', status: blank(gen) ? 'REMINDER' : ok ? 'PASS' : 'FAIL', risk: 'High', reason: blank(gen) ? 'Not in the export.' : ok ? 'Matches.' : 'Gender differs.', action: 'Fix gender on the ad group.' });
    }
    const age = row['Demographic Targeting Age'];
    if (!isBlank(g.age_min) || !isBlank(g.age_max)) {
      const ok = !blank(age) && sameSet(plannedAges(g.age_min, g.age_max), actualAges(age));
      add({ scope: 'Ad group', entity: e, parameter: 'Age', planned: `${g.age_min ?? 18}-${g.age_max ?? '65+'}`, actual: age || '–', status: blank(age) ? 'REMINDER' : ok ? 'PASS' : 'FAIL', risk: 'High', reason: blank(age) ? 'Not in the export.' : ok ? 'Matches.' : 'Age ranges differ.', action: 'Fix age on the ad group.' });
    }
    const cols = ['Audience Targeting - Include', 'Affinity & In Market Targeting - Include', 'Custom List Targeting', 'Combined Audience Targeting', 'Life Event Targeting - Include', 'Detailed Demo Targeting - Include', 'Lookalike Audience Targeting - Include', 'Keyword Targeting - Include', 'Category Targeting - Include', 'Placement Targeting - YouTube Channels - Include', 'Placement Targeting - YouTube Videos - Include'];
    const set = cols.filter((c) => !blank(row[c]));
    const broad = g.aud_targeting === 'Demographics Audiences' || /broad|prospect/i.test(g.audience || '');
    if (broad && set.length === 0) add({ scope: 'Ad group', entity: e, parameter: 'Audience', planned: g.audience || g.aud_targeting, actual: 'demographics only', status: 'PASS', reason: 'Broad / demographic targeting as planned.' });
    else if (set.length === 0) add({ scope: 'Ad group', entity: e, parameter: 'Audience', planned: g.audience || g.aud_targeting, actual: 'none set', status: 'FAIL', risk: 'High', reason: 'The brief plans an audience but none is set.', action: 'Add the planned audience.' });
    else add({ scope: 'Ad group', entity: e, parameter: 'Audience', planned: g.audience || g.aud_targeting, actual: set.map((c) => `${c}: ${row[c]}`).join(' | '), status: 'REVIEW', risk: 'Medium', reason: 'Audience IDs are set; a similar name is not proof of the same audience.', action: 'Confirm each audience ID is the planned one.' });
    const planBid = toNum(coalesce(g.bid_cost, l.bid_target));
    if (planBid !== null && !blank(row['Bid Cost'])) {
      add({ scope: 'Ad group', entity: e, parameter: 'Bid', planned: planBid, actual: row['Bid Cost'], status: sameNum(toNum(row['Bid Cost']), planBid) ? 'PASS' : 'FAIL', risk: 'Medium', reason: sameNum(toNum(row['Bid Cost']), planBid) ? 'Matches.' : 'Bid differs.', action: 'Set the planned bid.' });
    }
  }

  // ------------------------------------------------------------------ YouTube ads
  for (const a of A.filter((x) => Number(x.ag_no) > 0)) {
    const g = G.find((x) => x.io_no === a.io_no && x.line_no === a.line_no && x.ag_no === a.ag_no) || {};
    const entity = a.ad_name || `Ad ${a.io_no}.${a.line_no}.${a.ag_no} #${a.ad_no}`;
    const gr = agRow.get(g.id);
    const row = find('ads', 'Ad Id', { id: a.dv360_id, name: a.ad_name, filter: gr ? (r) => r['Ad Group Id'] === gr['Ad Group Id'] : null })
      || find('ads', 'Ad Id', { id: a.dv360_id, name: a.ad_name });
    if (!row) {
      add({ scope: 'Ad', entity, parameter: 'Found in DV360', planned: entity, actual: 'not in the export', status: 'FAIL', risk: 'High', reason: 'This ad from the brief is not in the uploaded export.', action: 'Create it in DV360, or upload the Ads file.' });
      continue;
    }
    const e = row.Name || entity;
    nameCheck('Ad', e, a.ad_name, row.Name);
    statusCheck('Ad', e, a.action, row.Status);
    if (gr && row['Ad Group Id'] !== gr['Ad Group Id']) add({ scope: 'Ad', entity: e, parameter: 'Ad group', planned: g.ad_group_name, actual: row['Ad Group Name'] || row['Ad Group Id'], status: 'FAIL', risk: 'High', reason: 'The ad is in a different ad group.', action: 'Move it to the planned ad group.' });
    const pv = videoId(a.asset_url);
    const av = row['Video Id'];
    add(!pv ? { scope: 'Ad', entity: e, parameter: 'YouTube video', planned: a.asset_url || '–', actual: av || '–', status: 'REVIEW', risk: 'Critical', reason: 'The brief has no readable YouTube link.', action: 'Add the video link to the brief.' }
      : { scope: 'Ad', entity: e, parameter: 'YouTube video', planned: pv, actual: av || '–', status: av === pv ? 'PASS' : 'FAIL', risk: 'Critical', reason: av === pv ? 'Same video.' : 'Wrong or missing video.', action: 'Use the planned video.' });
    if (!blank(a.landing_url)) {
      const al = row['Landing Page URL'];
      const exact = cleanUrl(al) === cleanUrl(a.landing_url);
      const loose = stripTracking(al) === stripTracking(a.landing_url);
      add({ scope: 'Ad', entity: e, parameter: 'Landing page', planned: a.landing_url, actual: al || '–', status: exact ? 'PASS' : loose ? 'REVIEW' : 'FAIL', risk: 'High', reason: exact ? 'Same URL.' : loose ? 'Same page, different tracking parameters.' : 'Landing page differs.', action: 'Set the planned landing URL.' });
    }
    if (!blank(a.cta)) add({ scope: 'Ad', entity: e, parameter: 'Call to action', planned: a.cta, actual: row['Call to Action'] || '–', status: norm(row['Call to Action']) === norm(a.cta) ? 'PASS' : 'FAIL', risk: 'Medium', reason: norm(row['Call to Action']) === norm(a.cta) ? 'Matches.' : 'CTA differs.', action: 'Set the planned CTA.' });
    if (!blank(a.headline)) add({ scope: 'Ad', entity: e, parameter: 'Headline', planned: a.headline, actual: row.Headline || '–', status: norm(row.Headline) === norm(a.headline) ? 'PASS' : 'FAIL', risk: 'Medium', reason: norm(row.Headline) === norm(a.headline) ? 'Matches.' : 'Headline differs.', action: 'Set the planned headline.' });
  }

  // ------------------------------------------------------------------ Items in DV360 that the brief doesn't have
  for (const [kind, label, idCol] of [['ios', 'Insertion order', 'Io Id'], ['lines', 'Line item', 'Line Item Id'], ['adGroups', 'Ad group', 'Ad Group Id'], ['ads', 'Ad', 'Ad Id']]) {
    for (const r of (sdf[kind] || []).filter((x) => !used[kind].has(x))) {
      const active = norm(r.Status) === 'active';
      add({ scope: label, entity: r.Name || r[idCol], parameter: 'Not in the brief', planned: '–', actual: `${r[idCol]} · ${r.Status || ''}`, status: 'REVIEW', risk: active ? 'High' : 'Low',
        reason: active ? 'An active item that the brief does not plan: it could spend.' : 'Item in the export that the brief does not plan (not active).', action: 'Confirm it belongs to this campaign, or pause / archive it.' });
    }
  }

  // ------------------------------------------------------------------ Manual QA (never in the export)
  const manual = [
    { key: 'brand-safety', item: 'Brand safety / content suitability', where: anyYt ? 'Line item → Brand safety, and YouTube Content exclusions (inventory type, content labels)' : 'Line item → Targeting → Brand safety / Digital content labels' },
    { key: 'creative-approval', item: 'Creatives approved and serving', where: anyYt ? 'Ad group → Ads: YouTube review status is Eligible' : 'Creatives → Approval status (Google + exchanges)' },
    { key: 'tracking', item: `Tracking live: ${b.tracking || 'as in the brief'}`, where: 'Floodlight / CM360 / UTM on the landing pages' },
    { key: 'launch-timing', item: 'Nothing can spend before the approved start date', where: 'Campaign, IO and line flights and statuses' },
  ];
  if (I.some((i) => /ias|integral|dv\b|doubleverify|moat/i.test(i.verification || ''))) manual.push({ key: 'verification', item: `Verification set up: ${[...new Set(I.map((i) => i.verification).filter(Boolean))].join(', ')}`, where: 'Verification platform + DV360 line item / YouTube third-party settings' });
  if (b.brand_lift === 'Yes') manual.push({ key: 'brand-lift', item: 'Brand lift study set up', where: 'YouTube line items → Brand lift (budget, dates, questions as in the brief)' });

  const count = (s, r) => findings.filter((f) => f.status === s && (!r || f.risk === r)).length;
  return {
    findings,
    manual,
    type: anyYt && anyNonYt ? 'YouTube + Non-YouTube' : anyYt ? 'YouTube' : 'Non-YouTube',
    counts: { pass: count('PASS'), fail: count('FAIL'), review: count('REVIEW'), reminder: count('REMINDER') + manual.length, critical: count('FAIL', 'Critical'), high: count('FAIL', 'High') },
  };
}

// Final decision. Strict, as agreed: any FAIL blocks; every REVIEW / REMINDER must be confirmed by QA.
export function decide(findings, accepted, ticked, manual) {
  if (findings.some((f) => f.status === 'FAIL')) return 'NOT READY TO LAUNCH';
  const openFindings = findings.filter((f, i) => (f.status === 'REVIEW' || f.status === 'REMINDER') && !accepted.has(i)).length;
  const openManual = manual.filter((m) => !ticked.has(m.key)).length;
  return openFindings + openManual > 0 ? 'READY WITH REVIEW' : 'READY TO LAUNCH';
}
