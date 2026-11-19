import React, { useState } from 'react';
import { Icone } from '../ui.jsx';
import { useI18n } from '../../i18n.jsx';

export default function AuditUploadPanel({
  visivel,
  pastaDestino,
  escolherPastaDestino,
  resultado,
  baixarTodosPdfsParaPasta,
  baixandoLotePdfs,
  nomeArquivo,
  textoManuscrito,
  setTextoManuscrito,
  moduloAuditoria,
  setModuloAuditoria,
  buscarEBaixar,
  setBuscarEBaixar,
  somenteLeitura,
  setSomenteLeitura,
  executarAuditoria,
  rodando,
}) {
  const { tr } = useI18n();
  const [mostrarTextoBruto, setMostrarTextoBruto] = useState(false);

  if (!visivel) return null;

  const modos = [
    {
      id: 'todos',
      label: tr('Completa', 'Full Audit'),
      desc: tr(
        'Executa todas as verificações: citações × referências, autenticidade nas bases, páginas em PDF, similaridade literal, semântica e estilo.',
        'Full 6-tier audit: citations vs refs, database authenticity, PDF pages, literal overlap, semantic claim support, stylometry.'
      ),
    },
    {
      id: 'chamadas',
      label: tr('Citações × Referências', 'Citations vs. Refs'),
      desc: tr('Cruza chamadas no corpo do texto com a lista final sem baixar PDFs.', 'Cross-check body citations vs. reference list.'),
    },
    {
      id: 'autenticidade',
      label: tr('Bases & DOIs', 'Databases & DOIs'),
      desc: tr('Autentica referências em Crossref, PubMed, OpenAlex e repositórios.', 'Verify DOIs/PMIDs against Crossref, PubMed, OpenAlex.'),
    },
    {
      id: 'paginas',
      label: tr('Páginas & Aspas', 'Quotes & Pages'),
      desc: tr('Confere páginas indicadas e trechos entre aspas contra os PDFs originais.', 'Verify quoted text and page numbers against PDFs.'),
    },
    {
      id: 'plagio',
      label: tr('Similaridade', 'Literal Overlap'),
      desc: tr('Verifica blocos idênticos sem aspas em comparação com os PDFs.', 'Literal overlap screening against PDFs.'),
    },
    {
      id: 'semantica',
      label: tr('Semântica PDF', 'Semantic PDF'),
      desc: tr('Avalia aderência temática PT↔EN usando método lexical e modelo ONNX local.', 'Bilingual lexical/ONNX claim support audit.'),
    },
    {
      id: 'estilo_ia',
      label: tr('Estilo', 'Stylometry'),
      desc: tr('Analisa monotonia sintática e marcadores de redação padronizada.', 'Syntactic monotony and style indicators.'),
    },
  ];

  const textoBotaoRodar = rodando
    ? tr('Auditando…', 'Auditing…')
    : moduloAuditoria === 'todos'
    ? tr('Iniciar Auditoria', 'Start Audit')
    : `${tr('Auditar:', 'Run:')} ${modos.find((m) => m.id === moduloAuditoria)?.label || ''}`;

  const exibirCaixaTexto = !nomeArquivo || mostrarTextoBruto;
  const totalChars = (textoManuscrito || '').length;

  return (
    <div className="bloco-proxy audit-upload-panel">
      {/* Arquivo carregado (resumo limpo sem poluir a tela com texto bruto) */}
      {nomeArquivo && (
        <div className="audit-file-pill">
          <div className="audit-file-meta">
            <Icone nome="file" tam={16} />
            <div>
              <strong>{nomeArquivo}</strong>
              <span className="audit-file-size">
                {totalChars.toLocaleString('pt-BR')} {tr('caracteres carregados', 'characters loaded')}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn pequeno fantasma"
            onClick={() => setMostrarTextoBruto((v) => !v)}
          >
            {mostrarTextoBruto ? tr('Ocultar texto ▴', 'Hide text ▴') : tr('Ver ou editar texto ▾', 'View or edit text ▾')}
          </button>
        </div>
      )}

      {exibirCaixaTexto && (
        <label className="campo">
          <span className="campo-rotulo">
            {nomeArquivo
              ? tr('Texto extraído (editável se necessário):', 'Extracted text (editable if needed):')
              : tr('Cole o texto do manuscrito (com a lista de Referências ao final) ou carregue um arquivo acima:', 'Paste your manuscript text (with References at the end) or load a file above:')}
          </span>
          <textarea
            rows={nomeArquivo ? 5 : 6}
            value={textoManuscrito}
            onChange={(e) => setTextoManuscrito(e.target.value)}
            placeholder={tr(
              'Cole o texto completo com citações e a lista de Referências ao final…',
              'Paste complete text with citations and References section…'
            )}
          />
        </label>
      )}

      {/* Pasta de destino compacta */}
      <div className="audit-folder-compact">
        <div className="audit-folder-info">
          <Icone nome="folder" tam={15} />
          <span className="audit-folder-compact-label">{tr('Pasta dos PDFs:', 'PDF Folder:')}</span>
          <code className="audit-folder-compact-path">
            {pastaDestino || tr('biblioteca/pdfs (padrão)', 'biblioteca/pdfs (default)')}
          </code>
        </div>
        <div className="audit-folder-actions">
          <button
            type="button"
            className="btn fantasma pequeno"
            onClick={escolherPastaDestino}
          >
            {tr('Alterar…', 'Change…')}
          </button>
          {resultado?.refsMapeadas?.length > 0 && (
            <button
              type="button"
              className="btn secundario pequeno"
              onClick={baixarTodosPdfsParaPasta}
              disabled={baixandoLotePdfs}
            >
              {baixandoLotePdfs ? tr('Baixando…', 'Downloading…') : tr('Salvar PDFs', 'Save PDFs')}
            </button>
          )}
        </div>
      </div>

      {/* Escopo em chips limpos */}
      <div className="audit-scope-row">
        <span className="audit-scope-title">{tr('Escopo:', 'Scope:')}</span>
        <div className="audit-scope-buttons">
          {modos.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chip ${moduloAuditoria === m.id ? 'ativo' : ''}`}
              onClick={() => setModuloAuditoria(m.id)}
              title={m.desc}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Opções + Botão Principal */}
      <div className="linha-opcoes-rapido">
        <div className="audit-options-inline">
          <label className="campo-inline audit-checkbox-label">
            <input
              type="checkbox"
              checked={buscarEBaixar}
              onChange={(e) => setBuscarEBaixar(e.target.checked)}
              disabled={moduloAuditoria === 'chamadas' || moduloAuditoria === 'estilo_ia'}
            />
            <span style={{ opacity: moduloAuditoria === 'chamadas' || moduloAuditoria === 'estilo_ia' ? 0.55 : 1 }}>
              {tr('Consultar bases online e baixar PDFs gratuitos', 'Query online APIs & fetch open PDFs')}
            </span>
          </label>
          <label
            className="campo-inline audit-checkbox-label"
            title={tr(
              'Executa em snapshot isolado sem gravar JSONs ou PDFs novos na pasta da Biblioteca',
              'Run in isolated snapshot without writing JSONs or PDFs to disk'
            )}
          >
            <input
              type="checkbox"
              checked={somenteLeitura}
              onChange={(e) => setSomenteLeitura(e.target.checked)}
            />
            <span>{tr('Auditoria isolada (somente leitura)', 'Isolated audit (read-only)')}</span>
          </label>
        </div>
        <button type="button" className="btn primario" onClick={() => executarAuditoria(moduloAuditoria)} disabled={rodando}>
          <Icone nome="search" tam={15} /> {textoBotaoRodar}
        </button>
      </div>
    </div>
  );
}
