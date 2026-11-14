// Roda DENTRO da página do ERP: espera o ERP carregar, abre "Novo pedido" e preenche os dados do cliente vindos do CRM.
(function () {
  const m = location.hash.match(/[#&]crm=([^&]+)/); if (!m) return;
  let d; try { d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { return; }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }   // tira os dados da barra de endereço
  const toast = (t, c) => { try { if (typeof showToast === 'function') return showToast(t, c || 'gr'); } catch (e) { } console.log('[CRM]', t); };
  let tries = 0, started = false;
  const iv = setInterval(() => {
    if (++tries > 600) { clearInterval(iv); return; }   // ~5 min (dá tempo de digitar a senha do ERP)
    try {
      if (started) return;
      const ready = typeof state !== 'undefined' && state && Array.isArray(state.prods) && typeof openNewOrder === 'function' && typeof showOrderModal === 'function' && typeof newOrderDefaults === 'function' &&
        document.getElementById('main-content') && !document.getElementById('login-screen') && (document.getElementById('loading-screen') || {}).style && document.getElementById('loading-screen').style.display === 'none';
      if (!ready) return;
      started = true; clearInterval(iv);
      openNewOrder();
      const o = orderModalData; if (!o) return;
      const digits = x => String(x || '').replace(/\D/g, '');
      const ph = digits(d.ph).replace(/^55(?=\d{10,11}$)/, '');
      const fone = ph.length >= 10 ? '(' + ph.slice(0, 2) + ') ' + ph.slice(2, -4) + '-' + ph.slice(-4) : ph;
      // cliente que já comprou antes: reaproveita o que o ERP já sabe
      const prev = (state.orders || []).find(x => (digits(d.cpf) && digits(x.cpfCnpj) === digits(d.cpf)) || (ph && digits(x.phone).replace(/^55/, '') === ph));
      const map = { clientName: d.n, cpfCnpj: digits(d.cpf), phone: fone, email: d.em, street: d.st, streetNum: d.nu, complement: d.co, bairro: d.ba, cep: digits(d.cep), city: d.ci, state: (d.uf || '').toUpperCase() };
      Object.keys(map).forEach(k => { if (map[k]) o[k] = map[k]; else if (prev && prev[k] && !o[k]) o[k] = prev[k]; });
      if (digits(d.cpf).length === 14) o.tipoPessoa = 'juridica';
      showOrderModal();
      toast('📝 Cliente preenchido pelo CRM' + (prev ? ' (já era cliente — completei com o cadastro anterior)' : '') + '. Escolha o relógio e o valor.');
    } catch (e) { console.warn('[CRM→ERP]', e); }
  }, 500);
})();
