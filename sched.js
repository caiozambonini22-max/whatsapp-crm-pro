// WhatsApp CRM Pro — sched.js
// "Mensagens Agendadas" (estilo WaSpeed): lista por conversa, formulário (texto / mídia / áudio / resposta rápida),
// recorrência, relatório e selo com a quantidade no menu lateral. O ENVIO de verdade é feito pelo engine.js (runSched).
(function () {
  'use strict';
  if (window.__wcrmSC) return; window.__wcrmSC = true;
  if (!document.body || !window.chrome || !chrome.storage) return;
  const KS = 'wcrm_sched';
  const W = () => window.__wcrm || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const sget = k => new Promise(r => chrome.storage.local.get(k, o => r(o[k])));
  const sset = (k, v) => new Promise(r => chrome.storage.local.set({ [k]: v }, r));
  const pad = n => String(n).padStart(2, '0');
  const toast = m => { try { W().toast && W().toast(m); } catch (e) {} };
  const me = () => { try { return (W().getDisplayName && W().getDisplayName()) || ''; } catch (e) { return ''; } };
  const DN = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dmy = ts => { const d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
  const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  let list = [], st = {}, view = 'list', scope = 'chat', draft = null, editId = null, shown = false, chatName = '', chatId = '';

  async function load() { const v = await sget(KS); list = Array.isArray(v) ? v : []; const s = await sget('wcrm_state'); st = s || {}; }
  function mutate(fn) {
    if (window.__wcrmMutateSched) return window.__wcrmMutateSched(fn);
    return (async () => { const l = (await sget(KS)) || []; const r = fn(l) || l; await sset(KS, r); return r; })();
  }
  const mine = it => norm(it.contact) === norm(chatName) || (chatId && it.cid === chatId);
  const active = it => ['pending', 'sending'].includes(it.state);
  const tipoLbl = it => it.kind === 'text' ? 'Texto' : it.kind === 'audio' ? 'Áudio' : it.kind === 'quick' ? 'Resposta rápida' : (it.media && it.media.type === 'video' ? 'Vídeo' : it.media && it.media.type === 'image' ? 'Imagem' : 'Mídia');
  const recLbl = r => { if (!r || !r.t || r.t === 'none') return '—'; if (r.t === 'daily') return 'Todo dia'; if (r.t === 'weekly') return r.days && r.days.length ? r.days.map(d => DN[d]).join(', ') : 'Toda semana'; if (r.t === 'monthly') return 'Todo mês'; if (r.t === 'yearly') return 'Todo ano'; if (r.t === 'custom') return r.days && r.days.length && r.unit === 'week' ? 'Semanal: ' + r.days.map(d => DN[d]).join(', ') : 'A cada ' + (r.every || 1) + ' ' + ({ day: 'dia(s)', week: 'semana(s)', month: 'mês(es)' }[r.unit] || 'dia(s)'); return '—'; };

  const css = document.createElement('style');
  css.textContent = `
  html.wcrm-bar #wcrm-sc{top:var(--wcrm-bh,46px) !important;} html.wcrm-left #wcrm-sc{left:56px !important;} html.wcrm-open #wcrm-sc{right:var(--wcrm-pw,380px) !important;}
  #wcrm-sc{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;font-family:'Segoe UI',Arial,sans-serif;}
  #wcrm-sc.show{display:flex;}
  #wcrm-sc .bx{width:min(860px,94vw);max-height:88vh;background:#14181c;color:#e9edef;border:1px solid #2a3238;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);}
  #wcrm-sc .hd{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #2a3238;flex-wrap:wrap;}
  #wcrm-sc .hd h2{margin:0;font-size:19px;font-weight:800;flex:1;min-width:180px;}
  #wcrm-sc .hb{position:relative;padding:7px 12px;border-radius:9px;border:1px solid #2a3238;background:#181d21;color:#cfd6db;font-size:12.5px;font-weight:600;cursor:pointer;}
  #wcrm-sc .hb:hover{border-color:#d4af37;color:#fff;} #wcrm-sc .hb.on{background:#d4af37;color:#111;border-color:#d4af37;}
  #wcrm-sc .hb b{position:absolute;top:-7px;right:-7px;background:#ef4444;color:#fff;border-radius:99px;font-size:10px;padding:1px 6px;}
  #wcrm-sc .bd{flex:1;overflow:auto;padding:16px 18px;}
  #wcrm-sc .empty{text-align:center;padding:48px 10px;color:#8a979f;font-size:15px;}
  #wcrm-sc .pri{padding:9px 20px;border-radius:9px;border:0;background:#d4af37;color:#111;font-weight:800;cursor:pointer;font-size:13.5px;} #wcrm-sc .pri:hover{filter:brightness(1.1);}
  #wcrm-sc .sec{padding:9px 20px;border-radius:9px;border:1px solid #2a3238;background:#181d21;color:#cfd6db;font-weight:600;cursor:pointer;font-size:13.5px;}
  #wcrm-sc table{width:100%;border-collapse:collapse;font-size:13px;} #wcrm-sc th{text-align:left;color:#8a979f;font-weight:600;padding:8px 8px;border-bottom:1px solid #2a3238;font-size:12px;}
  #wcrm-sc td{padding:10px 8px;border-bottom:1px solid #20272c;vertical-align:middle;} #wcrm-sc tr:hover td{background:#171c20;}
  #wcrm-sc .ib{border:0;background:transparent;cursor:pointer;font-size:16px;padding:3px 6px;border-radius:6px;} #wcrm-sc .ib:hover{background:#2a3238;}
  #wcrm-sc .pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:#26323a;color:#cfd6db;}
  #wcrm-sc .pill.ok{background:#12351f;color:#4ade80;} #wcrm-sc .pill.er{background:#3b1717;color:#f87171;} #wcrm-sc .pill.wa{background:#3a3010;color:#fbbf24;}
  #wcrm-sc label.f{display:block;font-size:12.5px;color:#aebac1;font-weight:600;margin:12px 0 5px;}
  #wcrm-sc input[type=text],#wcrm-sc input[type=date],#wcrm-sc input[type=time],#wcrm-sc input[type=number],#wcrm-sc select,#wcrm-sc textarea{width:100%;box-sizing:border-box;background:#0f1316;border:1px solid #2a3238;color:#e9edef;border-radius:9px;padding:9px 11px;font-size:13.5px;font-family:inherit;color-scheme:dark;}
  #wcrm-sc textarea{min-height:120px;resize:vertical;} #wcrm-sc input:focus,#wcrm-sc select:focus,#wcrm-sc textarea:focus{outline:0;border-color:#d4af37;}
  #wcrm-sc .tabs{display:flex;gap:4px;background:#0f1316;border-radius:10px;padding:4px;margin-top:12px;} #wcrm-sc .tabs div{flex:1;text-align:center;padding:8px 6px;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:700;color:#aebac1;} #wcrm-sc .tabs div.on{background:#d4af37;color:#111;}
  #wcrm-sc .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  #wcrm-sc .ft{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid #2a3238;}
  #wcrm-sc .dchips{display:flex;gap:6px;flex-wrap:wrap;} #wcrm-sc .dchips span{padding:6px 10px;border-radius:8px;border:1px solid #2a3238;cursor:pointer;font-size:12px;font-weight:700;color:#aebac1;} #wcrm-sc .dchips span.on{background:#d4af37;color:#111;border-color:#d4af37;}
  #wcrm-sc .hint{font-size:11.5px;color:#8a979f;margin-top:4px;} #wcrm-sc .who{font-size:12.5px;color:#d4af37;font-weight:700;}
  #wcrm-rail button.wcrm-sc-host{position:relative;} .wcrm-sb{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:99px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box;pointer-events:none;}
  `;
  document.documentElement.appendChild(css);
  const root = document.createElement('div'); root.id = 'wcrm-sc'; document.body.appendChild(root);
  root.addEventListener('mousedown', e => { if (e.target === root) close(); });

  function nowPlus(min) { const d = new Date(Date.now() + min * 60000); return { date: ymd(d), time: hhmm(d.getTime()) }; }
  function newDraft() { const n = nowPlus(10); return { title: '', kind: 'text', text: '', media: null, msgId: '', date: n.date, time: n.time, rec: { t: 'none' } }; }

  function render() {
    const pend = list.filter(it => (scope === 'all' || mine(it)) && active(it)).sort((a, b) => a.at - b.at);
    const fin = list.filter(it => (scope === 'all' || mine(it)) && !active(it)).sort((a, b) => (b.lastSentAt || b.at) - (a.lastSentAt || a.at));
    let h = '<div class="bx"><div class="hd"><h2>🕐 Mensagens Agendadas' + (scope === 'chat' && chatName ? ' <span class="who">· ' + esc(chatName) + '</span>' : scope === 'all' ? ' <span class="who">· todas as conversas</span>' : '') + '</h2>'
      + '<button class="hb' + (view === 'report' ? ' on' : '') + '" data-a="report">📊 Relatório' + (fin.length ? '<b>' + fin.length + '</b>' : '') + '</button>'
      + '<button class="hb' + (scope === 'all' ? ' on' : '') + '" data-a="scope">👁 Exibir Todos</button>'
      + '<button class="hb" data-a="gear" title="Limpar enviados">⚙</button>'
      + '<button class="hb" data-a="x">✕</button></div>';
    if (view === 'form') h += formHtml();
    else if (view === 'report') {
      h += '<div class="bd">' + (fin.length ? tableHtml(fin, true) : '<div class="empty">Nada no relatório ainda.<br><small>Mensagens enviadas, perdidas ou com erro aparecem aqui.</small></div>') + '</div>';
      h += '<div class="ft"><button class="sec" data-a="back">Voltar</button></div>';
    } else {
      h += '<div class="bd">' + (pend.length ? tableHtml(pend, false) : '<div class="empty">Nenhum agendamento encontrado<br><br><button class="pri" data-a="add">+ Adicionar</button></div>') + '</div>';
      if (pend.length) h += '<div class="ft"><button class="pri" data-a="add">+ Adicionar</button></div>';
    }
    root.innerHTML = h + '</div>';
    wireForm();
  }
  function tableHtml(arr, rep) {
    return '<table><thead><tr><th>Título</th><th>Cliente</th><th>Tipo</th><th>Data</th><th>Hora</th><th>Recorrência</th>' + (rep ? '<th>Status</th>' : '') + '<th style="text-align:right">Ações</th></tr></thead><tbody>'
      + arr.map(it => {
        const stt = it.state === 'sent' ? '<span class="pill ok">Enviado</span>' : it.state === 'error' ? '<span class="pill er" title="' + esc(it.lastErr || '') + '">Erro</span>' : it.state === 'missed' ? '<span class="pill wa">Perdido</span>' : '<span class="pill">' + esc(it.state) + '</span>';
        const dt = rep && it.lastSentAt ? it.lastSentAt : it.at;
        return '<tr data-id="' + esc(it.id) + '"><td>' + esc(it.title || '—') + '</td><td>' + esc(it.contact) + '</td><td>' + tipoLbl(it) + '</td><td>' + dmy(dt) + '</td><td>' + hhmm(dt) + '</td><td>' + esc(recLbl(it.rec)) + '</td>' + (rep ? '<td>' + stt + '</td>' : '')
          + '<td style="text-align:right;white-space:nowrap"><button class="ib" data-a="now" title="Enviar agora">🚀</button><button class="ib" data-a="edit" title="Editar">✏️</button><button class="ib" data-a="del" title="Excluir">🗑</button></td></tr>';
      }).join('') + '</tbody></table>' + (!rep && arr.some(it => it.missedAt) ? '<div class="hint">Algum agendamento passou do horário com o computador desligado — o envio automático só acontece até 6h depois.</div>' : '');
  }
  function formHtml() {
    const d = draft; const q = (st.msgs || []);
    const body = d.kind === 'text' ? '<label class="f">Mensagem</label><textarea id="sc-text" placeholder="Digite a mensagem… (aceita #primeiroNome)">' + esc(d.text) + '</textarea>'
      : d.kind === 'quick' ? '<label class="f">Mensagem rápida do CRM</label><select id="sc-q"><option value="">Escolher…</option>' + q.map(m => '<option value="' + esc(m.id) + '"' + (String(m.id) === String(d.msgId) ? ' selected' : '') + '>' + esc(m.label || m.id) + '</option>').join('') + '</select><div class="hint">Envia todas as ações dela (textos, mídias, áudios, esperas).</div>'
      : '<label class="f">' + (d.kind === 'audio' ? 'Áudio (vai como mensagem de voz)' : 'Imagem, vídeo ou documento') + '</label><input type="file" id="sc-file" accept="' + (d.kind === 'audio' ? 'audio/*' : 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt') + '"><div class="hint">' + (d.media ? '📎 ' + esc(d.media.name) + ' (' + Math.round((d.media.size || 0) / 1024) + ' KB)' : 'Nenhum arquivo escolhido') + '</div>'
        + (d.kind === 'audio' ? '' : '<label class="f">Legenda (opcional)</label><textarea id="sc-text" style="min-height:70px">' + esc(d.text) + '</textarea>');
    const r = d.rec || { t: 'none' };
    const opt = (v, l) => '<option value="' + v + '"' + (r.t === v ? ' selected' : '') + '>' + l + '</option>';
    const recSel = '<select id="sc-rec"><option value="none">Nenhuma selecionada…</option>' + opt('daily', 'Todo dia') + opt('weekly', 'Toda semana') + opt('monthly', 'Todo mês') + opt('yearly', 'Todo ano') + opt('custom', '➕ Adicionar recorrência personalizada') + '</select>';
    const uo = (v, l) => '<option value="' + v + '"' + (r.unit === v ? ' selected' : '') + '>' + l + '</option>';
    const cust = r.t === 'custom' ? '<div class="row2" style="margin-top:8px"><div><label class="f" style="margin-top:0">A cada</label><input type="number" id="sc-ev" min="1" max="365" value="' + (r.every || 1) + '"></div><div><label class="f" style="margin-top:0">Unidade</label><select id="sc-un">' + uo('day', 'dia(s)') + uo('week', 'semana(s)') + uo('month', 'mês(es)') + '</select></div></div>' : '';
    const days = (r.t === 'weekly' || (r.t === 'custom' && r.unit === 'week')) ? '<label class="f">Dias da semana (opcional)</label><div class="dchips">' + DN.map((n, i) => '<span data-dow="' + i + '" class="' + ((r.days || []).includes(i) ? 'on' : '') + '">' + n + '</span>').join('') + '</div>' : '';
    const until = r.t && r.t !== 'none' ? '<label class="f">Repetir até (opcional)</label><input type="date" id="sc-until" value="' + esc(r.until || '') + '">' : '';
    return '<div class="bd"><div class="who">Para: ' + esc(d.contact || chatName || '—') + '</div>'
      + '<label class="f">Título (opcional)</label><input type="text" id="sc-title" value="' + esc(d.title) + '" placeholder="Ex.: Cobrar retorno">'
      + '<div class="tabs"><div data-k="text" class="' + (d.kind === 'text' ? 'on' : '') + '">Criar texto</div><div data-k="media" class="' + (d.kind === 'media' ? 'on' : '') + '">Mídia</div><div data-k="audio" class="' + (d.kind === 'audio' ? 'on' : '') + '">Áudio</div><div data-k="quick" class="' + (d.kind === 'quick' ? 'on' : '') + '">Selecionar mensagem rápida</div></div>'
      + body
      + '<div class="row2"><div><label class="f">Data</label><input type="date" id="sc-date" value="' + esc(d.date) + '"></div><div><label class="f">Hora</label><input type="time" id="sc-time" value="' + esc(d.time) + '"></div></div>'
      + '<label class="f">Recorrência</label>' + recSel + cust + days + until
      + '</div><div class="ft"><button class="sec" data-a="cancel">Cancelar</button><button class="pri" data-a="save">' + (editId ? 'Salvar' : 'Criar') + '</button></div>';
  }
  function readForm() {
    const g = id => root.querySelector('#' + id);
    if (g('sc-title')) draft.title = g('sc-title').value;
    if (g('sc-text')) draft.text = g('sc-text').value;
    if (g('sc-q')) draft.msgId = g('sc-q').value;
    if (g('sc-date')) draft.date = g('sc-date').value;
    if (g('sc-time')) draft.time = g('sc-time').value;
    if (g('sc-rec')) { const t = g('sc-rec').value; if (t !== (draft.rec.t || 'none')) draft.rec = { t, every: 1, unit: 'day', days: [] }; }
    if (g('sc-ev')) draft.rec.every = Math.max(1, +g('sc-ev').value || 1);
    if (g('sc-un')) { const u = g('sc-un').value; if (u !== draft.rec.unit) { draft.rec.unit = u; draft.rec.days = []; } }
    if (g('sc-until')) draft.rec.until = g('sc-until').value || '';
  }
  function wireForm() {
    if (view !== 'form') return;
    root.querySelectorAll('.tabs div').forEach(t => t.addEventListener('click', () => { readForm(); const k = t.dataset.k; if (k !== draft.kind) { draft.kind = k; if (k !== 'media' && k !== 'audio') draft.media = null; else if (draft.media && ((k === 'audio') !== (draft.media.type === 'audio'))) draft.media = null; } render(); }));
    const sel = root.querySelector('#sc-rec'); if (sel) sel.addEventListener('change', () => { readForm(); render(); });
    const un = root.querySelector('#sc-un'); if (un) un.addEventListener('change', () => { readForm(); render(); });
    root.querySelectorAll('.dchips span').forEach(c => c.addEventListener('click', () => { readForm(); const i = +c.dataset.dow; const a = draft.rec.days || (draft.rec.days = []); const k = a.indexOf(i); if (k >= 0) a.splice(k, 1); else a.push(i); render(); }));
    const f = root.querySelector('#sc-file');
    if (f) f.addEventListener('change', () => {
      const file = f.files && f.files[0]; if (!file) return;
      if (file.size > 25 * 1024 * 1024) { toast('⚠️ Arquivo muito grande (máx. 25 MB)'); return; }
      const fr = new FileReader(); fr.onload = () => { readForm(); const mime = file.type || ''; draft.media = { dataUrl: fr.result, name: file.name, mime, size: file.size, type: draft.kind === 'audio' || /^audio/.test(mime) ? 'audio' : /^video/.test(mime) ? 'video' : /^image/.test(mime) ? 'image' : 'document' }; render(); }; fr.readAsDataURL(file);
    });
  }
  function close() { shown = false; root.classList.remove('show'); }
  async function open(opts) {
    opts = opts || {};
    await load();
    chatName = me(); chatId = '';
    try { if (chatName && W().bridgeOk && W().bridgeOk()) { const a = await W().bridgeCall('ACTIVE', {}, 2500); if (a && a.ok) chatId = a.id || ''; } } catch (e) {}
    scope = opts.all || !chatName ? 'all' : 'chat'; view = 'list'; draft = null; editId = null; shown = true; render(); root.classList.add('show');
    if (!chatName && !opts.all) toast('Abra uma conversa para agendar — mostrando todas');
  }
  async function save() {
    readForm(); const d = draft;
    const contact = d.contact || chatName; if (!contact) { toast('⚠️ Abra uma conversa primeiro'); return; }
    if (!d.date || !d.time) { toast('⚠️ Escolha data e hora'); return; }
    const at = new Date(d.date + 'T' + d.time + ':00').getTime();
    if (!(at > Date.now() + 20000)) { toast('⚠️ Escolha um horário no futuro'); return; }
    if (d.kind === 'text' && !d.text.trim()) { toast('⚠️ Digite a mensagem'); return; }
    if ((d.kind === 'media' || d.kind === 'audio') && !d.media) { toast('⚠️ Escolha o arquivo'); return; }
    if (d.kind === 'quick' && !d.msgId) { toast('⚠️ Escolha a mensagem rápida'); return; }
    const rec = Object.assign({}, d.rec); if (rec.t === 'custom' && rec.unit !== 'week') delete rec.days;
    const item = { title: d.title.trim(), contact, cid: d.cid || chatId || '', kind: d.kind, text: d.kind === 'quick' ? '' : d.text, media: d.kind === 'media' || d.kind === 'audio' ? d.media : null, msgId: d.kind === 'quick' ? d.msgId : '', at, rec, state: 'pending', fails: 0 };
    const eid = editId;
    if (eid) await mutate(l => { const x = l.find(y => y.id === eid); if (x) { Object.assign(x, item); delete x.lastErr; delete x.attempt; delete x.claim; delete x.retryAt; delete x.missedAt; } });
    else await mutate(l => { l.push(Object.assign({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), createdAt: Date.now() }, item)); });
    await load(); toast(eid ? '✅ Agendamento salvo' : '✅ Agendamento criado'); editId = null; draft = null; view = 'list'; render(); badge();
  }
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; const tr = b.closest('tr'); const id = tr && tr.dataset.id;
    if (a === 'x') return close();
    if (a === 'report') { view = view === 'report' ? 'list' : 'report'; return render(); }
    if (a === 'back' || a === 'cancel') { view = 'list'; draft = null; editId = null; return render(); }
    if (a === 'scope') { scope = scope === 'all' ? (chatName ? 'chat' : 'all') : 'all'; view = 'list'; return render(); }
    if (a === 'gear') { const n = list.filter(x => x.state === 'sent').length; if (!n) { toast('Nada para limpar'); return; } if (confirm('Apagar os ' + n + ' agendamentos já enviados do relatório?')) { await mutate(l => l.filter(x => x.state !== 'sent')); await load(); render(); badge(); } return; }
    if (a === 'add') { if (!chatName) { toast('⚠️ Abra uma conversa primeiro'); return; } draft = newDraft(); editId = null; view = 'form'; return render(); }
    if (a === 'save') return save();
    if (a === 'edit' && id) {
      const it = list.find(x => x.id === id); if (!it) return;
      const d = new Date(it.at > Date.now() ? it.at : Date.now() + 600000);
      draft = { title: it.title || '', kind: it.kind, text: it.text || '', media: it.media || null, msgId: it.msgId || '', date: ymd(d), time: hhmm(d.getTime()), rec: Object.assign({ t: 'none' }, it.rec || {}), contact: it.contact, cid: it.cid }; editId = id; view = 'form'; return render();
    }
    if (a === 'del' && id) { if (!confirm('Excluir este agendamento?')) return; await mutate(l => l.filter(x => x.id !== id)); await load(); render(); badge(); toast('🗑 Agendamento excluído'); return; }
    if (a === 'now' && id) {
      const it = list.find(x => x.id === id); if (!it) return;
      if (!confirm('Enviar agora para "' + it.contact + '"?')) return;
      toast('🚀 Enviando…'); window.postMessage({ type: 'SCHED_SEND_NOW', id }, '*');
    }
  });
  window.addEventListener('message', e => { const t = e.data && e.data.type; if (t === 'OPEN_SCHED_NEW') open(e.data); });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[KS]) { list = Array.isArray(ch[KS].newValue) ? ch[KS].newValue : []; if (shown && view !== 'form') render(); badge(); } });

  // ── selo com a quantidade no menu lateral (🕐 da conversa aberta) ──
  function badge() {
    const rail = document.getElementById('wcrm-rail'); if (!rail) return;
    const btn = [...rail.querySelectorAll('button')].find(x => /Agendar mensagem/.test(x.title || '')); if (!btn) return;
    btn.classList.add('wcrm-sc-host');
    let sb = btn.querySelector('.wcrm-sb'); if (!sb) { sb = document.createElement('span'); sb.className = 'wcrm-sb'; btn.appendChild(sb); }
    const nm = me(); const n = nm ? list.filter(it => active(it) && norm(it.contact) === norm(nm)).length : 0;
    sb.textContent = n; sb.style.display = n ? 'flex' : 'none';
  }
  load().then(badge);
  setInterval(badge, 2500);
})();
