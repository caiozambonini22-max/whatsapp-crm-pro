// WhatsApp CRM Pro v4.31 — content.js
(function () {
  if (document.getElementById('wcrm-wrap')) return;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ══════════════════════════════════════════════════════════
  //  NOME DO CONTATO  (v4.30)
  //  P1: nome salvo na agenda (título do cabeçalho da conversa)
  //  P2: nome do perfil do cliente (~Nome, abaixo do número)
  //  Senão: vazio. Sempre lido AO VIVO no momento do envio.
  // ══════════════════════════════════════════════════════════
  function isPhoneStr(v) {
    return /^[\+\d][\d\s\-\(\)\.]{5,}$/.test((v || '').trim());
  }

  const CBAD = new Set([
    'você','you','voce','whatsapp','status','clique','click','abrir','open',
    'mensagem','message','novo','new','buscar','search','arquivadas','archived',
    'conversas','chats','chat','grupos','groups','tudo','favoritas','não lidas',
    'conta','conta comercial','commercial account','business account','perfil',
    'profile','ver perfil','online','offline','digitando','gravando','typing',
    'recording','visto','last seen','label','labels','etiqueta','etiquetas',
    'bloquear','ferramentas','segurança','empresa','cadastrada','nenhum','test',
  ]);
  // "test" só é bloqueado como nome de UI se vier sozinho de uma fonte não confiável;
  // o nome da agenda é aceito mesmo assim (ver isValidName com trusted=true).
  const UI_PHRASE = /(clique|click|toque|tap)\b.*(aqui|here|dados|info|contato|contact)|dados d[oa] (contato|grupo|empresa)|contact info|group info|visto por último|last seen|^hoje\b|^ontem\b|^today\b|^yesterday\b|mensagens temporárias|disappearing|conta comercial|business account|conta empresarial|^online$|digitando|escrevendo|gravando|typing|recording|^[a-z][a-z0-9]*(-[a-z0-9]+){2,}$/i;

  function isValidName(v, trusted) {
    if (!v) return false;
    v = v.trim();
    if (v.length < 2 || v.length > 80) return false;
    if (isPhoneStr(v)) return false;
    if (UI_PHRASE.test(v)) return false;
    const low = v.toLowerCase();
    if (CBAD.has(low) && !(trusted && low === 'test')) return false;
    return true;
  }

  const HONOR = new Set(['dr','dra','sr','sra','prof','profa','dona','seu']);
  function stripEdges(t) {
    try { return t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); }
    catch (e) { return t.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g, ''); }
  }
  function getFirstName(raw) {
    if (!raw) return '';
    let s = raw.replace(/^~\s*/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const toks = s.split(/\s+/).map(stripEdges).filter(t => t && /[A-Za-zÀ-ÿ]/.test(t));
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (HONOR.has(t.toLowerCase().replace(/\.$/, '')) && i < toks.length - 1) continue;
      if (t.length < 2) continue;
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }
    return '';
  }

  // Painel principal da conversa aberta
  function getMainPane() {
    const m = document.getElementById('main');
    if (m) return m;
    let el = document.querySelector('div[contenteditable="true"][data-tab], footer div[contenteditable="true"]');
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.width > 300 && r.height > 400) return el;
      el = el.parentElement;
    }
    return null;
  }

  function nodeText(el) {
    let s = '';
    el.childNodes.forEach(n => { s += n.nodeType === 3 ? n.textContent : (n.nodeName === 'IMG' ? (n.alt || '') : ''); });
    return s.replace(/\s+/g, ' ').trim();
  }

  // Lê os textos visíveis na faixa do cabeçalho (topo da conversa) por GEOMETRIA —
  // não depende de data-testid nem de tags que o WhatsApp muda toda hora.
  function readHeader() {
    const main = getMainPane();
    if (!main) return null;
    const mr = main.getBoundingClientRect();
    const items = [];
    const all = main.querySelectorAll('*');
    const lim = Math.min(all.length, 600);
    for (let i = 0; i < lim; i++) {
      const el = all[i];
      if (el.children.length && [...el.children].some(c => c.nodeName !== 'IMG')) continue;
      const t = nodeText(el);
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.top < mr.top - 4 || r.top > mr.top + 95) continue;
      items.push({ t, top: Math.round(r.top / 6), left: r.left });
    }
    items.sort((a, b) => a.top - b.top || a.left - b.left);
    const texts = [];
    items.forEach(it => { if (!texts.includes(it.t)) texts.push(it.t); });
    if (!texts.length) return { title: '', subtitle: '', profile: '', group: false };

    const profileRaw = texts.find(t => /^~\s*\S/.test(t));
    const profile = profileRaw ? profileRaw.replace(/^~\s*/, '').trim() : '';
    const rest = texts.filter(t => t !== profileRaw);
    const title = rest[0] || '';
    const subtitle = rest[1] || (profileRaw || '');
    const sub = rest[1] || '';
    const subIsStatus = /visto|last seen|online|digitando|typing|gravando|recording|clique|click|toque|tap/i.test(sub);
    const group = !!sub && !subIsStatus && sub.includes(',') && !sub.startsWith('~');
    return { title, subtitle, profile, group };
  }

  function selectedRowName() {
    const row = document.querySelector('#pane-side [aria-selected="true"], [data-testid="cell-frame-container"][aria-selected="true"]');
    if (!row) return '';
    const sp = row.querySelector('span[title]');
    if (sp) return (sp.getAttribute('title') || '').trim();
    const leaf = [...row.querySelectorAll('span')].find(s => !s.children.length && s.textContent.trim());
    return leaf ? leaf.textContent.trim() : '';
  }

  // Resolve o contato aberto AGORA. Retorna {full, source, phone}
  function resolveContact() {
    const h = readHeader();
    let phone = '';
    if (h) {
      if (h.group) return { full: '', source: 'grupo', phone: '' };
      if (isPhoneStr(h.title)) phone = h.title;
      if (isValidName(h.title, true) && !isPhoneStr(h.title)) return { full: h.title, source: 'agenda', phone };
      if (isPhoneStr(h.title)) {
        if (isValidName(h.profile, true)) return { full: h.profile, source: 'perfil', phone };
        return { full: '', source: 'sem-nome', phone };
      }
    }
    // cabeçalho ilegível → usa o item selecionado na lista de conversas
    const row = selectedRowName();
    if (row) {
      if (isPhoneStr(row)) {
        phone = row;
        if (h && isValidName(h.profile, true)) return { full: h.profile, source: 'perfil', phone };
        return { full: '', source: 'sem-nome', phone };
      }
      if (isValidName(row, true)) return { full: row, source: 'lista', phone };
    }
    if (h && isValidName(h.profile, true)) return { full: h.profile, source: 'perfil', phone };
    return { full: '', source: 'nenhum', phone };
  }

  // Nome para exibir/identificar no painel
  function getDisplayName() {
    const r = resolveContact();
    if (r.source === 'grupo') {
      const h = readHeader();
      return h && h.title ? h.title : null;
    }
    return r.full || r.phone || null;
  }
  const getContact = getDisplayName;

  // Lê estável: duas leituras iguais seguidas (evita pegar o contato anterior na troca)
  async function resolveStable() {
    let prev = null, r = null;
    for (let i = 0; i < 8; i++) {
      r = resolveContact();
      const key = r.source + '|' + r.full;
      if (prev === key && (r.full || i >= 3)) return r;
      prev = key;
      await sleep(180);
    }
    return r;
  }

  // ── Aplica #primeiroNome (ao vivo, sem cache) ─────────────
  async function applyNomeLive(text) {
    if (!text) return text;
    if (!/#primeiroNome/i.test(text)) return text;
    let r = null, first = '';
    // 1º: nome direto da memória do WhatsApp (contato salvo → nome de perfil). Não depende do visual.
    if (bridge && bridge.ok) {
      try {
        const a = await bridgeCall('ACTIVE', {}, 4000);
        if (a && a.ok && !a.group) {
          const isNum = s => /^[+\d\s().-]{7,}$/.test((s || '').trim());
          const cand = [a.saved, a.name, a.push].find(x => x && !isNum(x) && getFirstName(x));
          if (cand) { first = getFirstName(cand); r = { source: 'ponte', full: cand }; }
        }
      } catch (e) {}
    }
    if (!r) { r = await resolveStable(); first = getFirstName(r.full); }
    console.log('[WCRM] #primeiroNome →', JSON.stringify({ origem: r.source, completo: r.full, primeiro: first }));
    return text.replace(/#primeiroNome/gi, first);
  }

  // ── Ponte com o WhatsApp (inject.js, mundo da página) ─────
  let bridge = null; // último snapshot {ok, labels:[{id,name,color,count}], chats:[{id,name,labels}], reason}
  const bridgeWaiters = {};
  function bridgeSend(o) { window.postMessage(Object.assign({ tag: 'WCRM_CONTENT' }, o), '*'); }
  function applyLabelBridge(chat, label, mode, create) {
    return new Promise(res => {
      const reqId = 'r' + Date.now() + Math.random().toString(36).slice(2, 6);
      const t = setTimeout(() => { delete bridgeWaiters[reqId]; res({ ok: false, reason: 'sem resposta da ponte' }); }, 8000);
      bridgeWaiters[reqId] = r => { clearTimeout(t); res(r); };
      bridgeSend({ kind: 'APPLY', reqId, chat, label, mode, create: !!create });
    });
  }
  function bridgeCall(kind, payload, timeout) {
    return new Promise(res => {
      const reqId = 'g' + Date.now() + Math.random().toString(36).slice(2, 6);
      const t = setTimeout(() => { delete bridgeWaiters[reqId]; res({ ok: false, reason: 'ponte não respondeu (F5 no WhatsApp Web?)' }); }, timeout || 10000);
      bridgeWaiters[reqId] = r => { clearTimeout(t); res(r); };
      bridgeSend(Object.assign({}, payload || {}, { kind, reqId }));
    });
  }
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.tag !== 'WCRM_BRIDGE') return;
    if (e.data.kind === 'RESULT' && bridgeWaiters[e.data.reqId]) { bridgeWaiters[e.data.reqId](e.data.result); delete bridgeWaiters[e.data.reqId]; }
    if (e.data.kind === 'SNAPSHOT') {
      bridge = e.data.snap;
      try { document.dispatchEvent(new CustomEvent('wcrm-bridge')); } catch (x) {}
      const f = document.getElementById('wcrm-iframe');
      f?.contentWindow?.postMessage({ type: 'CONVERSATIONS', conversations: getConversations(), allLabels: getAllWALabels(), bridge: { ok: !!bridge.ok, reason: bridge.reason || '', labels: bridge.labels || [], total: (bridge.chats || []).length } }, '*');
    }
    if (e.data.kind === 'APPLY_RESULT' && bridgeWaiters[e.data.reqId]) { bridgeWaiters[e.data.reqId](e.data.result); delete bridgeWaiters[e.data.reqId]; }
  });

  // ── Lê etiquetas do WA ────────────────────────────────────
  function getWALabels() {
    if (bridge && bridge.ok) {
      const me = (getContact() || '').trim().toLowerCase();
      const ch = (bridge.chats || []).find(x => (x.name || '').trim().toLowerCase() === me);
      return ch ? ch.labels.slice() : [];
    }
    const found = new Set();
    document.querySelectorAll('[data-testid="label-name"], .tag-text').forEach(el => {
      const t = el.textContent?.trim();
      if (t && t.length < 40) found.add(t);
    });
    return [...found];
  }

  // ── Scrape todas as conversas visíveis com suas etiquetas ─
  function getConversations() {
    const convos = [];
    const seenB = new Set();
    if (bridge && bridge.ok) (bridge.chats || []).forEach(x => { seenB.add(x.name.trim().toLowerCase()); convos.push({ name: x.name, labels: x.labels.slice(), preview: '' }); });
    const cells = document.querySelectorAll(
      '[data-testid="cell-frame-container"], [role="listitem"][data-id]'
    );
    cells.forEach(cell => {
      // Nome do contato
      const titleEl = cell.querySelector('[title], span[dir="auto"]');
      const name = titleEl?.title || titleEl?.textContent?.trim();
      if (!name || name.length > 80) return;

      // Etiquetas do contato nessa conversa
      const labelEls = cell.querySelectorAll(
        '[data-testid="label-name"], .tag-text, [data-icon="label-skin"] + span, span[data-testid*="label"]'
      );
      const cellLabels = [...labelEls].map(el => el.textContent?.trim()).filter(Boolean);

      // Preview da última mensagem
      const previewEl = cell.querySelector('[data-testid="last-msg-status"] ~ span, span[dir="ltr"]');
      const preview = previewEl?.textContent?.trim() || '';

      if (bridge && bridge.ok) { if (seenB.has(name.trim().toLowerCase())) return; }
      convos.push({ name, labels: cellLabels, preview });
    });
    return convos;
  }

  // ── Coleta todas as etiquetas do WA Business ────────────────
  function getAllWALabels() {
    if (bridge && bridge.ok) return bridge.labels.map(l => l.name);
    const found = new Set();
    const SKIP = new Set(['Tudo','Não lidas','Favoritas','Grupos','All','Unread','Favorites','Groups','1:1']);
    // Barra de filtros/etiquetas do WA Business no topo da lista
    const tabSels = [
      // WA Business: pills de etiqueta na barra superior
      '[data-testid="filter-tab-btn"]',
      'div[data-animate-tab]',
      'button[role="tab"]',
      'div[role="tab"]',
    ];
    for (const sel of tabSels) {
      document.querySelectorAll(sel).forEach(el => {
        // Pega o texto do span filho (ignora badges numéricos)
        const spans = el.querySelectorAll('span[dir="auto"], span:not([class])');
        const raw = spans.length ? spans[0].textContent?.trim() : el.textContent?.trim();
        const clean = (raw || '').replace(/\s+\d+$/, '').trim();
        if (clean && clean.length > 1 && clean.length < 60 && !SKIP.has(clean)) found.add(clean);
      });
    }
    // Etiquetas nas células de conversa
    document.querySelectorAll('[data-testid="label-name"], .tag-text').forEach(el => {
      const t = el.textContent?.trim();
      if (t && t.length < 50 && !SKIP.has(t)) found.add(t);
    });
    return [...found];
  }

  // ── Acha a caixa de texto do WA ───────────────────────────
  function getInputBox() {
    const sels = [
      '#main div[data-testid="conversation-compose-box-input"]',
      '#main div[contenteditable="true"][data-tab="10"]',
      '#main footer div[contenteditable="true"]',
      '#main div[role="textbox"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  // ── Envia mensagem respeitando quebras de linha ────────────
  async function sendMsg(text) {
    // Aplica #primeiroNome com o contato ATUAL do DOM (não depende de mensagem async)
    const resolvedText = await applyNomeLive(text);
    // 1º: envio direto pelo WhatsApp (nada é digitado na caixa de mensagem)
    if (bridge && bridge.ok) {
      try {
        const r = await bridgeCall('SENDTEXT', { chat: '__active__', text: resolvedText }, 15000);
        if (r && r.ok) { await sleep(500); return true; }
        console.warn('[WCRM] envio direto de texto falhou, usando a caixa:', r && r.reason);
      } catch (e) {}
    }
    const box = getInputBox();
    if (!box) { console.warn('[WCRM] Input não encontrado'); return false; }

    box.focus();
    await sleep(200);
    box.innerHTML = '';

    const lines = resolvedText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        // Insere a linha via execCommand (única chamada, sem fallback)
        document.execCommand('insertText', false, lines[i]);
      }
      // Entre linhas, simula Shift+Enter para quebra de linha no WA
      if (i < lines.length - 1) {
        box.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          shiftKey: true, bubbles: true, cancelable: true
        }));
        await sleep(30);
      }
    }

    await sleep(600 + Math.random() * 400);

    // Clica em enviar
    const sendSels = [
      'button[data-testid="send"]',
      'span[data-icon="send"]',
      'button[aria-label="Enviar"]',
      'button[aria-label="Send"]',
    ];
    for (const s of sendSels) {
      const btn = document.querySelector(s);
      if (btn) { (btn.closest('button') || btn).click(); return true; }
    }
    // Fallback Enter sem shift
    box.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13,
      shiftKey: false, bubbles: true, cancelable: true
    }));
    return true;
  }

  // ── Preenche sem enviar ────────────────────────────────────
  async function prefillMsg(text) {
    text = await applyNomeLive(text);
    const box = getInputBox();
    if (!box) return;
    box.focus();
    await sleep(150);
    box.innerHTML = '';
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) document.execCommand('insertText', false, lines[i]);
      if (i < lines.length - 1) {
        box.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          shiftKey: true, bubbles: true, cancelable: true
        }));
        await sleep(30);
      }
    }
  }

  // ── Mini-menu flutuante ────────────────────────────────────
  function buildInlineMenu() {
    if (document.getElementById('wcrm-fab')) return;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes wcrmPop { from{opacity:0;transform:scale(.9) translateY(8px);} to{opacity:1;transform:scale(1) translateY(0);} }
      .wcrm-mi{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;cursor:pointer;color:#e9edef;font-size:12px;font-weight:500;transition:background .12s;border:none;background:transparent;width:100%;text-align:left;font-family:'Segoe UI',Arial,sans-serif;}
      .wcrm-mi:hover{background:#2a3942;}
      .wcrm-mi-ico{font-size:15px;flex-shrink:0;}
      .wcrm-sep{height:1px;background:#2a3942;margin:4px 0;}
    `;
    document.head.appendChild(style);

    const fab = document.createElement('div');
    fab.id = 'wcrm-fab';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '20px', left: '540px',
      width: '40px', height: '40px', borderRadius: '50%',
      background: 'linear-gradient(135deg,#7c3aed,#5b21b6)',
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '18px', cursor: 'pointer', zIndex: '2147483645',
      boxShadow: '0 4px 16px rgba(0,0,0,.4)', transition: 'all .2s', userSelect: 'none',
    });
    fab.innerHTML = '⚡';
    fab.title = 'Abrir/Fechar Menu CRM';

    const panel = document.createElement('div');
    panel.id = 'wcrm-inline-panel';
    Object.assign(panel.style, {
      position: 'fixed', bottom: '68px', left: '540px',
      background: '#1a2530', border: '1px solid #2a3942', borderRadius: '14px',
      boxShadow: '0 8px 32px rgba(0,0,0,.6)', padding: '8px', width: '220px',
      display: 'none', zIndex: '2147483644',
      fontFamily: "'Segoe UI',Arial,sans-serif",
    });
    panel.innerHTML = `
      <div style="padding:4px 10px 6px;font-size:10px;font-weight:700;color:#8696a0;text-transform:uppercase;letter-spacing:.5px;">⚡ CRM Pro</div>
      <button class="wcrm-mi" data-wact="toggle-crm"><span class="wcrm-mi-ico">◀</span><span id="wcrm-toggle-lbl">Fechar painel CRM</span></button>
      <div class="wcrm-sep"></div>
      <button class="wcrm-mi" data-wact="contact-info"><span class="wcrm-mi-ico">👤</span>Ver / editar contato</button>
      <button class="wcrm-mi" data-wact="labels"><span class="wcrm-mi-ico">🏷️</span>Etiquetas do contato</button>
      <button class="wcrm-mi" data-wact="note"><span class="wcrm-mi-ico">📝</span>Criar anotação</button>
      <button class="wcrm-mi" data-wact="reminder"><span class="wcrm-mi-ico">🔔</span>Criar lembrete</button>
      <button class="wcrm-mi" data-wact="schedule"><span class="wcrm-mi-ico">🕐</span>Agendar mensagem</button>
      <div class="wcrm-sep"></div>
      <button class="wcrm-mi" data-wact="quick-msgs"><span class="wcrm-mi-ico">⚡</span>Respostas rápidas</button>
      <button class="wcrm-mi" data-wact="mass-send"><span class="wcrm-mi-ico">📢</span>Envio em massa</button>
      <div class="wcrm-sep"></div>
      <button class="wcrm-mi" data-wact="pin"><span class="wcrm-mi-ico">📌</span>Fixar conversa</button>
      <button class="wcrm-mi" data-wact="archive"><span class="wcrm-mi-ico">📁</span>Arquivar contato</button>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    let panelOpen = false;
    let crmVisible = true;

    fab.addEventListener('click', e => {
      e.stopPropagation();
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'block' : 'none';
      if (panelOpen) panel.style.animation = 'wcrmPop .2s ease';
    });
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== fab) {
        panel.style.display = 'none'; panelOpen = false;
      }
    });

    panel.addEventListener('click', e => {
      const btn = e.target.closest('[data-wact]'); if (!btn) return;
      const act = btn.dataset.wact;
      panel.style.display = 'none'; panelOpen = false;
      const iframe = document.getElementById('wcrm-iframe');
      const wrap = document.getElementById('wcrm-wrap');
      const sideBtn = document.getElementById('wcrm-btn');

      if (act === 'toggle-crm') {
        crmVisible = !crmVisible;
        if (wrap) wrap.style.transform = crmVisible ? 'translateX(0)' : 'translateX(100%)';
        if (sideBtn) { sideBtn.innerHTML = crmVisible ? '✕ CRM' : '⚡ CRM'; }
        document.getElementById('wcrm-toggle-lbl').textContent = crmVisible ? 'Fechar painel CRM' : 'Abrir painel CRM';
        document.documentElement.classList.toggle('wcrm-open', !!crmVisible);
        return;
      }
      const map = { 'contact-info': 'GOTO_TAB:contact', 'labels': 'GOTO_TAB:contact', 'quick-msgs': 'GOTO_TAB:msgs', 'mass-send': 'GOTO_TAB:mass', 'note': 'OPEN_NOTE', 'reminder': 'OPEN_REMINDER', 'schedule': 'OPEN_SCHED', 'pin': 'UTIL:pin', 'archive': 'UTIL:archive' };
      const msg = map[act];
      if (!msg) return;
      if (msg.startsWith('GOTO_TAB:')) iframe?.contentWindow?.postMessage({ type: 'GOTO_TAB', tab: msg.split(':')[1] }, '*');
      else if (msg.startsWith('UTIL:')) showPageToast(msg === 'UTIL:pin' ? '📌 Conversa fixada!' : '📁 Arquivado!');
      else iframe?.contentWindow?.postMessage({ type: msg }, '*');
    });
  }

  function showPageToast(msg) {
    let t = document.getElementById('wcrm-page-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'wcrm-page-toast';
      t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#00a884;color:white;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:2147483647;opacity:0;transition:opacity .3s;pointer-events:none;font-family:Segoe UI,Arial,sans-serif;white-space:nowrap;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._t); t._t = setTimeout(() => t.style.opacity = '0', 2500);
  }

  // ── Injeta painel lateral ─────────────────────────────────
  function inject() {
    const btn = document.createElement('div');
    btn.id = 'wcrm-btn';
    Object.assign(btn.style, {
      position: 'fixed', left: '0', bottom: '110px',
      background: 'linear-gradient(135deg,#00a884,#017d63)',
      color: 'white', fontWeight: '800', fontSize: '11px',
      padding: '12px 5px', borderRadius: '0 10px 10px 0',
      cursor: 'pointer', zIndex: '2147483647',
      boxShadow: '3px 0 14px rgba(0,0,0,.35)',
      opacity: '.85', userSelect: 'none',
      writingMode: 'vertical-rl', letterSpacing: '2px',
    });
    btn.innerHTML = '⚡ CRM';

    const wrap = document.createElement('div');
    wrap.id = 'wcrm-wrap';
    Object.assign(wrap.style, {
      position: 'fixed', top: '0', right: '0', bottom: '0',
      width: 'var(--wcrm-pw,380px)', zIndex: '2147483646',
      transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
      boxShadow: '-4px 0 20px rgba(0,0,0,.4)',
    });

    const iframe = document.createElement('iframe');
    iframe.id = 'wcrm-iframe';
    iframe.src = chrome.runtime.getURL('crm.html');
    Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', display: 'block' });

    iframe.addEventListener('load', () => {
      setTimeout(() => {
        const c = getContact(), labels = getWALabels();
        const allLabels = getAllWALabels(), conversations = getConversations();
        iframe.contentWindow?.postMessage({ type: 'CONTACT', name: c, waLabels: labels, allLabels, conversations }, '*');
      }, 700);
    });

    wrap.appendChild(iframe);
    document.body.appendChild(wrap);
    document.body.appendChild(btn);
    document.documentElement.classList.toggle('wcrm-open', true);

    let visible = true;
    btn.addEventListener('click', () => {
      visible = !visible;
      wrap.style.transform = visible ? 'translateX(0)' : 'translateX(100%)';
      btn.innerHTML = visible ? '✕ CRM' : '⚡ CRM';
      document.documentElement.classList.toggle('wcrm-open', !!visible);
    });

    buildInlineMenu();
  }

  // ── Mensagens do iframe ───────────────────────────────────
  window.addEventListener('message', async e => {
    if (!e.data?.type) return;
    const iframe = document.getElementById('wcrm-iframe');
    switch (e.data.type) {
      case 'SEND': await sendMsg(e.data.text); break;
      case 'PREFILL': await prefillMsg(e.data.text); break;
      case 'GET_CONTACT':
        iframe?.contentWindow?.postMessage({
          type: 'CONTACT', name: getContact(), waLabels: getWALabels(),
          allLabels: getAllWALabels(), conversations: getConversations()
        }, '*');
        break;
      case 'SYNC_LABELS':
        bridgeSend({ kind: 'SYNC' });
        setTimeout(() => iframe?.contentWindow?.postMessage({ type: 'CONVERSATIONS', conversations: getConversations(), allLabels: getAllWALabels(), bridge: bridge ? { ok: !!bridge.ok, reason: bridge.reason || '', labels: bridge.labels || [], total: (bridge.chats || []).length } : { ok: false, reason: 'ponte não respondeu (recarregue o WhatsApp Web com F5)' } }, '*'), 900);
        break;
      case 'APPLY_LABEL': {
        const r = await applyLabelBridge('__active__', e.data.label, e.data.mode, e.data.create);
        iframe?.contentWindow?.postMessage({ type: 'APPLY_LABEL_RESULT', label: e.data.label, mode: e.data.mode, result: r }, '*');
        break;
      }
      case 'GET_CONVERSATIONS':
        iframe?.contentWindow?.postMessage({
          type: 'CONVERSATIONS',
          conversations: getConversations(),
          allLabels: getAllWALabels()
        }, '*');
        break;
      case 'OPEN_CONTACT':
        document.querySelectorAll('[data-testid="cell-frame-container"],[role="listitem"]').forEach(row => {
          const t = row.querySelector('[title],span[dir="auto"]');
          if (t && (t.title === e.data.contact || t.textContent?.trim() === e.data.contact)) row.click();
        });
        break;
    }
  });

  // ── Monitor de conversa — só avisa o painel (NÃO usado no envio) ──
  let lastContact = undefined, debounce = null;
  function updateContactCache() {
    const c = getDisplayName();
    if (c !== lastContact) {
      lastContact = c;
      document.getElementById('wcrm-iframe')?.contentWindow?.postMessage(
        { type: 'CONTACT', name: c, waLabels: getWALabels(), allLabels: getAllWALabels(), conversations: getConversations() }, '*'
      );
    }
  }
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(updateContactCache, 300);
  }).observe(document.body, { childList: true, subtree: true });

  // ── API para o engine.js (motor de follow-up) ─────────────
  window.__wcrm = { bridgeCall, getBridge: () => bridge, applyLabel: applyLabelBridge, bridgeOk: () => !!(bridge && bridge.ok), sendMsg, prefillMsg, resolveStable, resolveContact, getDisplayName, getInputBox, getFirstName, toast: showPageToast };

  // ── Aguarda WA ────────────────────────────────────────────
  const timer = setInterval(() => {
    if (document.querySelector('#app,[data-testid="chat-list"],#pane-side')) {
      clearInterval(timer); setTimeout(inject, 2000);
    }
  }, 800);
})();
