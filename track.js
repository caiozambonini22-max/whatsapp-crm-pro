// ════════════════════════════════════════════════════════════════
// Zambonini Track dentro do CRM — origem do lead, etapa e venda
// direto na conversa aberta. Os eventos vão pra Meta pelo servidor
// do Track (zambonini-track.vercel.app).
// ════════════════════════════════════════════════════════════════
(function () {
  const DEF_URL = 'https://zambonini-track.vercel.app';
  const STAGES = { contato: 'Fez contato', qualificado: 'Qualificado', checkout: 'Quase fechando', comprou: 'Comprou ✅', perdido: 'Perdido' };
  const ORIG = { meta_ads: '📢 Anúncio Meta', bio: '🔗 Link da bio', nao_rastreada: '❔ Não rastreada' };
  const ORDER = { contato: 0, qualificado: 1, checkout: 2, comprou: 3, perdido: -1 };
  let cfg = null, chat = { phone: '', push: '', name: '' }, lead = null, events = [], busy = false, showSale = false, reqSeq = 0, ask = null;
  const EVT = { qualificado: 'AddToCart', checkout: 'InitiateCheckout', comprou: 'Purchase' };
  const PREV = { qualificado: 'contato', checkout: 'qualificado', comprou: 'checkout' };
  let winId = null, ai = null, aiInfo = '', aiBusy = false, aiSeq = 0, sug = null, sugBusy = false;
  // abre a ficha completa do Track numa janela grande (valor, data/hora, produto, dados, conversa)
  function openWin(venda) {
    if (!chat.phone) return;
    const u = (cfg && cfg.url || DEF_URL) + '/?phone=' + encodeURIComponent(chat.phone) + '&push=' + encodeURIComponent(chat.push || chat.name || '') + (venda ? '&venda=1' : '');
    const w = 860, h = 920, left = Math.max(0, Math.round((screen.availWidth - w) / 2)), top = Math.max(0, Math.round((screen.availHeight - h) / 2));
    try {
      if (winId != null) chrome.windows.remove(winId, () => void chrome.runtime.lastError);
      chrome.windows.create({ url: u, type: 'popup', width: w, height: Math.min(h, screen.availHeight), left, top }, win => { winId = win && win.id; });
    } catch (e) { window.open(u, '_blank'); }
  }
  try {
    chrome.windows.onRemoved.addListener(async id => {
      if (id !== winId) return; winId = null;
      const antes = lead && lead.stage; await load();
      if (lead && lead.stage === 'comprou' && antes !== 'comprou') syncCrmStatus('comprou');
    });
  } catch (e) { }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fone = p => { const d = String(p || '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p; };
  const toLocal = s => { const d = s ? new Date(s) : new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const note = (m, col) => { try { if (typeof toast === 'function') return toast(m, col); } catch (e) { } console.log('[Track]', m); };

  // ---------- estilo ----------
  const st = document.createElement('style');
  st.textContent = `
  #trk{background:#111b21;border:1px solid #2a3942;border-radius:10px;padding:10px;margin:8px 0 4px}
  #trk .th{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12px;color:#e9edef}
  #trk .th span.sp{flex:1}#trk .mut{color:#8696a0;font-size:11px}
  #trk .pill{font-size:10px;padding:2px 7px;border-radius:99px;background:#2a3942;color:#aebac1;white-space:nowrap}
  #trk .pill.meta_ads{background:#0f2340;color:#7db3ff}#trk .pill.bio{background:#2a1740;color:#c4a1ff}#trk .pill.nao_rastreada{background:#3a2d0b;color:#f5b84b}
  #trk .pill.comprou{background:#0d2e1a;color:#25d366}#trk .pill.qualificado,#trk .pill.checkout{background:#0f2340;color:#7db3ff}
  #trk .ad{font-size:11px;color:#aebac1;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #trk .meter{display:flex;gap:3px;margin:6px 0 4px}#trk .meter i{flex:1;height:5px;border-radius:3px;background:#2a3942}#trk .meter i.on{background:#00a884}
  #trk .chips{display:flex;flex-wrap:wrap;gap:4px}#trk .chip{font-size:10px;padding:1px 6px;border-radius:99px;background:#2a3942;color:#8696a0}#trk .chip.on{background:#0d2e1a;color:#25d366}
  #trk .acts{display:flex;gap:5px;margin-top:8px}#trk .acts button{flex:1;padding:7px 4px;border-radius:8px;border:1px solid #2a3942;background:#202c33;color:#e9edef;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}
  #trk .acts button:hover{border-color:#00a884}#trk .acts button.on{background:#00a884;border-color:#00a884;color:#fff}#trk .acts button.sale{background:#00a884;border-color:#00a884;color:#fff}
  #trk .g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;margin-top:6px}#trk .g .full{grid-column:1/-1}
  #trk label{display:flex;flex-direction:column;gap:3px;font-size:10px;color:#8696a0}
  #trk input,#trk select{box-sizing:border-box;min-width:0;width:100%;background:#202c33;border:1px solid #2a3942;border-radius:7px;padding:6px 8px;color:#e9edef;font-size:12px;font-family:inherit;outline:none}
  #trk input:focus{border-color:#00a884}
  #trk .ev{font-size:10px;margin-top:6px}#trk .ok{color:#25d366}#trk .no{color:#f15c6d}
  #trk a{color:#53bdeb;cursor:pointer;font-size:11px}
  #trk .ask{margin-top:8px;padding:8px;border-radius:8px;background:#2a2410;border:1px solid #6b5a1e;font-size:11px;color:#f5d97a}
  #trk .ask.back{background:#1d2630;border-color:#2a3942;color:#aebac1}
  #trk .ask .acts{margin-top:6px}
  #trk-ai{background:#111b21;border:1px solid #2a3942;border-radius:10px;padding:10px;margin:6px 0 4px;font-size:12px;color:#d1d7db}
  #trk-ai .th{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12px;color:#e9edef}#trk-ai .sp{flex:1}
  #trk-ai .tmp{font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700}
  #trk-ai .tmp.quente{background:#3a1a0b;color:#ff8a4c}#trk-ai .tmp.morno{background:#3a320b;color:#f5d36b}#trk-ai .tmp.frio{background:#0f2340;color:#7db3ff}
  #trk-ai .k{color:#8696a0;font-size:10px;text-transform:uppercase;letter-spacing:.4px;margin-top:8px;font-weight:600}
  #trk-ai .fu{background:#0b3d2e;border:1px solid #155e46;border-radius:8px;padding:8px;margin-top:4px;white-space:pre-wrap;color:#e9edef}
  #trk-ai textarea{width:100%;box-sizing:border-box;background:#0b3d2e;border:1px solid #155e46;border-radius:8px;padding:8px;color:#e9edef;font:inherit;font-size:12px;min-height:70px;resize:vertical;margin-top:4px}
  #trk-ai .acts{display:flex;gap:5px;margin-top:6px}#trk-ai .acts button{flex:1;padding:7px 4px;border-radius:8px;border:1px solid #2a3942;background:#202c33;color:#e9edef;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}
  #trk-ai .acts button.pri{background:#00a884;border-color:#00a884;color:#fff}#trk-ai .mut{color:#8696a0;font-size:11px}#trk-ai a{color:#53bdeb;cursor:pointer;font-size:11px}
  #trk-ai .tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}#trk-ai .tag{font-size:10px;padding:1px 7px;border-radius:99px;background:#2a3942;color:#aebac1}`;
  document.head.appendChild(st);

  // ---------- caixa no painel do contato ----------
  function mount() {
    if (document.getElementById('trk')) return document.getElementById('trk');
    const card = document.querySelector('#sec-contact .cc-card'); if (!card) return null;
    const box = document.createElement('div'); box.id = 'trk';
    card.insertAdjacentElement('afterend', box);
    const aib = document.createElement('div'); aib.id = 'trk-ai'; box.insertAdjacentElement('afterend', aib);
    aib.addEventListener('click', onAiClick);
    box.addEventListener('click', onClick);
    box.addEventListener('input', e => { if (e.target.dataset.f) updScoreLive(); });
    box.addEventListener('focusout', e => { if (e.target.dataset.f === 'zip') viaCep(); });
    return box;
  }

  // ---------- API ----------
  async function api(path, body) {
    if (!cfg) return { error: 'Track não conectado' };
    try {
      const r = await fetch((cfg.url || DEF_URL) + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-admin-key': cfg.k }, body: body ? JSON.stringify(Object.assign({ a: cfg.a }, body)) : undefined });
      return await r.json();
    } catch (e) { return { error: 'Sem conexão com o Track' }; }
  }
  async function load() {
    if (!cfg || !chat.phone) { render(); return; }
    const my = ++reqSeq; busy = true; render();
    const r = await api('lead?a=' + encodeURIComponent(cfg.a) + '&phone=' + encodeURIComponent(chat.phone));
    if (my !== reqSeq) return; // trocou de conversa no meio
    busy = false;
    if (r.error) { lead = null; events = []; render(r.error); return; }
    lead = r.lead; events = r.events || []; render();
    loadAI(true);
  }

  // ---------- Agente de IA (caixa 🤖) ----------
  async function loadAI(onlyCache) {
    if (!cfg || !chat.phone) { ai = null; renderAI(); return; }
    const my = ++aiSeq; aiBusy = !onlyCache; aiInfo = ''; renderAI();
    const r = await api('ai/lead', { phone: chat.phone, only_cache: !!onlyCache, force: !onlyCache && !!ai });
    if (my !== aiSeq) return;
    aiBusy = false;
    if (r.error && !r.ai) { ai = null; aiInfo = r.error; renderAI(); return; }
    ai = r.ai; aiInfo = r.stale && r.new_msgs > 0 ? r.new_msgs + ' mensagem(ns) nova(s) desde a última análise' : (!r.ai && r.new_msgs ? 'Ainda não analisada' : '');
    renderAI();
  }
  function renderAI() {
    const el = document.getElementById('trk-ai'); if (!el) return;
    if (!cfg || !chat.phone) { el.style.display = 'none'; return; }
    el.style.display = '';
    const T = { quente: '🔥 Quente', morno: '🌤 Morno', frio: '❄️ Frio' };
    let h = `<div class="th">🤖 Agente IA ${ai ? `<span class="tmp ${esc(ai.temperature)}">${T[ai.temperature] || ai.temperature}</span>` : ''}<span class="sp"></span>${ai ? `<a data-ai="run" title="Analisar de novo">↻</a>` : ''}</div>`;
    if (aiBusy) h += `<div class="mut" style="margin-top:6px">Lendo a conversa inteira… (alguns segundos)</div>`;
    else if (!ai) h += `<div class="mut" style="margin-top:6px">${esc(aiInfo || 'Resumo, temperatura do lead e follow-up sugerido.')}</div><div class="acts"><button class="pri" data-ai="run">✨ Analisar conversa</button></div>`;
    else {
      if (ai.reason) h += `<div class="mut" style="margin-top:4px">${esc(ai.reason)}</div>`;
      h += `<div class="k">Resumo</div><div>${esc(ai.summary)}</div>`;
      if ((ai.interests || []).length) h += `<div class="k">Interesse</div><div class="tags">${ai.interests.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>`;
      if ((ai.objections || []).length) h += `<div class="k">Dúvidas / objeções</div><div class="tags">${ai.objections.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>`;
      if (ai.next_step) h += `<div class="k">Próximo passo</div><div>👉 ${esc(ai.next_step)}</div>`;
      if (ai.followup) h += `<div class="k">Follow-up sugerido (pode editar)</div><textarea id="trk-fu">${esc(ai.followup)}</textarea>
        <div class="acts"><button data-ai="copy">📋 Copiar</button><button class="pri" data-ai="insert">✍️ Inserir no WhatsApp</button></div>`;
      const ex = Object.keys(ai.extracted || {}).filter(k => ai.extracted[k]);
      if (ex.length && (!lead || lead.stage !== 'comprou')) h += `<div class="mut" style="margin-top:6px">🧾 Dados do cliente achados na conversa: ${ex.length} — entram no "✨ Preencher com IA" da venda</div>`;
      h += `<div class="mut" style="margin-top:6px">${aiInfo ? '⚠️ ' + esc(aiInfo) + ' · ' : ''}analisado ${new Date(ai.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>`;
    }
    // 💡 Sugerir resposta — só gasta IA quando clica
    h += `<div class="k" style="margin-top:10px">💡 Sugerir resposta</div>`;
    if (sugBusy) h += `<div class="mut">Escrevendo no seu tom…</div>`;
    else if (sug) h += `<div class="mut">${sug.kind === 'followup' ? 'Follow-up pra retomar a conversa' : 'Resposta pra última mensagem do cliente'} (pode editar):</div><textarea id="trk-sug">${esc(sug.text)}</textarea>
      <div class="acts"><button data-ai="sug-copy">📋 Copiar</button><button class="pri" data-ai="sug-insert">✍️ Inserir no WhatsApp</button></div>
      <div style="text-align:right;margin-top:4px"><a data-ai="sug-new">↻ Outra sugestão</a></div>`;
    else h += `<input id="trk-hint" placeholder="Orientação opcional: ex. oferecer frete grátis" style="width:100%;box-sizing:border-box;background:#202c33;border:1px solid #2a3942;border-radius:7px;padding:6px 8px;color:#e9edef;font-size:11px;margin-top:4px">
      <div class="acts"><button class="pri" data-ai="sug">💡 Sugerir resposta</button></div>`;
    el.innerHTML = h;
  }
  async function suggest() {
    const hint = (document.getElementById('trk-hint')?.value || (sug && sug.hint) || '').trim();
    const my = aiSeq; sugBusy = true; renderAI();
    const r = await api('ai/reply', { phone: chat.phone, hint });
    if (my !== aiSeq) return;
    sugBusy = false;
    if (r.error || !r.text) { sug = null; renderAI(); note('IA: ' + (r.error || 'sem sugestão'), '#e74c3c'); return; }
    sug = { text: r.text, kind: r.kind, hint }; renderAI();
  }
  function onAiClick(e) {
    const b = e.target.closest('[data-ai]'); if (!b) return;
    const a = b.dataset.ai;
    if (a === 'run') loadAI(false);
    if (a === 'sug' || a === 'sug-new') suggest();
    const st = () => (document.getElementById('trk-sug')?.value || '').trim();
    if (a === 'sug-copy') navigator.clipboard.writeText(st()).then(() => note('📋 Copiado'), () => note('Não consegui copiar'));
    if (a === 'sug-insert') { const t = st(); if (!t) return; if (/\[[^\]]+\]/.test(t)) note('⚠️ Tem campo entre [colchetes] pra você completar'); try { window.parent.postMessage({ type: 'PREFILL', text: t }, '*'); note('✍️ Colocado na caixa do WhatsApp — revise e envie'); sug = null; renderAI(); } catch (x) { } }
    const txt = () => (document.getElementById('trk-fu')?.value || '').trim();
    if (a === 'copy') { navigator.clipboard.writeText(txt()).then(() => note('📋 Copiado'), () => note('Não consegui copiar')); }
    if (a === 'insert') { const t = txt(); if (!t) return; try { window.parent.postMessage({ type: 'PREFILL', text: t }, '*'); note('✍️ Mensagem colocada na caixa do WhatsApp — revise e aperte enviar'); } catch (x) { } }
  }

  // ---------- força dos dados ----------
  function score(l) {
    const nm = String(l.full_name || l.push_name || '').trim().split(/\s+/).filter(Boolean);
    const it = [['Telefone', !!l.phone], ['Nome', !!nm[0]], ['Sobrenome', nm.length > 1], ['E-mail', !!l.email], ['CEP', !!l.zip], ['Cidade', !!l.city], ['UF', !!l.state], ['Nascimento', !!l.birth], ['Sexo', !!l.gender], ['Clique anúncio', !!l.ctwa_clid]];
    return { it, n: it.filter(x => x[1]).length };
  }
  function formVals() { const o = {}; document.querySelectorAll('#trk [data-f]').forEach(el => { o[el.dataset.f] = el.value; }); return o; }
  function updScoreLive() {
    const base = Object.assign({ phone: chat.phone, push_name: chat.push }, lead || {}, formVals());
    const s = score(base); const m = document.querySelector('#trk .meter'); const c = document.querySelector('#trk .chips'); const n = document.querySelector('#trk .scn');
    if (m) m.innerHTML = s.it.map(x => `<i class="${x[1] ? 'on' : ''}"></i>`).join('');
    if (c) c.innerHTML = s.it.map(x => `<span class="chip ${x[1] ? 'on' : ''}">${x[1] ? '✓' : '+'} ${x[0]}</span>`).join('');
    if (n) n.textContent = s.n + '/10';
  }

  // ---------- tela ----------
  function render(err) {
    const box = mount(); if (!box) return;
    if (!cfg) {
      box.innerHTML = `<div class="th">📍 Zambonini Track<span class="sp"></span></div>
        <div class="mut" style="margin:4px 0 6px">Conecte pra ver a origem do lead e marcar vendas que vão direto pra Meta.</div>
        <div class="g"><label>Conta<input id="trk-a" placeholder="zambonini"></label><label>Senha<input id="trk-k" type="password"></label></div>
        <div class="acts"><button class="sale" data-act="connect">Conectar</button></div>`;
      return;
    }
    if (!chat.phone) { box.innerHTML = `<div class="th">📍 Track<span class="sp"></span><a data-act="cfg">⚙</a></div><div class="mut">${chat.group ? 'Grupos não são rastreados.' : 'Abra uma conversa pra ver os dados do Track.'}</div>`; return; }
    if (busy && !lead) { box.innerHTML = `<div class="th">📍 Track<span class="sp"></span></div><div class="mut">Carregando…</div>`; return; }
    const l = lead || { phone: chat.phone, push_name: chat.push, origin: 'nao_rastreada', stage: 'contato' };
    const s = score(l);
    const stg = l.stage || 'contato';
    let h = `<div class="th">📍 Track <span class="pill ${esc(l.origin)}">${esc(ORIG[l.origin] || l.origin)}</span><span class="pill ${esc(stg)}">${esc(STAGES[stg] || stg)}</span><span class="sp"></span><a data-act="refresh" title="Atualizar">↻</a> <a data-act="cfg" title="Configurar">⚙</a></div>`;
    if (!lead) h += `<div class="mut" style="margin-top:4px">Conversa anterior ao Track (${esc(fone(chat.phone))}). Se marcar venda, ela é registrada e enviada pra Meta mesmo assim.</div>`;
    if (l.ad_title) h += `<div class="ad" title="${esc(l.ad_title)}">📢 ${esc(l.ad_title)}</div>`;
    if (lead && lead.stage === 'comprou') h += `<div class="mut" style="margin-top:4px">💰 Venda: <b style="color:#25d366">${brl(lead.sale_value)}</b>${lead.product ? ' · ' + esc(lead.product) : ''}</div>`;
    const auto = [lead && lead.zip && 'CEP ' + String(lead.zip).replace(/(\d{5})(\d{3})/, '$1-$2'), lead && lead.city && lead.city + (lead.state ? '/' + lead.state : ''), lead && lead.email && 'e-mail'].filter(Boolean);
    if (auto.length && stg !== 'comprou') h += `<div class="mut" style="margin-top:6px;color:#25d366">📍 Já capturado: ${esc(auto.join(' · '))} — vai junto na venda</div>`;
    h += `<div class="mut" style="margin-top:6px">Força dos dados pra Meta: <b class="scn">${s.n}/10</b></div><div class="meter"></div><div class="chips"></div>`;
    h += `<div class="acts">
      <button data-st="qualificado" class="${ORDER[stg] >= 1 ? 'on' : ''}">Qualificado</button>
      <button data-st="checkout" class="${ORDER[stg] >= 2 ? 'on' : ''}">Quase fechando</button>
      <button data-act="sale" class="sale">💰 ${stg === 'comprou' ? 'Editar venda' : 'Venda'}</button></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px">${stg === 'perdido' ? '<span class="mut">✗ Marcado como perdido</span>' : (stg !== 'comprou' ? '<a data-act="lost" style="color:#f15c6d">✗ Perdido</a>' : '<span></span>')}<a data-act="ficha">📋 Abrir ficha completa</a></div>`;
    if (ask) {
      h += ask.lost
        ? `<div class="ask back">✗ Marcar este lead como <b>Perdido</b>?<br>Não envia nada pra Meta — serve pros seus relatórios. Se ele voltar a comprar, é só marcar a venda normalmente.<div class="acts"><button data-act="no">Cancelar</button><button data-act="yes" style="background:#e74c3c;border-color:#e74c3c;color:#fff">Marcar perdido</button></div></div>`
        : ask.back
        ? `<div class="ask back">↩️ Voltar <b>${esc(STAGES[ask.from])}</b> para <b>${esc(STAGES[ask.to])}</b>?<br>Só corrige no Track — o evento que já foi pra Meta continua lá (a Meta não deixa apagar).<div class="acts"><button data-act="no">Cancelar</button><button data-act="yes">Voltar etapa</button></div></div>`
        : `<div class="ask">⚠️ Marcar como <b>${esc(STAGES[ask.to])}</b>?<br>Isso envia o evento <b>${EVT[ask.to]}</b> pra Meta. Depois de enviado, não dá pra apagar na Meta.<div class="acts"><button data-act="no">Cancelar</button><button data-act="yes" class="sale">Confirmar e enviar</button></div></div>`;
    }
    if (showSale) {
      const f = k => esc(l[k] == null ? '' : l[k]);
      h += `<div class="g">
        <label>Valor (R$) *<input data-f="sale_value" type="number" step="0.01" inputmode="decimal" value="${f('sale_value')}" placeholder="0,00"></label>
        <label>Data da venda<input data-f="sale_at" type="datetime-local" value="${toLocal(l.sale_at)}"></label>
        <label class="full">Produto<input data-f="product" value="${f('product')}" placeholder="Ex: X11 Pro 47mm"></label>
        <label class="full">Nome completo<input data-f="full_name" value="${esc(l.full_name || l.push_name || chat.push || '')}"></label>
        <label>CEP<input data-f="zip" inputmode="numeric" value="${f('zip')}"></label>
        <label>E-mail<input data-f="email" type="email" value="${f('email')}"></label>
        <label>Cidade<input data-f="city" value="${f('city')}"></label>
        <label>UF<input data-f="state" maxlength="2" value="${f('state')}"></label>
        <label>Nascimento<input data-f="birth" type="date" value="${f('birth')}"></label>
        <label>Sexo<select data-f="gender"><option value="">—</option><option value="f" ${l.gender === 'f' ? 'selected' : ''}>Feminino</option><option value="m" ${l.gender === 'm' ? 'selected' : ''}>Masculino</option></select></label>
      </div>
      <div class="acts"><button data-act="cancel">Cancelar</button><button data-act="save" class="sale">✅ Confirmar venda</button></div>`;
    }
    if (events.length) h += `<div class="ev">${events.slice(0, 3).map(e => `<div class="${e.ok ? 'ok' : 'no'}">${e.ok ? '✓' : '✗'} ${esc(e.event_name)} · ${new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>`).join('')}</div>`;
    if (err) h += `<div class="ev no">${esc(err)}</div>`;
    box.innerHTML = h; updScoreLive();
  }

  // ---------- ações ----------
  async function setStage(stage, extra) {
    if (busy) return;
    busy = true;
    const body = Object.assign({ phone: chat.phone, push_name: chat.push, stage }, extra || {});
    const r = await api('stage', body);
    busy = false;
    if (r.error) { note('Track: ' + r.error, '#e74c3c'); render(r.error); return false; }
    lead = r.lead; const c = r.capi || {};
    note(c.ok ? '✅ ' + STAGES[stage] + ' — evento enviado pra Meta' : c.skipped ? '✅ ' + STAGES[stage] + ' — ' + c.skipped : '⚠️ Salvo, mas a Meta recusou o evento', c.ok || c.skipped ? '#00a884' : '#e67e22');
    syncCrmStatus(stage);
    load(); return true;
  }
  // mantém o status do CRM igual ao do Track
  function syncCrmStatus(stage) {
    const map = { comprou: 'comprou', qualificado: 'negociando', checkout: 'negociando', contato: 'lead', perdido: 'inativo' };
    const sel = document.getElementById('cc-status'); if (!sel || !map[stage]) return;
    if (sel.value === map[stage] || sel.value === 'posVenda') return;
    sel.value = map[stage];
    try { if (typeof saveC === 'function') saveC(); } catch (e) { }
  }
  async function saveSale() {
    const v = formVals(); const val = Number(String(v.sale_value || '').replace(',', '.'));
    if (!(val > 0)) { note('Informe o valor da venda', '#e74c3c'); document.querySelector('#trk [data-f=sale_value]')?.focus(); return; }
    const body = { sale_value: val };
    if (v.sale_at) body.sale_at = new Date(v.sale_at).toISOString();
    for (const k of ['product', 'full_name', 'zip', 'email', 'city', 'state', 'birth', 'gender']) if (v[k]) body[k] = v[k];
    if (body.full_name && !lead?.full_name && body.full_name === (lead?.push_name || chat.push)) delete body.full_name; // só o apelido do WhatsApp
    if (lead && lead.stage === 'comprou') body.resend = false;
    const ok = await setStage('comprou', body);
    if (ok) { showSale = false; }
  }
  async function viaCep() {
    const el = document.querySelector('#trk [data-f=zip]'); const c = (el?.value || '').replace(/\D/g, ''); if (c.length !== 8) return;
    try { const r = await (await fetch('https://viacep.com.br/ws/' + c + '/json/')).json(); if (!r.erro) { const ci = document.querySelector('#trk [data-f=city]'), uf = document.querySelector('#trk [data-f=state]'); if (ci && !ci.value) ci.value = r.localidade; if (uf && !uf.value) uf.value = r.uf; updScoreLive(); } } catch (e) { }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-act],[data-st]'); if (!b) return;
    if (b.dataset.st) {
      const s = b.dataset.st, cur = (lead && lead.stage) || 'contato';
      if (ORDER[cur] >= ORDER[s] && cur !== 'perdido') {
        // clicou numa etapa já marcada -> oferece voltar pra etapa anterior a ela
        ask = { back: true, from: cur, to: PREV[s] };
      } else ask = { back: false, to: s };
      showSale = false; render(); return;
    }
    const a = b.dataset.act;
    if (a === 'connect') {
      const ac = (document.getElementById('trk-a').value || '').trim().toLowerCase(), k = document.getElementById('trk-k').value;
      if (!ac || !k) return note('Preencha conta e senha', '#e74c3c');
      cfg = { url: DEF_URL, a: ac, k };
      const r = await api('rules?a=' + encodeURIComponent(ac));
      if (r.error) { cfg = null; note('Track: ' + r.error, '#e74c3c'); return; }
      chrome.storage.local.set({ wcrm_track: cfg }); note('✅ Track conectado'); requestChat();
    }
    if (a === 'cfg') { if (confirm('Desconectar o Zambonini Track desta extensão?')) { cfg = null; chrome.storage.local.remove('wcrm_track'); render(); } }
    if (a === 'refresh') load();
    if (a === 'sale') { ask = null; showSale = false; render(); openWin(true); }
    if (a === 'ficha') openWin(false);
    if (a === 'lost') { ask = { lost: true, to: 'perdido' }; render(); }
    if (a === 'cancel') { showSale = false; render(); }
    if (a === 'no') { ask = null; render(); }
    if (a === 'yes' && ask) { const q = ask; ask = null; setStage(q.to); }
    if (a === 'save') saveSale();
  }

  // ---------- integração com o CRM ----------
  function requestChat() { try { window.parent.postMessage({ type: 'TRACK_GET_CHAT' }, '*'); } catch (e) { } }
  window.addEventListener('message', e => {
    if (e.data?.type !== 'TRACK_CHAT') return;
    const ph = String(e.data.phone || '').replace(/\D/g, '');
    const changed = ph !== chat.phone;
    chat = { phone: ph, push: e.data.push || '', name: e.data.name || '', group: !!e.data.group };
    if (changed) { lead = null; events = []; showSale = false; ask = null; ai = null; aiInfo = ''; sug = null; sugBusy = false; aiSeq++; renderAI(); }
    load();
  });
  // mudou o Status do contato no CRM -> acompanha no Track
  document.addEventListener('change', e => {
    if (e.target.id !== 'cc-status' || !cfg || !chat.phone) return;
    const v = e.target.value;
    if (v === 'comprou' && (!lead || lead.stage !== 'comprou')) { openWin(true); note('💰 Preencha a venda na janela do Track pra enviar pra Meta'); }
    if (v === 'inativo' && lead && lead.stage !== 'perdido' && lead.stage !== 'comprou') { ask = { lost: true, to: 'perdido' }; render(); }
    if (v === 'negociando' && (!lead || ORDER[lead.stage] < 1)) { ask = { back: false, to: 'qualificado' }; showSale = false; render(); }
  });

  chrome.storage.local.get('wcrm_track', o => { cfg = o.wcrm_track || null; render(); requestChat(); });
})();
