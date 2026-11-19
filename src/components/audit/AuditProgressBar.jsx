import React from 'react';
import { useI18n } from '../../i18n.jsx';

export default function AuditProgressBar({ rodando, progresso, etapa, onCancelar }) {
  const { tr } = useI18n();
  if (!rodando) return null;

  const pct = Math.max(5, Math.min(100, progresso?.porcentagem || 5));

  return (
    <div
      className="card-progresso-auditoria"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div className="progresso-cabecalho">
        <div className="progresso-fase-titulo">
          <span className="progresso-pulse-ativo" />
          <span>{progresso?.mensagem || etapa || tr('Executando auditoria do manuscrito…', 'Auditing manuscript…')}</span>
        </div>
        <div className="audit-progress-meta">
          {progresso?.total > 0 && (
            <span className="tag-mini audit-progress-counter">
              {progresso.atual} / {progresso.total}
            </span>
          )}
          <span className="progresso-badge-porcentagem">{pct}%</span>
          {onCancelar && (
            <button
              type="button"
              className="btn pequeno secundario"
              onClick={onCancelar}
              title={tr('Interromper auditoria em andamento', 'Cancel running audit')}
            >
              {tr('Cancelar', 'Cancel')}
            </button>
          )}
        </div>
      </div>

      <div className="progresso-trilho">
        <div className="progresso-preenchimento" style={{ width: `${pct}%` }} />
      </div>

      <div className="progresso-rodape">
        <div className="progresso-detalhe-item" title={progresso?.detalhe}>
          <span>{progresso?.detalhe || tr('Processando localmente…', 'Processing locally…')}</span>
        </div>
      </div>
    </div>
  );
}
