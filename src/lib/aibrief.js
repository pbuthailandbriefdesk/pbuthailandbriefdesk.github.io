// AI-assisted brief filling without an API: the Desk writes a prompt for WPP Open AI (or any
// chat AI), the planner pastes the AI's JSON answer back, and we turn it into brief rows.
// Everything here is plain functions so it can be tested without the UI.
import { AUDS, CATS, DEVICES, LANGS, OBJS, OPT, ytTypeForFormat } from './constants.js';
import { isBlank, todayBkk } from './util.js';

// ----------------------------------------------------------------------------- prompt

const AD_KEYS = {
  ad_name: 'string', video_length: 'number (seconds, YouTube)', creative_size: 'string (non-YouTube, e.g. 300x250)',
  asset_url: 'YouTube URL or creative link', landing_url: 'https://…', display_url: 'string', cta: 'max 10 chars',
  headline: 'max 15 chars', description: 'string', asset_desc: 'short asset description', asset_source: OPT.assetSource,
  cta_code: OPT.ctaCode, redirect: OPT.redirect, retailer: 'string',
};

export function buildPrompt({ text, brands, today = todayBkk() }) {
  const list = (a) => a.join(' | ');
  const schema = {
    campaign: {
      brand: `one of the BRANDS list`, team: list(OPT.team), brief_type: list(OPT.briefType),
      campaign_name: 'short working name', geo: 'Thailand unless stated', launch_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD',
      effective_date: 'YYYY-MM-DD (Extension/Update only)', objective: list(OPT.objective), kpi_model: list(OPT.kpiModel),
      kpi_target: 'number (THB)', category: 'one of CATEGORIES', franchise: 'product line', campaign_desc: 'short description for naming',
      po_number: 'string', po_amount: 'number (THB)', total_budget: 'number (THB incl. fee)', tracking: 'string',
      brand_safety: 'string', reporting: 'string', brand_lift: list(OPT.yesNo), bls_notes: 'string', notes: 'string',
    },
    insertion_orders: [{
      channel: list(OPT.channel), io_type: list(OPT.ioType),
      io_format: `YouTube: ${list(OPT.ytFormats)}; Non-YouTube: ${list(OPT.otherFormats)}`,
      budget: 'number (THB incl. fee)', start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD', pacing: list(OPT.pacing),
      buying_type: list(OPT.buyingType), deal_id: 'string', kpi_model: list(OPT.ioKpi), kpi_target: 'number',
      freq_exposures: 'number', freq_period: list(OPT.freqPeriod), verification: 'IAS / DV / none',
      io_objective: list(OBJS.map((o) => o.name)),
      line_items: [{
        format: 'same choices as io_format', budget: 'number', start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD',
        bid_strategy: list(OPT.bidStrategy), bid_target: 'number (THB)', inventory: 'string', deal_type: list(OPT.dealType),
        aud_targeting: 'one of AUDIENCE TYPES', aud_tactic: 'short tactic', gender: list(OPT.gender), age_min: 'number', age_max: 'number',
        language: list(LANGS.map((x) => x.name)), device: list(DEVICES.map((x) => x.name)), environment: list(OPT.environment),
        audience: 'Non-YouTube only: audience, demographics, geo', exclusions: 'Non-YouTube only',
        ad_groups: [{
          audience: 'affinity / in-market / 1P / custom audiences', demographics: 'gender, age, parental',
          aud_targeting: 'one of AUDIENCE TYPES', aud_tactic: 'string', gender: list(OPT.gender), age_min: 'number', age_max: 'number',
          ads: [AD_KEYS],
        }],
        creatives: [AD_KEYS],
      }],
    }],
    questions: ['anything important that is missing or unclear'],
  };

  return `You are helping a programmatic planner at WPP Media Thailand fill a DV360 campaign brief for L'Oréal.
Read the PLANNER NOTES and return the brief as JSON that follows the SCHEMA exactly.

RULES
- Reply with ONE JSON code block only. No text before or after it.
- Use only the allowed values shown in the schema and the lists below (exact spelling). If a value is not given, use null. Never invent PO numbers, IDs, URLs or budgets.
- Money is a plain number in THB including fee (1.5 ล้าน / 1.5M = 1500000). Dates are YYYY-MM-DD. Today is ${today}; a date without a year means the next one from today.
- YouTube insertion orders: put ads inside "ad_groups" (each ad group has "ads"), leave "creatives" empty. Non-YouTube: put ads in "creatives", leave "ad_groups" empty.
- One line item per format/audience combination. Line item budgets must add up to their IO budget; IO budgets must add up to total_budget when both are known.
- Gender codes: W = women, M = men, M-W = all. Thai (ไทย) notes are fine; write the brief values in English.
- List anything important that is missing (PO, landing URL, video links…) in "questions".

SCHEMA (types or allowed values shown as strings)
${JSON.stringify(schema, null, 1)}

BRANDS
${brands.map((b) => b.brand_name).filter(Boolean).sort().join(' | ')}

CATEGORIES
${CATS.map((c) => c.name).join(' | ')}

AUDIENCE TYPES
${AUDS.map((a) => a.name).join(' | ')}

PLANNER NOTES
"""
${text.trim()}
"""`;
}

// ----------------------------------------------------------------------------- parse

// Pull the JSON object out of an AI answer (code fences, smart quotes, trailing commas).
export function parseAnswer(raw) {
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  const a = s.indexOf('{');
  const z = s.lastIndexOf('}');
  if (a < 0 || z <= a) throw new Error('No JSON found. Copy the whole answer from WPP Open AI, including the { … } part.');
  s = s.slice(a, z + 1).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error(`The answer is not valid JSON (${e.message}). Ask WPP Open AI to "reply with valid JSON only" and paste again.`);
  }
}

// ----------------------------------------------------------------------------- normalise

const blank = (v) => isBlank(v) || (typeof v === 'string' && ['', 'null', 'n/a', 'na', '-', '–', 'none', 'unknown'].includes(v.trim().toLowerCase()));
const str = (v) => (blank(v) ? null : String(v).trim());

// 1,500,000 · "1.5M" · "1.5 ล้าน" · "THB 200k" → number
export function toNumber(v) {
  if (blank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).toLowerCase().replace(/thb|baht|บาท|฿|,|\s/g, '');
  let mult = 1;
  if (/(m|mn|mil|million|ล้าน)$/.test(s)) { mult = 1e6; s = s.replace(/(m|mn|mil|million|ล้าน)$/, ''); }
  else if (/(k|พัน)$/.test(s)) { mult = 1e3; s = s.replace(/(k|พัน)$/, ''); }
  else if (/แสน$/.test(s)) { mult = 1e5; s = s.replace(/แสน$/, ''); }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * mult * 100) / 100 : null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function toDate(v) {
  if (blank(v)) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy (Thai style)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})$/i);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Match a value to a list of allowed choices (case, spaces, dashes and underscores ignored).
const key = (v) => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_\-./()&'’]+/g, '');
export function pick(v, options) {
  if (blank(v)) return null;
  const k = key(v);
  return options.find((o) => key(o) === k)
    || (k.length >= 3 ? options.find((o) => key(o).startsWith(k) || k.startsWith(key(o))) : null)
    || null;
}

const ALIASES = {
  gender: { women: 'W', woman: 'W', female: 'W', f: 'W', ผู้หญิง: 'W', men: 'M', man: 'M', male: 'M', ผู้ชาย: 'M', all: 'M-W', both: 'M-W', 'm/w': 'M-W', 'w/m': 'M-W' },
  channel: { yt: 'YouTube', youtube: 'YouTube', 'non-yt': 'Non-YouTube', display: 'Non-YouTube', dv360: 'Non-YouTube', programmatic: 'Non-YouTube' },
  pacing: { asap: 'ASAP', even: 'Even', ahead: 'Ahead' },
};
const pickA = (v, options, alias) => {
  if (blank(v)) return null;
  const a = alias && alias[String(v).trim().toLowerCase()];
  return pick(a || v, options);
};

export function pickBrand(v, brands) {
  if (blank(v)) return null;
  const names = brands.map((b) => b.brand_name).filter(Boolean);
  const byName = (n) => brands.find((b) => b.brand_name === n);
  const k = key(v);
  const exact = names.find((n) => key(n) === k);
  if (exact) return byName(exact);
  // Initials the team uses: LRP = La Roche-Posay, YSL, GA, HR …
  const initials = (n) => n.normalize('NFD').split(/[\s\-.'’]+/).filter(Boolean).map((w) => w[0]).join('').toLowerCase();
  const ini = names.filter((n) => initials(n).length > 1 && initials(n) === k);
  if (ini.length === 1) return byName(ini[0]);
  if (k.length < 3) return null;
  const hit = names.filter((n) => key(n).includes(k) || k.includes(key(n)));
  if (hit.length === 1) return byName(hit[0]);
  const pre = names.filter((n) => key(n).startsWith(k));
  return pre.length >= 1 ? byName(pre.sort((a, b) => a.length - b.length)[0]) : null;
}

// Turn the AI JSON into rows ready to insert, with the same defaults as the "+ Add …" buttons.
// Returns { brief, ios, lines, groups, ads, warnings, questions, filled }.
export function normalize(json, { brands, b }) {
  const warn = [];
  const c = json.campaign || json.brief || {};
  const brief = {};
  const set = (field, value, raw, label) => {
    if (value !== null && value !== undefined) brief[field] = value;
    else if (!blank(raw)) warn.push(`${label}: "${raw}" is not an allowed value, left blank`);
  };

  if (!blank(c.brand)) {
    const br = pickBrand(c.brand, brands);
    if (br) Object.assign(brief, { brand: br.brand_name, advertiser_name: br.advertiser_name || null, advertiser: br.advertiser_id || null });
    else warn.push(`Brand: "${c.brand}" is not in the brand list, choose it by hand`);
  }
  set('team', pick(c.team, OPT.team), c.team, 'Team');
  set('brief_type', pick(c.brief_type, OPT.briefType), c.brief_type, 'Brief type');
  for (const f of ['campaign_name', 'geo', 'franchise', 'campaign_desc', 'po_number', 'tracking', 'brand_safety', 'reporting', 'bls_notes', 'notes']) {
    if (str(c[f])) brief[f] = str(c[f]);
  }
  for (const f of ['launch_date', 'end_date', 'effective_date']) set(f, toDate(c[f]), c[f], f.replace('_', ' '));
  set('objective', pick(c.objective, OPT.objective), c.objective, 'Objective');
  set('kpi_model', pick(c.kpi_model, OPT.kpiModel), c.kpi_model, 'KPI model');
  for (const f of ['kpi_target', 'po_amount', 'total_budget']) set(f, toNumber(c[f]), c[f], f.replace('_', ' '));
  set('category', pick(c.category, CATS.map((x) => x.name)), c.category, 'Category');
  set('brand_lift', pick(c.brand_lift, OPT.yesNo), c.brand_lift, 'Brand lift');

  const flight = { start: brief.launch_date || b.launch_date || null, end: brief.end_date || b.end_date || null };
  const objective = brief.objective || b.objective;
  const ios = []; const lines = []; const groups = []; const ads = [];
  const ioList = Array.isArray(json.insertion_orders) ? json.insertion_orders : [];

  ioList.forEach((io, i) => {
    const io_no = i + 1;
    const channel = pickA(io.channel, OPT.channel, ALIASES.channel)
      || (/youtube|vrc|bumper|trueview|shorts/i.test(JSON.stringify(io)) ? 'YouTube' : 'Non-YouTube');
    const yt = channel === 'YouTube';
    const fmts = yt ? OPT.ytFormats : OPT.otherFormats;
    const io_format = pick(io.io_format, fmts) || (yt ? 'VRC' : 'Display');
    const ioRow = {
      io_no, channel,
      io_type: pick(io.io_type, OPT.ioType) || (yt ? 'Video' : 'Display'),
      io_format,
      io_objective: pick(io.io_objective, OBJS.map((o) => o.name))
        || (['Consideration', 'Action'].includes(objective) ? 'Drive_online_action_or_visits' : 'Raise_awareness_of_my_brand_or_product'),
      kpi_model: pick(io.kpi_model, OPT.ioKpi) || 'CPM',
      kpi_target: toNumber(io.kpi_target),
      pacing: pickA(io.pacing, OPT.pacing, ALIASES.pacing) || 'Even',
      budget: toNumber(io.budget),
      start_date: toDate(io.start_date) || flight.start,
      end_date: toDate(io.end_date) || flight.end,
      buying_type: pick(io.buying_type, OPT.buyingType),
      deal_id: str(io.deal_id),
      freq_exposures: toNumber(io.freq_exposures),
      freq_period: pick(io.freq_period, OPT.freqPeriod),
      verification: str(io.verification),
    };
    ios.push(ioRow);

    (Array.isArray(io.line_items) ? io.line_items : []).forEach((li, j) => {
      const line_no = j + 1;
      const format = pick(li.format, fmts) || (fmts.includes(io_format) ? io_format : fmts[0]);
      const gender = pickA(li.gender, OPT.gender, ALIASES.gender) || 'M-W';
      const lineRow = {
        io_no, line_no, format,
        yt_li_type: yt ? (pick(li.yt_li_type, OPT.ytLiType) || ytTypeForFormat(format)) : null,
        deal_type: pick(li.deal_type, OPT.dealType) || (yt ? 'Youtube' : 'OpenEx'),
        gender,
        age_min: toNumber(li.age_min), age_max: toNumber(li.age_max),
        language: pick(li.language, LANGS.map((x) => x.name)) || 'Thai',
        device: pick(li.device, DEVICES.map((x) => x.name)) || 'All',
        environment: pick(li.environment, OPT.environment) || 'All',
        sustainability: 'No optimisation', service_disc: 'NO',
        aud_targeting: pick(li.aud_targeting, AUDS.map((x) => x.name)),
        aud_tactic: str(li.aud_tactic),
        budget: toNumber(li.budget),
        bid_strategy: pick(li.bid_strategy, OPT.bidStrategy),
        bid_target: toNumber(li.bid_target),
        inventory: str(li.inventory),
        audience: yt ? null : str(li.audience),
        exclusions: yt ? null : str(li.exclusions),
        start_date: toDate(li.start_date) || ioRow.start_date,
        end_date: toDate(li.end_date) || ioRow.end_date,
      };
      lines.push(lineRow);

      const adRow = (ad, ag_no, ad_no) => ({
        io_no, line_no, ag_no, ad_no,
        ad_name: str(ad.ad_name),
        video_length: yt ? toNumber(ad.video_length) : null,
        creative_size: yt ? null : str(ad.creative_size),
        asset_url: str(ad.asset_url),
        landing_url: str(ad.landing_url),
        display_url: str(ad.display_url),
        cta: str(ad.cta), headline: str(ad.headline), description: str(ad.description),
        asset_desc: str(ad.asset_desc), asset_source: pick(ad.asset_source, OPT.assetSource),
        ad_format: yt ? lineRow.yt_li_type : null,
        skippable: ['Non-skip', 'Bumper'].includes(format) ? 'unskip' : ['Display', 'Native'].includes(format) ? 'display' : 'skip',
        cta_code: pick(ad.cta_code, OPT.ctaCode) || 'SHOP-NOW',
        ad_buying_type: 'Programmatic', rotation: 'optimized',
        redirect: pick(ad.redirect, OPT.redirect) || "L'Oréal D2C",
        retailer: str(ad.retailer),
      });

      if (yt) {
        const ags = Array.isArray(li.ad_groups) && li.ad_groups.length ? li.ad_groups : [{ ads: li.creatives || [] }];
        ags.forEach((ag, k) => {
          const ag_no = k + 1;
          groups.push({
            io_no, line_no, ag_no,
            audience: str(ag.audience), demographics: str(ag.demographics),
            aud_targeting: pick(ag.aud_targeting, AUDS.map((x) => x.name)) || lineRow.aud_targeting,
            aud_tactic: str(ag.aud_tactic) || lineRow.aud_tactic,
            gender: pickA(ag.gender, OPT.gender, ALIASES.gender) || gender,
            age_min: toNumber(ag.age_min) ?? lineRow.age_min, age_max: toNumber(ag.age_max) ?? lineRow.age_max,
            language: pick(ag.language, LANGS.map((x) => x.name)) || lineRow.language,
            video_ad_format: lineRow.yt_li_type,
          });
          (Array.isArray(ag.ads) ? ag.ads : []).forEach((ad, n) => ads.push(adRow(ad, ag_no, n + 1)));
        });
      } else {
        const crs = Array.isArray(li.creatives) && li.creatives.length ? li.creatives
          : (li.ad_groups || []).flatMap((g) => g.ads || []);
        crs.forEach((ad, n) => ads.push(adRow(ad, 0, n + 1)));
      }
    });
  });

  // Budget sanity checks (warnings only; the Gate checks catch the rest).
  const total = brief.total_budget ?? b.total_budget;
  const ioSum = ios.reduce((s, x) => s + (x.budget || 0), 0);
  if (ios.length && total && Math.round(ioSum) !== Math.round(total)) warn.push(`IO budgets add up to ${ioSum.toLocaleString()} but the total budget is ${Number(total).toLocaleString()}`);
  for (const io of ios) {
    const s = lines.filter((l) => l.io_no === io.io_no).reduce((t, l) => t + (l.budget || 0), 0);
    if (io.budget && Math.round(s) !== Math.round(io.budget)) warn.push(`IO ${io.io_no}: line item budgets add up to ${s.toLocaleString()}, IO budget is ${io.budget.toLocaleString()}`);
  }

  const questions = (Array.isArray(json.questions) ? json.questions : []).map(str).filter(Boolean);
  return { brief, ios, lines, groups, ads, warnings: warn, questions };
}
