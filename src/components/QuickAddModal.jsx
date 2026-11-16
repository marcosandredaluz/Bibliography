import React, { useState } from 'react';
import { Modal, Icone, useAviso } from './ui.jsx';

function detectarTipo(texto) {
  const s = String(texto || '').trim();
  if (!s) return null;
  const doi = s.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  if (doi) return { tipo: 'doi', valor: doi[0].replace(/[.,;:)\]}]+$/, '') };
  const pmidUrl = s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i);
  if (pmidUrl) return { tipo: 'pmid', valor: pmidUrl[1] };
  if (/^pmid\s*:?\s*\d{1,9}$/i.test(s) || /^\d{7,8}$/.test(s)) {
    return { tipo: 'pmid', valor: s.replace(/\D/g, '') };
  }
  const limpo = s.replace(/[^0-9Xx]/g, '');
  if ((limpo.length === 10 || limpo.length === 13) && /^[0-9-]+x?$/i.test(s.replace(/^isbn\s*:?\s*/i, ''))) {
    return { tipo: 'isbn', valor: limpo };
  }
  return { tipo: 'titulo', valor: s };
}

export default function QuickAddModal({ onFechar, onImportarCsl, onImportarPdfs, onRecarregar }) {
  const avisar = useAviso();
  const [entrada, setEntrada] = useState('');
  const [statusInicial, setStatusInicial] = useState('consultada');
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState([]);

  const submeter = async (e) => {
    e.preventDefault();
    const det = detectarTipo(entrada);
    if (!det) return;
    setCarregando(true);
    setResultados([]);
    try {
      if (det.tipo === 'doi') {
        const csl = await window.api.meta.doi(det.valor);
        await onImportarCsl(csl, statusInicial);
        onFechar();
      } else if (det.tipo === 'pmid') {
        const csl = await window.api.meta.pmid(det.valor);
        await onImportarCsl(csl, statusInicial);
        onFechar();
      } else if (det.tipo === 'isbn') {
        const csl = await window.api.meta.isbn(det.valor);
        await onImportarCsl(csl, statusInicial);
        onFechar();
      } else {
        const lista = await window.api.meta.buscar(det.valor);
        setResultados(lista);
        if (!lista.length) avisar('Nenhum resultado encontrado para este título.', 'info');
      }
    } catch (err) {
      avisar(err.message, 'erro');
    } finally {
      setCarregando(false);
    }
  };

  const importarDoResultado = async (r) => {
    setCarregando(true);
    try {
      const csl = await window.api.meta.doi(r.doi);
      await onImportarCsl(csl, statusInicial);
      avisar(`Importado: ${r.titulo.slice(0, 60)}…`, 'ok');
    } catch (err) {
      avisar(err.message, 'erro');
    } finally {
      setCarregando(false);
    }
  };

  const criarEmBranco = async () => {
    await onImportarCsl({ type: 'article-journal', title: entrada.trim() || 'Nova referência' }, statusInicial);
    onFechar();
  };

  const escolherPdfs = async () => {
    const caminhos = await window.api.dialogo.escolherPdfs();
    if (caminhos?.length) {
      onFechar();
      await onImportarPdfs(caminhos, statusInicial);
    }
  };

  const escolherPastaComPdfs = async () => {
    const caminhos = await window.api.dialogo.escolherPastaComPdfs();
    if (caminhos?.length) {
      onFechar();
      await onImportarPdfs(caminhos, statusInicial);
    } else if (caminhos) {
      avisar('Nenhum arquivo .pdf encontrado nessa pasta.', 'info');
    }
  };

  return (
    <Modal titulo="Adicionar referência" onFechar={onFechar} largura={640}>
      <form onSubmit={submeter} className="form-rapido">
        <label className="campo">
          <span className="campo-rotulo">
            Cole um DOI, PMID (PubMed), link do PubMed, ISBN de livro ou digite palavras do título
          </span>
          <div className="linha-form">
            <input
              autoFocus
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              placeholder="Ex.: 10.1056/NEJMoa2034577  ou  33301246  ou  9788535902778  ou  título do artigo…"
            />
            <button type="submit" className="btn primario" disabled={carregando || !entrada.trim()}>
              <Icone nome="search" tam={15} /> {carregando ? 'Buscando…' : 'Buscar / Importar'}
            </button>
          </div>
        </label>

        <div className="linha-opcoes-rapido">
          <label className="campo-inline">
            <span>Entrar como:</span>
            <select value={statusInicial} onChange={(e) => setStatusInicial(e.target.value)}>
              <option value="a_ler">A ler</option>
              <option value="consultada">Consultada (lida/fichada)</option>
              <option value="citada">Citada (usada no texto)</option>
            </select>
          </label>
          <div className="acoes-direita">
            <button type="button" className="btn secundario" onClick={escolherPdfs}>
              <Icone nome="upload" tam={14} /> Arquivos PDF
            </button>
            <button
              type="button"
              className="btn secundario"
              onClick={escolherPastaComPdfs}
              title="Escolhe uma pasta inteira do computador e importa todos os PDFs dentro dela"
            >
              <Icone nome="folder" tam={14} /> Pasta de PDFs
            </button>
            <button
              type="button"
              className="btn secundario"
              onClick={async () => {
                const res = await window.api.imp.escolherEImportar(statusInicial);
                if (res?.importadas) {
                  await onRecarregar?.();
                  avisar(`${res.importadas} referências importadas do arquivo RIS/BibTeX!`, 'ok');
                  onFechar();
                }
              }}
              title="Importar arquivo .ris, .nbib (PubMed) ou .bib (BibTeX) exportado das bases"
            >
              <Icone nome="file" tam={14} /> RIS / BibTeX
            </button>
            <button type="button" className="btn fantasma" onClick={criarEmBranco}>
              <Icone nome="plus" tam={14} /> Manual
            </button>
          </div>
        </div>
      </form>

      {resultados.length > 0 && (
        <div className="lista-resultados-modal">
          <h5>Resultados encontrados no Crossref — clique em Importar:</h5>
          {resultados.map((r) => (
            <div key={r.doi} className="item-resultado-modal">
              <div>
                <strong>{r.titulo}</strong>
                <div className="sub-meta">
                  {[r.autores, r.ano, r.fonte, r.doi].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn pequeno primario" onClick={() => importarDoResultado(r)} disabled={carregando}>
                Importar
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
