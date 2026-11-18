import React, { useEffect, useMemo, useState } from 'react';
import { autoresResumo, ano, semHtml } from '../lib/csl.js';
import { useI18n } from '../i18n.jsx';
import { useAviso } from './ui.jsx';

const ROB_DOMAINS = {
  ROB2: [
    { id: 'D1', pt: 'Randomização', en: 'Randomization process' },
    { id: 'D2', pt: 'Desvios intervenções', en: 'Deviations from interventions' },
    { id: 'D3', pt: 'Dados ausentes', en: 'Missing outcome data' },
    { id: 'D4', pt: 'Mensuração desfecho', en: 'Measurement of outcome' },
    { id: 'D5', pt: 'Seleção resultado', en: 'Selection of reported result' },
  ],
  'ROBINS-I': [
    { id: 'D1', pt: 'Confundimento', en: 'Confounding' },
    { id: 'D2', pt: 'Seleção participantes', en: 'Selection of participants' },
    { id: 'D3', pt: 'Classif. intervenções', en: 'Classification of interventions' },
    { id: 'D4', pt: 'Desvios intervenções', en: 'Deviations from interventions' },
    { id: 'D5', pt: 'Dados ausentes', en: 'Missing data' },
    { id: 'D6', pt: 'Mensuração desfechos', en: 'Measurement of outcomes' },
    { id: 'D7', pt: 'Seleção resultado', en: 'Selection of reported result' },
  ],
};

// Paletas baseadas na especificação aberta do mcguinlu/robvis (MIT) — sem copiar código R
const PALETTES = {
  cochrane: {
    low: { fill: '#02C100', symbol: '+', text: '#052e16', labelPt: 'Baixo risco', labelEn: 'Low risk' },
    some_concerns: { fill: '#E2DF07', symbol: '−', text: '#422006', labelPt: 'Algumas preocupações', labelEn: 'Some concerns' },
    moderate: { fill: '#E2DF07', symbol: '−', text: '#422006', labelPt: 'Moderado', labelEn: 'Moderate' },
    high: { fill: '#BF0000', symbol: '✕', text: '#ffffff', labelPt: 'Alto risco', labelEn: 'High risk' },
    serious: { fill: '#BF0000', symbol: '✕', text: '#ffffff', labelPt: 'Sério', labelEn: 'Serious' },
    critical: { fill: '#7f1d1d', symbol: '!', text: '#ffffff', labelPt: 'Crítico', labelEn: 'Critical' },
    no_information: { fill: '#94a3b8', symbol: '?', text: '#0f172a', labelPt: 'Sem informação', labelEn: 'No information' },
  },
  colourblind: {
    low: { fill: '#fee8c8', symbol: '+', text: '#451a03', labelPt: 'Baixo risco', labelEn: 'Low risk' },
    some_concerns: { fill: '#fdbb84', symbol: '−', text: '#451a03', labelPt: 'Algumas preocupações', labelEn: 'Some concerns' },
    moderate: { fill: '#fdbb84', symbol: '−', text: '#451a03', labelPt: 'Moderado', labelEn: 'Moderate' },
    high: { fill: '#e34a33', symbol: '✕', text: '#ffffff', labelPt: 'Alto risco', labelEn: 'High risk' },
    serious: { fill: '#e34a33', symbol: '✕', text: '#ffffff', labelPt: 'Sério', labelEn: 'Serious' },
    critical: { fill: '#991b1b', symbol: '!', text: '#ffffff', labelPt: 'Crítico', labelEn: 'Critical' },
    no_information: { fill: '#cbd5e1', symbol: '?', text: '#0f172a', labelPt: 'Sem informação', labelEn: 'No information' },
  },
};

const LEVEL_OPTIONS_BY_TOOL = {
  ROB2: ['low', 'some_concerns', 'high', 'no_information'],
  'ROBINS-I': ['low', 'moderate', 'serious', 'critical', 'no_information'],
};

export default function RiskOfBiasPanel({ refs = [], onRecarregar }) {
  const avisar = useAviso();
  const { ehEn, tr } = useI18n();
  const [tool, setTool] = useState('ROB2');
  const [palette, setPalette] = useState('cochrane');
  const [reviewerId, setReviewerId] = useState('');
  const [estudoAtivoId, setEstudoAtivoId] = useState('');
  const [rascunhoJulgamentos, setRascunhoJulgamentos] = useState({});
  const [auditTrail, setAuditTrail] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const estudosElegiveis = useMemo(
    () => refs.filter((r) => r.status === 'citada' || r.status === 'consultada' || r.robAssessment),
    [refs]
  );

  const carregados = useMemo(
    () => estudosElegiveis.filter((r) => r.robAssessment?.tool === tool || (!r.robAssessment && tool === 'ROB2')),
    [estudosElegiveis, tool]
  );

  useEffect(() => {
    if (!estudoAtivoId && estudosElegiveis[0]?.id) {
      setEstudoAtivoId(estudosElegiveis[0].id);
    }
  }, [estudosElegiveis, estudoAtivoId]);

  useEffect(() => {
    window.api?.bib?.robHistorico?.().then(setAuditTrail).catch(() => {});
  }, [refs]);

  const estudoAtivo = estudosElegiveis.find((r) => r.id === estudoAtivoId) || null;

  useEffect(() => {
    if (!estudoAtivo?.robAssessment) {
      setRascunhoJulgamentos({});
      return;
    }
    const mapa = {};
    for (const d of estudoAtivo.robAssessment.domains || []) {
      mapa[d.domain_id] = d.final_human_judgment || d.suggested_judgment || 'no_information';
    }
    setRascunhoJulgamentos(mapa);
  }, [estudoAtivo?.id, estudoAtivo?.robAssessment]);

  const gerarSugestao = async (refId) => {
    try {
      setSalvando(true);
      await window.api.bib.robSugerir({ refId, tool });
      await onRecarregar?.();
      avisar(tr('Sugestão preliminar gerada em status "Aguardando Revisão Humana".', 'Preliminary suggestion generated with "Pending Human Review" status.'), 'info');
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarRevisao = async () => {
    if (!estudoAtivo) return;
    if (!reviewerId.trim()) {
      avisar(tr('Informe a identificação do revisor humano (reviewer_id) para registrar na trilha imutável.', 'Enter the human reviewer ID (reviewer_id) to record in the immutable audit trail.'), 'erro');
      return;
    }
    try {
      setSalvando(true);
      await window.api.bib.robConfirmar({
        refId: estudoAtivo.id,
        reviewerId: reviewerId.trim(),
        domainJudgments: rascunhoJulgamentos,
      });
      await onRecarregar?.();
      const logs = await window.api.bib.robHistorico();
      setAuditTrail(logs || []);
      avisar(tr('Avaliação confirmada pelo revisor e gravada na trilha SHA-256!', 'Assessment confirmed by reviewer and recorded in SHA-256 audit trail!'), 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const colors = PALETTES[palette] || PALETTES.cochrane;
  const domains = ROB_DOMAINS[tool] || ROB_DOMAINS.ROB2;
  const avaliados = carregados.filter((r) => r.robAssessment);

  // Dados para Traffic Light SVG
  const colW = 54;
  const rowH = 34;
  const labelW = 210;
  const headerH = 42;
  const svgW = labelW + (domains.length + 1) * colW + 24;
  const svgH = headerH + Math.max(1, avaliados.length) * rowH + 14;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="banner-didatico-prisma">
        <h4 style={{ margin: '0 0 4px' }}>
          ⚖️ {tr('Risco de Viés (RoB 2 / ROBINS-I) com Revisão Humana Obrigatória', 'Risk of Bias (RoB 2 / ROBINS-I) with Mandatory Human Review')}
        </h4>
        <p style={{ margin: 0 }}>
          {tr(
            'Sugestões automáticas sempre iniciam como pending_human_review com trechos ancorados por SHA-256. Nenhum julgamento final é emitido sem confirmação nominal do revisor humano.',
            'Automated suggestions always start as pending_human_review with SHA-256 anchored quotes. No final judgment is issued without explicit human reviewer confirmation.'
          )}
        </p>
      </div>

      {/* Controles de Ferramenta & Paleta */}
      <div className="bloco-proxy" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="campo-inline" style={{ margin: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{tr('Instrumento:', 'Tool:')}</span>
            <select value={tool} onChange={(e) => setTool(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6 }}>
              <option value="ROB2">RoB 2 (RCTs — 5 domínios)</option>
              <option value="ROBINS-I">ROBINS-I (Não randomizados — 7 domínios)</option>
            </select>
          </label>

          <label className="campo-inline" style={{ margin: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{tr('Paleta Visual:', 'Palette:')}</span>
            <select value={palette} onChange={(e) => setPalette(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6 }}>
              <option value="cochrane">Cochrane (#02C100 / #E2DF07 / #BF0000)</option>
              <option value="colourblind">{tr('Acessível p/ Daltonismo (Colourblind)', 'Colourblind-safe')}</option>
            </select>
          </label>
        </div>

        <label className="campo-inline" style={{ margin: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{tr('Revisor Humano (reviewer_id):', 'Human Reviewer (reviewer_id):')}</span>
          <input
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            placeholder={tr('Ex.: M. Luz (Revisor 1)', 'e.g. M. Luz (Reviewer 1)')}
            style={{ width: 210, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--borda)' }}
          />
        </label>
      </div>

      {/* Área em 2 colunas: Seleção & Auditoria Humana à esquerda + Traffic Light SVG + Summary Bar SVG à direita */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 14, alignItems: 'start' }}>
        <div className="bloco-cofre">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13 }}>{tr('Estudo incluído / consultado:', 'Included / consulted study:')}</strong>
            <select
              value={estudoAtivoId}
              onChange={(e) => setEstudoAtivoId(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--borda)' }}
            >
              {estudosElegiveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {autoresResumo(r.csl) || 'Autor'} ({ano(r.csl) || 's.d.'}) — {semHtml(r.csl?.title).slice(0, 50)}
                </option>
              ))}
            </select>
            {estudoAtivo && (
              <button className="btn pequeno secundario" onClick={() => gerarSugestao(estudoAtivo.id)} disabled={salvando}>
                🔍 {estudoAtivo.robAssessment ? tr('Regerar Sugestão', 'Regenerate Suggestion') : tr('Extrair Âncoras', 'Extract Anchors')}
              </button>
            )}
          </div>

          {estudoAtivo?.robAssessment ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span
                  className="pill-contagem"
                  style={{
                    background: estudoAtivo.robAssessment.status === 'pending_human_review' ? '#fef3c7' : '#dcfce7',
                    color: estudoAtivo.robAssessment.status === 'pending_human_review' ? '#92400e' : '#166534',
                    fontWeight: 700,
                  }}
                >
                  {estudoAtivo.robAssessment.status === 'pending_human_review'
                    ? `⏳ ${tr('Aguardando Revisão Humana (pending_human_review)', 'Pending Human Review')}`
                    : `✓ ${tr('Confirmado por:', 'Confirmed by:')} ${estudoAtivo.robAssessment.reviewer_id}`}
                </span>
              </div>

              {(estudoAtivo.robAssessment.domains || []).map((d) => {
                const lvl = rascunhoJulgamentos[d.domain_id] || d.suggested_judgment || 'no_information';
                const anchor = d.evidence_anchors?.[0];
                return (
                  <div key={d.domain_id} style={{ border: '1px solid var(--borda)', borderRadius: 6, padding: '8px 10px', background: 'var(--painel)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 12.5 }}>
                        {d.domain_id} — {ehEn ? d.domain_label_en || d.domain_label : d.domain_label}
                      </strong>
                      <select
                        value={lvl}
                        onChange={(e) => setRascunhoJulgamentos((prev) => ({ ...prev, [d.domain_id]: e.target.value }))}
                        style={{ padding: '3px 6px', borderRadius: 4, fontSize: 11.5 }}
                      >
                        {(LEVEL_OPTIONS_BY_TOOL[estudoAtivo.robAssessment.tool] || LEVEL_OPTIONS_BY_TOOL.ROB2).map((opt) => (
                          <option key={opt} value={opt}>
                            {ehEn ? colors[opt]?.labelEn || opt : colors[opt]?.labelPt || opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 3 }}>
                      {tr('Sugestão preliminar:', 'Preliminary suggestion:')} <strong>{d.suggested_judgment}</strong> ({Math.round((d.confidence || 0) * 100)}%) — {d.rationale}
                    </div>
                    {anchor && (
                      <div style={{ fontSize: 11, marginTop: 4, padding: '4px 6px', borderRadius: 4, background: 'var(--fundo)', borderLeft: '3px solid #2563eb' }}>
                        <em>"{anchor.literal_quote}"</em> <code style={{ fontSize: 10, color: '#64748b' }}>sha256:{anchor.excerpt_sha256.slice(0, 12)}…</code>
                      </div>
                    )}
                  </div>
                );
              })}

              <button className="btn primario" onClick={confirmarRevisao} disabled={salvando}>
                ✓ {tr('Confirmar Julgamento Humano & Gravar na Trilha SHA-256', 'Confirm Human Judgment & Log to SHA-256 Trail')}
              </button>
            </div>
          ) : (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--texto-suave)', fontSize: 12.5 }}>
              {estudoAtivo
                ? tr('Clique em "Extrair Âncoras" para iniciar uma avaliação preliminar vinculada a citações do estudo.', 'Click "Extract Anchors" to begin a preliminary assessment linked to study quotes.')
                : tr('Marque ao menos um artigo como Consultada ou Citada para avaliar risco de viés.', 'Mark at least one article as Consulted or Cited to assess risk of bias.')}
            </div>
          )}
        </div>

        {/* Coluna Direita: Traffic Light Plot SVG + Summary Bar SVG */}
        <div className="bloco-cofre" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: 13 }}>🚦 {tr('Traffic Light Plot', 'Traffic Light Plot')} ({tool})</strong>
          {avaliados.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
              {tr('Nenhum estudo avaliado neste instrumento ainda.', 'No studies assessed in this tool yet.')}
            </div>
          ) : (
            <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" role="img" aria-label={`RoB Traffic Light (${tool})`}>
              {[...domains.map((d) => d.id), 'Overall'].map((c, idx) => (
                <text key={c} x={labelW + idx * colW + colW / 2} y={24} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#1e293b">
                  {c}
                </text>
              ))}
              {avaliados.map((st, rIdx) => {
                const rob = st.robAssessment;
                const cy = headerH + rIdx * rowH + rowH / 2;
                const label = `${autoresResumo(st.csl) || st.id} (${ano(st.csl) || 's.d.'})`.slice(0, 28);
                return (
                  <g key={st.id}>
                    <text x={6} y={cy + 4} fontSize="11.5" fill="#0f172a" fontWeight="600">
                      {label}
                    </text>
                    {[...domains.map((d) => d.id), 'Overall'].map((col, cIdx) => {
                      const val =
                        col === 'Overall'
                          ? rob.final_human_overall || rob.suggested_overall || 'no_information'
                          : (rob.domains || []).find((x) => x.domain_id === col)?.final_human_judgment ||
                            (rob.domains || []).find((x) => x.domain_id === col)?.suggested_judgment ||
                            'no_information';
                      const spec = colors[val] || colors.no_information;
                      const cx = labelW + cIdx * colW + colW / 2;
                      return (
                        <g key={col}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={10.5}
                            fill={spec.fill}
                            stroke={rob.status === 'pending_human_review' ? '#94a3b8' : '#1e293b'}
                            strokeDasharray={rob.status === 'pending_human_review' ? '2,2' : undefined}
                            strokeWidth="1.2"
                          />
                          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11.5" fontWeight="800" fill={spec.text}>
                            {spec.symbol}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Summary Bar Plot SVG por Domínio */}
          {avaliados.length > 0 && (
            <>
              <strong style={{ fontSize: 13 }}>📊 {tr('Distribuição por Domínio (Summary Plot)', 'Domain Summary Bar Plot')}</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...domains.map((d) => ({ id: d.id, nome: ehEn ? d.en : d.pt })), { id: 'Overall', nome: tr('Julgamento Global', 'Overall Judgment') }].map((dom) => {
                  const counts = {};
                  for (const st of avaliados) {
                    const rob = st.robAssessment;
                    const val =
                      dom.id === 'Overall'
                        ? rob.final_human_overall || rob.suggested_overall || 'no_information'
                        : (rob.domains || []).find((x) => x.domain_id === dom.id)?.final_human_judgment ||
                          (rob.domains || []).find((x) => x.domain_id === dom.id)?.suggested_judgment ||
                          'no_information';
                    counts[val] = (counts[val] || 0) + 1;
                  }
                  return (
                    <div key={dom.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                      <span style={{ width: 155, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <strong>{dom.id}:</strong> {dom.nome}
                      </span>
                      <div style={{ flex: 1, height: 14, display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--borda)' }}>
                        {Object.entries(counts).map(([lvl, n]) => (
                          <div
                            key={lvl}
                            title={`${lvl}: ${n}/${avaliados.length}`}
                            style={{ width: `${(n / avaliados.length) * 100}%`, background: (colors[lvl] || colors.no_information).fill }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {auditTrail.length > 0 && (
            <div style={{ fontSize: 11.5, borderTop: '1px solid var(--borda)', paddingTop: 8 }}>
              <strong>🔒 {tr('Trilha de Auditoria Append-Only', 'Append-Only Audit Trail')} ({auditTrail.length})</strong>
              <div style={{ maxHeight: 110, overflowY: 'auto', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {auditTrail.slice(0, 6).map((log) => (
                  <div key={log.entry_id} style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
                    <strong>{log.reviewer_id}</strong> · {log.ref_id} · {log.action} · <code>prev:{String(log.prev_entry_sha256).slice(0, 8)}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
