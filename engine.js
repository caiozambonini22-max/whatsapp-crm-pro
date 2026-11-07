// WhatsApp CRM Pro v4.33 — engine.js
// Motor de FOLLOW-UP por funil (etiqueta/aba), dentro do WhatsApp Web (content script).
//  • regra = funil (etiquetas/abas) + acionamento (ao entrar / ao sair / após um tempo) + ação (mensagem, etiqueta, aba)
//  • TODOS os disparos entram numa FILA ÚNICA: um por vez, intervalo fixo ou aleatório, horário e limites → nunca sai tudo junto
//  • se o cliente responde antes do disparo, para e PERGUNTA (manter / resetar o tempo / cancelar)
//  • se o computador ficou desligado, o que venceu vira "atrasado" e só segue com a sua decisão
(function (root) {
  'use strict';

  // ════════════════════════════════════════════════════════════
  //  NÚCLEO (funções puras — testáveis fora do navegador)
  // ════════════════════════════════════════════════════════════
  const DEFAULT_CFG = {
    on: false,                    // envio automático ligado?
    winStart: '09:00', winEnd: '19:00', days: [1, 2, 3, 4, 5, 6],
    dailyCap: 30, hourlyCap: 12,
    queue: { mode: 'random', fixedMin: 5, minMin: 3, maxMin: 8 },   // intervalo entre envios (minutos)
    staleMin: 120,                // atrasado > X min (ou computador desligado) → pede decisão
    apiUrl: 'https://zambonini-crm.vercel.app', token: '',
    rules: [],
  };

  const pad = n => String(n).padStart(2, '0');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hhmm = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const digits = s => (s || '').replace(/\D/g, '');
  function sameContact(a, b) {
    if (!a || !b) return false;
    const da = digits(a), db = digits(b);
    if (da.length >= 8 && db.length >= 8) return da.slice(-9) === db.slice(-9);
    return norm(a) === norm(b);
  }
  const fkey = f => (f.type === 'tab' ? 'tab:' : 'label:') + f.name;

  function inWindow(now, cfg) {
    const d = new Date(now);
    if (!(cfg.days || []).includes(d.getDay())) return false;
    if (cfg.win24) return true;
    const a = hhmm(cfg.winStart), b = hhmm(cfg.winEnd), cur = d.getHours() * 60 + d.getMinutes();
    if (a === null || b === null) return false;
    return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b);
  }

  // espera do acionamento "após um tempo": dias + hh:mm (+ variação de 0 a varMin minutos, nunca antes)
  function delayMs(tr) {
    const t = hhmm(tr && tr.time) || 0;
    return Math.max(0, +(tr && tr.days) || 0) * 86400e3 + t * 60e3 + Math.max(0, Math.min(59, +(tr && tr.sec) || 0)) * 1000;
  }
  function dueAtFor(rule, now) {
    const tr = rule.trigger || {};
    if (tr.mode !== 'delay') return now;
    return Math.round(now + delayMs(tr) + rnd(0, Math.max(0, +tr.varMin || 0) * 60e3));
  }
  // intervalo entre dois envios (ms): fixo (você define) ou aleatório entre mínimo e máximo. Piso de 10 s.
  function gapMs(cfg) {
    const q = cfg.queue || {};
    const m = q.mode === 'fixed' ? (+q.fixedMin || 1) : rnd(+q.minMin || 1, Math.max(+q.minMin || 1, +q.maxMin || 1));
    return Math.max(10e3, Math.round(m * 60e3));
  }

  function pickVariation(variations, idx) {
    const v = (variations || []).map(x => (x || '').trim()).filter(Boolean);
    if (!v.length) return '';
    return v[(idx || 0) % v.length];
  }

  // "[14:30, 04/11/2026] Nome: " → timestamp (ms). Aceita 24h e AM/PM.
  function parsePrePlain(str) {
    const m = /\[\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)?\s*,\s*(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})\s*\]/.exec(str || '');
    if (!m) return null;
    let h = +m[1]; const mi = +m[2], ap = m[3];
    if (ap) { const pm = /p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    let a = +m[4], b = +m[5], c = +m[6], y, mo, d;
    if (a > 31) { y = a; mo = b; d = c; }              // 2026/11/04
    else { y = c < 100 ? 2000 + c : c; if (ap) { mo = a; d = b; } else { d = a; mo = b; } } // pt-BR dd/mm/aaaa (AM/PM → mm/dd)
    const t = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
    return isNaN(t) ? null : t;
  }

  // O cliente respondeu desde "baseTs"? msgs = [{from:'in'|'out', text, ts}]
  function hasReplySince(msgs, baseTs) {
    if (!msgs || !msgs.length) return { replied: false, text: '' };
    const incoming = msgs.filter(m => m.from === 'in');
    const withTs = incoming.filter(m => m.ts);
    if (withTs.length) {
      const later = withTs.filter(m => m.ts > baseTs);
      if (later.length) return { replied: true, text: later[later.length - 1].text || '' };
      return { replied: false, text: '' };
    }
    // sem horários legíveis: se a última mensagem é do cliente, considera resposta
    const last = msgs[msgs.length - 1];
    if (last.from === 'in') return { replied: true, text: last.text || '' };
    return { replied: false, text: '' };
  }


  // ── acompanha quem ENTRA e quem SAI de cada etiqueta/aba ──
  // state = { m: { 'label:X': { nome_normalizado: {n, at, base, miss} } }, init: {labels, tabs} }
  // • a primeira leitura é só "linha de base": quem já estava no funil NÃO dispara nada
  // • sumir por 3 leituras seguidas (≈30 s) para contar como "saiu" (evita falso alarme de carregamento)
  function trackMembers(state, cur, avail, now) {
    state = state && state.m ? state : { m: {}, init: {} };
    state.init = state.init || {};
    const entered = [], left = [];
    ['labels', 'tabs'].forEach(src => {
      if (!avail[src]) return;
      const first = !state.init[src];
      const pre = src === 'labels' ? 'label:' : 'tab:';
      const keys = new Set(Object.keys(cur).filter(k => k.startsWith(pre)).concat(Object.keys(state.m).filter(k => k.startsWith(pre))));
      keys.forEach(key => {
        const prev = state.m[key] || (state.m[key] = {});
        const seen = {};
        (cur[key] || []).forEach(n => {
          const nk = norm(n); if (!nk) return; seen[nk] = 1;
          const p = prev[nk];
          if (!p) { prev[nk] = { n, at: now, base: first, miss: 0 }; if (!first) entered.push({ key, n, nk }); }
          else { p.miss = 0; p.n = n; }
        });
        Object.keys(prev).forEach(nk => {
          if (seen[nk]) return;
          const p = prev[nk]; p.miss = (p.miss || 0) + 1;
          if (p.miss >= 3) { delete prev[nk]; left.push({ key, n: p.n, nk }); }
        });
      });
      state.init[src] = true;
    });
    return { state, entered, left };
  }

  // novos inscritos a partir de eventos de entrada/saída
  function newEnrollments(rules, enrs, events, now) {
    const out = [];
    events.forEach(ev => rules.forEach(rule => {
      if (!rule.active) return;
      const tr = rule.trigger || {};
      const okKind = ev.kind === 'enter' ? (tr.mode === 'enter' || tr.mode === 'delay') : (tr.mode === 'leave');
      if (!okKind || !(rule.funnel || []).some(f => fkey(f) === ev.key)) return;
      const open = e => e.ruleId === rule.id && e.nk === ev.nk && ['waiting', 'stale', 'asked', 'approval', 'sending'].includes(e.state);
      if (enrs.some(open) || out.some(open)) return;
      if (enrs.some(e => e.ruleId === rule.id && e.nk === ev.nk && e.state === 'sent' && now - (e.endedAt || 0) < 2 * 60e3)) return;   // acabou de receber esse follow up (ex.: aba piscou): não repete
      out.push({ id: 'e' + now + Math.floor(Math.random() * 99999), ruleId: rule.id, contact: ev.n, nk: ev.nk, state: 'waiting', enteredAt: now, dueAt: dueAtFor(rule, now), ignoreInUntil: 0, fails: 0, history: [], from: ev.key });
    }));
    return out;
  }


  // ── script de ações (passos) ──
  // modelo novo: action.steps = [{id,type,...}]. Regras antigas (variations/addLabel/...) viram passos sozinhas.
  function stepsOf(action) {
    action = action || {};
    if (Array.isArray(action.steps)) return action.steps;
    const st = [];
    const v = (action.variations || []).map(x => (x || '').trim()).filter(Boolean);
    if (v.length) st.push({ id: 'm0', type: 'text', variations: v });
    if (action.addLabel) st.push({ id: 'l0', type: 'label_add', name: action.addLabel });
    if (action.removeLabel) st.push({ id: 'l1', type: 'label_rm', name: action.removeLabel });
    if (action.moveTab) st.push({ id: 't0', type: 'tab_add', name: action.moveTab });
    return st;
  }
  const SEND_TYPES = ['text', 'quick', 'image', 'video', 'audio', 'document', 'sticker', 'pix', 'invite', 'contact', 'banner', 'list'];
  const isSendStep = st => SEND_TYPES.includes(st.type);

  // ── regras de segurança ──
  const DEFAULT_SAFETY = { onClientReply: 'ask', onManualMsg: 'none', stopOnFunnelExit: true, skipGroups: true, excludeLabels: [], excludeTabs: [], maxPerContact: { count: 0, days: 7 }, minHoursBetween: 0, requireApproval: false, dryRun: false };
  function safetyOf(rule) {
    const s = Object.assign({}, DEFAULT_SAFETY, (rule && rule.safety) || {});
    if (!(rule && rule.safety && rule.safety.onClientReply) && rule && rule.onReply) s.onClientReply = rule.onReply;   // compatibilidade
    s.maxPerContact = Object.assign({}, DEFAULT_SAFETY.maxPerContact, s.maxPerContact || {});
    return s;
  }
  // checa as travas de segurança na hora de enviar. {ok:true} | {ok:false, act:'cancel'|'postpone', reason, until?}
  function checkSafety(rule, ctx) {
    const s = safetyOf(rule); const now = ctx.now; const nk = ctx.enr.nk;
    if (s.skipGroups && ctx.isGroup) return { ok: false, act: 'cancel', reason: 'é um grupo (travado por segurança)' };
    const ex = new Set((s.excludeLabels || []).map(norm)); const hit = (ctx.labels || []).find(l => ex.has(norm(l)));
    if (hit) return { ok: false, act: 'cancel', reason: 'está na etiqueta bloqueada “' + hit + '”' };
    const et = new Set((s.excludeTabs || []).map(norm)); const tl = (ctx.tabs || (ctx.tab ? [ctx.tab] : [])).find(x => et.has(norm(x))); if (tl) return { ok: false, act: 'cancel', reason: 'está na aba bloqueada “' + tl + '”' };
    const sentBy = (ctx.enrs || []).filter(e => e.nk === nk && e.state === 'sent' && !e.simulated);
    const mp = s.maxPerContact;
    if (+mp.count > 0) {
      const n = sentBy.filter(e => e.ruleId === rule.id && now - (e.endedAt || 0) < (+mp.days || 7) * 86400e3).length;
      if (n >= +mp.count) return { ok: false, act: 'cancel', reason: 'já recebeu ' + n + ' follow-up(s) desse nos últimos ' + (+mp.days || 7) + ' dia(s)' };
    }
    if (+s.minHoursBetween > 0) {
      const last = sentBy.reduce((m, e) => Math.max(m, e.endedAt || 0), 0);
      if (last && now - last < s.minHoursBetween * 3600e3) return { ok: false, act: 'postpone', reason: 'recebeu outro follow-up há pouco (mín. ' + s.minHoursBetween + 'h entre mensagens)', until: last + s.minHoursBetween * 3600e3 + 60e3 };
    }
    return { ok: true };
  }

  // Decide o que fazer agora. Retorna {act:'send', enr} ou {act:'wait', why}
  function decide(cfg, enrs, rt, now) {
    if (!cfg.on) return { act: 'wait', why: 'envio automático desligado' };
    if (!inWindow(now, cfg)) return { act: 'wait', why: 'fora do horário permitido' };
    const today = dayKey(new Date(now));
    const sentToday = rt.day === today ? (rt.sent || 0) : 0;
    if (sentToday >= (cfg.dailyCap || 0)) return { act: 'wait', why: 'limite diário atingido' };
    const lastHour = (rt.hourly || []).filter(t => now - t < 3600e3).length;
    if (cfg.hourlyCap && lastHour >= cfg.hourlyCap) return { act: 'wait', why: 'limite por hora atingido' };
    if (rt.nextSendAfter && now < rt.nextSendAfter) return { act: 'wait', why: 'aguardando intervalo entre envios' };
    const on = id => (cfg.rules || []).some(r => r.id === id && r.active);
    const due = (enrs || []).filter(e => e.state === 'waiting' && e.dueAt <= now && on(e.ruleId)).sort((a, b) => a.dueAt - b.dueAt);
    if (!due.length) return { act: 'wait', why: 'fila vazia' };
    return { act: 'send', enr: due[0], queued: due.length };
  }

  const BULK_OPTS = { minSec: 40, maxSec: 120, perHour: 30, perDay: 150, useWindow: true, onlyKnown: true, pauseAfterFails: 3, dryRun: false,
    typingSim: false, batchEvery: 0, batchMin: 5, batchMax: 12, warmN: 0, warmFactor: 2, skipRecentHours: 0, skipActiveMin: 0, excludeTabs: [],
    customWindow: false, winStart: '09:00', winEnd: '19:00', startAt: 0 };
  // monta os passos de UM contato (idx = posição dele no disparo): variações e alternativas são distribuídas em rodízio, pausas entre ações sorteadas
  function bulkStepsOf(job, idx) {
    const o = job.opts || {}; const n = (idx || 0) + (job.seed || 0); const out = [];
    const rr = list => list[n % list.length];
    const gA = Math.max(0, +job.stepGap || 0), gB = Math.max(gA, +job.stepGapMax || gA);
    const gap = () => gB > gA ? gA + Math.floor(Math.random() * (gB - gA + 1)) : gA;
    (job.steps || []).forEach((s, i) => {
      const pre = () => { const g = gap(); if (i > 0 && g > 0) out.push({ type: 'wait', seconds: g }); };
      if (s.type === 'quick' && s.msgId) { const ids = [s.msgId].concat((s.alts || []).filter(Boolean)); pre(); out.push({ type: 'quick', msgId: rr(ids) }); }
      else if (s.type === 'text') {
        const v = (s.variations || []).map(x => (x || '').trim()).filter(Boolean); if (!v.length) return;
        const txt = rr(v); pre();
        if (o.typingSim) out.push({ type: 'typing', seconds: Math.max(2, Math.min(9, Math.round(txt.length / 18))) });
        out.push({ type: 'text', variations: [txt] });
      }
      else if (s.type === 'wait') out.push({ type: 'wait', seconds: Math.max(0, +s.seconds || 0) });
      else if (s.type === 'typing' || s.type === 'recording') out.push({ type: s.type, seconds: Math.max(1, +s.seconds || 3) });
    });
    return out;
  }
  // decide se o próximo envio do disparo pode sair agora (função pura, testável)
  function bulkGate(job, rt, cfg, now) {
    const o = Object.assign({}, BULK_OPTS, job.opts || {});
    if (job.status !== 'running') return { go: false, why: 'parado' };
    if (o.startAt && now < o.startAt) return { go: false, why: 'agendado para ' + new Date(o.startAt).toLocaleString('pt-BR') };
    if (job.nextAt && now < job.nextAt) { const sec = Math.ceil((job.nextAt - now) / 1000); return { go: false, why: (job.longPause ? 'pausa longa entre lotes (' : 'intervalo aleatório (') + (sec >= 120 ? Math.ceil(sec / 60) + ' min' : sec + ' s') + ')' }; }
    const wcfg = o.customWindow ? Object.assign({}, cfg, { winStart: o.winStart, winEnd: o.winEnd, win24: false }) : cfg;
    if (o.useWindow && !inWindow(now, wcfg)) return { go: false, why: 'fora do horário permitido (' + wcfg.winStart + '–' + wcfg.winEnd + ')' };
    const hourly = (rt.hourly || []).filter(t => now - t < 3600e3).length;
    if (hourly >= o.perHour) return { go: false, why: 'limite por hora (' + o.perHour + ') atingido' };
    const today = dayKey(new Date(now)); const sentToday = rt.day === today ? (rt.sent || 0) : 0;
    if (sentToday >= o.perDay) return { go: false, why: 'limite por dia (' + o.perDay + ') atingido' };
    return { go: true };
  }

  const core = { bulkGate, bulkStepsOf, BULK_OPTS, stepsOf, isSendStep, safetyOf, checkSafety, DEFAULT_SAFETY, DEFAULT_CFG, inWindow, delayMs, dueAtFor, gapMs, pickVariation, parsePrePlain, hasReplySince, trackMembers, newEnrollments, decide, sameContact, dayKey, norm, fkey };
  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

  // ════════════════════════════════════════════════════════════
  //  A PARTIR DAQUI: só roda no navegador (WhatsApp Web)
  // ════════════════════════════════════════════════════════════
  if (typeof document === 'undefined' || !root.chrome || !chrome.storage) return;
  if (root.__wcrmEngineLoaded) return;
  root.__wcrmEngineLoaded = true;

  const K_CFG = 'wcrm_cfg', K_ENR = 'wcrm_enr', K_RT = 'wcrm_rt', K_MEM = 'wcrm_mem', K_BAR = 'wcrm_labelbar';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[WCRM][escada]', ...a);

  // ── storage (leitura/gravação sempre "fresca" para não pisar na UI) ──
  const sget = k => new Promise(res => chrome.storage.local.get(k, o => res(o[k])));
  const sset = (k, v) => new Promise(res => chrome.storage.local.set({ [k]: v }, res));
  async function getCfg() { const c = (await sget(K_CFG)) || {}; return Object.assign({}, DEFAULT_CFG, c, { queue: Object.assign({}, DEFAULT_CFG.queue, c.queue || {}) }); }
  async function getEnrs() { return (await sget(K_ENR)) || []; }
  async function getRt() { return (await sget(K_RT)) || { day: '', sent: 0, nextSendAfter: 0, hourly: [], rot: {}, log: [], alerts: [] }; }
  async function mutateEnr(fn) { const l = await getEnrs(); const r = fn(l) || l; await sset(K_ENR, r); return r; }
  async function mutateRt(fn) { const r = (await getRt()); fn(r); await sset(K_RT, r); return r; }
  async function addLog(msg) { await mutateRt(r => { r.log = [{ at: Date.now(), msg }].concat(r.log || []).slice(0, 80); }); log(msg); }
  async function addAlert(kind, contact, text, extra) {
    await mutateRt(r => { r.alerts = [Object.assign({ id: Date.now() + '' + Math.floor(Math.random() * 999), at: Date.now(), kind, contact, text }, extra || {})].concat(r.alerts || []).slice(0, 60); });
    try { chrome.runtime.sendMessage({ type: 'NOTIFY', title: kind === 'replied' ? '💬 ' + contact + ' respondeu!' : '⚠️ Escada: ' + contact, message: (text || '').slice(0, 160) }); } catch (e) {}
    try { root.__wcrm && root.__wcrm.toast(kind === 'replied' ? '💬 ' + contact + ' respondeu — follow-up parado' : '⚠️ ' + contact + ': ' + (text || '').slice(0, 60)); } catch (e) {}
  }

  // ── leitura das mensagens da conversa aberta ──
  function readMessages(max) {
    const main = document.getElementById('main'); if (!main) return [];
    const nodes = [...main.querySelectorAll('[data-id]')].filter(el => /^(true|false)_/.test(el.getAttribute('data-id') || '') || /message-(in|out)/.test(el.className || ''));
    const out = [];
    nodes.forEach(el => {
      const id = el.getAttribute('data-id') || '';
      let from = id.startsWith('false_') ? 'in' : id.startsWith('true_') ? 'out' : (/message-in/.test(el.className) ? 'in' : /message-out/.test(el.className) ? 'out' : null);
      if (!from) return;
      const pre = el.querySelector('[data-pre-plain-text]');
      const ts = pre ? parsePrePlain(pre.getAttribute('data-pre-plain-text')) : null;
      const txtEl = el.querySelector('span.selectable-text, .copyable-text span');
      let text = (txtEl ? (txtEl.innerText !== undefined ? txtEl.innerText : txtEl.textContent) || '' : '').trim();
      if (!text) text = el.querySelector('img') ? '[foto]' : el.querySelector('audio, [data-icon*="audio"], [data-icon*="ptt"]') ? '[áudio]' : el.querySelector('video') ? '[vídeo]' : '[mídia]';
      out.push({ id, from, text: text.slice(0, 1500), ts, at: ts ? new Date(ts).toLocaleString('pt-BR') : '' });
    });
    const seen = new Set(); const uniq = out.filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    return uniq.slice(-(max || 60));
  }

  // leitura preferindo a ponte (memória do WhatsApp); DOM só como reserva
  async function readMsgs(contact, max) {
    const W = root.__wcrm;
    if (W && W.bridgeOk && W.bridgeOk()) {
      const r = await W.bridgeCall('READ', { chat: contact, max: max || 60 }, 8000);
      if (r && r.ok && r.messages) return r.messages;
    }
    return readMessages(max);
  }

  // ── abrir uma conversa pelo nome ──
  function fire(el, types) { types.forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))); }
  function findRow(name) {
    const rows = document.querySelectorAll('#pane-side [data-testid="cell-frame-container"], #pane-side [role="listitem"], #pane-side [role="row"]');
    for (const row of rows) {
      const t = row.querySelector('span[title]');
      const title = t ? (t.getAttribute('title') || t.textContent || '') : '';
      if (title && sameContact(title, name)) return row;
    }
    return null;
  }
  function clickRow(row) { const target = row.querySelector('[role="gridcell"]') || row; fire(target, ['mousedown', 'mouseup', 'click']); }
  function searchBox() {
    return document.querySelector('[data-testid="chat-list-search"]') || document.querySelector('#side div[contenteditable="true"][data-tab="3"]') || document.querySelector('#side div[contenteditable="true"]');
  }
  async function clearSearch() {
    const sb = searchBox(); if (!sb) return;
    sb.focus(); document.execCommand('selectAll'); document.execCommand('delete');
    sb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }
  async function openChat(name) {
    const W = root.__wcrm;
    if (W && W.bridgeOk && W.bridgeOk()) {
      const r = await W.bridgeCall('OPEN', { chat: name }, 10000);
      if (r && r.ok) {
        for (let i = 0; i < 14; i++) {
          await sleep(400);
          const d = W.getDisplayName() || ''; const rc = W.resolveContact();
          if (sameContact(d, r.name || name) || sameContact(d, name) || sameContact(rc.full || rc.phone, name) || document.querySelector('#main footer')) { await sleep(900); return true; }
        }
      } else { log('ponte não abriu a conversa:', r && r.reason); }
    }
    // contato que ainda aparece como número (ou foi salvo depois): abre direto pelo telefone
    const dg = String(name || '').replace(/\D/g, '');
    if (W && W.bridgeOk && W.bridgeOk() && dg.length >= 10 && dg.length <= 13 && !/[a-zà-ú]/i.test(name)) {
      const r2 = await W.bridgeCall('OPEN_NUMBER', { phone: dg }, 12000);
      if (r2 && r2.ok) {
        for (let i = 0; i < 12; i++) { await sleep(400); if (document.querySelector('#main footer')) { await sleep(1000); return true; } }
      } else { log('abrir pelo número falhou:', r2 && r2.reason); }
    }
    let row = findRow(name);
    if (!row) {
      const sb = searchBox();
      if (sb) {
        sb.focus(); await sleep(250);
        document.execCommand('selectAll'); document.execCommand('delete');
        document.execCommand('insertText', false, name);
        await sleep(1600);
        row = findRow(name);
      }
    }
    if (!row) { await clearSearch(); return false; }
    clickRow(row);
    // espera o cabeçalho mostrar o contato certo
    for (let i = 0; i < 14; i++) {
      await sleep(450);
      const r = W.resolveContact();
      if (sameContact(r.full || r.phone, name) || sameContact(W.getDisplayName() || '', name)) { await sleep(700); await clearSearch(); return true; }
    }
    await clearSearch();
    return false;
  }

  // ── etiquetas pelo menu do WhatsApp Business Web (EXPERIMENTAL) ──
  function clickable(el) { return el && (el.closest('button, [role="button"], [role="menuitem"], li') || el); }
  async function applyLabelsUI(add, remove) {
    const want = {};
    (add || []).filter(Boolean).forEach(n => { want[norm(n)] = { name: n, on: true }; });
    (remove || []).filter(Boolean).forEach(n => { want[norm(n)] = { name: n, on: false }; });
    if (!Object.keys(want).length) return { ok: true };
    // 1º: ponte direta com o WhatsApp (sincroniza com o celular, sem clicar em menus)
    if (window.__wcrm && window.__wcrm.bridgeOk && window.__wcrm.bridgeOk()) {
      const me = window.__wcrm.getDisplayName();
      let allOk = true, why = '';
      for (const w of Object.values(want)) {
        const r = await window.__wcrm.applyLabel(me, w.name, w.on ? 'add' : 'remove', w.on);
        if (!r.ok) { allOk = false; why = r.reason || 'falhou'; break; }
      }
      if (allOk) return { ok: true };
      // se a ponte recusou, tenta o jeito antigo (menu)
    }
    const header = document.querySelector('#main header') || document.getElementById('main');
    const menuBtn = header && (header.querySelector('[data-icon="menu"], [data-icon="more-refreshed"], [aria-label="Menu"], [aria-label="Mais opções"], [aria-label="More options"]'));
    if (!menuBtn) return { ok: false, why: 'não achei o menu (⋮) da conversa' };
    fire(clickable(menuBtn), ['mousedown', 'mouseup', 'click']);
    await sleep(700);
    const items = [...document.querySelectorAll('[role="menuitem"], li, [role="button"], div[tabindex]')];
    const item = items.find(e => /etiquetar|etiqueta|rotular|label chat|labels?$/i.test((e.innerText || '').trim()) && (e.innerText || '').length < 40);
    if (!item) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); return { ok: false, why: 'não achei "Etiquetar conversa" no menu' }; }
    fire(clickable(item), ['mousedown', 'mouseup', 'click']);
    await sleep(900);
    const dlg = document.querySelector('[role="dialog"], [data-animate-modal-popup="true"]') || document.body;
    const isChecked = row => !!(row.getAttribute('aria-checked') === 'true' || row.querySelector('[aria-checked="true"], input[type="checkbox"]:checked, [data-icon*="checkbox-checked"], [data-icon="checkmark-square"], [data-icon="checkbox-filled"]'));
    let touched = 0; const missing = [];
    for (const k of Object.keys(want)) {
      const leaf = [...dlg.querySelectorAll('span, div')].find(e => !e.children.length && norm(e.textContent) === k);
      if (!leaf) { missing.push(want[k].name); continue; }
      const row = leaf.closest('[role="checkbox"], [role="listitem"], label, [role="button"], div[tabindex]') || leaf.parentElement;
      if (isChecked(row) !== want[k].on) { fire(row, ['mousedown', 'mouseup', 'click']); touched++; await sleep(350); }
    }
    const save = [...dlg.querySelectorAll('button, [role="button"]')].find(b => /salvar|save|concluir|ok/i.test((b.innerText || b.getAttribute('aria-label') || '').trim())) || dlg.querySelector('[data-icon="checkmark"], [data-icon="checkmark-refreshed"]');
    if (save) { fire(clickable(save), ['mousedown', 'mouseup', 'click']); await sleep(700); }
    if (missing.length || !save) {
      log('diálogo de etiquetas (para depuração):', (dlg.outerHTML || '').slice(0, 2500));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      return { ok: false, why: missing.length ? 'etiqueta(s) não encontrada(s) na lista: ' + missing.join(', ') : 'não achei o botão Salvar' };
    }
    return { ok: true, touched };
  }

  // ── análise (IA) de uma resposta para sugerir o próximo passo ──
  async function suggestFor(contact, msgs) {
    const cfg = await getCfg();
    if (!cfg.token || !cfg.apiUrl) return null;
    try {
      const r = await fetch(cfg.apiUrl.replace(/\/$/, '') + '/api/ext/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.token },
        body: JSON.stringify({ name: contact, messages: msgs.slice(-60).map(m => ({ from: m.from, text: m.text, at: m.at || undefined })) }),
      });
      const j = await r.json();
      return j.analysis || null;
    } catch (e) { return null; }
  }

  // ── decisão do usuário sobre um inscrito ──
  async function decideEnr(id, choice) {
    const cfg = await getCfg(); const now = Date.now();
    await mutateEnr(l => {
      const x = l.find(e => e.id === id); if (!x) return;
      const rule = (cfg.rules || []).find(r => r.id === x.ruleId) || { trigger: {} };
      if (choice === 'keep') { x.state = 'waiting'; x.ignoreInUntil = now; x.dueAt = Math.max(x.dueAt || 0, now + 2 * 60e3); }
      else if (choice === 'reset') { x.state = 'waiting'; x.ignoreInUntil = now; x.enteredAt = now; x.dueAt = dueAtFor(rule, now); x.fails = 0; }
      else if (choice === 'release') { x.state = 'waiting'; x.dueAt = now; }
      else if (choice === 'approve') { x.state = 'waiting'; x.approved = true; x.dueAt = Math.min(x.dueAt || now, now); }
      else if (choice === 'cancel') { x.state = 'cancelled'; x.reason = 'cancelado por você'; x.endedAt = now; }
    });
    await mutateRt(r => { r.alerts = (r.alerts || []).filter(a => a.enrId !== id); });
  }
  async function markStale(thresholdTs) {
    let n = 0;
    await mutateEnr(l => { l.forEach(e => { if (e.state === 'waiting' && e.dueAt <= thresholdTs) { e.state = 'stale'; n++; } }); });
    if (n) {
      await addLog(n + ' follow-up(s) atrasado(s): aguardam sua decisão (aba Fila → Atrasados)');
      try { chrome.runtime.sendMessage({ type: 'NOTIFY', title: '⏰ ' + n + ' follow-up(s) atrasado(s)', message: 'O computador ficou desligado ou o envio ficou parado. Decida o que fazer na aba Fila.' }); } catch (e) {}
    }
    return n;
  }

  // ── funis: quem está em cada etiqueta/aba agora ──
  let bridgeOkSince = 0;
  async function currentMembers() {
    const W = root.__wcrm; const br = W && W.getBridge && W.getBridge();
    const cur = {}, avail = { labels: false, tabs: false };
    if (br && br.ok) {
      if (!bridgeOkSince) bridgeOkSince = Date.now();
      avail.labels = Date.now() - bridgeOkSince > 45e3;     // espera o WhatsApp terminar de carregar
      (br.labels || []).forEach(l => { cur['label:' + l.name] = []; });
      (br.chats || []).forEach(c => (c.labels || []).forEach(l => { (cur['label:' + l] = cur['label:' + l] || []).push(c.name); }));
    } else bridgeOkSince = 0;
    const bar = await sget(K_BAR);
    if (bar && bar.tabs) { avail.tabs = true; bar.tabs.forEach(t => { cur['tab:' + t.name] = (t.contacts || []).slice(); }); }
    return { cur, avail };
  }

  // ── contato salvo/renomeado no WhatsApp: segue o chat pelo ID e leva abas, funil, Follow Up e vendas junto (sem reiniciar o tempo) ──
  async function migrateContact(from, to) {
    const fk = norm(from), tk = norm(to); if (!fk || !tk || fk === tk) return;
    const f = document.getElementById('wcrm-iframe'); try { f && f.contentWindow && f.contentWindow.postMessage({ type: 'RENAME_CONTACT', from, to }, '*'); } catch (e) {}
    const bar = await sget(K_BAR);
    if (bar && bar.tabs) { let ch = false; bar.tabs.forEach(t => { const cs = t.contacts || []; const i = cs.findIndex(n => norm(n) === fk); if (i >= 0) { if (cs.some(n => norm(n) === tk)) cs.splice(i, 1); else cs[i] = to; t.count = cs.length; ch = true; } }); if (ch) await sset(K_BAR, bar); }
    const mem = await sget(K_MEM);
    if (mem && mem.m) { Object.keys(mem.m).forEach(key => { const p = mem.m[key]; if (p && p[fk]) { if (!p[tk]) p[tk] = Object.assign({}, p[fk], { n: to, miss: 0 }); delete p[fk]; } }); await sset(K_MEM, mem); }
    await mutateEnr(l => { l.forEach(e => { if (e.nk === fk) { e.nk = tk; e.contact = to; } }); });
    const sal = await sget('wcrm_sales');
    if (sal && sal.marks && sal.marks[fk]) { const m = sal.marks[fk]; delete sal.marks[fk]; if (!sal.marks[tk]) sal.marks[tk] = Object.assign({}, m, { name: to }); await sset('wcrm_sales', sal); }
    await addLog('🔁 Contato salvo/renomeado no WhatsApp: "' + from + '" → "' + to + '". Abas e Follow Up mantidos (tempo NÃO reiniciou).');
  }
  async function syncRenames() {
    const br = root.__wcrm && root.__wcrm.getBridge && root.__wcrm.getBridge(); if (!br || !br.ok || !Array.isArray(br.act)) return;
    const map = (await sget('wcrm_idmap')) || {}; let changed = false; const moves = [];
    br.act.forEach(a => {
      if (!a || !a.id || !a.n || a.g) return; const prev = map[a.id];
      if (prev && norm(prev) !== norm(a.n) && !br.act.some(x => x.id !== a.id && norm(x.n) === norm(prev))) moves.push({ from: prev, to: a.n });
      if (prev !== a.n) { map[a.id] = a.n; changed = true; }
    });
    if (changed) await sset('wcrm_idmap', map);
    // contatos guardados com o número como nome, que agora têm nome salvo no WhatsApp
    try {
      const names = new Set(br.act.map(a => norm(a.n || '')));
      const enrs = await getEnrs(); const seen = new Set();
      for (const e of enrs) {
        const c = e.contact || ''; const d = c.replace(/\D/g, '');
        if (!c || seen.has(c) || /[a-zà-ú]/i.test(c) || d.length < 10 || names.has(norm(c))) continue; seen.add(c);
        const hit = br.act.find(a => a && a.id && !a.g && /@c\.us$/.test(a.id) && a.id.replace(/\D/g, '').slice(-9) === d.slice(-9) && /[a-zà-ú]/i.test(a.n || ''));
        if (hit && !moves.some(m => m.from === c)) moves.push({ from: c, to: hit.n });
      }
    } catch (x) {}
    for (const m of moves) await migrateContact(m.from, m.to);
    // 1x: reativa follow-ups que pararam por "não achei a conversa"
    if (!(await sget('wcrm_fix486'))) {
      await mutateEnr(l => { l.forEach(e => { if (e.state === 'error' && /Não achei\/abri/.test(e.reason || '')) { e.state = 'waiting'; e.fails = 0; e.dueAt = Date.now(); delete e.reason; } }); });
      await sset('wcrm_fix486', 1);
    }
  }
  async function trackAndEnroll() {
    const cfg = await getCfg(); const { cur, avail } = await currentMembers();
    const r = trackMembers(await sget(K_MEM), cur, avail, Date.now());
    await sset(K_MEM, r.state);
    if (!r.entered.length && !r.left.length) return;
    const now = Date.now(); const rules = (cfg.rules || []).filter(x => x.active);
    let created = 0;
    await mutateEnr(list => {
      r.left.forEach(ev => list.forEach(e => {
        if (!['waiting', 'stale', 'asked', 'approval', 'sending'].includes(e.state) || e.nk !== ev.nk) return;
        const rule = rules.find(x => x.id === e.ruleId); if (!rule || (rule.trigger || {}).mode === 'leave' || !safetyOf(rule).stopOnFunnelExit) return;
        if (!(rule.funnel || []).some(f => fkey(f) === ev.key)) return;
        const still = (rule.funnel || []).some(f => r.state.m[fkey(f)] && r.state.m[fkey(f)][e.nk]);
        if (!still) { e.state = 'cancelled'; e.reason = 'saiu do funil'; e.endedAt = now; }
      }));
      const evs = r.entered.map(e => Object.assign({ kind: 'enter' }, e)).concat(r.left.map(e => Object.assign({ kind: 'leave' }, e)));
      const add = newEnrollments(cfg.rules || [], list, evs, now); created = add.length;
      return list.concat(add);
    });
    if (created) await addLog(created + ' contato(s) entraram em follow-up (entrada/saída de funil)');
  }

  // ── resposta do cliente ANTES do disparo ──
  async function handleReplied(enr, rule, preview, msgs) {
    const mode = safetyOf(rule).onClientReply; const now = Date.now();
    if (mode === 'ignore') { await mutateEnr(l => { const x = l.find(e => e.id === enr.id); if (x) x.ignoreInUntil = now; }); return; }
    if (mode === 'cancel') {
      await mutateEnr(l => { const x = l.find(e => e.id === enr.id); if (x) { x.state = 'cancelled'; x.reason = 'cliente respondeu'; x.endedAt = now; } });
      await addLog(enr.contact + ' respondeu — follow-up cancelado');
      await addAlert('info', enr.contact, 'Respondeu: ' + (preview || '(mensagem)') + ' — follow-up "' + (rule ? rule.name : '') + '" cancelado.');
      return;
    }
    await mutateEnr(l => { const x = l.find(e => e.id === enr.id); if (x) { x.state = 'asked'; x.repliedAt = now; } });
    await addLog(enr.contact + ' respondeu antes do disparo — aguardando sua decisão');
    const sug = msgs && msgs.length ? await suggestFor(enr.contact, msgs) : null;
    await addAlert('replied', enr.contact, preview || '(mensagem)', Object.assign({ enrId: enr.id, ruleId: enr.ruleId, ruleName: rule ? rule.name : '', ask: true },
      sug ? { suggestion: sug.mensagem_followup, temp: sug.temperatura, score: sug.pontuacao, resumo: sug.resumo } : {}));
  }
  async function replyScan() {
    const W = root.__wcrm; const br = W && W.getBridge && W.getBridge(); if (!br || !br.ok || !br.act) return;
    const by = {}; br.act.forEach(a => { by[norm(a.n)] = a; });
    const cfg = await getCfg(); const enrs = await getEnrs();
    for (const e of enrs) {
      if (!['waiting', 'stale'].includes(e.state)) continue;
      const a = by[e.nk]; if (!a) continue;
      const rl0 = (cfg.rules || []).find(r => r.id === e.ruleId); const sf = rl0 ? safetyOf(rl0) : null;
      if (sf && sf.onManualMsg !== 'none' && a.o > (e.enteredAt || 0) + 45e3 && a.o > (e.manualSeen || 0)) {
        const nowM = Date.now();
        if (sf.onManualMsg === 'cancel') { await mutateEnr(l => { const x = l.find(q => q.id === e.id); if (x) { x.state = 'cancelled'; x.reason = 'você falou com o cliente'; x.endedAt = nowM; } }); await addLog(e.contact + ': você mandou mensagem manual — follow-up cancelado'); }
        else { await mutateEnr(l => { const x = l.find(q => q.id === e.id); if (x) { x.manualSeen = a.o; x.enteredAt = nowM; x.dueAt = dueAtFor(rl0, nowM); x.state = 'waiting'; } }); await addLog(e.contact + ': você mandou mensagem manual — tempo do follow-up reiniciado'); }
        continue;
      }
      if (a.i > Math.max(e.enteredAt || 0, e.ignoreInUntil || 0)) {
        const rule = (cfg.rules || []).find(r => r.id === e.ruleId);
        let msgs = [], prev = '';
        try { msgs = await readMsgs(e.contact, 40); const last = msgs.filter(m => m.from === 'in').pop(); prev = last ? last.text : ''; } catch (x) {}
        await handleReplied(e, rule, prev, msgs);
      }
    }
  }


  // ── executor do script de ações ──
  const rndMs = (a, b) => Math.round(a + Math.random() * (b - a));
  async function dataUrlToFile(du, name, mime) { const r = await fetch(du); const b = await r.blob(); return new File([b], name || 'arquivo', { type: mime || b.type }); }
  async function actBridge(op, chat) { if ((root.__wcrmPresFail || 0) > 2) return { ok: false, reason: 'presença desligada' }; const W = root.__wcrm; if (!(W && W.bridgeOk && W.bridgeOk())) return { ok: false, reason: 'ponte indisponível' }; const r = (await W.bridgeCall('ACT', { op, chat }, 4000)) || { ok: false, reason: 'sem resposta' }; if (!r.ok && /presen|ponte/.test(r.reason || '') && ['typing', 'recording', 'paused'].includes(op)) root.__wcrmPresFail = (root.__wcrmPresFail || 0) + 1; return r; }
  async function actBridgeActive() { const W = root.__wcrm; try { const r = await W.bridgeCall('ACTIVE', {}, 2500); return r && r.ok ? (r.id || '__active__') : null; } catch (x) { return null; } }
  async function sendMedia(W, m, chat) {
    // 1º: envio direto pelo WhatsApp (sem prévia, igual ao WaSpeed)
    if (W.bridgeOk && W.bridgeOk()) {
      const r = await W.bridgeCall('SENDMEDIA', { chat: chat || '__active__', dataUrl: m.dataUrl, name: m.name, mime: m.mime, caption: m.caption || '', mkind: m.type }, 90000);
      if (r && r.ok) { await sleep(1200); return true; }
      log('envio direto falhou:', r && r.reason); root.__wcrmLastMediaErr = String((r && r.reason) || '').slice(0, 140);
      if (Date.now() - (root.__wcrmMediaAlertAt || 0) > 10 * 60e3) try {
        root.__wcrmMediaAlertAt = Date.now();
        const pb = await W.bridgeCall('PROBE', {}, 15000);
        const info = 'Envio direto de mídia falhou: ' + ((r && r.reason) || '?') + ' | módulos=' + (pb && pb.modules) + ' OpaqueData=' + (pb && pb.opaque) + ' prepRawMedia=' + (pb && pb.prep);
        await addLog('⚠️ ' + info); await addAlert('error', 'mídia', info);
      } catch (e) {}
      if (m.type === 'audio') { await addLog('⚠️ Áudio não enviado como voz: ' + ((r && r.reason) || '?')); return false; }   // nunca manda áudio como arquivo (parece robô)

    }
    if (chat && chat !== '__active__') { const a = await actBridgeActive(); if (a && a !== chat) return false; }
    const box = W.getInputBox(); if (!box) return false;
    const file = await dataUrlToFile(m.dataUrl, m.name, m.mime);
    box.focus(); await sleep(250);
    const dt = new DataTransfer(); dt.items.add(file);
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const findSend = () => {
      const c = [...document.querySelectorAll('[data-icon*="send"], [aria-label="Enviar"], [aria-label="Send"], [aria-label^="Enviar"]')].filter(vis);
      const el = c[c.length - 1] || null;           // o da prévia é o último desenhado na tela
      return el && (el.closest('button, [role="button"]') || el);
    };
    const press = el => {
      const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, o) : new MouseEvent(t, o)));
    };
    const pressEnter = el => { ['keydown', 'keypress', 'keyup'].forEach(t => el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))); };
    const capBox = () => { const l = [...document.querySelectorAll('[contenteditable="true"]')].filter(vis); return l[l.length - 1] || null; };
    let btn = null;
    for (let i = 0; i < 30 && !btn; i++) { await sleep(400); btn = findSend(); }
    if (!btn) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); return false; }
    await sleep(900 + Math.random() * 600);          // deixa o vídeo/foto terminar de carregar na prévia
    if (m.caption) { const cap = capBox(); if (cap) { cap.focus(); document.execCommand('insertText', false, m.caption); await sleep(400); } }
    for (let k = 0; k < 4; k++) {
      const b = findSend();
      if (b) press(b); else { const cb = capBox(); cb && (cb.focus(), pressEnter(cb)); }
      await sleep(2200);
      if (!findSend()) return true;                  // prévia fechou = enviou
      const cb = capBox(); if (k >= 1 && cb) { cb.focus(); pressEnter(cb); await sleep(1500); if (!findSend()) return true; }
    }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    return false;
  }
  // monta o texto de passos "de modelo" (Pix, convite, contato, banner, lista)
  function templateText(st) {
    if (st.type === 'pix') return ['💠 *Pix*', st.name ? 'Favorecido: ' + st.name : '', st.key ? 'Chave (' + (st.keyType || 'chave') + '): ' + st.key : '', st.value ? 'Valor: ' + st.value : '', st.note || ''].filter(Boolean).join('\n');
    if (st.type === 'invite') return [st.text || '', st.link || ''].filter(Boolean).join('\n');
    if (st.type === 'contact') return ['👤 *' + (st.name || 'Contato') + '*', st.phone ? '📞 ' + st.phone : ''].filter(Boolean).join('\n');
    if (st.type === 'banner') return [st.text || '', st.link || ''].filter(Boolean).join('\n');
    if (st.type === 'list') return [st.title ? '*' + st.title + '*' : '', st.text || '', (st.items || []).map((x, i) => (i + 1) + '. ' + x).join('\n'), st.footer ? '_' + st.footer + '_' : ''].filter(Boolean).join('\n');
    return '';
  }
  const AUX = new Set(['tab_add', 'tab_rm', 'tab_rmall', 'label_add', 'label_rm', 'label_rmall', 'archive', 'unarchive', 'pin', 'unpin', 'unread']);
  async function quickSteps(id, depth) {
    const stt = (await sget('wcrm_state')) || {}; const m = (stt.msgs || []).find(x => String(x.id) === String(id));
    if (!m) return null;
    const out = [];
    for (const a of (m.actions || [])) {
      if (a.k === 'ref') {   // script: junta várias respostas rápidas
        if ((depth || 0) < 2 && a.refId != null) { const sub = await quickSteps(a.refId, (depth || 0) + 1); if (sub) sub.forEach(x => out.push(x)); }
        if (+a.iv) out.push({ type: 'wait', seconds: +a.iv });
        continue;
      }
      if (a.db) out.push({ type: 'wait', seconds: a.db });
      if (a.ty && ['text', 'image', 'video', 'doc', 'pix', 'invite', 'contact', 'banner', 'list', 'sticker'].includes(a.k)) out.push({ type: 'typing', seconds: a.ty });
      if (a.k === 'text' && a.txt) out.push({ type: 'text', variations: [a.txt] });
      else if (['image', 'video', 'audio', 'doc', 'sticker'].includes(a.k) && (a.fileDataUrl || a.fileKey)) {
        const du = a.fileDataUrl || (await sget(a.fileKey)); if (!du) { await addLog('Mídia não encontrada (' + (a.fileName || a.k) + ') — pulei'); continue; }
        if (a.k === 'audio' && a.ty) out.push({ type: 'recording', seconds: a.ty });
        out.push({ type: a.k === 'doc' ? 'document' : a.k, dataUrl: du, name: a.fileName, mime: a.fileMime, caption: a.cap || '' });
      }
      else if (a.k === 'pix') out.push({ type: 'pix', name: a.name, keyType: a.keyType, key: a.key, value: a.value, note: a.note });
      else if (a.k === 'invite') out.push({ type: 'invite', text: a.txt || (a.group ? 'Entre no grupo ' + a.group + ':' : ''), link: a.link });
      else if (a.k === 'contact') out.push({ type: 'contact', name: a.name, phone: a.phone });
      else if (a.k === 'banner') out.push({ type: 'banner', text: [a.title ? '*' + a.title + '*' : '', a.desc || ''].filter(Boolean).join('\n'), link: a.link });
      else if (a.k === 'list') out.push({ type: 'list', title: a.title, text: a.desc, footer: a.footer, items: (a.items || []).filter(Boolean) });
      else if (AUX.has(a.k)) out.push({ type: a.k, name: a.name });
      else if (a.k === 'typing' || a.k === 'recording') out.push({ type: a.k, seconds: a.db || a.sec || 3 });
      else if (a.k === 'wait' && (a.sec || a.da)) out.push({ type: 'wait', seconds: a.sec || a.da });
      if (a.da && a.k !== 'wait') out.push({ type: 'wait', seconds: a.da });
    }
    return out;
  }
  async function sendOne(W, enr, st, rot) {
    // devolve {ok, sent:boolean, text}. Confirma pelo ID das mensagens (não pela contagem: a janela de 60 mensagens "anda").
    const outIds = async () => new Set((await readMsgs(enr.contact, 120)).filter(m => m.from === 'out').map(m => m.id));
    const beforeIds = await outIds();
    const gotNew = async tries => { for (let i = 0; i < tries; i++) { await sleep(i ? 2500 : 1500); const now = await outIds(); for (const id of now) if (!beforeIds.has(id)) return true; } return false; };
    let ok = false, text = '';
    if (['text', 'pix', 'invite', 'contact', 'banner', 'list'].includes(st.type)) {
      text = st.type === 'text' ? pickVariation(st.variations, rot) : templateText(st);
      if (!text) return { ok: true, sent: false, text: '' };
      ok = await W.sendMsg(text);
    } else {
      if (!st.dataUrl) return { ok: false, sent: false, why: 'passo de ' + st.type + ' sem arquivo anexado' };
      if (st.type === 'audio') { await actBridge('recording', enr.contact); await sleep(rndMs(3000, 6500)); await actBridge('paused', enr.contact); }   // “gravando áudio…” antes de mandar
      let m2 = st;
      if (st.caption && /#primeiroNome/i.test(st.caption) && W.applyNomeLive) { try { m2 = Object.assign({}, st, { caption: String((await W.applyNomeLive(st.caption)) || '').replace(/#primeiroNome/gi, '') }); } catch (x) {} }
      ok = await sendMedia(W, m2); text = '[' + st.type + '] ' + (st.name || '');
    }
    if (ok) { if (!(await gotNew(2))) await addLog('⚠️ Envio para "' + enr.contact + '" aceito pelo WhatsApp, mas não vi a mensagem na conversa — NÃO reenviei (confira)'); return { ok: true, sent: true, text }; }
    // o envio disse que falhou: só confirma que realmente NÃO saiu antes de permitir nova tentativa
    if (await gotNew(5)) return { ok: true, sent: true, text };
    return { ok: false, sent: false, why: 'Não consegui confirmar o envio (' + st.type + ')' };
  }
  async function execAux(W, st, contact) {
    const t = st.type;
    if (t === 'label_add' || t === 'label_rm') { const r = await applyLabelsUI(t === 'label_add' ? [st.name] : [], t === 'label_rm' ? [st.name] : []); if (!r.ok) await addLog('Etiqueta não aplicada em "' + contact + '": ' + r.why); return; }
    if (t === 'label_rmall') { const br = W.getBridge && W.getBridge(); const c = ((br && br.chats) || []).find(x => norm(x.name) === norm(contact)); const ls = c ? c.labels : []; if (ls.length) await applyLabelsUI([], ls); return; }
    if (t === 'tab_add' || t === 'tab_rm' || t === 'tab_rmall') {
      const f = document.getElementById('wcrm-iframe');
      const msg = t === 'tab_add' ? { type: 'SET_TAB', contact, tab: st.name, newTab: st.name, mode: 'add' } : t === 'tab_rm' ? { type: 'SET_TAB', contact, tab: st.name, mode: 'remove' } : { type: 'SET_TAB', contact, tab: '', mode: 'clear' };
      f && f.contentWindow && f.contentWindow.postMessage(msg, '*'); return;
    }
    if (['archive', 'unarchive', 'pin', 'unpin', 'unread'].includes(t)) { const r = await actBridge(t, '__active__'); if (!r.ok) await addLog('Ação "' + t + '" falhou em "' + contact + '": ' + r.reason); }
  }
  async function runSteps(W, rule, enr, steps, rot, before, fail) {
    let firstText = '', sentCount = 0;
    const start = Math.min(enr.stepIdx || 0, steps.length);
    for (let i = start; i < steps.length; i++) {
      let st = steps[i]; const t = st.type;
      const mark = async () => { await mutateEnr(l => { const x = l.find(e => e.id === enr.id); if (x) x.stepIdx = i + 1; }); };
      if (t === 'quick') {
        const qs = await quickSteps(st.msgId);
        if (!qs) { await addLog('Resposta rápida não encontrada (passo ' + (i + 1) + ') — pulei'); await mark(); continue; }
        for (const q of qs) {
          if (q.type === 'wait') { await sleep(Math.min(120, +q.seconds || 0) * 1000); continue; }
          if (q.type === 'typing' || q.type === 'recording') { await actBridge(q.type, enr.contact); await sleep((+q.seconds || 3) * 1000); await actBridge('paused', enr.contact); continue; }
          if (AUX.has(q.type)) { await execAux(W, q, enr.contact); continue; }
          const r = await sendOne(W, enr, q, rot);
          if (!r.ok) { await fail(r.why + ' — NÃO avancei', 'Falha no envio do follow-up "' + rule.name + '": ' + r.why); return { ok: false }; }
          if (r.sent) { sentCount++; firstText = firstText || r.text; await sleep(rndMs(1200, 2500)); }
        }
        await mark(); continue;
      }
      if (isSendStep(st)) {
        const r = await sendOne(W, enr, st, rot);
        if (!r.ok) { await fail(r.why + ' — NÃO avancei', 'Falha no passo ' + (i + 1) + ' do follow-up "' + rule.name + '": ' + r.why); return { ok: false }; }
        if (r.sent) { sentCount++; firstText = firstText || r.text; await sleep(rndMs(1200, 2500)); }
      } else if (t === 'wait') { await sleep(Math.min(3600, Math.max(0, +st.seconds || 0)) * 1000); }
      else if (t === 'typing' || t === 'recording') {
        const r = await actBridge(t, enr.contact); if (!r.ok) await addLog('Presença "' + t + '" não aplicada (' + r.reason + ') — só esperei');
        await sleep(Math.min(120, Math.max(1, +st.seconds || 3)) * 1000); await actBridge('paused', enr.contact);
      }
      else if (t === 'label_add' || t === 'label_rm') {
        const r = await applyLabelsUI(t === 'label_add' ? [st.name] : [], t === 'label_rm' ? [st.name] : []);
        if (!r.ok) { await addLog('Etiqueta não aplicada em "' + enr.contact + '": ' + r.why); await addAlert('label', enr.contact, 'Troque a etiqueta manualmente (' + (st.name || '') + '). Motivo: ' + r.why); }
        else await addLog('Etiqueta em "' + enr.contact + '": ' + (t === 'label_add' ? '+' : '−') + st.name);
      }
      else if (t === 'label_rmall') {
        const br = W.getBridge && W.getBridge(); const c = ((br && br.chats) || []).find(x => norm(x.name) === enr.nk);
        const ls = c ? c.labels : [];
        if (ls.length) { const r = await applyLabelsUI([], ls); if (!r.ok) await addAlert('label', enr.contact, 'Não consegui tirar todas as etiquetas: ' + r.why); else await addLog('Todas as etiquetas removidas de "' + enr.contact + '"'); }
      }
      else if (t === 'tab_add' || t === 'tab_rm' || t === 'tab_rmall') {
        try {
          const f = document.getElementById('wcrm-iframe');
          if (!(f && f.contentWindow)) { await fail('Painel do CRM não carregado — não consegui mudar a aba', 'Não consegui mudar a aba de "' + enr.contact + '": o painel do CRM não está carregado (F5 no WhatsApp).'); return { ok: false }; }
          const msg = t === 'tab_add' ? { type: 'SET_TAB', contact: enr.contact, tab: st.name, newTab: st.name, mode: 'add' } : t === 'tab_rm' ? { type: 'SET_TAB', contact: enr.contact, tab: st.name, mode: 'remove' } : { type: 'SET_TAB', contact: enr.contact, tab: '', mode: 'clear' };
          f && f.contentWindow && f.contentWindow.postMessage(msg, '*');
        } catch (e) {}
      }
      else if (['archive', 'unarchive', 'pin', 'unpin', 'unread'].includes(t)) {
        const r = await actBridge(t, enr.contact); if (!r.ok) { await addLog('Ação "' + t + '" falhou em "' + enr.contact + '": ' + r.reason); await addAlert('label', enr.contact, 'Ação “' + t + '” não aplicada: ' + r.reason); }
      }
      await mark();
    }
    return { ok: true, firstText, sentCount };
  }

  // ── processa UM inscrito (um envio) ──
  let busy = false;
  const INST = Math.random().toString(36).slice(2, 8);
  async function processEnrollment(enrId) {
    // TRAVA: reserva o contato ("sending") antes de mexer em qualquer coisa → impossível enviar 2x o mesmo follow-up
    const myId = INST + '-' + Date.now(); let claimed = false;
    await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x && ['waiting', 'stale'].includes(x.state)) { x.state = 'sending'; x.claim = myId; x.claimAt = Date.now(); claimed = true; } });
    if (!claimed) return;
    await sleep(450 + Math.random() * 350);
    const chk = (await getEnrs()).find(e => e.id === enrId);
    if (!chk || chk.claim !== myId || chk.state !== 'sending') return;   // outra cópia reservou primeiro
    try { await processEnrollmentInner(enrId); }
    finally { await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x && x.claim === myId) { if (x.state === 'sending') x.state = 'waiting'; delete x.claim; } }); }
  }
  async function processEnrollmentInner(enrId) {
    const W = root.__wcrm; if (!W) return;
    const cfg = await getCfg();
    const enr = (await getEnrs()).find(e => e.id === enrId); if (!enr) return;
    const rule = (cfg.rules || []).find(r => r.id === enr.ruleId);
    if (!rule) { await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x) { x.state = 'cancelled'; x.reason = 'follow-up apagado'; } }); return; }
    const act = rule.action || {};
    const fail = async (why, alertText) => {
      const fails = (enr.fails || 0) + 1;
      await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x) { x.fails = fails; x.dueAt = Date.now() + 20 * 60e3; if (fails >= 3) { x.state = 'error'; x.reason = why; } } });
      await addLog(why + ' ("' + enr.contact + '", tentativa ' + fails + ')');
      if (fails >= 3) await addAlert('error', enr.contact, alertText || why);
    };

    const ok = await openChat(enr.contact);
    if (!ok) return fail('Não achei/abri a conversa', 'Não consegui abrir a conversa 3 vezes. Follow-up parado para esse contato.');
    const before = await readMsgs(enr.contact, 60);
    const base = Math.max(enr.enteredAt || 0, enr.ignoreInUntil || 0);
    const rep = hasReplySince(before, base);
    if (rep.replied && safetyOf(rule).onClientReply !== 'ignore') { await handleReplied(enr, rule, rep.text, before); return; }

    // ── travas de segurança (na hora de enviar) ──
    const sf = safetyOf(rule); const br0 = W.getBridge && W.getBridge();
    const ainfo = ((br0 && br0.act) || []).find(a => norm(a.n) === enr.nk);
    const cinfo = ((br0 && br0.chats) || []).find(c => norm(c.name) === enr.nk);
    const bar0 = await sget(K_BAR); const tabsNow = ((bar0 && bar0.tabs) || []).filter(t => (t.contacts || []).some(n => norm(n) === enr.nk)).map(t => t.name);
    const allEnrs = await getEnrs();
    const chk = checkSafety(rule, { enr, enrs: allEnrs, now: Date.now(), isGroup: !!(ainfo && ainfo.g), labels: cinfo ? cinfo.labels : [], tabs: tabsNow });
    if (!chk.ok) {
      if (chk.act === 'postpone') { await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x) x.dueAt = chk.until; }); await addLog('"' + enr.contact + '" adiado: ' + chk.reason); }
      else { await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x) { x.state = 'cancelled'; x.reason = chk.reason; x.endedAt = Date.now(); } }); await addLog('"' + enr.contact + '" cancelado: ' + chk.reason); }
      return;
    }
    if (sf.requireApproval && !enr.approved) {
      await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x) { x.state = 'approval'; } });
      await addLog('"' + enr.contact + '" aguardando sua aprovação para enviar');
      await addAlert('approve', enr.contact, 'Follow-up "' + rule.name + '" pronto para sair. Aprove ou cancele na aba Fila.', { enrId: enr.id });
      return;
    }
    const steps = stepsOf(act);
    if (sf.dryRun) {
      await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x) { x.state = 'sent'; x.simulated = true; x.endedAt = Date.now(); x.history = (enr.history || []).concat([{ at: Date.now(), text: '[SIMULAÇÃO] ' + steps.length + ' ação(ões)' }]); } });
      await mutateRt(r => { r.nextSendAfter = Date.now() + gapMs(cfg); });
      await addLog('🧪 SIMULAÇÃO: "' + rule.name + '" → "' + enr.contact + '" (' + steps.length + ' ação(ões), nada foi enviado)');
      return;
    }
    const hist = enr.history || [];
    const rt0 = await getRt();
    const rot = ((rt0.rot || {})[rule.id]) || 0;
    const res = await runSteps(W, rule, enr, steps, rot, before, fail);
    if (!res.ok) return;
    const text = res.firstText;
    const now = Date.now();
    await mutateEnr(l => { const x = l.find(e => e.id === enrId); if (x) { x.state = 'sent'; x.endedAt = now; x.fails = 0; x.history = hist.concat([{ at: now, text: text || '' }]); x.stepIdx = 0; } });
    await mutateRt(r => {
      const today = dayKey(new Date(now));
      if (r.day !== today) { r.day = today; r.sent = 0; }
      r.sent = (r.sent || 0) + (res.sentCount ? 1 : 0);
      r.hourly = (r.hourly || []).filter(t => now - t < 3600e3).concat(res.sentCount ? [now] : []);
      r.rot = r.rot || {}; r.rot[rule.id] = (r.rot[rule.id] || 0) + 1;
      r.nextSendAfter = now + gapMs(cfg);
    });
    await addLog('Follow-up "' + rule.name + '" enviado para "' + enr.contact + '"');
  }

  // ── ciclo principal ──
  let bootPrevAlive = null, wasOn = null;
  async function tick(force) {
    if (busy) return; busy = true;
    try {
      if (!root.__wcrm || !document.querySelector('#pane-side')) return;
      const cfg = await getCfg(); const rt0 = await getRt(); const now = Date.now();
      // só UMA aba do WhatsApp comanda o robô (a que tem o painel do CRM carregado) — evita duas abas mexendo na mesma fila
      const hasPanel = !!(document.getElementById('wcrm-iframe') && document.getElementById('wcrm-iframe').contentWindow);
      const L = rt0.leader;
      if (L && L.id !== INST && now - L.at < 30000 && !force) return;
      if (!hasPanel) { if (!(L && L.id !== INST && now - L.at < 30000) && now - (root.__wcrmNoPanelLog || 0) > 10 * 60e3) { root.__wcrmNoPanelLog = now; try { await addLog('⚠️ Esta aba do WhatsApp está sem o painel do CRM (mudar aba/etiqueta não funciona) — o robô não vai rodar aqui. Aperte F5.'); } catch (x) {} } return; }
      await mutateRt(r => { r.leader = { id: INST, at: now }; });
      if (bootPrevAlive === null) {
        bootPrevAlive = rt0.lastAlive || now;
        if (now - bootPrevAlive > (cfg.staleMin || 120) * 60e3) await markStale(now);   // computador ficou desligado
      }
      if (wasOn === null) wasOn = cfg.on;
      else if (cfg.on && !wasOn) { wasOn = true; await markStale(now - (cfg.staleMin || 120) * 60e3); }
      else if (!cfg.on) wasOn = false;
      await mutateRt(r => { r.lastAlive = now; });
      await mutateEnr(l => { l.forEach(e => { if (e.state === 'sending' && now - (e.claimAt || 0) > 15 * 60e3) { e.state = 'stale'; delete e.claim; } }); });
      await syncRenames();
      await trackAndEnroll();
      await replyScan();
      const enrs = await getEnrs(), rt = await getRt();
      const d = force ? { act: 'send', enr: enrs.find(e => e.id === force && ['waiting', 'stale'].includes(e.state)) } : decide(cfg, enrs, rt, Date.now());
      await mutateRt(r => { r.state = d.act === 'send' ? 'enviando' : d.why; r.stateAt = Date.now(); });
      if (d.act === 'send' && d.enr) await processEnrollment(d.enr.id);
    } catch (e) { console.error('[WCRM][escada] erro', e); try { await addLog('Erro: ' + (e && e.message)); } catch (x) {} }
    finally { busy = false; }
  }

  // ── conversa com a interface (painel e janela de Follow Up) ──
  window.addEventListener('message', async e => {
    const t = e.data && e.data.type; if (!t) return;
    const iframe = document.getElementById('wcrm-iframe');
    const reply = m => iframe && iframe.contentWindow && iframe.contentWindow.postMessage(m, '*');
    if (t === 'GET_CHAT_MESSAGES') {
      const W = root.__wcrm; const r = W ? await W.resolveStable() : { full: '' };
      const nm = (r && (r.full || r.phone)) || ''; reply({ type: 'CHAT_MESSAGES', name: nm, messages: await readMsgs(nm || (W && W.getDisplayName()) || '', 60) });
    }
    if (t === 'ENGINE_DIAG') {
      const W = root.__wcrm; const L = [];
      const ok = (b, s) => L.push((b ? '✅ ' : '❌ ') + s);
      ok(!!W, 'extensão carregada no WhatsApp');
      ok(!!document.querySelector('#pane-side'), 'lista de conversas encontrada (#pane-side)');
      const br = W && W.getBridge && W.getBridge();
      ok(!!(br && br.ok), 'ponte com o WhatsApp' + (br && !br.ok ? ' — ' + br.reason : (br ? ' — ' + br.labels.length + ' etiquetas, ' + (br.act || []).length + ' conversas monitoradas' : ' — sem resposta (F5 no WhatsApp Web)')));
      const me = W && W.getDisplayName();
      ok(!!me, 'conversa aberta: ' + (me || 'nenhuma — abra uma conversa e rode de novo'));
      if (me) {
        const m = await readMsgs(me, 60);
        ok(m.length > 0, 'leu ' + m.length + ' mensagens (' + m.filter(x => x.from === 'in').length + ' do cliente, ' + m.filter(x => x.from === 'out').length + ' suas)');
        if (m.length) { const lm = m[m.length - 1]; L.push('   última: ' + (lm.from === 'in' ? 'cliente' : 'você') + ' — “' + (lm.text || '').slice(0, 50) + '” ' + (lm.at || '')); }
        ok(!!(W.getInputBox && W.getInputBox()), 'caixa de texto da conversa encontrada');
        if (br && br.ok) { const pb = await W.bridgeCall('PROBE', {}, 15000); ok(pb && pb.ok && pb.opaque && pb.prep && pb.text, 'envio direto — texto: ' + (pb && pb.text ? 'ok' : 'NÃO') + ' · mídia: ' + (pb && pb.ok ? pb.modules + ' módulos; OpaqueData=' + pb.opaque + '; prepRawMedia=' + pb.prep : (pb && pb.reason))); }
        if (br && br.ok) { const o = await W.bridgeCall('OPEN', { chat: me }, 8000); ok(o && o.ok, 'abrir conversa pela ponte' + (o && !o.ok ? ' — ' + o.reason : '')); }
      }
      const cfg = await getCfg(), enrs = await getEnrs(), rt = await getRt(), mem = await sget(K_MEM);
      ok(!!cfg.on, 'envio automático LIGADO' + (cfg.on ? '' : ' — está desligado (só ▶ Enviar agora envia)'));
      const nowOk = inWindow(Date.now(), cfg);
      ok(nowOk, 'dentro do horário permitido agora' + (nowOk ? '' : ' (' + cfg.winStart + '–' + cfg.winEnd + ')'));
      const rules = (cfg.rules || []);
      ok(rules.some(r => r.active), rules.filter(r => r.active).length + ' follow-up(s) ativo(s) de ' + rules.length);
      rules.filter(r => r.active && !(r.funnel || []).length).forEach(r => L.push('   ⚠️ "' + r.name + '" sem etiqueta/aba no funil'));
      ok(!!(mem && mem.init && (mem.init.labels || mem.init.tabs)), 'funis monitorados' + (mem && mem.init ? ' (etiquetas: ' + (mem.init.labels ? 'sim' : 'aguardando 45s') + ', abas: ' + (mem.init.tabs ? 'sim' : 'não') + ')' : ' — ainda não iniciou'));
      const c = s => enrs.filter(x => x.state === s).length;
      L.push('   fila: ' + c('waiting') + ' aguardando · ' + c('stale') + ' atrasados · ' + c('asked') + ' esperando sua decisão · ' + c('sent') + ' enviados');
      const next = enrs.filter(x => x.state === 'waiting').sort((a, b) => a.dueAt - b.dueAt)[0];
      if (next) L.push('   próximo: ' + next.contact + ' — ' + new Date(next.dueAt).toLocaleString('pt-BR'));
      L.push('   estado: ' + (rt.state || '—') + ' · enviadas hoje: ' + (rt.sent || 0));
      reply({ type: 'ENGINE_DIAG_RESULT', lines: L });
    }
    if (t === 'ENGINE_SEND_NOW' && e.data.id) { tick(e.data.id); }
    if (t === 'ENGINE_DECIDE' && e.data.id) { await decideEnr(e.data.id, e.data.choice); }
    if (t === 'ENGINE_DECIDE_ALL') {
      const ids = (await getEnrs()).filter(x => x.state === e.data.from).map(x => x.id);
      for (const id of ids) await decideEnr(id, e.data.choice);
    }
    if (t === 'ENGINE_ENROLL_EXISTING' && e.data.ruleId) {
      const cfg = await getCfg(); const rule = (cfg.rules || []).find(r => r.id === e.data.ruleId); if (!rule) return;
      const { cur } = await currentMembers(); const now = Date.now(); const evs = [];
      (rule.funnel || []).forEach(f => (cur[fkey(f)] || []).forEach(n => evs.push({ kind: 'enter', key: fkey(f), n, nk: norm(n) })));
      let n = 0;
      await mutateEnr(l => { const add = newEnrollments([Object.assign({}, rule, { active: true })], l, evs, now); n = add.length; return l.concat(add); });
      await addLog('"' + rule.name + '": ' + n + ' contato(s) que já estavam no funil foram colocados na fila');
    }
    if (t === 'ENGINE_TEST_LABEL') {
      const r = await applyLabelsUI(e.data.add ? [e.data.add] : [], e.data.remove ? [e.data.remove] : []);
      reply({ type: 'ENGINE_TEST_LABEL_RESULT', result: r });
    }
  });


  // ══════════════════════════════════════════════════════════
  //  DISPARO EM MASSA (seguro) — um contato por vez, intervalo aleatório, horário e limites
  // ══════════════════════════════════════════════════════════
  const K_BULK = 'wcrm_bulk';
  const BULK_DEF = { groups: [], jobs: [] };
  async function getBulk() { const b = (await sget(K_BULK)) || {}; return Object.assign({}, BULK_DEF, b, { groups: b.groups || [], jobs: b.jobs || [] }); }
  let bulkQ = Promise.resolve();
  function mutateBulk(fn) { const p = bulkQ.then(async () => { const b = await getBulk(); fn(b); await sset(K_BULK, b); return b; }); bulkQ = p.catch(() => {}); return p; }
  async function bulkProcess(jobId) {
    const W = root.__wcrm; if (!W) return;
    const cfg = await getCfg();
    const b0 = await getBulk(); const job = b0.jobs.find(j => j.id === jobId); if (!job) return;
    const o = Object.assign({}, BULK_OPTS, job.opts || {});
    const idx = job.contacts.findIndex(c => c.state === 'pending');
    if (idx < 0) { await mutateBulk(b => { const j = b.jobs.find(x => x.id === jobId); if (j) { j.status = 'done'; j.endedAt = Date.now(); } }); await addLog('📣 Disparo "' + job.name + '" concluído'); return; }
    const c = job.contacts[idx];
    const setC = (patch, jobPatch) => mutateBulk(b => { const j = b.jobs.find(x => x.id === jobId); if (!j) return; Object.assign(j.contacts[idx], patch, { at: Date.now() }); if (jobPatch) Object.assign(j, jobPatch); });
    const sentN = job.contacts.filter(x => x.state === 'sent').length + 1;   // contando este
    const warm = o.warmN && sentN <= o.warmN ? (o.warmFactor || 2) : 1;
    const longP = o.batchEvery && sentN % o.batchEvery === 0 && job.contacts.some(x => x.state === 'pending' && x !== c);
    const gap = (ok) => Date.now() + ((ok && longP) ? rndMs(o.batchMin * 60e3, Math.max(o.batchMin, o.batchMax) * 60e3) : rndMs(o.minSec * 1000 * warm, Math.max(o.minSec, o.maxSec) * 1000 * warm));
    const br = W.getBridge && W.getBridge();
    let info = ((br && br.act) || []).find(a => norm(a.n) === norm(c.n));
    if (!info) { const al = ((br && br.all) || []).find(a => norm(a.n) === norm(c.n)); if (al && al.t) info = { n: al.n, i: al.t, o: 0 }; }
    if (info && info.g) { await setC({ state: 'skipped', why: 'é um grupo' }); return; }
    if (o.onlyKnown && !(info && (info.i || info.o))) { await setC({ state: 'skipped', why: 'nunca conversou com você (proteção)' }); await addLog('📣 "' + c.n + '" pulado: nunca conversou com você'); return; }
    if (o.skipRecentHours > 0) { const lim = Date.now() - o.skipRecentHours * 3600e3; const rec = b0.jobs.some(j => (j.contacts || []).some(x => norm(x.n) === norm(c.n) && x.state === 'sent' && !x.simulated && (x.at || 0) > lim && !(j.id === jobId && x === c))); if (rec) { await setC({ state: 'skipped', why: 'já recebeu disparo há menos de ' + o.skipRecentHours + ' h' }); await addLog('📣 "' + c.n + '" pulado: recebeu disparo recente'); return; } }
    if (o.skipActiveMin > 0 && info && info.i && Date.now() - info.i < o.skipActiveMin * 60e3) { await setC({ state: 'skipped', why: 'conversa ativa (cliente escreveu há menos de ' + o.skipActiveMin + ' min)' }); await addLog('📣 "' + c.n + '" pulado: conversa ativa'); return; }
    if ((o.excludeTabs || []).length) { const bar = (await sget(K_BAR)) || {}; const ex = new Set(o.excludeTabs.map(norm)); const hit = (bar.tabs || []).find(t => ex.has(norm(t.name)) && (t.contacts || []).some(n => norm(n) === norm(c.n))); if (hit) { await setC({ state: 'skipped', why: 'está na aba bloqueada “' + hit.name + '”' }); await addLog('📣 "' + c.n + '" pulado: aba ' + hit.name); return; } }
    const steps = bulkStepsOf(job, idx);
    if (!steps.length) { await mutateBulk(b => { const j = b.jobs.find(x => x.id === jobId); if (j) j.status = 'paused'; }); await addLog('📣 Disparo "' + job.name + '" sem ações — pausado'); return; }
    if (o.dryRun) { await setC({ state: 'sent', simulated: true }, { nextAt: Date.now() + 1500, longPause: false }); await addLog('🧪 SIMULAÇÃO disparo "' + job.name + '" → "' + c.n + '" (nada enviado)'); return; }
    const fakeEnr = { id: 'bulk-' + jobId + '-' + idx, contact: c.n, nk: norm(c.n), stepIdx: 0 };
    const failed = async why => {
      const fails = (job.fails || 0) + 1;
      await setC({ state: 'error', why }, { fails, nextAt: gap(false), longPause: false });
      await addLog('📣 Falha em "' + c.n + '": ' + why);
      if (fails >= o.pauseAfterFails) { await mutateBulk(b => { const j = b.jobs.find(x => x.id === jobId); if (j) j.status = 'paused'; }); await addAlert('error', c.n, 'Disparo "' + job.name + '" PAUSADO após ' + fails + ' falhas seguidas: ' + why); }
    };
    const opened = await openChat(c.n);
    if (!opened) { await failed('não consegui abrir a conversa'); return; }
    const before = await readMsgs(c.n, 60);
    const res = await runSteps(W, { name: job.name }, fakeEnr, steps, 0, before, async (why) => { await failed(why); });
    if (!res.ok) return;
    const now = Date.now();
    await setC({ state: 'sent', text: (res.firstText || '').slice(0, 80) }, { fails: 0, nextAt: gap(true), longPause: !!longP });
    await mutateRt(r => { const today = dayKey(new Date(now)); if (r.day !== today) { r.day = today; r.sent = 0; } r.sent = (r.sent || 0) + 1; r.hourly = (r.hourly || []).filter(t => now - t < 3600e3).concat([now]); });
    await addLog('📣 Disparo "' + job.name + '" → "' + c.n + '"');
  }
  async function bulkTick() {
    if (busy) return;
    let mine = false;
    try {
      if (!root.__wcrm || !document.querySelector('#pane-side')) return;
      const b = await getBulk(); const job = b.jobs.find(j => j.status === 'running'); if (!job) return;
      const cfg = await getCfg(); const rt = await getRt();
      if (rt.leader && rt.leader.id !== INST && Date.now() - rt.leader.at < 30000) return;   // outra aba comanda
      const g = bulkGate(job, rt, cfg, Date.now());
      if (job.waitWhy !== (g.go ? '' : g.why)) await mutateBulk(x => { const j = x.jobs.find(y => y.id === job.id); if (j) j.waitWhy = g.go ? '' : g.why; });
      if (!g.go) return;
      if (busy) return; busy = true; mine = true; await bulkProcess(job.id);
    } catch (e) { console.error('[WCRM][massa] erro', e); } finally { if (mine) busy = false; }
  }
  // lista de contatos disponíveis para escolher (vem da ponte do WhatsApp)
  async function bulkSources() {
    const W = root.__wcrm; const br = W && W.getBridge && W.getBridge();
    const actMap = new Map(); ((br && br.act) || []).filter(a => !a.g).forEach(a => actMap.set(norm(a.n), { n: a.n, i: a.i || 0, o: a.o || 0, id: a.id || '' }));
    ((br && br.all) || []).forEach(a => { const k = norm(a.n); if (!actMap.has(k)) actMap.set(k, { n: a.n, i: a.t || 0, o: 0, t: a.t || 0, id: a.id || '' }); else { actMap.get(k).t = a.t || 0; if (!actMap.get(k).id && a.id) actMap.get(k).id = a.id; } });
    const act = [...actMap.values()].sort((x, y) => (y.t || Math.max(x.i, x.o)) - (x.t || Math.max(y.i, y.o)));
    const labels = ((br && br.labels) || []).map(l => ({ name: l.name, color: l.color, count: l.count }));
    const chats = ((br && br.chats) || []).filter(c => !/@g\.us$/.test(c.id || '')).map(c => ({ n: c.name, labels: c.labels }));
    const bar = (await sget(K_BAR)) || {}; const tabs = (bar.tabs || []).map(t => ({ name: t.name, contacts: t.contacts || [] }));
    const sal = (await sget('wcrm_sales')) || {}; const marks = Object.values(sal.marks || {}).map(m => ({ n: m.name, day: m.day }));
    const stt = (await sget('wcrm_state')) || {}; const profile = Object.entries(stt.contacts || {}).map(([n, c]) => ({ n, notes: Array.isArray(c.notesList) ? c.notesList.length : (c.notes ? 1 : 0), val: !!(c.values && (Array.isArray(c.values) ? c.values.length : Object.keys(c.values).length)) }));
    return { act, labels, chats, tabs, marks, profile, ok: !!(br && br.ok) };
  }
  // ── envio manual de resposta rápida (clique em ▷) — com faixa de progresso e "Cancelar Envio" (igual WaSpeed) ──
  let qrRunning = false, qrCancel = false;
  const QR_ICO = { text: '📝', image: '🖼️', video: '🎬', audio: '🎤', document: '📄', sticker: '😀', pix: '💠', invite: '👥', contact: '👤', banner: '🔗', list: '☰' };
  // ── envios de resposta rápida: um por conversa (cada um com seu status e seu Cancelar) ──
  const qrRuns = {};   // chatId -> { cancel, label, ico, cancelable }
  let qrActive = '__active__';
  function qrDraw(run) {
    let b = document.getElementById('wcrm-qrbar');
    if (!run) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'wcrm-qrbar';
      b.style.cssText = 'position:fixed;z-index:2147483000;display:flex;align-items:center;gap:12px;padding:8px 14px;background:#111;color:#fff;border-bottom:1px solid #333;font:600 15px system-ui,Segoe UI,sans-serif;box-shadow:0 2px 8px #0006';
      b.innerHTML = '<button id="wcrm-qrcancel" style="border:1px solid #ff4d4d;color:#ff6b6b;background:transparent;border-radius:999px;padding:5px 14px;font:600 13px system-ui;cursor:pointer">Cancelar Envio</button><span id="wcrm-qrico"></span><span id="wcrm-qrtxt"></span>';
      document.body.appendChild(b);
      b.querySelector('#wcrm-qrcancel').onclick = () => { const r = qrRuns[qrActive] || qrRuns.__active__; if (r) { r.cancel = true; r.label = 'Cancelando…'; qrDraw(r); } };
    }
    const main = document.querySelector('#main'); const r = main ? main.getBoundingClientRect() : { left: 0, width: window.innerWidth, top: 0 };
    b.style.left = r.left + 'px'; b.style.width = r.width + 'px'; b.style.top = (r.top + 59) + 'px';
    b.querySelector('#wcrm-qrico').textContent = run.ico || ''; b.querySelector('#wcrm-qrtxt').textContent = run.label;
    b.querySelector('#wcrm-qrcancel').style.display = run.cancelable === false ? 'none' : '';
  }
  // mostra só o status da conversa que está aberta
  async function qrSync() {
    const keys = Object.keys(qrRuns); if (!keys.length) { qrDraw(null); return; }
    const cur = await actBridgeActive(); if (cur) qrActive = cur;
    const run = qrRuns[qrActive] || (qrRuns.__active__ && (cur === '__active__' || !cur) ? qrRuns.__active__ : null);
    qrDraw(run && !run.hidden ? run : null);
  }
  setInterval(() => { if (Object.keys(qrRuns).length) qrSync(); }, 700);
  async function qrSleep(ms, run) { const end = Date.now() + ms; while (Date.now() < end && !(run && run.cancel)) await sleep(Math.min(200, end - Date.now())); }
  // espera uma ação, mas devolve na hora se o usuário cancelar
  function qrRace(p, run) { return new Promise(res => { let done = false; const t = setInterval(() => { if (run.cancel && !done) { done = true; clearInterval(t); res(false); } }, 150); Promise.resolve(p).then(v => { if (!done) { done = true; clearInterval(t); res(v); } }, () => { if (!done) { done = true; clearInterval(t); res(false); } }); }); }
  async function quickRun(id) {
    const W = root.__wcrm; if (!W) return;
    const chatId = (await actBridgeActive()) || '__active__';
    if (qrRuns[chatId]) { const r = qrRuns[chatId]; r.hidden = false; qrActive = chatId; qrDraw(r); return; }
    if (busy && !Object.keys(qrRuns).length) { qrDraw({ label: 'Aguarde: o robô está enviando outra coisa agora', ico: '⏳', cancelable: false }); setTimeout(() => { if (!Object.keys(qrRuns).length) qrDraw(null); }, 3000); return; }
    const stt = (await sget('wcrm_state')) || {}; const m = (stt.msgs || []).find(x => String(x.id) === String(id));
    const qs = await quickSteps(id); if (!qs || !qs.length) { qrDraw({ label: 'Resposta rápida vazia', ico: '⚠️', cancelable: false }); setTimeout(() => { if (!Object.keys(qrRuns).length) qrDraw(null); }, 2500); return; }
    const ui = (await sget('wcrm_ui')) || {};
    // #primeiroNome: resolve UMA vez, com a conversa em que o envio foi acionado (contato salvo → nome do perfil; vazio em grupo)
    let nome = ''; const usaNome = /#primeiroNome/i.test(JSON.stringify(qs.map(q => Object.assign({}, q, { dataUrl: '' }))));
    if (usaNome) {   // o WhatsApp às vezes demora a sincronizar o nome: tenta de novo por até ~5 s (grupo não tem nome, não espera)
      for (let i = 0; i < 10 && !nome; i++) {
        try { const a = await W.bridgeCall('ACTIVE', {}, 3000); if (a && a.ok && a.group) break; } catch (x) {}
        try { if (W.applyNomeLive) nome = String((await W.applyNomeLive('#primeiroNome')) || '').trim(); } catch (x) {}
        if (!/[A-Za-zÀ-ÿ]/.test(nome)) nome = '';
        if (!nome) await sleep(500);
      }
    }
    if (!/[A-Za-zÀ-ÿ]/.test(nome)) nome = '';   // número/55 nunca vira nome: sem nome, fica em branco
    const subst = v => typeof v === 'string' ? v.replace(/#primeiroNome/gi, nome) : Array.isArray(v) ? v.map(subst) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x)])) : v;
    for (const q of qs) for (const k of Object.keys(q)) { if (k !== 'dataUrl') q[k] = subst(q[k]); }
    const run = { cancel: false, label: 'Preparando…', ico: '', cancelable: true, hidden: !!ui.noMonitor }; qrRuns[chatId] = run; qrActive = chatId; busy = true;
    const showBar = (a, b, c) => { run.label = a; run.ico = b; run.cancelable = c; qrSync(); };
    const sendable = qs.filter(q => !['wait', 'typing', 'recording'].includes(q.type) && !AUX.has(q.type)); const total = sendable.length; let n = 0;
    const title = (m && m.label) || 'Resposta Rápida'; let fail = '';
    const same = async () => { if (chatId === '__active__') return true; const c = await actBridgeActive(); return !c || c === chatId; };   // ainda é a conversa aberta?
    const pres = async op => { await actBridge(op, chatId); };
    try {
      for (const q of qs) {
        if (run.cancel) break;
        if (q.type === 'wait') { await qrSleep(Math.min(120, +q.seconds || 0) * 1000, run); continue; }
        if (q.type === 'typing' || q.type === 'recording') { await pres(q.type); await qrSleep((+q.seconds || 3) * 1000, run); await pres('paused'); continue; }
        if (AUX.has(q.type)) { if (await same()) await execAux(W, q, (W.getDisplayName && W.getDisplayName()) || ''); else await addLog('Ação "' + q.type + '" pulada: você trocou de conversa'); continue; }
        n++; showBar('Ação da Resposta Rápida (' + n + '/' + total + ') — ' + title, QR_ICO[q.type] || '📨', true);
        let ok = false;
        if (q.type === 'text' || ['pix', 'invite', 'contact', 'banner', 'list'].includes(q.type)) {
          let t = q.type === 'text' ? pickVariation(q.variations, 0) : templateText(q);
          if (q.type === 'text' && t && !ui.noSig && ui.sigName) t = '*' + ui.sigName + ':*\n' + t;
          if (!t) ok = true;
          else {
            const r = (W.bridgeOk && W.bridgeOk()) ? await qrRace(W.bridgeCall('SENDTEXT', { chat: chatId, text: t }, 20000), run) : false;
            ok = !!(r && r.ok);
            if (!ok && !run.cancel && (await same())) ok = await qrRace(W.sendMsg(t), run);   // plano B: caixa de texto (só se ainda for a conversa)
          }
        } else {
          if (q.type === 'audio') { await pres('recording'); await qrSleep(rndMs(2000, 4000), run); await pres('paused'); }
          if (run.cancel) break;
          root.__wcrmLastMediaErr = '';
          ok = await qrRace(sendMedia(W, q, chatId), run);
        }
        if (run.cancel) break;
        if (!ok) { fail = 'Falhou na ação ' + n + '/' + total + (root.__wcrmLastMediaErr ? ' — ' + root.__wcrmLastMediaErr : ''); break; }
        await qrSleep(rndMs(700, 1400), run);
      }
    } catch (err) { fail = String(err && err.message || err); }
    run.cancelable = false;
    if (fail) { run.label = '⚠️ ' + fail; run.ico = ''; await addLog('Resposta rápida "' + title + '": ' + fail); }
    else if (run.cancel) { run.label = 'Envio cancelado (' + Math.max(0, n - 1) + '/' + total + ' enviadas)'; run.ico = '✋'; }
    else { run.label = 'Enviado (' + total + '/' + total + ') ✔'; run.ico = ''; }
    await qrSync();
    setTimeout(() => { delete qrRuns[chatId]; busy = Object.keys(qrRuns).length > 0; qrSync(); if (!Object.keys(qrRuns).length) qrDraw(null); }, fail ? 5000 : run.cancel ? 2500 : 1200);
  }
  window.addEventListener('message', e => { const d = e.data; if (!d || d.type !== 'QUICK_RUN') return; quickRun(d.id); });

  window.addEventListener('message', async e => {
    const t = e.data && e.data.type; if (!t || t.indexOf('BULK_') !== 0) return;
    const reply = m => window.postMessage(Object.assign({ from: 'wcrm-bulk' }, m), '*');
    if (t === 'BULK_SOURCES') reply({ type: 'BULK_SOURCES_RESULT', data: await bulkSources(), req: e.data.req });
    if (t === 'BULK_STATE') { const rt = await getRt(); reply({ type: 'BULK_STATE_RESULT', bulk: await getBulk(), rt: { day: rt.day, sent: rt.sent, hourly: (rt.hourly || []).filter(x => Date.now() - x < 3600e3).length }, cfg: { winStart: (await getCfg()).winStart, winEnd: (await getCfg()).winEnd } }); }
    if (t === 'BULK_SAVE_GROUP') await mutateBulk(b => { const g = e.data.group; const i = b.groups.findIndex(x => x.id === g.id); if (i >= 0) b.groups[i] = g; else b.groups.push(g); });
    if (t === 'BULK_DEL_GROUP') await mutateBulk(b => { b.groups = b.groups.filter(x => x.id !== e.data.id); });
    if (t === 'BULK_START') await mutateBulk(b => { b.jobs.forEach(j => { if (j.status === 'running') j.status = 'paused'; }); const j = e.data.job; j.status = 'running'; j.created = Date.now(); j.nextAt = 0; j.fails = 0; b.jobs.unshift(j); b.jobs = b.jobs.slice(0, 30); });
    if (t === 'BULK_CTRL') await mutateBulk(b => { const j = b.jobs.find(x => x.id === e.data.id); if (!j) return; if (e.data.op === 'pause') j.status = 'paused'; if (e.data.op === 'resume') { b.jobs.forEach(x => { if (x.status === 'running') x.status = 'paused'; }); j.status = 'running'; j.nextAt = 0; } if (e.data.op === 'stop') { j.status = 'stopped'; j.endedAt = Date.now(); } if (e.data.op === 'retry') { j.contacts.forEach(c => { if (c.state === 'error') { c.state = 'pending'; c.why = ''; } }); j.fails = 0; } });
  });
  setInterval(() => bulkTick(), 4000);


  // ── Notificação no canto da tela: aprovar follow up sem abrir a janela ──
  (function alertCards() {
    const css = document.createElement('style');
    css.textContent = '#wcrm-ac{position:fixed;right:16px;bottom:96px;z-index:2147482000;display:flex;flex-direction:column;gap:10px;width:330px;max-height:70vh;overflow:auto;font-family:system-ui,Segoe UI,sans-serif}'
      + '#wcrm-ac .ac{background:#171b1f;color:#e9edef;border:1px solid var(--wcrm-acc,#d4af37);border-radius:14px;padding:12px 14px;box-shadow:0 10px 30px #000b;animation:acin .25s ease-out}@keyframes acin{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}'
      + '#wcrm-ac .t{display:flex;gap:8px;align-items:center;font-weight:700;font-size:14px}#wcrm-ac .t b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#wcrm-ac .x{cursor:pointer;color:#8696a0;font-size:16px;border:0;background:none}'
      + '#wcrm-ac .m{font-size:13px;color:#cfd6db;margin:6px 0 8px;line-height:1.35;max-height:78px;overflow:hidden}#wcrm-ac .r{font-size:12px;color:#8696a0;margin-bottom:8px}'
      + '#wcrm-ac .b{display:flex;gap:6px;flex-wrap:wrap}#wcrm-ac .b button{border:1px solid #384046;background:#242b31;color:#e9edef;border-radius:8px;padding:6px 10px;font-size:12.5px;cursor:pointer;font-weight:600}'
      + '#wcrm-ac .b .go{background:var(--wcrm-acc,#d4af37);color:#000;border-color:transparent}#wcrm-ac .b .no{color:#ff6b6b;border-color:#6b2b2b}';
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'wcrm-ac'; document.body.appendChild(box);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const hidden = new Set();
    let busyDraw = false;
    async function draw() {
      if (busyDraw) return; busyDraw = true;
      try {
        const rt = await getRt(), enrs = await getEnrs(); const cards = [];
        for (const a of (rt.alerts || [])) {
          if (hidden.has(a.id)) continue;
          const enr = enrs.find(x => x.id === a.enrId); if (!enr) continue;
          if (a.kind === 'replied' && a.ask && enr.state === 'asked') cards.push({ a, kind: 'ask' });
          else if (a.kind === 'approve' && enr.state === 'approval') cards.push({ a, kind: 'apv' });
        }
        box.style.display = cards.length ? 'flex' : 'none';
        box.innerHTML = cards.slice(0, 4).map(({ a, kind }) => '<div class="ac" data-id="' + esc(a.id) + '" data-enr="' + esc(a.enrId) + '" data-n="' + esc(a.contact) + '">'
          + '<div class="t"><span>' + (kind === 'ask' ? '💬' : '✅') + '</span><b>' + esc(a.contact) + (kind === 'ask' ? ' respondeu' : ' — aprovar envio') + '</b><button class="x" data-x="1" title="Dispensar">✕</button></div>'
          + (a.ruleName ? '<div class="r">Follow up: ' + esc(a.ruleName) + (kind === 'ask' ? ' · envio pausado' : '') + '</div>' : '')
          + '<div class="m">' + (kind === 'ask' ? '“' + esc((a.text || '').slice(0, 180)) + '”' : esc((a.text || '').slice(0, 180))) + '</div>'
          + '<div class="b">' + (kind === 'ask'
            ? '<button class="go" data-c="keep">▶ Continuar follow up</button><button data-c="reset">↻ Reiniciar tempo</button><button class="no" data-c="cancel">✖ Cancelar</button><button data-open="1">💬 Abrir</button>'
            : '<button class="go" data-c="approve">✅ Aprovar envio</button><button class="no" data-c="cancel">✖ Cancelar</button><button data-open="1">💬 Abrir</button>')
          + '</div></div>').join('') + (cards.length > 4 ? '<div class="ac" style="text-align:center;font-size:13px">+' + (cards.length - 4) + ' aviso(s) — veja em Follow Up › Avisos</div>' : '');
      } finally { busyDraw = false; }
    }
    box.addEventListener('click', async e => {
      const card = e.target.closest('.ac[data-enr]'); if (!card) return;
      const id = card.dataset.enr;
      if (e.target.closest('[data-x]')) { hidden.add(card.dataset.id); return draw(); }
      if (e.target.closest('[data-open]')) { try { await openChat(card.dataset.n); } catch (x) {} return; }
      const b = e.target.closest('[data-c]'); if (!b) return;
      b.disabled = true; await decideEnr(id, b.dataset.c);
      try { root.__wcrm && root.__wcrm.toast(b.dataset.c === 'cancel' ? '✖ Follow up cancelado' : b.dataset.c === 'reset' ? '↻ Tempo reiniciado' : '✅ Follow up continua'); } catch (x) {}
      draw();
    });
    try { chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && (c[K_RT] || c[K_ENR])) draw(); }); } catch (e) {}
    setTimeout(draw, 1500); setInterval(draw, 8000);
  })();

  root.__wcrmEngine = { tick, bulkTick, bulkGate, bulkStepsOf, quickRun, syncRenames, migrateContact };
  setInterval(() => tick(), 10000);
  log('motor de follow-up carregado (v4.33)');
})(typeof window !== 'undefined' ? window : globalThis);
