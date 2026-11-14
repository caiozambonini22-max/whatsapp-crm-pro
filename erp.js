// WhatsApp CRM Pro — erp.js: roda no Gestão Zambonini (ERP). Se a página foi aberta pelo CRM com #crm=..., injeta o preenchedor.
(function () {
  if (!/[#&]crm=/.test(location.hash)) return;
  const s = document.createElement('script'); s.src = chrome.runtime.getURL('erp-inject.js'); s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();
