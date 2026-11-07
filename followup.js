// WhatsApp CRM Pro v4.33 — followup.js
// Janela "Follow Up" (estilo WaSpeed, só que com fila segura): lista, criar/editar, fila, avisos e ajustes.
(function () {
  'use strict';
  if (window.__wcrmFU) return; window.__wcrmFU = true;
  if (!document.body || !window.chrome || !chrome.storage) return;
  const K = { cfg: 'wcrm_cfg', enr: 'wcrm_enr', rt: 'wcrm_rt', bar: 'wcrm_labelbar', st: 'wcrm_state' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sget = k => new Promise(r => chrome.storage.local.get(k, o => r(o[k])));
  const sset = (k, v) => new Promise(r => chrome.storage.local.set({ [k]: v }, r));
  const pad = n => String(n).padStart(2, '0');
  const fmt = ts => { if (!ts) return '—'; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const toast = m => { try { window.__wcrm && window.__wcrm.toast && window.__wcrm.toast(m); } catch (e) {} };
  const send = m => window.postMessage(m, '*');
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const DEF = { on: false, winStart: '09:00', winEnd: '19:00', days: [1, 2, 3, 4, 5, 6], dailyCap: 30, hourlyCap: 12, queue: { mode: 'random', fixedMin: 5, minMin: 3, maxMin: 8 }, staleMin: 120, apiUrl: 'https://zambonini-crm.vercel.app', token: '', rules: [] };

  async function getCfg() { const c = (await sget(K.cfg)) || {}; return Object.assign({}, DEF, c, { queue: Object.assign({}, DEF.queue, c.queue || {}), rules: c.rules || [] }); }
  let cfgQ = Promise.resolve();
  function mutateCfg(fn) { const p = cfgQ.then(async () => { const c = await getCfg(); fn(c); await sset(K.cfg, c); cache.cfg = c; return c; }); cfgQ = p.catch(() => {}); return p; }

  let cache = { cfg: DEF, enrs: [], rt: {}, bar: {}, st: {} };
  let menuOpen = false, view = 'list', draft = null, editing = false, sec = 'funnel', fTab = 'label', opened = false, rtimer = null;

  // ── CSS ──
  const css = document.createElement('style');
  css.textContent = `
  html.wcrm-bar #wcrm-fu{top:46px !important;} html.wcrm-left #wcrm-fu{left:56px !important;} html.wcrm-open #wcrm-fu{right:var(--wcrm-pw,380px) !important;}
  #wcrm-fu{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;font-family:'Segoe UI',Arial,sans-serif;}
  #wcrm-fu.show{display:flex;}
  #wcrm-fu .fu-box{width:min(940px,94vw);height:min(86vh,820px);background:#14181c;color:#e9edef;border:1px solid #2a3238;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);}
  #wcrm-fu .fu-hd{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #2a3238;flex-wrap:wrap;}
  #wcrm-fu .fu-hd h2{margin:0;font-size:20px;font-weight:800;}
  #wcrm-fu .fu-tabs{display:flex;gap:4px;flex:1;min-width:260px;}
  #wcrm-fu .fu-tab{padding:7px 12px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;color:#aebac1;border:1px solid transparent;}
  #wcrm-fu .fu-tab:hover{color:#fff;} #wcrm-fu .fu-tab.on{background:#d4af37;color:#111;}
  #wcrm-fu .fu-tab b{background:#ef4444;color:#fff;border-radius:99px;font-size:10px;padding:1px 6px;margin-left:5px;}
  #wcrm-fu .fu-x{width:32px;height:32px;border-radius:9px;border:1px solid #2a3238;background:#181d21;color:#cfd6db;font-size:16px;cursor:pointer;}
  #wcrm-fu .fu-body{flex:1;overflow:auto;padding:16px 18px;}
  #wcrm-fu .fu-ft{padding:12px 18px;border-top:1px solid #2a3238;display:flex;gap:10px;justify-content:center;}
  #wcrm-fu button.pri{background:#d4af37;color:#111;border:none;border-radius:9px;padding:9px 26px;font-weight:800;font-size:14px;cursor:pointer;}
  #wcrm-fu button.sec{background:#222a30;color:#e9edef;border:1px solid #38424a;border-radius:9px;padding:9px 20px;font-weight:600;font-size:13px;cursor:pointer;}
  #wcrm-fu button.sm{padding:5px 10px;font-size:12px;border-radius:8px;} #wcrm-fu button.red{background:#3a1d1d;border-color:#7f2d2d;color:#fca5a5;}
  #wcrm-fu .card{background:#1a2025;border:1px solid #2a3238;border-radius:12px;padding:14px 16px;margin-bottom:12px;}
  #wcrm-fu .card .nm{font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;}
  #wcrm-fu .card .nm span.sp{flex:1;} #wcrm-fu .ic{cursor:pointer;color:#aebac1;font-size:16px;padding:2px 5px;} #wcrm-fu .ic:hover{color:#d4af37;}
  #wcrm-fu .meta{color:#aebac1;font-size:13px;margin-top:6px;line-height:1.55;} #wcrm-fu .meta b{color:#e9edef;}
  #wcrm-fu .chip{display:inline-block;background:#26323c;color:#93c5fd;border-radius:99px;padding:2px 10px;font-size:12px;margin:2px 4px 2px 0;}
  #wcrm-fu .chip.tab{background:#33301c;color:#fcd34d;} #wcrm-fu .chip x{cursor:pointer;margin-left:6px;opacity:.7;}
  #wcrm-fu .tog{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#cfd6db;}
  #wcrm-fu .tog i{width:38px;height:20px;border-radius:99px;background:#3a444c;position:relative;transition:.15s;display:inline-block;}
  #wcrm-fu .tog i:after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s;}
  #wcrm-fu .tog.on i{background:#16a34a;} #wcrm-fu .tog.on i:after{left:20px;}
  #wcrm-fu input[type=text],#wcrm-fu input[type=time],#wcrm-fu input[type=number],#wcrm-fu textarea,#wcrm-fu select{background:#0f1316;color:#e9edef;border:1px solid #38424a;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;}
  #wcrm-fu input:focus,#wcrm-fu textarea:focus,#wcrm-fu select:focus{border-color:#d4af37;}
  #wcrm-fu .bb-wrap{display:flex;justify-content:flex-end;background:#0b141a;background-image:radial-gradient(#ffffff08 1px,transparent 1px);background-size:14px 14px;border-radius:12px;padding:14px;margin-top:8px}
  #wcrm-fu .bb{background:#144d37;color:#e9edef;border-radius:10px 10px 2px 10px;padding:4px;max-width:340px;min-width:200px;box-shadow:0 1px 2px #0008}
  #wcrm-fu .bb-m{display:block;width:100%;max-height:340px;object-fit:cover;border-radius:7px}
  #wcrm-fu .bb-doc{padding:10px 12px;background:#0e3a29;border-radius:7px;font-size:13px}
  #wcrm-fu .bb-c{padding:6px 6px 2px;font-size:14px;line-height:1.35;word-break:break-word;white-space:normal}
  #wcrm-fu .bb-c b{font-weight:800 !important;color:#fff} #wcrm-fu .bb-c i{font-style:italic !important} #wcrm-fu .bb-c s{text-decoration:line-through !important}
  #wcrm-fu .bb-t{font-size:11px;color:#8fb5a3;text-align:right;padding:0 6px 2px}
  #wcrm-fu textarea.cap-ta{min-height:110px}
  #wcrm-fu .full{width:100%;} #wcrm-fu textarea{width:100%;min-height:120px;resize:vertical;line-height:1.5;}
  #wcrm-fu .acc{background:#1a2025;border:1px solid #2a3238;border-radius:12px;margin-bottom:10px;overflow:hidden;}
  #wcrm-fu .acc-h{padding:13px 16px;font-weight:800;font-size:15px;cursor:pointer;display:flex;justify-content:space-between;} #wcrm-fu .acc-b{padding:6px 16px 16px;}
  #wcrm-fu .lbl{font-size:12px;color:#8696a0;margin:10px 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;}
  #wcrm-fu .step{background:#12171b;border:1px solid #2f3a42;border-radius:10px;padding:10px 12px;margin-top:10px;}
  #wcrm-fu .step .sh{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;} #wcrm-fu .step .sp{flex:1;}
  #wcrm-fu .step .sn{background:#d4af37;color:#111;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}
  #wcrm-fu .addmenu{position:absolute;left:0;bottom:44px;z-index:5;width:min(560px,90%);max-height:360px;overflow:auto;background:#1c2329;border:1px solid #d4af37;border-radius:12px;padding:8px;box-shadow:0 10px 30px rgba(0,0,0,.6);}
  #wcrm-fu .addmenu .mh{font-size:11px;font-weight:800;color:#d4af37;text-transform:uppercase;letter-spacing:.5px;padding:8px 8px 4px;}
  #wcrm-fu .addmenu .mi{padding:7px 10px;border-radius:7px;cursor:pointer;font-size:13px;} #wcrm-fu .addmenu .mi:hover{background:#2c363e;}
  #wcrm-fu .trow{display:flex;gap:12px;align-items:flex-start;padding:7px 0;} #wcrm-fu .rec{background:#14532d;color:#bbf7d0;border-radius:99px;font-size:10px;padding:1px 7px;margin-left:6px;font-weight:700;}
  #wcrm-fu .rad{display:flex;align-items:center;gap:9px;padding:6px 0;cursor:pointer;font-size:14px;} #wcrm-fu .rad input{accent-color:#d4af37;}
  #wcrm-fu .info{background:#12303d;border:1px solid #1e5a73;color:#bae6fd;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.5;margin-top:10px;}
  #wcrm-fu .warn{background:#3a2d12;border:1px solid #7a5b14;color:#fde68a;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.5;margin-bottom:12px;}
  #wcrm-fu .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;} #wcrm-fu .grow{flex:1;min-width:140px;}
  #wcrm-fu .pick{max-height:190px;overflow:auto;border:1px solid #2a3238;border-radius:10px;margin-top:6px;}
  #wcrm-fu .pick label{display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;font-size:13.5px;border-bottom:1px solid #20272c;} #wcrm-fu .pick label:hover{background:#20282e;}
  #wcrm-fu .pick input{accent-color:#d4af37;}
  #wcrm-fu .sub{display:flex;gap:4px;margin-top:6px;} #wcrm-fu .sub span{padding:6px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#aebac1;border:1px solid #2a3238;} #wcrm-fu .sub span.on{background:#26323c;color:#fff;border-color:#d4af37;}
  #wcrm-fu .qi{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #2a3238;border-radius:10px;margin-bottom:8px;background:#1a2025;} #wcrm-fu .qi .g{flex:1;min-width:0;} #wcrm-fu .qi .t{font-weight:700;font-size:14px;} #wcrm-fu .qi .s{font-size:12px;color:#8696a0;margin-top:2px;}
  #wcrm-fu .h3{font-size:13px;font-weight:800;color:#d4af37;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.5px;}
  #wcrm-fu .empty{color:#8696a0;text-align:center;padding:26px 10px;font-size:13.5px;line-height:1.6;}
  #wcrm-fu .sug{background:#0f1316;border:1px solid #2a3238;border-radius:9px;padding:9px 11px;font-size:13px;margin-top:6px;white-space:pre-wrap;}
  `;
  document.head.appendChild(css);

  const root = document.createElement('div'); root.id = 'wcrm-fu';
  root.innerHTML = '<div class="fu-box"><div class="fu-hd"></div><div class="fu-body"></div><div class="fu-ft"></div></div>';
  document.body.appendChild(root);
  const $hd = root.querySelector('.fu-hd'), $bd = root.querySelector('.fu-body'), $ft = root.querySelector('.fu-ft');
  root.addEventListener('mousedown', e => { if (e.target === root) close(); });

  async function load() {
    cache.cfg = await getCfg(); cache.enrs = (await sget(K.enr)) || []; cache.rt = (await sget(K.rt)) || {}; cache.bar = (await sget(K.bar)) || {}; cache.st = (await sget(K.st)) || {};
  }
  // migração única: antes, linha em branco no texto virava "variação" (mandava só um parágrafo por vez). Agora o texto sai inteiro.
  setTimeout(async () => { try {
    const c0 = await sget(K.cfg); if (!c0 || c0.varMerged475) return;
    await mutateCfg(c => { (c.rules || []).forEach(r => { const a = r.action || {}; if (Array.isArray(a.steps)) a.steps.forEach(st => { if (st.type === 'text' && (st.variations || []).length > 1) st.variations = [st.variations.map(x => (x || '').trim()).filter(Boolean).join('\n\n')]; }); else if (Array.isArray(a.variations) && a.variations.length > 1) a.variations = [a.variations.map(x => (x || '').trim()).filter(Boolean).join('\n\n')]; }); c.varMerged475 = true; });
  } catch (e) {} }, 2500);
  function open(v) { opened = true; view = v || 'list'; root.classList.add('show'); load().then(render); clearInterval(rtimer); rtimer = setInterval(() => { if (opened && (view === 'queue' || view === 'alerts' || view === 'list')) load().then(render); }, 5000); }
  function close() { opened = false; root.classList.remove('show'); clearInterval(rtimer); }
  window.addEventListener('message', e => { if (e.data && e.data.type === 'OPEN_FOLLOWUP') open(e.data.view); });

  // ── textos ──
  function describeTrigger(r) {
    const t = r.trigger || {};
    if (t.mode === 'enter') return 'Imediatamente ao entrar no funil';
    if (t.mode === 'leave') return 'Imediatamente ao sair do funil';
    const [h, m] = (t.time || '00:00').split(':').map(Number); const parts = [];
    if (+t.days) parts.push(t.days + (t.days == 1 ? ' Dia' : ' Dias'));
    if (h) parts.push(h + (h == 1 ? ' Hora' : ' Horas'));
    if (m) parts.push(m + (m == 1 ? ' Minuto' : ' Minutos'));
    if (+t.sec) parts.push(t.sec + (t.sec == 1 ? ' Segundo' : ' Segundos'));
    return 'Após um tempo: ' + (parts.join(' e ') || '0 segundo');
  }
  function describeAction(r) {
    const st = stepsOf(r.action); if (!st.length) return '—';
    return st.length + ' ação(ões): ' + st.map(stepSummary).join(' → ');
  }
  const waLabels = () => { const br = window.__wcrm && window.__wcrm.getBridge && window.__wcrm.getBridge(); if (br && br.ok) return br.labels.map(l => l.name); return (cache.bar.labels || []).filter(l => l.wa).map(l => l.name); };
  const crmTabs = () => (cache.bar.tabs || []).map(t => t.name);
  const cnt = s => cache.enrs.filter(e => e.state === s).length;

  // ── catálogo de ações (igual ao menu "Adicionar Ação" do WaSpeed) ──
  const MENU = [
    { g: 'Enviar Mensagem', i: '💬', items: [['text', '📝', 'Texto'], ['image', '🖼️', 'Imagem'], ['video', '🎥', 'Vídeo'], ['audio', '🎤', 'Áudio'], ['document', '📄', 'Documentos'], ['quick', '⚡', 'Respostas Rápidas'], ['pix', '💠', 'Pix'], ['invite', '👥', 'Convite para Grupo'], ['contact', '👤', 'Contato'], ['banner', '🔗', 'Link com Banner'], ['sticker', '🏷️', 'Figurinha'], ['list', '📋', 'Lista']] },
    { g: 'Aba do CRM', i: '📂', items: [['tab_add', '➕', 'Adicionar a uma aba'], ['tab_rm', '➖', 'Remover de uma aba'], ['tab_rmall', '🧹', 'Remover de todas as abas']] },
    { g: 'Etiquetas', i: '🏷️', items: [['label_add', '➕', 'Adicionar uma etiqueta'], ['label_rm', '➖', 'Remover uma etiqueta'], ['label_rmall', '🧹', 'Remover todas as etiquetas']] },
    { g: 'Temporizadores', i: '⏱️', items: [['wait', '⏳', 'Esperar (segundos)'], ['typing', '⌨️', 'Exibir "digitando..."'], ['recording', '🎙️', 'Exibir "gravando áudio..."']] },
    { g: 'Utilitários', i: '🧰', items: [['archive', '🗄️', 'Arquivar conversa'], ['unarchive', '📤', 'Desarquivar conversa'], ['pin', '📌', 'Fixar conversa'], ['unpin', '📍', 'Desafixar conversa'], ['unread', '🔵', 'Marcar como não lida']] },
  ];
  const STEP = {}; MENU.forEach(g => g.items.forEach(([t, ic, l]) => { STEP[t] = { ic, l, g: g.g }; }));
  const MEDIA = { image: 'image/*', video: 'video/*', audio: 'audio/*', document: '*/*', sticker: 'image/webp,image/*' };
  const stepsOf = a => {
    a = a || {}; if (Array.isArray(a.steps)) return a.steps;
    const st = []; const v = (a.variations || []).map(x => (x || '').trim()).filter(Boolean);
    if (v.length) st.push({ id: 's' + Math.random().toString(36).slice(2, 8), type: 'text', variations: v });
    if (a.addLabel) st.push({ id: 's' + Math.random().toString(36).slice(2, 8), type: 'label_add', name: a.addLabel });
    if (a.removeLabel) st.push({ id: 's' + Math.random().toString(36).slice(2, 8), type: 'label_rm', name: a.removeLabel });
    if (a.moveTab) st.push({ id: 's' + Math.random().toString(36).slice(2, 8), type: 'tab_add', name: a.moveTab });
    return st;
  };
  const SAFE = { onClientReply: 'ask', onManualMsg: 'none', stopOnFunnelExit: true, skipGroups: true, excludeLabels: [], excludeTabs: [], maxPerContact: { count: 0, days: 7 }, minHoursBetween: 0, requireApproval: false, dryRun: false };
  const safeOf = r => { const s = Object.assign({}, SAFE, r.safety || {}); if (!(r.safety && r.safety.onClientReply) && r.onReply) s.onClientReply = r.onReply; s.maxPerContact = Object.assign({}, SAFE.maxPerContact, s.maxPerContact || {}); s.excludeLabels = (s.excludeLabels || []).slice(); s.excludeTabs = (s.excludeTabs || []).slice(); return s; };
  function stepSummary(st) {
    const m = STEP[st.type] || { l: st.type }; const n = st.name ? ' “' + st.name + '”' : '';
    if (st.type === 'text') { const c = (st.variations || []).filter(x => (x || '').trim()).length; return 'texto' + (c > 1 ? ' (' + c + ' variações)' : ''); }
    if (st.type === 'wait' || st.type === 'typing' || st.type === 'recording') return m.l.replace('(segundos)', '').replace(/"/g, '“').trim() + ' ' + (st.seconds || 0) + 's';
    if (st.type === 'quick') { const q = (cache.st.msgs || []).find(x => String(x.id) === String(st.msgId)); return 'resposta rápida' + (q ? ' “' + q.label + '”' : ''); }
    return m.l.toLowerCase() + n;
  }


  // ── cabeçalho ──
  function renderHead() {
    const al = (cache.rt.alerts || []).filter(a => a.kind === 'replied' && a.ask).length + cnt('asked') + cnt('approval');
    const tabs = [['list', 'Follow Ups'], ['queue', 'Fila' + (cnt('stale') ? '<b>' + cnt('stale') + '</b>' : '')], ['alerts', 'Avisos' + (al ? '<b>' + al + '</b>' : '')], ['settings', 'Ajustes']];
    const on = cache.cfg.on;
    $hd.innerHTML = '<h2>Follow Up</h2><div class="fu-tabs">' + tabs.map(t => '<div class="fu-tab' + (view === t[0] || (view === 'form' && t[0] === 'list') ? ' on' : '') + '" data-v="' + t[0] + '">' + t[1] + '</div>').join('') + '</div>'
      + '<div class="tog' + (on ? ' on' : '') + '" data-a="master" title="Liga/desliga TODO envio automático"><i></i>Envio automático: <b>' + (on ? 'LIGADO' : 'desligado') + '</b></div><button class="fu-x" data-a="close">✕</button>';
  }

  // ── lista ──
  function renderList() {
    const rules = cache.cfg.rules;
    const rt = cache.rt || {}; const nowD = new Date(); const cf = cache.cfg;
    const stTxt = rt.state && !['fila vazia', 'enviando'].includes(rt.state) ? rt.state : '';
    const stBanner = cf.on && stTxt ? '<div class="warn">ℹ️ Agora não está enviando: <b>' + esc(stTxt) + '</b>' + (/hor[áa]rio/.test(stTxt) ? ' (agora são ' + hm(Date.now()) + '; janela ' + esc(cf.winStart) + '–' + esc(cf.winEnd) + '). Mude em <b>Ajustes</b> ou marque “Sem limite de horário”.' : '') + '</div>' : '';
    $bd.innerHTML = stBanner + (!cache.cfg.on ? '<div class="warn">⏸ O envio automático está <b>desligado</b>. Os contatos entram na fila, mas nada é enviado até você ligar (botão no topo).</div>' : '')
      + (rules.length ? rules.map(r => {
        const waiting = cache.enrs.filter(e => e.ruleId === r.id && e.state === 'waiting').length;
        return '<div class="card"><div class="nm"><span>' + esc(r.name || '(sem nome)') + '</span><span class="sp"></span><span class="ic" data-a="edit" data-id="' + r.id + '" title="Editar">✎</span><span class="ic" data-a="dup" data-id="' + r.id + '" title="Duplicar">⧉</span><span class="ic" data-a="del" data-id="' + r.id + '" title="Excluir">🗑</span></div>'
          + '<div class="meta">Tipo de acionamento: <b>' + esc(describeTrigger(r)) + '</b><br>Funis: ' + ((r.funnel || []).length ? r.funnel.map(f => '<span class="chip' + (f.type === 'tab' ? ' tab' : '') + '">' + (f.type === 'tab' ? '📂 ' : '🏷️ ') + esc(f.name) + '</span>').join('') : '<span style="color:#f87171">nenhum — escolha etiqueta ou aba</span>')
          + '<br>Ação: ' + esc(describeAction(r)) + '<br>Na fila agora: <b>' + waiting + '</b></div>'
          + '<div class="row" style="margin-top:10px;"><div class="tog' + (r.active ? ' on' : '') + '" data-a="toggle" data-id="' + r.id + '"><i></i>Ativo</div><span style="flex:1"></span>'
          + '<button class="sec sm" data-a="existing" data-id="' + r.id + '" title="Colocar na fila quem JÁ está nesse funil agora (normalmente só entram os novos)">＋ Incluir quem já está no funil</button></div></div>';
      }).join('') : '<div class="empty">Nenhum follow up criado.<br>Clique em <b>Criar</b>: escolha uma etiqueta ou aba, o tempo e a mensagem.<br>Quem <b>entrar</b> nesse funil depois disso entra na fila automaticamente.</div>');
    $ft.innerHTML = '<button class="pri" data-a="new">Criar</button>';
  }

  // ── formulário ──
  function newRule() { return { id: 'r' + Date.now(), name: '', active: false, funnel: [], trigger: { mode: 'delay', days: 0, time: '04:00', varMin: 10 }, action: { steps: [{ id: 's' + Date.now().toString(36), type: 'text', variations: [''] }] }, safety: JSON.parse(JSON.stringify(SAFE)) }; }
  function renderForm() {
    const d = draft, t = d.trigger, a = d.action;
    const acc = (id, title, html) => '<div class="acc"><div class="acc-h" data-a="sec" data-s="' + id + '"><span>' + title + '</span><span>' + (sec === id ? '⌃' : '⌄') + '</span></div>' + (sec === id ? '<div class="acc-b">' + html + '</div>' : '') + '</div>';
    const sel = new Set(d.funnel.map(f => f.type + '|' + f.name));
    const list = fTab === 'label' ? waLabels() : crmTabs();
    const funnelHtml = '<div class="lbl">Selecionar etiquetas ou abas (quem entrar/sair delas aciona este follow up)</div>'
      + '<div>' + (d.funnel.length ? d.funnel.map((f, i) => '<span class="chip' + (f.type === 'tab' ? ' tab' : '') + '">' + (f.type === 'tab' ? '📂 ' : '🏷️ ') + esc(f.name) + '<x data-a="rmf" data-i="' + i + '">✕</x></span>').join('') : '<span style="color:#8696a0;font-size:13px;">Nada selecionado</span>') + '</div>'
      + '<div class="sub"><span data-a="ftab" data-t="label" class="' + (fTab === 'label' ? 'on' : '') + '">Etiquetas (WhatsApp)</span><span data-a="ftab" data-t="tab" class="' + (fTab === 'tab' ? 'on' : '') + '">Abas (CRM)</span></div>'
      + '<div class="pick">' + (list.length ? list.map(n => '<label><input type="checkbox" data-a="pickf" data-n="' + esc(n) + '"' + (sel.has(fTab + '|' + n) ? ' checked' : '') + '>' + (fTab === 'tab' ? '📂 ' : '🏷️ ') + esc(n) + '</label>').join('') : '<div class="empty" style="padding:14px">' + (fTab === 'label' ? 'Nenhuma etiqueta lida do WhatsApp ainda (precisa ser WhatsApp Business e a extensão sincronizada).' : 'Nenhuma aba criada. Crie pela barra do topo (≡ → Abas → ＋).') + '</div>') + '</div>';
    const trigHtml = ['enter|Disparar imediatamente ao entrar no funil', 'leave|Disparar imediatamente ao sair do funil', 'delay|Disparar após um tempo definido'].map(x => { const [v, l] = x.split('|'); return '<label class="rad"><input type="radio" name="tm" data-a="tmode" value="' + v + '"' + (t.mode === v ? ' checked' : '') + '>' + l + '</label>'; }).join('')
      + (t.mode === 'delay' ? '<div class="lbl">Defina o tempo para acionar</div><div class="row"><div><div style="font-size:12px;color:#8696a0;margin-bottom:3px">Dias</div><input type="number" min="0" data-f="days" value="' + esc(t.days || '') + '" placeholder="0" style="width:110px"></div><div><div style="font-size:12px;color:#8696a0;margin-bottom:3px">Horas e minutos (hh:mm)</div><input type="time" data-f="time" value="' + esc(t.time || '00:00') + '"></div><div><div style="font-size:12px;color:#8696a0;margin-bottom:3px">Segundos</div><input type="number" min="0" max="59" data-f="sec" value="' + esc(t.sec || '') + '" placeholder="0" style="width:90px"></div><div><div style="font-size:12px;color:#8696a0;margin-bottom:3px">Variação (até)</div><div class="row" style="gap:6px"><input type="number" min="0" data-f="varV" value="' + esc(t.varU === 's' ? Math.round((t.varMin || 0) * 60) : (t.varMin || 0)) + '" style="width:90px"><select data-f="varU" style="width:110px"><option value="m"' + (t.varU === 's' ? '' : ' selected') + '>minutos</option><option value="s"' + (t.varU === 's' ? ' selected' : '') + '>segundos</option></select></div></div></div>'
        + '<div class="info" id="fu-sum"></div>' : '')
      + '<div class="info">O tempo começa a contar quando o contato <b>entra</b> no funil. Mesmo com o tempo vencido, o envio só acontece pela <b>fila</b> (um por vez, com intervalo), no horário permitido.</div>';
    const quick = (cache.st.msgs || []).map(m => '<option value="' + esc(m.id) + '">' + esc(m.label) + '</option>').join('');
    const lblList = '<datalist id="fu-dl-l">' + waLabels().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist><datalist id="fu-dl-t">' + crmTabs().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>';
    const inp = (id, f, v, ph, w, list) => '<input class="' + (w ? '' : 'full') + '" ' + (w ? 'style="width:' + w + '" ' : '') + 'type="text" ' + (list ? 'list="' + list + '" ' : '') + 'data-sf="' + id + '|' + f + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '">';
    const fld = (l, h) => '<div style="font-size:12px;color:#8696a0;margin:8px 0 3px">' + l + '</div>' + h;
    const fmtCap = x => esc(x || '').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>').replace(/\n/g, '<br>');
    const bubble = st => {
      const du = st.dataUrl, t = st.type; let media = '';
      if (du && /^data:image/.test(du)) media = '<img src="' + du + '" class="bb-m">';
      else if (du && /^data:video/.test(du)) media = '<video src="' + du + '" controls class="bb-m"></video>';
      else if (du && /^data:audio/.test(du)) media = '<audio src="' + du + '" controls style="width:100%;margin:2px 0 4px"></audio>';
      else if (du) media = '<div class="bb-doc">📄 ' + esc(st.name || 'documento') + '</div>';
      if (!media) return '';
      const hasCap = t !== 'sticker' && t !== 'audio';
      return '<div class="bb-wrap"><div class="bb">' + media + (hasCap ? '<div class="bb-c" data-capprev="' + st.id + '">' + (st.caption ? fmtCap(st.caption) : '<span style="opacity:.45">A legenda aparece aqui…</span>') + '</div>' : '') + '<div class="bb-t">agora ✓✓</div></div></div>';
    };
    const stepBody = st => {
      const t = st.type, id = st.id;
      if (t === 'text') {
        const vs = (st.variations && st.variations.length) ? st.variations : [''];
        return fld('Mensagem — sai exatamente como você escrever aqui (Enter e linhas em branco ficam do jeito que estão). Use #primeiroNome.', '')
          + vs.map((v, i) => '<div style="margin-bottom:8px">' + (vs.length > 1 ? '<div style="display:flex;justify-content:space-between;font-size:12px;color:#d4af37;margin:4px 0">Variação ' + (i + 1) + ' de ' + vs.length + '<span data-a="vdel" data-sid="' + id + '" data-i="' + i + '" style="cursor:pointer;color:#ff6b6b">🗑 remover</span></div>' : '') + '<textarea data-sf="' + id + '|var|' + i + '" placeholder="Oi #primeiroNome! Tudo bem?...">' + esc(v) + '</textarea></div>').join('')
          + '<div class="row" style="gap:8px"><button class="sec sm" data-a="vadd" data-sid="' + id + '">＋ Adicionar outra variação</button>' + (vs.length > 1 ? '<button class="sec sm" data-a="vmerge" data-sid="' + id + '">⤵ Juntar tudo em uma mensagem só</button>' : '') + '</div>'
          + '<div class="meta" style="margin-top:6px">' + (vs.length > 1 ? '⚠️ Com ' + vs.length + ' variações o robô manda <b>uma delas por contato</b> (alterna). Se você escreveu UMA mensagem com parágrafos, use “Juntar tudo em uma mensagem só”.' : 'Uma variação = uma mensagem inteira. Só adicione outra se quiser que o robô alterne entre textos diferentes.') + '</div>';
      }
      if (MEDIA[t]) return '<div class="row" style="margin-top:6px"><label class="sec sm" style="cursor:pointer;display:inline-block;border:1px solid #38424a;border-radius:8px;padding:6px 12px;font-size:12px">📎 ' + (st.dataUrl ? 'Trocar arquivo' : 'Escolher arquivo') + '<input type="file" accept="' + MEDIA[t] + '" data-file="' + id + '" style="display:none"></label><span class="meta" style="margin:0">' + (st.dataUrl ? '✅ ' + esc(st.name || 'arquivo') + ' (' + Math.round((st.dataUrl.length * 0.75) / 1024) + ' KB)' : '<span style="color:#f87171">nenhum arquivo</span>') + '</span></div>'
        + bubble(st)
        + (t === 'sticker' || t === 'audio' ? '' : fld('✍️ Legenda — o texto que vai junto com ' + (t === 'image' ? 'a imagem' : t === 'video' ? 'o vídeo' : 'o arquivo') + ' (Enter = nova linha · *negrito* · _itálico_ · #primeiroNome)', '<textarea class="cap-ta" data-sf="' + id + '|caption" placeholder="Escreva a legenda aqui…">' + esc(st.caption || '') + '</textarea>'))
        + (t === 'audio' ? '<div class="info">O áudio vai como <b>mensagem de voz gravada</b> (com ondinha), e o cliente vê “gravando áudio…” uns segundos antes. Se não der pra mandar como voz, ele NÃO é enviado como arquivo.</div>' : '') + (t === 'sticker' ? '<div class="info">Use uma imagem .webp. Pode ser enviada como imagem comum dependendo da versão do WhatsApp.</div>' : '');
      if (t === 'quick') return fld('Resposta rápida do CRM (envia todas as ações dela: textos, mídias, esperas)', '<select class="full" data-sf="' + id + '|msgId"><option value="">Escolher…</option>' + quick.replace('value="' + esc(st.msgId) + '"', 'value="' + esc(st.msgId) + '" selected') + '</select>');
      if (t === 'pix') return '<div class="row"><div class="grow">' + fld('Favorecido', inp(id, 'name', st.name, 'Zambonini Imports')) + '</div><div class="grow">' + fld('Chave Pix', inp(id, 'key', st.key, 'CNPJ, e-mail, telefone…')) + '</div></div><div class="row"><div class="grow">' + fld('Valor (opcional)', inp(id, 'value', st.value, 'R$ 0,00')) + '</div><div class="grow">' + fld('Tipo da chave', inp(id, 'keyType', st.keyType, 'CNPJ')) + '</div></div>' + fld('Observação (opcional)', inp(id, 'note', st.note, 'Envie o comprovante por aqui'));
      if (t === 'invite') return fld('Texto', inp(id, 'text', st.text, 'Entre no nosso grupo de ofertas:')) + fld('Link do grupo', inp(id, 'link', st.link, 'https://chat.whatsapp.com/…'));
      if (t === 'contact') return '<div class="row"><div class="grow">' + fld('Nome', inp(id, 'name', st.name, 'Atendimento')) + '</div><div class="grow">' + fld('Telefone', inp(id, 'phone', st.phone, '(16) 99999-9999')) + '</div></div><div class="info">Vai como texto (nome + telefone).</div>';
      if (t === 'banner') return fld('Texto', inp(id, 'text', st.text, 'Olha esse modelo:')) + fld('Link (o WhatsApp mostra a prévia com banner)', inp(id, 'link', st.link, 'https://…'));
      if (t === 'list') return fld('Título', inp(id, 'title', st.title, 'Modelos disponíveis')) + fld('Itens (um por linha)', '<textarea data-sf="' + id + '|items" style="min-height:80px">' + esc((st.items || []).join('\n')) + '</textarea>') + '<div class="info">Vai como lista numerada em texto.</div>';
      if (t === 'tab_add' || t === 'tab_rm') return fld('Aba do CRM', inp(id, 'name', st.name, 'ex: Quentes', '', 'fu-dl-t'));
      if (t === 'label_add' || t === 'label_rm') return fld('Etiqueta do WhatsApp', inp(id, 'name', st.name, 'ex: FOLLOW 2', '', 'fu-dl-l'));
      if (t === 'wait' || t === 'typing' || t === 'recording') return fld('Segundos', '<input type="number" min="1" data-sf="' + id + '|seconds" value="' + esc(st.seconds || '') + '" placeholder="5" style="width:110px">' + (t === 'wait' ? '' : '<div class="info">O cliente vê “' + (t === 'typing' ? 'digitando…' : 'gravando áudio…') + '” durante esse tempo (humaniza o envio).</div>'));
      if (t === 'tab_rmall') return '<div class="meta">Tira o contato de qualquer aba do CRM.</div>';
      if (t === 'label_rmall') return '<div class="meta">Tira todas as etiquetas do contato no WhatsApp.</div>';
      return '<div class="meta">Sem configuração.</div>';
    };
    const steps = a.steps || [];
    const menu = '<div class="addmenu" id="fu-menu" style="display:' + (menuOpen ? 'block' : 'none') + '">' + MENU.map(g => '<div class="mg"><div class="mh">' + g.i + ' ' + g.g + '</div>' + g.items.map(([t, ic, l]) => '<div class="mi" data-a="addstep" data-t="' + t + '">' + ic + ' ' + l + '</div>').join('') + '</div>').join('') + '</div>';
    const actHtml = '<div class="info" style="margin-top:0">Monte um <b>script</b>: as ações rodam <b>na ordem</b>, uma depois da outra, para cada contato.</div>'
      + (steps.length ? steps.map((st, i) => '<div class="step"><div class="sh"><span class="sn">' + (i + 1) + '</span><span class="st">' + (STEP[st.type] ? STEP[st.type].ic + ' ' + STEP[st.type].g + ' · ' + STEP[st.type].l : st.type) + '</span><span class="sp"></span><span class="ic" data-a="stup" data-i="' + i + '" title="Subir">↑</span><span class="ic" data-a="stdn" data-i="' + i + '" title="Descer">↓</span><span class="ic" data-a="stdel" data-i="' + i + '" title="Remover">🗑</span></div>' + stepBody(st) + '</div>').join('') : '<div class="empty" style="padding:16px">Nenhuma ação. Clique em <b>Adicionar Ação</b>.</div>')
      + '<div style="position:relative;margin-top:10px"><button class="sec" data-a="menu">＋ Adicionar Ação</button>' + menu + '</div>' + lblList
      + '<div class="info">Dica: para fazer uma <b>escada</b>, termine o script com “Adicionar etiqueta/aba” do próximo passo e crie outro follow up com <b>esse</b> funil.</div>';

    const sf = safeOf(d);
    const rad = (name, key, val, html) => '<label class="rad"><input type="radio" name="' + name + '" data-a="srad" data-k="' + key + '" value="' + val + '"' + (sf[key] === val ? ' checked' : '') + '>' + html + '</label>';
    const tg = (key, html, sub) => '<div class="trow"><div class="tog' + (sf[key] ? ' on' : '') + '" data-a="stog" data-k="' + key + '"><i></i></div><div><div style="font-size:14px">' + html + '</div>' + (sub ? '<div class="meta" style="margin:2px 0 0">' + sub + '</div>' : '') + '</div></div>';
    const exList = (key, label, list) => '<div class="lbl">' + label + '</div><div>' + (sf[key].length ? sf[key].map((n, i) => '<span class="chip' + (key === 'excludeTabs' ? ' tab' : '') + '">' + esc(n) + '<x data-a="rmex" data-k="' + key + '" data-i="' + i + '">✕</x></span>').join('') : '<span style="color:#8696a0;font-size:13px">Nenhuma</span>') + '</div><div class="row" style="margin-top:6px"><select class="grow" id="fu-ex-' + key + '"><option value="">Escolher…</option>' + list.filter(n => !sf[key].includes(n)).map(n => '<option>' + esc(n) + '</option>').join('') + '</select><button class="sec sm" data-a="addex" data-k="' + key + '">Adicionar</button></div>';
    const rulesHtml = '<div class="lbl" style="margin-top:2px">1 · Se o CLIENTE responder antes do disparo</div>'
      + rad('r1', 'onClientReply', 'ask', '<b>Perguntar-me</b> — pausa esse contato e me avisa (manter, resetar o tempo ou cancelar) <span class="rec">recomendado</span>')
      + rad('r1', 'onClientReply', 'cancel', 'Cancelar o follow up automaticamente e me avisar')
      + rad('r1', 'onClientReply', 'ignore', 'Ignorar e enviar mesmo assim <span class="rec" style="background:#7f1d1d">arriscado</span>')
      + '<div class="lbl">2 · Se EU mandar mensagem manual para o cliente antes do disparo</div>'
      + rad('r2', 'onManualMsg', 'none', 'Não fazer nada')
      + rad('r2', 'onManualMsg', 'reset', 'Reiniciar a contagem do tempo (conversa continua viva)')
      + rad('r2', 'onManualMsg', 'cancel', 'Cancelar o follow up (já estou atendendo)')
      + '<div class="lbl">3 · Travas automáticas</div>'
      + tg('stopOnFunnelExit', 'Cancelar se o contato <b>sair do funil</b>', 'Mudou de etiqueta/aba antes do disparo → não envia.')
      + tg('skipGroups', 'Nunca enviar para <b>grupos</b>', 'Evita mandar follow up para o grupo errado.')
      + exList('excludeLabels', '4 · Nunca enviar para quem estiver nestas etiquetas (ex.: Cliente, Bloqueado, Pós-venda)', waLabels())
      + exList('excludeTabs', 'E nestas abas do CRM', crmTabs())
      + '<div class="lbl">5 · Limites por contato</div>'
      + '<div class="row">No máximo <input type="number" min="0" data-sfs="mpc" value="' + esc(sf.maxPerContact.count) + '" style="width:70px"> follow up(s) deste em <input type="number" min="1" data-sfs="mpd" value="' + esc(sf.maxPerContact.days) + '" style="width:70px"> dia(s) <span class="meta" style="margin:0">(0 = sem limite)</span></div>'
      + '<div class="row" style="margin-top:8px">Mínimo de <input type="number" min="0" step="0.5" data-sfs="mhb" value="' + esc(sf.minHoursBetween) + '" style="width:70px"> hora(s) entre dois follow ups para o <b>mesmo</b> contato (de qualquer regra)</div>'
      + '<div class="lbl">6 · Modo seguro</div>'
      + tg('requireApproval', 'Pedir <b>minha aprovação</b> antes de cada envio', 'O contato fica na aba Fila → “Aguardando aprovação”. Só sai quando você aprovar.')
      + tg('dryRun', '🧪 <b>Modo simulação</b> — roda tudo, mas NÃO envia nada', 'Ótimo para testar a regra: o painel mostra o que seria feito.')
      + '<div class="info">Sempre valem (não dá para desligar): confirmação do envio antes de avançar, fila com intervalo, limite diário/hora e horário permitido (aba Ajustes).</div>';
    $bd.innerHTML = '<div style="font-size:12px;color:#8696a0;margin-bottom:4px">Nome do follow up</div><input class="full" type="text" data-f="name" value="' + esc(d.name) + '" placeholder="Insira o nome do follow up" style="margin-bottom:12px;">'
      + acc('funnel', 'Configurações do Funil', funnelHtml) + acc('trigger', 'Acionamento do Follow Up', trigHtml) + acc('action', 'Ação do Follow Up', actHtml) + acc('rules', 'Regras de Acionamento', rulesHtml);
    $ft.innerHTML = '<button class="sec" data-a="cancelForm">Cancelar</button><button class="pri" data-a="saveForm">' + (editing ? 'Salvar' : 'Criar') + '</button>';
    sumTrigger();
  }
  function sumTrigger() { const el = document.getElementById('fu-sum'); if (el && draft) el.textContent = 'O acionamento será disparado ' + describeTrigger(draft).replace('Após um tempo: ', '') + ' após o contato ter sido inserido no funil' + (draft.trigger.varMin ? ' (+ variação de até ' + (draft.trigger.varU === 's' ? Math.round(draft.trigger.varMin * 60) + ' s' : draft.trigger.varMin + ' min') + ')' : '') + '.'; }

  // ── fila ──
  function renderQueue() {
    const cfg = cache.cfg, rt = cache.rt, now = Date.now();
    const today = new Date(); const dk = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const sentToday = rt.day === dk ? (rt.sent || 0) : 0;
    const waiting = cache.enrs.filter(e => e.state === 'waiting').sort((a, b) => a.dueAt - b.dueAt);
    const stale = cache.enrs.filter(e => e.state === 'stale');
    const appr = cache.enrs.filter(e => e.state === 'approval');
    const q = cfg.queue, avg = q.mode === 'fixed' ? q.fixedMin : (q.minMin + q.maxMin) / 2;
    let eta = Math.max(now, rt.nextSendAfter || 0);
    const rn = id => (cfg.rules.find(r => r.id === id) || {}).name || '(apagado)';
    const items = waiting.map(e => { const when = Math.max(eta, e.dueAt); eta = when + avg * 60e3; return { e, when }; });
    $bd.innerHTML = '<div class="card"><div class="meta"><b>' + (cfg.on ? '▶ Ligado' : '⏸ Desligado') + '</b> · Hoje: <b>' + sentToday + '/' + cfg.dailyCap + '</b> · Janela ' + esc(cfg.winStart) + '–' + esc(cfg.winEnd) + ' · Intervalo: <b>' + (q.mode === 'fixed' ? fmtMin(q.fixedMin) + ' (sempre igual)' : 'varia entre ' + fmtMin(q.minMin) + ' e ' + fmtMin(q.maxMin)) + '</b>'
      + '<br>Estado: ' + esc(rt.state || '—') + (rt.nextSendAfter > now ? ' · próximo envio após <b>' + hm(rt.nextSendAfter) + '</b>' : '') + '</div></div>'
      + (appr.length ? '<div class="h3">✅ Aguardando sua aprovação (' + appr.length + ')</div>' + appr.map(e => '<div class="qi"><div class="g"><div class="t">' + esc(e.contact) + '</div><div class="s">' + esc(rn(e.ruleId)) + '</div></div><button class="pri sm" data-a="dec" data-id="' + e.id + '" data-c="approve" style="padding:6px 14px;font-size:12px">Aprovar envio</button><button class="sec sm red" data-a="dec" data-id="' + e.id + '" data-c="cancel">Cancelar</button></div>').join('') : '')
      + (stale.length ? '<div class="h3">⏰ Atrasados — aguardam sua decisão (' + stale.length + ')</div><div class="warn">O computador ficou desligado ou o envio ficou parado. <b>Nada disso foi enviado.</b> Escolha o que fazer:<div class="row" style="margin-top:8px"><button class="pri sm" data-a="all" data-from="stale" data-c="release" style="padding:6px 14px;font-size:12px">Liberar todos na fila (espaçados)</button><button class="sec sm" data-a="all" data-from="stale" data-c="reset">Resetar o tempo de todos</button><button class="sec sm red" data-a="all" data-from="stale" data-c="cancel">Cancelar todos</button></div></div>'
        + stale.map(e => '<div class="qi"><div class="g"><div class="t">' + esc(e.contact) + '</div><div class="s">' + esc(rn(e.ruleId)) + ' · venceu ' + fmt(e.dueAt) + '</div></div><button class="sec sm" data-a="dec" data-id="' + e.id + '" data-c="release">Liberar</button><button class="sec sm" data-a="dec" data-id="' + e.id + '" data-c="reset">Resetar</button><button class="sec sm red" data-a="dec" data-id="' + e.id + '" data-c="cancel">✕</button></div>').join('') : '')
      + '<div class="h3">Fila de envio (' + waiting.length + ')</div>'
      + (items.length ? items.map(({ e, when }) => '<div class="qi"><div class="g"><div class="t">' + esc(e.contact) + '</div><div class="s">' + esc(rn(e.ruleId)) + ' · ' + (e.dueAt > now ? 'vence ' + fmt(e.dueAt) : 'vencido, na fila') + ' · envio previsto ≈ <b>' + fmt(when) + '</b></div></div>'
        + '<button class="sec sm" data-a="now" data-id="' + e.id + '" title="Envia este agora (fora da fila)">▶ Agora</button><button class="sec sm" data-a="dec" data-id="' + e.id + '" data-c="reset" title="Recomeça a contar o tempo">↻ Resetar</button><button class="sec sm red" data-a="dec" data-id="' + e.id + '" data-c="cancel">✕</button></div>').join('') : '<div class="empty">Fila vazia.</div>')
      + '<div class="h3">Últimos eventos</div>' + ((rt.log || []).slice(0, 12).map(l => '<div class="meta" style="margin:3px 0"><span style="color:#8696a0">' + fmt(l.at) + '</span> ' + esc(l.msg) + '</div>').join('') || '<div class="empty">—</div>');
    $ft.innerHTML = '';
  }

  // ── avisos ──
  function renderAlerts() {
    const al = (cache.rt.alerts || []);
    $bd.innerHTML = al.length ? al.slice(0, 40).map(a => {
      const asks = a.kind === 'replied' && a.ask && cache.enrs.some(e => e.id === a.enrId && e.state === 'asked');
      const apv = a.kind === 'approve' && cache.enrs.some(e => e.id === a.enrId && e.state === 'approval');
      const icon = a.kind === 'approve' ? '✅' : a.kind === 'replied' ? '💬' : a.kind === 'label' ? '🏷️' : a.kind === 'info' ? 'ℹ️' : '⚠️';
      return '<div class="card"><div class="nm"><span>' + icon + ' ' + esc(a.contact) + '</span><span class="sp"></span><span style="font-size:12px;color:#8696a0;font-weight:400">' + fmt(a.at) + '</span></div>'
        + (a.kind === 'replied' ? '<div class="meta">Respondeu antes do disparo' + (a.ruleName ? ' do follow up <b>' + esc(a.ruleName) + '</b>' : '') + '. O envio dele está <b>pausado</b>.</div>' : '')
        + '<div class="meta">“' + esc((a.text || '').slice(0, 300)) + '”</div>' + (a.resumo ? '<div class="meta">' + esc(a.resumo) + '</div>' : '') + (a.suggestion ? '<div class="sug">💡 Sugestão: ' + esc(a.suggestion) + '</div>' : '')
        + '<div class="row" style="margin-top:10px">' + (apv ? '<button class="pri sm" data-a="dec" data-id="' + a.enrId + '" data-c="approve" style="padding:6px 14px;font-size:12px">Aprovar envio</button><button class="sec sm red" data-a="dec" data-id="' + a.enrId + '" data-c="cancel">Cancelar</button>' : '') + (asks ? '<button class="pri sm" data-a="dec" data-id="' + a.enrId + '" data-c="keep" style="padding:6px 14px;font-size:12px">Manter no follow up</button><button class="sec sm" data-a="dec" data-id="' + a.enrId + '" data-c="reset">↻ Resetar o tempo</button><button class="sec sm red" data-a="dec" data-id="' + a.enrId + '" data-c="cancel">Cancelar follow up</button>' : '')
        + (a.kind === 'replied' ? '<button class="sec sm" data-a="open" data-n="' + esc(a.contact) + '">💬 Abrir conversa</button>' : '') + '<button class="sec sm" data-a="dis" data-id="' + a.id + '">Dispensar</button></div></div>';
    }).join('') : '<div class="empty">Nenhum aviso.<br>Quando um cliente responder antes do disparo, aparece aqui com as opções.</div>';
    $ft.innerHTML = al.length ? '<button class="sec" data-a="disall">Dispensar todos</button>' : '';
  }

  // ── ajustes ──
  // campo de intervalo com unidade (segundos/minutos); guarda sempre em minutos
  const fmtMin = m => { const t = Math.round((+m || 0) * 60); const mm = Math.floor(t / 60), ss = t % 60; return mm ? (mm + ' min' + (ss ? ' ' + ss + ' s' : '')) : ss + ' s'; };
  function qf(key, q) {
    const u = (q.units || {})[key] === 's' ? 's' : 'm'; const v = u === 's' ? Math.round((q[key] || 0) * 60) : q[key];
    return '<input type="number" min="1" step="1" data-s="' + key + '" value="' + esc(v) + '" style="width:80px"> <select data-su="' + key + '" style="width:105px"><option value="m"' + (u === 'm' ? ' selected' : '') + '>minutos</option><option value="s"' + (u === 's' ? ' selected' : '') + '>segundos</option></select>';
  }
  function capInner(c) {
    const q = c.queue || {}; const avg = q.mode === 'fixed' ? (+q.fixedMin || 1) : ((+q.minMin || 1) + Math.max(+q.minMin || 1, +q.maxMin || 1)) / 2;
    const gapPerH = 60 / (avg + 0.7);   // ~0,7 min para rodar o roteiro de cada contato
    const perH = Math.min(+c.hourlyCap || 0, gapPerH);
    const tm = x => { const [h, m] = String(x || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    let hrs = c.win24 ? 24 : (tm(c.winEnd) - tm(c.winStart)) / 60; if (hrs <= 0) hrs += 24; if (!c.win24 && c.winEnd === '00:00') hrs = (1440 - tm(c.winStart)) / 60;
    const perD = Math.min(+c.dailyCap || 0, Math.floor(perH * hrs));
    const why = perD === (+c.dailyCap || 0) ? 'limite por dia' : perH === (+c.hourlyCap || 0) ? 'limite por hora' : 'intervalo da fila';
    const need = n => 45 * n;
    const ok = perD >= need(5);
    return '<div class="h3" style="margin-top:0">📊 Capacidade com essas regras</div><div style="font-size:15px">≈ <b>' + Math.floor(perH) + ' envios por hora</b> · ≈ <b style="color:' + (ok ? '#4ade80' : '#fbbf24') + '">' + perD + ' envios por dia</b> <span style="opacity:.7;font-size:12.5px">(o que mais limita: ' + why + ' · janela de ' + Math.round(hrs * 10) / 10 + ' h)</span></div>'
      + '<div class="meta" style="margin-top:6px">Cada lead gera <b>1 envio por etapa</b> da escada. Com ~45 leads novos por dia: 3 etapas ≈ ' + need(3) + ' envios/dia · 4 etapas ≈ ' + need(4) + ' · 5 etapas ≈ ' + need(5) + '. ' + (ok ? '✅ Dá conta de uma escada de até 5 etapas.' : '⚠️ Abaixo de ' + need(5) + ': parte dos follow ups vai ficar esperando para o dia seguinte.') + '</div>';
  }
  function renderSettings() {
    const c = cache.cfg, q = c.queue;
    $bd.innerHTML = '<div class="info" style="margin-top:0">Estas regras valem para <b>todos</b> os follow ups. Elas existem para NUNCA sair vários envios de uma vez.</div>'
      + '<div class="h3">Intervalo entre um contato e o próximo (fila única)</div><div class="card">'
      + '<div class="meta" style="margin:0 0 10px">Existe <b>uma fila só</b> para todos os follow ups: o robô atende <b>um contato por vez</b> e só começa o próximo depois que o anterior terminou <b>todo o roteiro</b> e o intervalo abaixo passou. Dois envios nunca saem juntos, nem de follow ups diferentes.</div>'
      + '<label class="rad"><input type="radio" name="qm" data-s="qmode" value="random"' + (q.mode === 'random' ? ' checked' : '') + '>🎲 <b>Variável (recomendado)</b> — cada espera é sorteada entre ' + qf('minMin', q) + ' e ' + qf('maxMin', q) + '</label>'
      + '<label class="rad"><input type="radio" name="qm" data-s="qmode" value="fixed"' + (q.mode === 'fixed' ? ' checked' : '') + '>⏱ <b>Fixo</b> — sempre ' + qf('fixedMin', q) + ' entre um contato e o outro</label>'
      + '<div class="meta">Variável parece mais natural para o WhatsApp (ninguém manda mensagem em intervalo exato de relógio). Mesmo no variável, o sorteio nunca fica abaixo do mínimo. Mínimo absoluto: 10 segundos.</div></div>'
      + '<div class="h3">Horário permitido</div><div class="card"><label class="rad" style="padding-top:0"><input type="checkbox" data-s="win24"' + (c.win24 ? ' checked' : '') + '>Sem limite de horário (24 h — enviar a qualquer hora, inclusive de madrugada)</label><div class="row">Das <input type="time" data-s="winStart" value="' + esc(c.winStart) + '"> às <input type="time" data-s="winEnd" value="' + esc(c.winEnd) + '"></div><div style="margin-top:10px">'
      + DAYS.map((d, i) => '<span class="chip' + (c.days.includes(i) ? '' : '" style="opacity:.4') + '" data-a="day" data-d="' + i + '" style="cursor:pointer;' + '">' + d + '</span>').join('') + '</div></div>'
      + '<div class="h3">Limites</div><div class="card"><div class="row"><input type="number" min="1" data-s="dailyCap" value="' + esc(c.dailyCap) + '" style="width:90px"> por dia &nbsp;·&nbsp; <input type="number" min="1" data-s="hourlyCap" value="' + esc(c.hourlyCap) + '" style="width:90px"> por hora</div></div>'
      + '<div class="card" id="fu-cap">' + capInner(c) + '</div>'
      + '<div class="h3">Atrasados</div><div class="card"><div class="row">Se passou mais de <input type="number" min="10" data-s="staleMin" value="' + esc(c.staleMin) + '" style="width:90px"> minutos do horário (ou o computador ficou desligado), <b>perguntar</b> antes de enviar.</div></div>'
      + '<div class="h3">Agente de IA (CRM)</div><div class="card"><div style="font-size:12px;color:#8696a0;margin-bottom:3px">Endereço do CRM</div><input class="full" type="text" data-s="apiUrl" value="' + esc(c.apiUrl) + '"><div style="font-size:12px;color:#8696a0;margin:8px 0 3px">Token da extensão (EXT_TOKEN da Vercel)</div><input class="full" type="password" data-s="token" value="' + esc(c.token) + '" placeholder="cole aqui o token"></div>';
    $ft.innerHTML = '';
  }

  function render() {
    if (!opened) return;
    renderHead();
    if (view === 'list') renderList(); else if (view === 'form') renderForm(); else if (view === 'queue') renderQueue(); else if (view === 'alerts') renderAlerts(); else renderSettings();
  }

  // ── eventos ──
  root.addEventListener('click', async e => {
    if (menuOpen && !e.target.closest('[data-a="menu"],#fu-menu')) { menuOpen = false; const mn = document.getElementById('fu-menu'); if (mn) mn.style.display = 'none'; }
    const tab = e.target.closest('.fu-tab'); if (tab) { view = tab.dataset.v; draft = null; await load(); render(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = b.dataset.id;
    if (a === 'close') return close();
    if (a === 'master') { await mutateCfg(c => { c.on = !c.on; }); toast(cache.cfg.on ? '▶ Envio automático LIGADO' : '⏸ Envio automático desligado'); return render(); }
    if (a === 'new') { draft = newRule(); editing = false; menuOpen = false; sec = 'funnel'; view = 'form'; return render(); }
    if (a === 'edit') { draft = JSON.parse(JSON.stringify(cache.cfg.rules.find(r => r.id === id))); draft.action = { steps: stepsOf(draft.action) }; draft.safety = safeOf(draft); editing = true; menuOpen = false; sec = 'funnel'; view = 'form'; return render(); }
    if (a === 'dup') { const r = JSON.parse(JSON.stringify(cache.cfg.rules.find(x => x.id === id))); r.id = 'r' + Date.now(); r.name += ' (cópia)'; r.active = false; await mutateCfg(c => c.rules.push(r)); return render(); }
    if (a === 'del') { if (confirm('Excluir este follow up? Quem está na fila dele será cancelado.')) { await mutateCfg(c => { c.rules = c.rules.filter(r => r.id !== id); }); await load(); render(); } return; }
    if (a === 'toggle') { await mutateCfg(c => { const r = c.rules.find(x => x.id === id); if (r) { r.active = !r.active; if (r.active && !(r.funnel || []).length) { r.active = false; toast('⚠️ Escolha uma etiqueta ou aba no funil antes de ativar'); } } }); return render(); }
    if (a === 'existing') { send({ type: 'ENGINE_ENROLL_EXISTING', ruleId: id }); toast('Quem já está no funil entrou na fila (confira em Fila)'); return; }
    if (a === 'sec') { sec = sec === b.dataset.s ? '' : b.dataset.s; return render(); }
    if (a === 'ftab') { fTab = b.dataset.t; return render(); }
    if (a === 'rmf') { draft.funnel.splice(+b.dataset.i, 1); return render(); }
    if (a === 'menu') {
      menuOpen = !menuOpen; const mn = document.getElementById('fu-menu');
      if (mn) {
        mn.style.display = menuOpen ? 'block' : 'none';
        if (menuOpen) {   // posição fixa na tela: nunca fica cortado pela janela
          const r = b.getBoundingClientRect(); const vh = window.innerHeight;
          const below = vh - r.bottom - 12, above = r.top - 12; const down = below >= 260 || below >= above;
          const h = Math.max(180, Math.min(440, down ? below : above));
          mn.style.position = 'fixed'; mn.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 420)) + 'px'; mn.style.width = '400px'; mn.style.maxHeight = h + 'px'; mn.style.bottom = 'auto'; mn.style.top = down ? (r.bottom + 6) + 'px' : Math.max(8, r.top - 6 - h) + 'px';
          mn.scrollTop = 0;
        }
      }
      return;
    }
    if (a === 'vadd' || a === 'vdel' || a === 'vmerge') {
      const st = (draft.action.steps || []).find(x => x.id === b.dataset.sid); if (!st) return; st.variations = st.variations && st.variations.length ? st.variations : [''];
      if (a === 'vadd') st.variations.push('');
      else if (a === 'vdel') { st.variations.splice(+b.dataset.i, 1); if (!st.variations.length) st.variations = ['']; }
      else st.variations = [st.variations.map(x => (x || '').trim()).filter(Boolean).join('\n\n')];
      return render();
    }
    if (a === 'addstep') {
      const t = b.dataset.t; const st = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: t };
      if (t === 'text') st.variations = ['']; if (['wait', 'typing', 'recording'].includes(t)) st.seconds = t === 'wait' ? 5 : 4;
      draft.action.steps.push(st); menuOpen = false; return render();
    }
    if (a === 'stdel') { draft.action.steps.splice(+b.dataset.i, 1); return render(); }
    if (a === 'stup' || a === 'stdn') { const i = +b.dataset.i, j = a === 'stup' ? i - 1 : i + 1, L = draft.action.steps; if (j >= 0 && j < L.length) { [L[i], L[j]] = [L[j], L[i]]; } return render(); }
    if (a === 'stog') { const sf = draft.safety = safeOf(draft); sf[b.dataset.k] = !sf[b.dataset.k]; draft.safety = sf; return render(); }
    if (a === 'addex') { const k = b.dataset.k; const v = (document.getElementById('fu-ex-' + k) || {}).value; if (v) { const sf = draft.safety = safeOf(draft); sf[k].push(v); } return render(); }
    if (a === 'rmex') { const sf = draft.safety = safeOf(draft); sf[b.dataset.k].splice(+b.dataset.i, 1); return render(); }
    if (a === 'cancelForm') { view = 'list'; draft = null; return render(); }
    if (a === 'saveForm') {
      if (!draft.name.trim()) { toast('⚠️ Dê um nome ao follow up'); return; }
      if (!draft.funnel.length) { toast('⚠️ Escolha ao menos uma etiqueta ou aba'); sec = 'funnel'; return render(); }
      const L = draft.action.steps || [];
      if (!L.length) { toast('⚠️ Adicione ao menos uma ação'); sec = 'action'; return render(); }
      for (let i = 0; i < L.length; i++) {
        const st = L[i], bad = m => { toast('⚠️ Ação ' + (i + 1) + ' (' + STEP[st.type].l + '): ' + m); sec = 'action'; render(); };
        if (st.type === 'text' && !(st.variations || []).some(x => (x || '').trim())) return bad('escreva a mensagem');
        if (MEDIA[st.type] && !st.dataUrl) return bad('escolha o arquivo');
        if (st.type === 'quick' && !st.msgId) return bad('escolha a resposta rápida');
        if (st.type === 'pix' && !st.key) return bad('informe a chave Pix');
        if ((st.type === 'invite' || st.type === 'banner') && !st.link) return bad('informe o link');
        if (st.type === 'contact' && !st.phone) return bad('informe o telefone');
        if (st.type === 'list' && !(st.items || []).length) return bad('adicione itens');
        if (['tab_add', 'tab_rm', 'label_add', 'label_rm'].includes(st.type) && !(st.name || '').trim()) return bad('informe o nome');
        if (['wait', 'typing', 'recording'].includes(st.type) && !(+st.seconds > 0)) return bad('informe os segundos');
        if (st.type === 'text') st.variations = st.variations.map(x => x.trim()).filter(Boolean);
      }
      draft.safety = safeOf(draft); delete draft.onReply;
      await mutateCfg(c => { const i = c.rules.findIndex(r => r.id === draft.id); if (i >= 0) c.rules[i] = draft; else c.rules.push(draft); });
      toast('✅ Follow up salvo' + (draft.active ? '' : ' — ligue o botão “Ativo” na lista para começar')); view = 'list'; draft = null; await load(); return render();
    }
    if (a === 'now') { send({ type: 'ENGINE_SEND_NOW', id }); toast('▶ Enviando agora…'); return; }
    if (a === 'dec') { send({ type: 'ENGINE_DECIDE', id, choice: b.dataset.c }); await new Promise(r => setTimeout(r, 350)); await load(); return render(); }
    if (a === 'all') { send({ type: 'ENGINE_DECIDE_ALL', from: b.dataset.from, choice: b.dataset.c }); await new Promise(r => setTimeout(r, 700)); await load(); return render(); }
    if (a === 'dis') { const r = (await sget(K.rt)) || {}; r.alerts = (r.alerts || []).filter(x => x.id !== id); await sset(K.rt, r); await load(); return render(); }
    if (a === 'disall') { const r = (await sget(K.rt)) || {}; r.alerts = (r.alerts || []).filter(x => x.kind === 'replied' && x.ask && cache.enrs.some(en => en.id === x.enrId && en.state === 'asked')); await sset(K.rt, r); await load(); return render(); }
    if (a === 'open') { send({ type: 'OPEN_CONTACT', contact: b.dataset.n }); close(); return; }
    if (a === 'day') { await mutateCfg(c => { const d = +b.dataset.d; c.days = c.days.includes(d) ? c.days.filter(x => x !== d) : c.days.concat([d]); }); return render(); }
  });
  root.addEventListener('input', async e => {
    const t = e.target;
    if (t.dataset.f && draft) {
      const f = t.dataset.f;
      if (f === 'name') draft.name = t.value;
      else if (f === 'days') { draft.trigger[f] = Math.max(0, +t.value || 0); sumTrigger(); }
      else if (f === 'sec') { draft.trigger.sec = Math.max(0, Math.min(59, Math.round(+t.value || 0))); sumTrigger(); }
      else if (f === 'varV') { const v = Math.max(0, +t.value || 0); draft.trigger.varMin = draft.trigger.varU === 's' ? v / 60 : v; sumTrigger(); }
      else if (f === 'varU') { draft.trigger.varU = t.value; render(); }
      else if (f === 'time') { draft.trigger.time = t.value || '00:00'; sumTrigger(); }
    }
    if (t.dataset.sf && draft) {
      const [sid, f, ix] = t.dataset.sf.split('|'); const st = (draft.action.steps || []).find(x => x.id === sid); if (st) {
        if (f === 'var') { st.variations = st.variations || ['']; st.variations[+ix] = t.value; }
        else if (f === 'vars') st.variations = t.value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
        else if (f === 'items') st.items = t.value.split('\n').map(x => x.trim()).filter(Boolean);
        else if (f === 'seconds') st.seconds = Math.max(0, +t.value || 0);
        else st[f] = t.value;
        if (f === 'caption') { const pv = root.querySelector('[data-capprev="' + sid + '"]'); if (pv) pv.innerHTML = t.value ? t.value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>').replace(/\n/g, '<br>') : '<span style="opacity:.45">A legenda aparece aqui…</span>'; }
      }
    }
    if (t.dataset.sfs && draft) {
      const sf = draft.safety = safeOf(draft); const k = t.dataset.sfs, v = Math.max(0, +t.value || 0);
      if (k === 'mpc') sf.maxPerContact.count = v; else if (k === 'mpd') sf.maxPerContact.days = Math.max(1, v); else if (k === 'mhb') sf.minHoursBetween = v;
    }
    if (t.dataset.s) {
      setTimeout(() => { const el = document.getElementById('fu-cap'); if (el) el.innerHTML = capInner(cache.cfg); }, 120);
      const s = t.dataset.s; const num = t.type === 'number' ? +t.value : t.type === 'checkbox' ? t.checked : t.value;
      await mutateCfg(c => { if (['minMin', 'maxMin', 'fixedMin'].includes(s)) { const su = document.querySelector('[data-su="' + s + '"]'); const un = su && su.value === 's' ? 's' : 'm'; c.queue.units = Object.assign({}, c.queue.units, { [s]: un }); c.queue[s] = Math.max(10 / 60, (un === 's' ? (num || 10) / 60 : (num || 1))); } else if (s === 'qmode') c.queue.mode = t.value; else c[s] = (s === 'dailyCap' || s === 'hourlyCap' || s === 'staleMin') ? Math.max(1, num || 1) : num; });
    }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.a === 'pickf' && draft) { const n = t.dataset.n; const i = draft.funnel.findIndex(f => f.type === fTab && f.name === n); if (t.checked && i < 0) draft.funnel.push({ type: fTab, name: n }); if (!t.checked && i >= 0) draft.funnel.splice(i, 1); render(); }
    if (t.dataset.su) { const key = t.dataset.su; mutateCfg(c => { const q = c.queue; const un = t.value; q.units = Object.assign({}, q.units, { [key]: un }); }).then(() => render()); }
    if (t.dataset.a === 'tmode' && draft) { draft.trigger.mode = t.value; render(); }
    if (t.dataset.a === 'srad' && draft) { const sf = draft.safety = safeOf(draft); sf[t.dataset.k] = t.value; }
    if (t.dataset.sf && draft && t.tagName === 'SELECT') { const [sid, f] = t.dataset.sf.split('|'); const st = (draft.action.steps || []).find(x => x.id === sid); if (st) st[f] = t.value; }
    if (t.dataset.file && draft) {
      const st = (draft.action.steps || []).find(x => x.id === t.dataset.file); const f = t.files && t.files[0]; if (!st || !f) return;
      if (f.size > 16 * 1024 * 1024) { toast('⚠️ Arquivo grande demais (máx. 16 MB)'); return; }
      const rd = new FileReader(); rd.onload = () => { st.dataUrl = rd.result; st.name = f.name; st.mime = f.type; render(); }; rd.readAsDataURL(f);
    }
  });
  try { chrome.storage.onChanged.addListener((ch, ar) => { if (ar === 'local' && opened && (ch[K.enr] || ch[K.rt] || ch[K.cfg]) && view !== 'form' && view !== 'settings') load().then(render); }); } catch (e) {}
  window.WCRM_FU = { open };
})();
