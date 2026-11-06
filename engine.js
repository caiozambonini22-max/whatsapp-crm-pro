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
      const open = e => e.ruleId === rule.id && e.nk === ev.nk && ['waiting', 'stale', 'asked', 'approval'].includes(e.state);
      if (enrs.some(open) || out.some(open)) return;
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

  const core = { stepsOf, isSendStep, safetyOf, checkSafety, DEFAULT_SAFETY, DEFAULT_CFG, inWindow, delayMs, dueAtFor, gapMs, pickVariation, parsePrePlain, hasReplySince, trackMembers, newEnrollments, decide, sameContact, dayKey, norm, fkey };
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
  async function trackAndEnroll() {
    const cfg = await getCfg(); const { cur, avail } = await currentMembers();
    const r = trackMembers(await sget(K_MEM), cur, avail, Date.now());
    await sset(K_MEM, r.state);
    if (!r.entered.length && !r.left.length) return;
    const now = Date.now(); const rules = (cfg.rules || []).filter(x => x.active);
    let created = 0;
    await mutateEnr(list => {
      r.left.forEach(ev => list.forEach(e => {
        if (!['waiting', 'stale', 'asked', 'approval'].includes(e.state) || e.nk !== ev.nk) return;
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
  async function actBridge(op, chat) { const W = root.__wcrm; if (!(W && W.bridgeOk && W.bridgeOk())) return { ok: false, reason: 'ponte indisponível' }; return (await W.bridgeCall('ACT', { op, chat }, 8000)) || { ok: false, reason: 'sem resposta' }; }
  async function sendMedia(W, m) {
    // 1º: envio direto pelo WhatsApp (sem prévia, igual ao WaSpeed)
    if (W.bridgeOk && W.bridgeOk()) {
      const r = await W.bridgeCall('SENDMEDIA', { chat: '__active__', dataUrl: m.dataUrl, name: m.name, mime: m.mime, caption: m.caption || '', kind: m.type }, 60000);
      if (r && r.ok) { await sleep(1200); return true; }
      log('envio direto falhou:', r && r.reason);
      if (Date.now() - (root.__wcrmMediaAlertAt || 0) > 10 * 60e3) try {
        root.__wcrmMediaAlertAt = Date.now();
        const pb = await W.bridgeCall('PROBE', {}, 15000);
        const info = 'Envio direto de mídia falhou: ' + ((r && r.reason) || '?') + ' | módulos=' + (pb && pb.modules) + ' OpaqueData=' + (pb && pb.opaque) + ' prepRawMedia=' + (pb && pb.prep);
        await addLog('⚠️ ' + info); await addAlert('error', 'mídia', info);
      } catch (e) {}
      if (m.type === 'audio') { await addLog('⚠️ Áudio não enviado como voz: ' + ((r && r.reason) || '?')); return false; }   // nunca manda áudio como arquivo (parece robô)

    }
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
    if (st.type === 'list') return [st.title ? '*' + st.title + '*' : '', (st.items || []).map((x, i) => (i + 1) + '. ' + x).join('\n')].filter(Boolean).join('\n');
    return '';
  }
  async function quickSteps(id) {
    const stt = (await sget('wcrm_state')) || {}; const m = (stt.msgs || []).find(x => String(x.id) === String(id));
    if (!m) return null;
    const out = [];
    (m.actions || []).forEach(a => {
      if (a.db) out.push({ type: 'wait', seconds: a.db });
      if (a.k === 'text' && a.txt) out.push({ type: 'text', variations: [a.txt] });
      else if (['image', 'video', 'audio', 'doc'].includes(a.k) && a.fileDataUrl) out.push({ type: a.k === 'doc' ? 'document' : a.k, dataUrl: a.fileDataUrl, name: a.fileName, mime: a.fileMime, caption: a.cap || '' });
      else if (a.k === 'typing' || a.k === 'recording') out.push({ type: a.k, seconds: a.db || 3 });
      if (a.da) out.push({ type: 'wait', seconds: a.da });
    });
    return out;
  }
  async function sendOne(W, enr, st, rot) {
    // devolve {ok, sent:boolean, text}
    const before = (await readMsgs(enr.contact, 60)).filter(m => m.from === 'out').length;
    let ok = false, text = '';
    if (['text', 'pix', 'invite', 'contact', 'banner', 'list'].includes(st.type)) {
      text = st.type === 'text' ? pickVariation(st.variations, rot) : templateText(st);
      if (!text) return { ok: true, sent: false, text: '' };
      ok = await W.sendMsg(text);
    } else {
      if (!st.dataUrl) return { ok: false, sent: false, why: 'passo de ' + st.type + ' sem arquivo anexado' };
      if (st.type === 'audio') { await actBridge('recording', enr.contact); await sleep(rndMs(3000, 6500)); await actBridge('paused', enr.contact); }   // “gravando áudio…” antes de mandar
      ok = await sendMedia(W, st); text = '[' + st.type + '] ' + (st.name || '');
    }
    await sleep(2600);
    const after = (await readMsgs(enr.contact, 60)).filter(m => m.from === 'out').length;
    if (!ok || after <= before) return { ok: false, sent: false, why: 'Não consegui confirmar o envio (' + st.type + ')' };
    return { ok: true, sent: true, text };
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
  async function processEnrollment(enrId) {
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
      if (bootPrevAlive === null) {
        bootPrevAlive = rt0.lastAlive || now;
        if (now - bootPrevAlive > (cfg.staleMin || 120) * 60e3) await markStale(now);   // computador ficou desligado
      }
      if (wasOn === null) wasOn = cfg.on;
      else if (cfg.on && !wasOn) { wasOn = true; await markStale(now - (cfg.staleMin || 120) * 60e3); }
      else if (!cfg.on) wasOn = false;
      await mutateRt(r => { r.lastAlive = now; });
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

  root.__wcrmEngine = { tick };
  setInterval(() => tick(), 10000);
  log('motor de follow-up carregado (v4.33)');
})(typeof window !== 'undefined' ? window : globalThis);
