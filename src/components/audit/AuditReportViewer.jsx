import React from 'react';
import { Icone } from '../ui.jsx';

export default function AuditReportViewer({
  visivel,
  instrucaoExtraIa,
  setInstrucaoExtraIa,
  textoRelatorio,
  onCopiarTudo,
  onFechar,
}) {
  if (!visivel) return null;

  return (
    <div className="bloco-cofre audit-report-viewer">
      <div className="audit-report-header">
        <div>
          <h4>Relatório Estruturado de Revisão</h4>
          <p className="dica-texto">
            Inclui citações, parágrafos (§), linhas e diagnósticos para revisão manual ou assistida.
          </p>
        </div>
        <div className="audit-report-actions">
          <button type="button" className="btn pequeno primario" onClick={onCopiarTudo}>
            <Icone nome="copy" tam={13} /> Copiar Relatório
          </button>
          <button type="button" className="btn pequeno fantasma" onClick={onFechar}>
            Fechar ×
          </button>
        </div>
      </div>

      <label className="campo audit-report-field">
        <span className="campo-rotulo">Instrução no topo do relatório (editável):</span>
        <input
          value={instrucaoExtraIa}
          onChange={(e) => setInstrucaoExtraIa(e.target.value)}
        />
      </label>

      <textarea
        rows={12}
        readOnly
        value={textoRelatorio}
        className="audit-prompt-textarea"
      />
    </div>
  );
}
