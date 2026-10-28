// "Fill with AI": describe the campaign (type or speak), copy a prompt into WPP Open AI,
// paste its JSON answer back, check it, then fill the brief. No API key, no cost.
import { useEffect, useRef, useState } from 'preact/hooks';
import { applyAiPlan } from '../data/actions.js';
import { app, toast, useStore } from '../data/store.js';
import { buildPrompt, normalize, parseAnswer } from '../lib/aibrief.js';
import { fmtDate, fmtInt } from '../lib/util.js';
import { ActionButton, html, Icon } from './ui.js';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const LABELS = {
  brand: 'Brand', team: 'Team', brief_type: 'Brief type', campaign_name: 'Campaign name', geo: 'Geo', launch_date: 'Launch',
  end_date: 'End', effective_date: 'Changes start', objective: 'Objective', kpi_model: 'KPI model', kpi_target: 'KPI target',
  category: 'Category', franchise: 'Franchise', campaign_desc: 'Description', po_number: 'PO number', po_amount: 'PO amount',
  total_budget: 'Total budget', tracking: 'Tracking', brand_safety: 'Brand safety', reporting: 'Reporting', brand_lift: 'Brand lift',
  bls_notes: 'BLS notes', notes: 'Notes',
};
const SHOW_SKIP = new Set(['advertiser', 'advertiser_name']);
const fmtVal = (k, v) => (/date/.test(k) ? fmtDate(v) : ['po_amount', 'total_budget', 'kpi_target'].includes(k) ? fmtInt(v) : String(v));

// Keep what the planner typed while they hop to WPP Open AI and back.
const memo = (id) => ({
  get: (k) => { try { return sessionStorage.getItem(`lbd-ai-${id}-${k}`) || ''; } catch { return ''; } },
  set: (k, v) => { try { sessionStorage.setItem(`lbd-ai-${id}-${k}`, v); } catch { /* private mode */ } },
});

export function AiAssist({ st, store }) {
  const { brands } = useStore(app);
  const { b, I } = st;
  const m = memo(b.brief_id);
  const empty = !b.brand && I.length === 0;
  const [open, setOpen] = useState(empty);
  const [text, setText] = useState(() => m.get('text'));
  const [answer, setAnswer] = useState(() => m.get('answer'));
  const [plan, setPlan] = useState(null);
  const [mode, setMode] = useState(I.length ? 'replace' : 'add');
  const [lang, setLang] = useState('th-TH');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const rec = useRef(null);

  useEffect(() => m.set('text', text), [text]);
  useEffect(() => m.set('answer', answer), [answer]);
  useEffect(() => () => rec.current && rec.current.abort(), []);

  const toggleMic = () => {
    if (listening) { rec.current && rec.current.stop(); return; }
    const r = new SR();
    r.lang = lang; r.continuous = true; r.interimResults = true;
    let base = text ? `${text.trimEnd()} ` : '';
    r.onresult = (e) => {
      let fin = ''; let mid = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript; else mid += e.results[i][0].transcript;
      }
      if (fin) { base = `${base}${fin.trim()} `; setText(base); }
      setInterim(mid);
    };
    r.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') toast(`Microphone: ${e.error === 'not-allowed' ? 'allow the microphone for this site in the browser' : e.error}`, 'error'); };
    r.onend = () => { setListening(false); setInterim(''); };
    rec.current = r;
    r.start();
    setListening(true);
  };

  const copyPrompt = async () => {
    if (!text.trim()) { toast('Describe the campaign first (type or use the microphone).', 'error'); return; }
    const prompt = buildPrompt({ text, brands });
    try {
      await navigator.clipboard.writeText(prompt);
      toast('Prompt copied. Paste it into WPP Open AI, send it, then copy the whole answer back here.', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = prompt; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      toast('Prompt copied. Paste it into WPP Open AI.', 'success');
    }
  };

  const check = () => {
    try {
      setPlan(normalize(parseAnswer(answer), { brands, b }));
    } catch (e) { setPlan(null); toast(e.message, 'error'); }
  };

  const fill = async () => {
    await applyAiPlan(store, plan, mode);
    toast('Brief filled. Check every field, then fix anything the Gate checks flag.', 'success');
    setPlan(null); setAnswer(''); setText(''); setOpen(false);
  };

  if (!open) {
    return html`<div class="ai-bar">
      <span><${Icon} name="edit" /> Save time: describe the campaign and let WPP Open AI fill the brief.</span>
      <button class="btn btn-sm" onClick=${() => setOpen(true)}>Fill with AI</button>
    </div>`;
  }

  const fields = plan ? Object.entries(plan.brief).filter(([k]) => !SHOW_SKIP.has(k)) : [];
  return html`<section class="card ai-card">
    <div class="card-head"><h3>Fill with AI · WPP Open AI</h3>
      <div class="right"><button class="btn btn-sm btn-ghost" onClick=${() => setOpen(false)}>Hide</button></div></div>
    <div class="card-body stack" style="gap:18px">

      <div>
        <div class="ai-step"><b>1</b> Describe the campaign: type, paste an email, or speak</div>
        <textarea class="textarea" rows="5" value=${text} onInput=${(e) => setText(e.currentTarget.value)}
          placeholder="e.g. La Roche-Posay Effaclar Serum, YouTube for Reach, women 25-44, 1-30 Nov, budget 1.5M incl. fee, PO 4500123456, videos 15s and 6s https://youtu.be/…, landing https://www.laroche-posay.co.th/effaclar"></textarea>
        ${interim && html`<div class="small muted" style="margin-top:4px">… ${interim}</div>`}
        <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
          ${SR ? html`
            <button class=${`btn btn-sm${listening ? ' btn-danger' : ''}`} onClick=${toggleMic}>${listening ? '■ Stop' : '🎤 Speak'}</button>
            <select class="select" style="width:auto;height:32px" value=${lang} disabled=${listening} onChange=${(e) => setLang(e.currentTarget.value)} aria-label="Speech language">
              <option value="th-TH">ไทย</option><option value="en-US">English</option></select>`
          : html`<span class="small muted">Voice input needs Chrome or Edge.</span>`}
          <span class="spacer" style="flex:1"></span>
          <button class="btn btn-dark btn-sm" onClick=${copyPrompt}><${Icon} name="copy" /> Copy prompt for WPP Open AI</button>
        </div>
      </div>

      <div>
        <div class="ai-step"><b>2</b> Paste it into <strong>WPP Open AI</strong>, send, then copy the whole answer</div>
      </div>

      <div>
        <div class="ai-step"><b>3</b> Paste the AI answer here and check it</div>
        <textarea class="textarea mono" rows="5" value=${answer} onInput=${(e) => { setAnswer(e.currentTarget.value); setPlan(null); }}
          placeholder='{ "campaign": { … }, "insertion_orders": [ … ] }'></textarea>
        <div class="row" style="margin-top:8px"><button class="btn btn-sm" disabled=${!answer.trim()} onClick=${check}>Check the answer</button></div>
      </div>

      ${plan && html`<div class="ai-preview">
        <div class="ai-step"><b>4</b> Review what will be filled</div>
        ${fields.length > 0 && html`<dl class="ai-fields">${fields.map(([k, v]) => html`
          <div class=${b[k] && String(b[k]) !== String(v) ? 'over' : ''}><dt>${LABELS[k] || k}</dt><dd>${fmtVal(k, v)}${b[k] && String(b[k]) !== String(v) ? html` <span class="small muted">(was ${fmtVal(k, b[k])})</span>` : ''}</dd></div>`)}</dl>`}
        <div class="small" style="margin-top:10px"><strong>Structure:</strong> ${plan.ios.length} IO · ${plan.lines.length} line items · ${plan.groups.length} ad groups · ${plan.ads.length} ads / creatives
          ${plan.ios.length > 0 && html`<span class="muted"> (${plan.ios.map((io) => `IO ${io.io_no} ${io.channel} ${io.io_format} THB ${fmtInt(io.budget || 0)}`).join(' · ')})</span>`}</div>
        ${plan.warnings.length > 0 && html`<div class="callout warn small" style="margin-top:10px"><strong>Check these</strong>
          <ul style="margin:4px 0 0;padding-left:18px">${plan.warnings.map((w) => html`<li>${w}</li>`)}</ul></div>`}
        ${plan.questions.length > 0 && html`<div class="callout small" style="margin-top:10px"><strong>Missing or unclear (from the AI)</strong>
          <ul style="margin:4px 0 0;padding-left:18px">${plan.questions.map((q) => html`<li>${q}</li>`)}</ul></div>`}
        ${I.length > 0 && plan.ios.length > 0 && html`<div class="row small" style="gap:16px;margin-top:12px;flex-wrap:wrap">
          <span>This brief already has ${I.length} IO:</span>
          <label class="row" style="gap:6px"><input type="radio" name="ai-mode" checked=${mode === 'replace'} onChange=${() => setMode('replace')} />Replace the structure</label>
          <label class="row" style="gap:6px"><input type="radio" name="ai-mode" checked=${mode === 'add'} onChange=${() => setMode('add')} />Add after it</label>
        </div>`}
        <div class="row" style="margin-top:14px;gap:8px">
          <${ActionButton} cls="btn btn-primary" onClick=${fill}>Fill the brief<//>
          <button class="btn btn-ghost" onClick=${() => setPlan(null)}>Cancel</button>
        </div>
      </div>`}
    </div>
  </section>`;
}
