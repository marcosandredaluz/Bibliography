const ENDPOINT = 'http://127.0.0.1:23119/api/v1/clip';

const tokenInput = document.getElementById('token');
const statusEl = document.getElementById('status');
const btnClip = document.getElementById('btnClip');

chrome.storage.local.get(['bibLocalToken'], (res) => {
  if (res.bibLocalToken) tokenInput.value = res.bibLocalToken;
});

tokenInput.addEventListener('change', () => {
  chrome.storage.local.set({ bibLocalToken: tokenInput.value.trim() });
});

function extrairMetadadosDaAba() {
  const metas = [...document.querySelectorAll('meta')];
  const porNome = (alvo) =>
    metas
      .filter((m) => (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase() === alvo)
      .map((m) => (m.getAttribute('content') || '').trim())
      .filter(Boolean);

  const doiMeta = porNome('citation_doi')[0] || porNome('dc.identifier')[0] || '';
  const doiRegex = document.body?.innerText?.match(/\b10\.\d{4,9}\/[^\s"'<>]+/i)?.[0] || '';
  const titulo = porNome('citation_title')[0] || porNome('dc.title')[0] || document.title || '';
  const autores = (porNome('citation_author').length ? porNome('citation_author') : porNome('dc.creator')).map((n) => {
    const p = n.split(',').map((s) => s.trim());
    return p.length >= 2 ? { family: p[0], given: p.slice(1).join(' ') } : { literal: n };
  });

  return {
    source_url: window.location.href,
    detected_type: porNome('citation_journal_title').length ? 'article-journal' : 'webpage',
    doi: doiMeta || doiRegex || null,
    pmid: porNome('citation_pmid')[0] || null,
    title: titulo,
    authors: autores,
    container_title: porNome('citation_journal_title')[0] || null,
    pdf_url: porNome('citation_pdf_url')[0] || null,
    captured_at: new Date().toISOString(),
    extension_version: '1.0.0',
  };
}

btnClip.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    statusEl.textContent = '⚠ Informe o X-Bibliography-Local-Token copiado do app desktop.';
    return;
  }
  chrome.storage.local.set({ bibLocalToken: token });
  btnClip.disabled = true;
  statusEl.textContent = 'Extraindo metadados locais...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: payload }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extrairMetadadosDaAba,
    });

    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bibliography-Local-Token': token,
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || `HTTP ${resp.status}`);
    statusEl.textContent = `✓ ${data.dedupe_status === 'created' ? 'Salvo' : 'Já existente'}: ${data.reference_id}`;
  } catch (e) {
    statusEl.textContent = `Erro: ${e.message}`;
  } finally {
    btnClip.disabled = false;
  }
});
