// WhatsApp CRM Pro — clientbox.js (painel do CRM)
// Caixa "🧾 Dados do cliente": puxa nome/CPF/endereço/etc. direto da conversa (sem IA, sem servidor),
// deixa conferir/editar e manda pro ERP (Gestão Zambonini) com 1 clique: abre "Novo pedido" já preenchido.
(function () {
  'use strict';
  const ERP = 'https://gestao-zambonini.vercel.app/';
  const FIELDS = [['name', 'Nome completo', 1], ['cpf', 'CPF / CNPJ'], ['birth', 'Nascimento', 0, 'date'], ['email', 'E-mail'], ['phone', 'Telefone'], ['cep', 'CEP'], ['street', 'Rua / Avenida', 1], ['number', 'Número'], ['complement', 'Complemento / Ref.', 1], ['bairro', 'Bairro'], ['city', 'Cidade'], ['uf', 'UF']];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let chat = { phone: '', name: '', group: false }, cd = null, open = false, busy = false, seq = 0;
  const st = document.createElement('style');
  st.textContent = `#trk-cd{background:#111b21;border:1px solid #2a3942;border-radius:10px;padding:10px;margin:6px 0 4px;font-size:12px;color:#d1d7db}
  #trk-cd .th{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12px;color:#e9edef}#trk-cd .sp{flex:1}
  #trk-cd .mut{color:#8696a0;font-size:11px}#trk-cd a{color:#53bdeb;cursor:pointer;font-size:11px}
  #trk-cd .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}#trk-cd .chip{font-size:10px;padding:2px 7px;border-radius:99px;background:#2a3942;color:#8696a0}#trk-cd .chip.ok{background:#0b3d2e;color:#25d366}#trk-cd .chip.bad{background:#3a1a0b;color:#ff8a4c}
  #trk-cd .acts{display:flex;gap:5px;margin-top:8px}#trk-cd .acts button{flex:1;padding:7px 4px;border-radius:8px;border:1px solid #2a3942;background:#202c33;color:#e9edef;font-size:11px;font-weight:600;cursor:pointer}
  #trk-cd .acts button:hover{border-color:#00a884}#trk-cd .acts button.pri{background:#00a884;border-color:#00a884;color:#fff}
  #trk-cd .g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;margin-top:8px}#trk-cd .g .full{grid-column:1/-1}
  #trk-cd label{display:flex;flex-direction:column;gap:3px;font-size:10px;color:#8696a0}
  #trk-cd input{box-sizing:border-box;min-width:0;width:100%;background:#202c33;border:1px solid #2a3942;border-radius:7px;padding:6px 8px;color:#e9edef;font-size:12px;font-family:inherit;outline:none;color-scheme:dark}
  #trk-cd input:focus{border-color:#00a884}`;
  document.head.appendChild(st);

  const fone = p => { const d = String(p || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : d; };
  const fmtCpf = d => d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d;
  const toast2 = (m, c) => { try { if (typeof toast === 'function') return toast(m, c); } catch (e) { } };
  const sget = k => new Promise(r => chrome.storage.local.get(k, o => r(o[k])));
  const sset = (k, v) => new Promise(r => chrome.storage.local.set({ [k]: v }, r));

  function mount() {
    let box = document.getElementById('trk-cd'); if (box) return box;
    const anchor = document.getElementById('trk-ai') || document.getElementById('trk') || document.querySelector('#sec-contact .cc-card'); if (!anchor) return null;
    box = document.createElement('div'); box.id = 'trk-cd'; anchor.insertAdjacentElement('afterend', box);
    box.addEventListener('click', onClick); return box;
  }
  function have(k) { return !!(cd && cd[k]); }
  function summary() {
    const need = [['name', 'Nome'], ['cpf', 'CPF'], ['cep', 'CEP'], ['street', 'Rua'], ['number', 'Nº'], ['bairro', 'Bairro'], ['city', 'Cidade'], ['uf', 'UF'], ['email', 'E-mail'], ['birth', 'Nasc.']];
    return need.map(([k, l]) => `<span class="chip ${k === 'cpf' && cd && cd.cpfBad ? 'bad' : have(k) ? 'ok' : ''}">${have(k) ? (k === 'cpf' && cd.cpfBad ? '⚠ ' : '✓ ') : ''}${l}</span>`).join('');
  }
  function render() {
    const box = mount(); if (!box) return;
    if (!chat.phone || chat.group) { box.style.display = 'none'; return; } box.style.display = '';
    let h = `<div class="th">🧾 Dados do cliente<span class="sp"></span><a data-a="reload" title="Ler a conversa de novo">↻ Puxar</a></div>`;
    if (busy && !cd) h += `<div class="mut" style="margin-top:6px">Lendo a conversa…</div>`;
    else if (!cd || !cd.found) h += `<div class="mut" style="margin-top:6px">Não achei dados de cadastro nessa conversa (nome, CPF, endereço). Dá pra preencher na mão e mandar pro ERP.</div>`;
    else h += `<div class="chips">${summary()}</div>${cd.cpfBad ? '<div class="mut" style="color:#ff8a4c;margin-top:4px">⚠ O CPF informado não passa na validação — confira com o cliente.</div>' : ''}`;
    if (open) {
      const v = cd || {};
      h += `<div class="g">` + FIELDS.map(([k, l, full, ty]) => `<label class="${full ? 'full' : ''}">${l}<input data-c="${k}" ${ty ? `type="${ty}"` : ''} value="${esc(k === 'cpf' ? fmtCpf(v[k] || '') : v[k] || '')}"></label>`).join('') + `</div>`;
    }
    h += `<div class="acts"><button data-a="${open ? 'save' : 'edit'}">${open ? '💾 Salvar' : '✏️ Conferir / editar'}</button><button class="pri" data-a="erp">📝 Anotar no ERP</button></div>`;
    h += `<div class="acts" style="margin-top:5px"><button data-a="copy">📋 Copiar dados</button></div>`;
    box.innerHTML = h;
  }
  function readInputs() {
    const o = Object.assign({}, cd || {});
    document.querySelectorAll('#trk-cd [data-c]').forEach(i => { let v = i.value.trim(); const k = i.dataset.c; if (k === 'cpf' || k === 'cep' || k === 'phone') v = v.replace(/\D/g, ''); if (k === 'uf') v = v.toUpperCase().slice(0, 2); o[k] = v; });
    if (o.cpf && window.__wcrmClient) { o.cpfBad = !(o.cpf.length === 14 ? window.__wcrmClient.cnpjOk(o.cpf) : window.__wcrmClient.cpfOk(o.cpf)); } o.found = FIELDS.filter(([k]) => o[k]).length; o._edited = true;
    return o;
  }
  async function viaCep(o) {   // completa rua/bairro/cidade pelo CEP quando faltar
    if (!o.cep || o.cep.length !== 8 || (o.street && o.bairro && o.city && o.uf)) return;
    try { const r = await (await fetch('https://viacep.com.br/ws/' + o.cep + '/json/')).json(); if (r && !r.erro) { if (!o.street && r.logradouro) o.street = r.logradouro; if (!o.bairro && r.bairro) o.bairro = r.bairro; if (!o.city && r.localidade) o.city = r.localidade; if (!o.uf && r.uf) o.uf = r.uf; } } catch (e) { }
  }
  async function load() {
    if (!chat.phone || chat.group) { render(); return; }
    const my = ++seq, ph = chat.phone; busy = true; render();
    try { window.parent.postMessage({ type: 'TRACK_READ_CLIENT', seq: my }, '*'); } catch (e) { busy = false; render(); }
  }
  window.addEventListener('message', async e => {
    const d = e.data; if (!d) return;
    if (d.type === 'TRACK_CHAT') {
      const ph = String(d.phone || '').replace(/\D/g, ''); const changed = ph !== chat.phone;
      chat = { phone: ph, name: d.name || d.push || '', group: !!d.group };
      if (changed) { cd = null; open = false; setTimeout(load, 500); } else render();
      return;
    }
    if (d.type !== 'TRACK_CLIENT') return;
    const ph = chat.phone; let o = Object.assign({}, d.data || {});
    const saved = (await sget('wcrm_cdata')) || {};
    const s = saved[ph];
    if (s) Object.keys(s).forEach(k => { if (s[k] && !k.startsWith('_')) o[k] = s[k]; });   // o que você editou à mão vale mais
    if (!o.phone) o.phone = ph;
    if (!o.name && chat.name && !/^[+\d\s()-]+$/.test(chat.name)) o.name = chat.name;
    await viaCep(o);
    o.found = FIELDS.filter(([k]) => k !== 'phone' && o[k]).length;
    if (o.cpf && window.__wcrmClient && o.cpf.length === 11 && !s) o.cpfBad = !window.__wcrmClient.cpfOk(o.cpf);
    cd = o; busy = false; render();
  });
  function payload() {
    const o = open ? readInputs() : (cd || {});
    return { n: o.name || '', cpf: o.cpf || '', em: o.email || '', ph: o.phone || chat.phone || '', st: o.street || '', nu: o.number || '', co: o.complement || '', ba: o.bairro || '', cep: o.cep || '', ci: o.city || '', uf: o.uf || '', bd: o.birth || '' };
  }
  function openErp() {
    const p = payload();
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(p))));
    const url = ERP + '#crm=' + b64;
    try { chrome.tabs.create({ url }); } catch (e) { window.open(url, '_blank'); }
    toast2('📝 Abrindo o ERP com os dados do cliente…');
  }
  function text() {
    const o = open ? readInputs() : (cd || {});
    return ['Nome: ' + (o.name || ''), 'CPF: ' + fmtCpf(o.cpf || ''), 'Nascimento: ' + (o.birth ? o.birth.split('-').reverse().join('/') : ''), 'E-mail: ' + (o.email || ''), 'Telefone: ' + fone(o.phone || chat.phone), 'Endereço: ' + [o.street, o.number].filter(Boolean).join(', ') + (o.complement ? ' - ' + o.complement : ''), 'Bairro: ' + (o.bairro || ''), 'Cidade/UF: ' + [o.city, o.uf].filter(Boolean).join('/'), 'CEP: ' + (o.cep || '')].join('\n');
  }
  async function onClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'reload') { cd = null; load(); }
    if (a === 'edit') { open = true; render(); }
    if (a === 'save') {
      cd = readInputs(); open = false;
      const all = (await sget('wcrm_cdata')) || {}; all[chat.phone] = Object.assign({}, cd, { _at: Date.now() }); await sset('wcrm_cdata', all);
      render(); toast2('✅ Dados do cliente salvos');
    }
    if (a === 'erp') openErp();
    if (a === 'copy') { try { await navigator.clipboard.writeText(text()); toast2('📋 Dados copiados'); } catch (x) { toast2('Não consegui copiar', '#e74c3c'); } }
  }
  // pede a conversa assim que o painel carrega
  setInterval(() => { mount() && !document.getElementById('trk-cd').dataset.init && (document.getElementById('trk-cd').dataset.init = '1', render()); }, 1200);
  try { window.parent.postMessage({ type: 'TRACK_GET_CHAT' }, '*'); } catch (e) { }
})();
