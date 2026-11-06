// WhatsApp CRM Pro v4.33 — ladder.js
// Aba 🪜 do painel: resumo do follow-up, diagnóstico, avisos com decisão, análise da conversa (IA) e backup.
// (a criação das regras de follow up fica na janela "Follow Up" — followup.js)
(function () {
  'use strict';
  const K_CFG = 'wcrm_cfg', K_ENR = 'wcrm_enr', K_RT = 'wcrm_rt';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sget = k => new Promise(r => chrome.storage.local.get(k, o => r(o[k])));
  const sset = (k, v) => new Promise(r => chrome.storage.local.set({ [k]: v }, r));
  const pad = n => String(n).padStart(2, '0');
  const fmt = ts => { if (!ts) return '—'; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const toastMsg = (m, bg) => { try { toast(m, bg); } catch (e) {} };
  const TEMP = { quente: ['🔥 Quente', '#ef4444'], morno: ['🌤️ Morno', '#f59e0b'], frio: ['❄️ Frio', '#60a5fa'], nao_lead: ['⛔ Não é lead', '#8696a0'] };
  const DEFQ = { mode: 'random', fixedMin: 5, minMin: 3, maxMin: 8 };

  let analysis = null, analyzing = false, rendered = false;
  async function getCfg() { const c = (await sget(K_CFG)) || {}; return Object.assign({ on: false, winStart: '09:00', winEnd: '19:00', dailyCap: 30, apiUrl: 'https://zambonini-crm.vercel.app', token: '', rules: [] }, c, { queue: Object.assign({}, DEFQ, c.queue || {}) }); }
  let cfgQ = Promise.resolve();
  function mutateCfg(fn) { const p = cfgQ.then(async () => { const c = await getCfg(); fn(c); await sset(K_CFG, c); return c; }); cfgQ = p.catch(() => {}); return p; }
  const curName = () => (typeof activeContact !== 'undefined' ? activeContact : null);

  async function render() {
    $('ladder-root').innerHTML = '<div id="lad-status"></div><div id="lad-diag"><div class="cfg-card"><button class="add-btn" style="width:100%;padding:8px;font-size:12px;" data-lad-act="diag">🩺 Diagnóstico: por que não está enviando?</button><div id="lad-diag-out" style="font-size:11px;line-height:1.7;color:#cfd6db;margin-top:8px;white-space:pre-wrap;"></div></div></div><div id="lad-alerts"></div><div id="lad-contact"></div><div id="lad-cfg"></div>';
    rendered = true; await renderLive(); renderContact(); renderCfg();
  }

  async function renderLive() {
    if (!rendered || !$('lad-status')) return;
    const cfg = await getCfg(); const rt = (await sget(K_RT)) || {}; const enrs = (await sget(K_ENR)) || [];
    const dk = (() => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; })();
    const sent = rt.day === dk ? (rt.sent || 0) : 0; const c = s => enrs.filter(e => e.state === s).length;
    const q = cfg.queue;
    $('lad-status').innerHTML = '<div class="cfg-card" style="border:1px solid ' + (cfg.on ? '#00a884' : '#2a3942') + ';">'
      + '<div style="display:flex;align-items:center;gap:10px;"><div style="flex:1;"><div style="color:#e9edef;font-weight:700;font-size:13px;">🪜 Follow-up automático</div>'
      + '<div style="color:#8696a0;font-size:11px;margin-top:3px;line-height:1.55;">Hoje: <strong style="color:#00a884;">' + sent + '/' + cfg.dailyCap + '</strong> · Janela ' + esc(cfg.winStart) + '–' + esc(cfg.winEnd)
      + '<br>Intervalo entre envios: ' + (q.mode === 'fixed' ? q.fixedMin + ' min (fixo)' : q.minMin + '–' + q.maxMin + ' min (aleatório)')
      + '<br>Fila: <strong style="color:#e9edef;">' + c('waiting') + '</strong> aguardando' + (c('stale') ? ' · <strong style="color:#f59e0b;">' + c('stale') + ' atrasados</strong>' : '') + (c('asked') ? ' · <strong style="color:#f87171;">' + c('asked') + ' esperando você</strong>' : '')
      + '<br>Estado: ' + esc(rt.state || '—') + (rt.nextSendAfter > Date.now() ? ' · próximo após ' + fmt(rt.nextSendAfter).slice(-5) : '') + '</div></div>'
      + '<label class="tog"><input type="checkbox" id="lad-on"' + (cfg.on ? ' checked' : '') + '><span class="tog-sl"></span></label></div>'
      + '<button class="btn" data-lad-act="openFU" style="margin-top:8px;">📋 Abrir Follow Up (criar regras, fila e ajustes)</button>'
      + '<button class="btn" data-lad-act="update" style="margin-top:8px;">🔄 Atualizar extensão (versão ' + (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '') + ')</button>'
      + '<div style="color:#8696a0;font-size:10px;margin-top:6px;">Só envia com o WhatsApp Web aberto. Todos os envios saem pela fila, um por vez.</div></div>';
    $('lad-on').addEventListener('change', async e => { await mutateCfg(c2 => { c2.on = e.target.checked; }); toastMsg(e.target.checked ? '▶ Envio automático LIGADO' : '⏸ Envio automático desligado'); renderLive(); });

    const alerts = (rt.alerts || []).filter(a => a.kind !== 'info');
    $('lad-alerts').innerHTML = alerts.length ? '<div class="lbl">Avisos</div>' + alerts.slice(0, 8).map(a => {
      const t = a.temp && TEMP[a.temp] ? '<span class="fu-tag" style="background:' + TEMP[a.temp][1] + '30;color:' + TEMP[a.temp][1] + ';">' + TEMP[a.temp][0] + (a.score != null ? ' · ' + a.score : '') + '</span> ' : '';
      const icon = a.kind === 'replied' ? '💬' : a.kind === 'label' ? '🏷️' : '⚠️';
      const asks = a.kind === 'replied' && a.ask && enrs.some(e => e.id === a.enrId && e.state === 'asked');
      return '<div class="fu-item" style="padding:9px 11px;"><div style="color:#e9edef;font-size:12px;font-weight:600;">' + icon + ' ' + esc(a.contact) + ' <span style="color:#8696a0;font-weight:400;font-size:10px;">' + fmt(a.at) + '</span></div>'
        + (a.kind === 'replied' ? '<div style="color:#f59e0b;font-size:10px;margin:2px 0;">Respondeu antes do disparo — envio pausado</div>' : '')
        + '<div style="color:#aebac1;font-size:11px;margin:3px 0;">' + t + esc((a.text || '').slice(0, 200)) + '</div>'
        + (a.resumo ? '<div style="color:#8696a0;font-size:11px;line-height:1.4;margin:3px 0;">' + esc(a.resumo) + '</div>' : '')
        + (a.suggestion ? '<div class="mc-full-text" style="margin-top:4px;">' + esc(a.suggestion) + '</div>' : '')
        + '<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">'
        + (asks ? '<button class="send-btn" data-lad-act="decide" data-c="keep" data-id="' + a.enrId + '">Manter</button><button class="edit-btn" data-lad-act="decide" data-c="reset" data-id="' + a.enrId + '">↻ Resetar tempo</button><button class="edit-btn" data-lad-act="decide" data-c="cancel" data-id="' + a.enrId + '">Cancelar</button>' : '')
        + (a.suggestion ? '<button class="edit-btn" data-lad-act="useSug" data-contact="' + esc(a.contact) + '" data-sug="' + esc(a.suggestion) + '">💬 Abrir e preencher</button>' : '')
        + '<button class="edit-btn" data-lad-act="dismiss" data-id="' + a.id + '">Dispensar</button></div></div>';
    }).join('') : '';
  }

  function renderContact() {
    const el = $('lad-contact'); if (!el) return;
    const name = curName(); let ai = '';
    if (analyzing) ai = '<div class="info-box">⏳ Lendo a conversa e analisando...</div>';
    else if (analysis && analysis.error) ai = '<div class="info-box" style="color:#f87171;">' + esc(analysis.error) + '</div>';
    else if (analysis && analysis.a) {
      const a = analysis.a, t = TEMP[a.temperatura] || ['?', '#8696a0'];
      ai = '<div class="mc" style="border-color:' + t[1] + '60;"><div style="display:flex;gap:8px;align-items:center;margin-bottom:5px;"><span class="fu-tag" style="background:' + t[1] + '30;color:' + t[1] + ';font-size:12px;">' + t[0] + '</span><span style="color:#8696a0;font-size:11px;">chance de fechar: <strong style="color:#e9edef;">' + esc(a.pontuacao) + '</strong>/100</span></div>'
        + '<div style="color:#aebac1;font-size:11px;line-height:1.5;margin-bottom:5px;">' + esc(a.resumo) + '</div>'
        + '<div style="color:#8696a0;font-size:11px;margin-bottom:5px;"><strong style="color:#aebac1;">Próximo passo:</strong> ' + esc(a.proximo_passo) + ' <span class="fu-tag">' + esc(String(a.quando_fazer_followup).replace(/_/g, ' ')) + '</span></div>'
        + (a.mensagem_followup ? '<div class="lbl" style="margin-top:6px;">Sugestão de mensagem</div><textarea class="ft" id="lad-sug" style="min-height:70px;">' + esc(a.mensagem_followup) + '</textarea><div style="display:flex;gap:5px;margin-top:5px;"><button class="send-btn" data-lad-act="fillSug">💬 Preencher na conversa</button><button class="edit-btn" data-lad-act="copySug">📋 Copiar</button></div>' : '') + '</div>';
    }
    el.innerHTML = '<div class="lbl">Contato aberto</div><div class="cfg-card"><div style="color:#e9edef;font-size:12px;font-weight:600;margin-bottom:7px;">👤 ' + esc(name || 'Nenhum contato aberto no WhatsApp') + '</div>'
      + '<button class="btn outline" data-lad-act="analyze" style="margin-top:0;">🌡️ Analisar com IA (quente/frio + sugestão)</button></div>' + ai;
  }

  async function renderCfg() {
    const el = $('lad-cfg'); if (!el) return; const cfg = await getCfg();
    el.innerHTML = '<div class="lbl">Agente de IA (CRM)</div>'
      + '<div class="cfg-card"><div class="cfg-lbl2">Endereço do CRM</div><input class="fi" data-cfg="apiUrl" value="' + esc(cfg.apiUrl) + '" style="margin-bottom:6px;"><div class="cfg-lbl2">Token da extensão (EXT_TOKEN da Vercel)</div><input class="fi" type="password" data-cfg="token" value="' + esc(cfg.token) + '" placeholder="cole o token aqui"></div>'
      + '<div class="lbl">Backup dos dados</div>'
      + '<div class="cfg-card"><div style="color:#8696a0;font-size:11px;line-height:1.5;margin-bottom:6px;">Tudo fica salvo no Chrome e um arquivo de backup é criado todo dia em <strong style="color:#e9edef;">Downloads/WCRM-backup</strong>.</div>'
      + '<div style="display:flex;gap:6px;"><button class="btn outline sm" data-lad-act="backupNow" style="margin-top:0;flex:1;">💾 Salvar backup agora</button><button class="btn outline sm" data-lad-act="restorePick" style="margin-top:0;flex:1;">📂 Restaurar backup</button></div>'
      + '<input type="file" id="lad-restore-file" accept=".json" style="display:none"></div>'
      + '<div class="lbl">Testar etiqueta</div>'
      + '<div class="cfg-card"><div style="color:#8696a0;font-size:11px;margin-bottom:6px;">Aplica/remove uma etiqueta na conversa aberta.</div>'
      + '<div style="display:flex;gap:6px;"><input class="fi" id="lad-tl-add" placeholder="pôr etiqueta"><input class="fi" id="lad-tl-rem" placeholder="tirar etiqueta"></div>'
      + '<button class="btn outline" data-lad-act="testLabel" style="margin-top:6px;">🏷️ Testar agora</button><div id="lad-tl-res" style="color:#8696a0;font-size:11px;margin-top:5px;"></div></div>';
  }

  document.addEventListener('input', async e => {
    if (!e.target.closest || !e.target.closest('#ladder-root')) return;
    const k = e.target.dataset.cfg; if (k) await mutateCfg(c => { c[k] = e.target.value; });
  });
  document.addEventListener('change', async e => {
    if (!e.target || e.target.id !== 'lad-restore-file') return;
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.state) await sset('wcrm_state', j.state); if (j.cfg) await sset(K_CFG, j.cfg); if (j.enr) await sset(K_ENR, j.enr);
      toastMsg('✅ Backup restaurado — recarregando…'); setTimeout(() => location.reload(), 900);
    } catch (err) { toastMsg('❌ Arquivo de backup inválido', '#e74c3c'); }
  });

  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-lad-act]'); if (!b || !b.closest('#ladder-root')) return;
    const act = b.dataset.ladAct, id = b.dataset.id;
    if (act === 'update') { try { chrome.runtime.sendMessage({ type: 'OPEN_UPDATER' }); } catch (e) { window.open(chrome.runtime.getURL('update.html')); } return; }
    if (act === 'openFU') { window.parent.postMessage({ type: 'OPEN_FOLLOWUP' }, '*'); return; }
    if (act === 'decide') { window.parent.postMessage({ type: 'ENGINE_DECIDE', id, choice: b.dataset.c }, '*'); setTimeout(renderLive, 500); return; }
    if (act === 'dismiss') { const r = (await sget(K_RT)) || {}; r.alerts = (r.alerts || []).filter(a => a.id !== id); await sset(K_RT, r); renderLive(); return; }
    if (act === 'useSug') {
      const contact = b.dataset.contact, msg = b.dataset.sug;
      window.parent.postMessage({ type: 'OPEN_CONTACT', contact }, '*');
      setTimeout(() => window.parent.postMessage({ type: 'PREFILL', text: msg }, '*'), 1200);
      toastMsg('💬 Abrindo ' + contact + '...'); return;
    }
    if (act === 'fillSug') { const t = $('lad-sug'); if (t) { window.parent.postMessage({ type: 'PREFILL', text: t.value }, '*'); toastMsg('💬 Sugestão colocada na caixa de texto'); } return; }
    if (act === 'copySug') { const t = $('lad-sug'); if (t) { navigator.clipboard.writeText(t.value).then(() => toastMsg('📋 Copiado')).catch(() => { t.select(); document.execCommand('copy'); toastMsg('📋 Copiado'); }); } return; }
    if (act === 'analyze') {
      const cfg = await getCfg();
      if (!cfg.token) { analysis = { error: 'Falta o token da extensão. Role até "Agente de IA (CRM)" e cole o EXT_TOKEN.' }; renderContact(); return; }
      analyzing = true; analysis = null; renderContact();
      window.parent.postMessage({ type: 'GET_CHAT_MESSAGES' }, '*'); return;
    }
    if (act === 'diag') { $('lad-diag-out').textContent = '⏳ Verificando...'; window.parent.postMessage({ type: 'ENGINE_DIAG' }, '*'); return; }
    if (act === 'backupNow') { try { chrome.runtime.sendMessage({ type: 'BACKUP_NOW' }); } catch (err) {} toastMsg('💾 Backup salvo em Downloads/WCRM-backup'); return; }
    if (act === 'restorePick') { const f = $('lad-restore-file'); if (f) f.click(); return; }
    if (act === 'testLabel') { $('lad-tl-res').textContent = '⏳ Tentando...'; window.parent.postMessage({ type: 'ENGINE_TEST_LABEL', add: $('lad-tl-add').value.trim(), remove: $('lad-tl-rem').value.trim() }, '*'); return; }
  });

  window.addEventListener('message', async e => {
    const d = e.data || {};
    if (d.type === 'ENGINE_DIAG_RESULT') { const o = $('lad-diag-out'); if (o) o.textContent = (d.lines || []).join('\n'); }
    if (d.type === 'ENGINE_TEST_LABEL_RESULT') {
      const r = d.result || {}; const el = $('lad-tl-res');
      if (el) el.innerHTML = r.ok ? '<span style="color:#00a884;">✅ Pronto. Confira a etiqueta na conversa.</span>' : '<span style="color:#f87171;">❌ ' + esc(r.why || r.reason || 'falhou') + '</span>';
    }
    if (d.type === 'CHAT_MESSAGES' && analyzing) {
      const msgs = d.messages || [];
      if (!msgs.length) { analyzing = false; analysis = { error: 'Não consegui ler mensagens desta conversa. Abra uma conversa e tente de novo.' }; renderContact(); return; }
      const cfg = await getCfg();
      try {
        const r = await fetch(cfg.apiUrl.replace(/\/$/, '') + '/api/ext/analyze', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.token },
          body: JSON.stringify({ name: d.name || curName() || undefined, messages: msgs.map(m => ({ from: m.from, text: m.text, at: m.at || undefined })) }),
        });
        const j = await r.json().catch(() => ({}));
        analysis = r.ok && j.analysis ? { a: j.analysis } : { error: j.error || ('Erro ' + r.status) };
      } catch (err) { analysis = { error: 'Não consegui falar com o CRM: ' + (err && err.message) }; }
      analyzing = false; renderContact();
    }
    if (d.type === 'CONTACT') renderContact();
    if (d.type === 'RUN_ANALYZE') { const btn = document.querySelector('#ladder-root [data-lad-act="analyze"]'); if (btn) btn.click(); }
  });

  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch[K_ENR] || ch[K_RT] || ch[K_CFG])) renderLive(); }); } catch (e) {}
  setInterval(() => { const s = $('sec-ladder'); if (s && s.classList.contains('active')) renderLive(); }, 15000);
  window.WCRM_LADDER = { render };
})();
