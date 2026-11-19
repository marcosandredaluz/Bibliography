import React from 'react';
import { useI18n } from '../../i18n.jsx';

export default function AuditMetricsGrid({
  resultado,
  abaVisualizacao,
  setAbaVisualizacao,
  grupoIntercorrenciaAtivo,
  setGrupoIntercorrenciaAtivo,
  refsSuspeitasIaAtivas,
  alertasAtribuicaoFalsaAtivos,
  alertasPlagioAtivos,
  alertasEstatisticosAtivos,
  alertasRedeAtivos,
  alertasMetodologiaClinicaAtivos,
  alertasFrasesTorturadasAtivos,
  alertasEstilometricosAtivos,
  alertasPredatoriosAtivos,
  alertasAbnt6023Ativos,
  alertasCorrupcaoGeneAtivos,
  alertasFomentoAtivos,
  alertasDesvioTematicoAtivos,
  citacoesSemReferenciaAtivas,
  refsNaoCitadasNoTextoAtivas,
  alertasFigurasTabelasAtivos,
  totalInconformidades,
  totalConformesComPdf,
  obrasConformes,
}) {
  const { tr } = useI18n();
  if (!resultado) return null;

  const cards = [
    {
      id: 'todas',
      titulo: tr('Total de Citações', 'Total Citations'),
      valor: resultado.totalCitacoesOcorrencias,
      sub: `${resultado.totalAutoresCitadosUnicos} ${tr('obras citadas', 'unique works')}`,
      cor: 'var(--primaria)',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'todas',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo('todas');
      },
      title: tr('Clique para ver todas as citações e inconformidades', 'View all citations and findings'),
    },
    {
      id: 'ia',
      titulo: tr('Não Localizadas / DOI', 'Unverified / DOI'),
      valor: refsSuspeitasIaAtivas.length,
      sub: refsSuspeitasIaAtivas.length ? tr('DOI falso / inexistente', 'Unverified / invalid DOI') : tr('Todas autenticadas', 'All verified'),
      classeEstado: refsSuspeitasIaAtivas.length ? 'com-alerta' : '',
      cor: refsSuspeitasIaAtivas.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'ia',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'ia' ? 'todas' : 'ia'));
      },
      title: tr('Filtrar fontes não localizadas ou com DOI divergente', 'Filter unverified or mismatched DOI sources'),
    },
    {
      id: 'atribuicao',
      titulo: tr('Atribuição / Suporte', 'Attribution / Support'),
      valor: alertasAtribuicaoFalsaAtivos.length,
      sub: alertasAtribuicaoFalsaAtivos.length ? tr('Baixa aderência ao texto', 'Low source support') : tr('Conteúdo compatível', 'Claims supported'),
      classeEstado: alertasAtribuicaoFalsaAtivos.length ? 'com-alerta' : '',
      cor: alertasAtribuicaoFalsaAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'atribuicao',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'atribuicao' ? 'todas' : 'atribuicao'));
      },
      title: tr('Filtrar citações sem suporte no artigo citado', 'Filter unsupported claims'),
    },
    {
      id: 'plagio',
      titulo: tr('Similaridade Literal', 'Literal Overlap'),
      valor: alertasPlagioAtivos.length,
      sub: alertasPlagioAtivos.length ? tr('Cópia sem aspas', 'Unquoted literal overlap') : tr('Sem sobreposição', 'No overlap'),
      classeEstado: alertasPlagioAtivos.length ? 'com-alerta' : '',
      cor: alertasPlagioAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'plagio',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'plagio' ? 'todas' : 'plagio'));
      },
      title: tr('Filtrar trechos com cópia literal sem aspas', 'Filter unquoted literal overlap'),
    },
    {
      id: 'estatistica',
      titulo: tr('Erros Estatísticos', 'Statcheck'),
      valor: alertasEstatisticosAtivos.length,
      sub: alertasEstatisticosAtivos.length ? tr('Inconsistência p-valor', 'Stat inconsistency') : tr('Cálculos consistentes', 'Stats consistent'),
      classeEstado: alertasEstatisticosAtivos.length ? 'com-alerta' : '',
      cor: alertasEstatisticosAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'estatistica',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'estatistica' ? 'todas' : 'estatistica'));
      },
      title: tr('Filtrar inconsistências estatísticas (Statcheck)', 'Filter statistical inconsistencies'),
    },
    {
      id: 'rede',
      titulo: tr('Concentração Fontes', 'Citation Concentration'),
      valor: alertasRedeAtivos.length,
      sub: alertasRedeAtivos.length ? tr('Autor/revista repetido', 'High concentration') : tr('Fontes diversificadas', 'Diverse sources'),
      classeEstado: alertasRedeAtivos.length ? 'com-aviso' : '',
      cor: alertasRedeAtivos.length ? '#d97706' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'rede',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'rede' ? 'todas' : 'rede'));
      },
      title: tr('Filtrar concentração excessiva em um autor ou periódico', 'Filter high author/journal concentration'),
    },
    {
      id: 'metodologia_clinica',
      titulo: tr('Ética e Método', 'Ethics & Method'),
      valor: alertasMetodologiaClinicaAtivos.length,
      sub: alertasMetodologiaClinicaAtivos.length ? tr('Ressalvas metodológicas', 'Methodological notes') : tr('Protocolos conformes', 'Checklist compliant'),
      classeEstado: alertasMetodologiaClinicaAtivos.length ? 'com-alerta' : '',
      cor: alertasMetodologiaClinicaAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'metodologia_clinica',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'metodologia_clinica' ? 'todas' : 'metodologia_clinica'));
      },
      title: tr('Filtrar itens de CEP, TCLE e checklists clínicos', 'Filter ethics and clinical checklist items'),
    },
    {
      id: 'frases_torturadas',
      titulo: tr('Frases Torturadas', 'Tortured Phrases'),
      valor: alertasFrasesTorturadasAtivos.length,
      sub: alertasFrasesTorturadasAtivos.length ? tr('Paráfrase artificial', 'Spin-bot artifacts') : tr('Vocabulário natural', 'Natural phrasing'),
      classeEstado: alertasFrasesTorturadasAtivos.length ? 'com-alerta' : '',
      cor: alertasFrasesTorturadasAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'frases_torturadas',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'frases_torturadas' ? 'todas' : 'frases_torturadas'));
      },
      title: tr('Filtrar expressões artificiais de paráfrase automática', 'Filter paraphrasing artifacts'),
    },
    {
      id: 'estilometria',
      titulo: tr('Estilometria', 'Stylometry'),
      valor: alertasEstilometricosAtivos.length,
      sub: alertasEstilometricosAtivos.length ? tr('Cadência monótona', 'Monotonous rhythm') : tr('Fluidez regular', 'Natural rhythm'),
      classeEstado: alertasEstilometricosAtivos.length ? 'com-aviso' : '',
      cor: alertasEstilometricosAtivos.length ? '#d97706' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'estilometria',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'estilometria' ? 'todas' : 'estilometria'));
      },
      title: tr('Filtrar apontamentos de monotonia sintática', 'Filter syntactic monotony items'),
    },
    {
      id: 'predatorias',
      titulo: tr('Periódicos Suspeitos', 'Predatory Venues'),
      valor: alertasPredatoriosAtivos.length,
      sub: alertasPredatoriosAtivos.length ? tr('Editora sinalizada', 'Flagged publisher') : tr('Periódicos idôneos', 'Verified venues'),
      classeEstado: alertasPredatoriosAtivos.length ? 'com-alerta' : '',
      cor: alertasPredatoriosAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'predatorias',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'predatorias' ? 'todas' : 'predatorias'));
      },
      title: tr('Filtrar periódicos ou editoras sinalizadas', 'Filter flagged publishers/journals'),
    },
    {
      id: 'abnt6023',
      titulo: tr('Normas ABNT / Style', 'Style Metadata'),
      valor: alertasAbnt6023Ativos.length,
      sub: alertasAbnt6023Ativos.length ? tr('Campos incompletos', 'Missing metadata') : tr('Campos completos', 'Complete fields'),
      classeEstado: alertasAbnt6023Ativos.length ? 'com-aviso' : '',
      cor: alertasAbnt6023Ativos.length ? '#d97706' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'abnt6023',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'abnt6023' ? 'todas' : 'abnt6023'));
      },
      title: tr('Filtrar pendências formais ABNT NBR 6023', 'Filter bibliography metadata checks'),
    },
    {
      id: 'genomica',
      titulo: tr('Genes / Planilhas', 'Gene Symbols'),
      valor: alertasCorrupcaoGeneAtivos.length,
      sub: alertasCorrupcaoGeneAtivos.length ? tr('Erro de planilha', 'Spreadsheet artifact') : tr('Símbolos corretos', 'Valid symbols'),
      classeEstado: alertasCorrupcaoGeneAtivos.length ? 'com-alerta' : '',
      cor: alertasCorrupcaoGeneAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'genomica',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'genomica' ? 'todas' : 'genomica'));
      },
      title: tr('Filtrar símbolos de genes convertidos em datas', 'Filter corrupted HGNC gene symbols'),
    },
    {
      id: 'fomento',
      titulo: tr('Fomento / CAPES', 'Funding & Grants'),
      valor: alertasFomentoAtivos.length,
      sub: alertasFomentoAtivos.length ? tr('Falta código CAPES/CNPq', 'Missing disclosure') : tr('Fomento conforme', 'Compliant'),
      classeEstado: alertasFomentoAtivos.length ? 'com-aviso' : '',
      cor: alertasFomentoAtivos.length ? '#d97706' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'fomento',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'fomento' ? 'todas' : 'fomento'));
      },
      title: tr('Filtrar requisitos de fomento e processo CAPES/CNPq', 'Filter grant acknowledgment checks'),
    },
    {
      id: 'desvio_tematico',
      titulo: tr('Desvio Temático', 'Topic Drift'),
      valor: alertasDesvioTematicoAtivos.length,
      sub: alertasDesvioTematicoAtivos.length ? tr('Frase difere da fonte', 'Differs from source') : tr('Tema coerente', 'On-topic'),
      classeEstado: alertasDesvioTematicoAtivos.length ? 'com-alerta' : '',
      cor: alertasDesvioTematicoAtivos.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'desvio_tematico',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'desvio_tematico' ? 'todas' : 'desvio_tematico'));
      },
      title: tr('Filtrar desvios temáticos contra o artigo citado', 'Filter off-topic citation claims'),
    },
    {
      id: 'orfa',
      titulo: tr('Ausentes nas Refs.', 'Missing in Refs'),
      valor: citacoesSemReferenciaAtivas.length,
      sub: citacoesSemReferenciaAtivas.length ? tr('Citou e não listou', 'Orphan citations') : tr('Todas listadas', 'All listed'),
      classeEstado: citacoesSemReferenciaAtivas.length ? 'com-alerta' : '',
      cor: citacoesSemReferenciaAtivas.length ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'orfa',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'orfa' ? 'todas' : 'orfa'));
      },
      title: tr('Filtrar citações no texto sem referência correspondente', 'Filter orphan in-text citations'),
    },
    {
      id: 'sobrando',
      titulo: tr('Nunca Citadas', 'Uncited in Text'),
      valor: refsNaoCitadasNoTextoAtivas.length,
      sub: refsNaoCitadasNoTextoAtivas.length ? tr('Sobrando na lista final', 'Unused entries') : tr('Todas citadas', 'All cited'),
      classeEstado: refsNaoCitadasNoTextoAtivas.length ? 'com-aviso' : '',
      cor: refsNaoCitadasNoTextoAtivas.length ? '#d97706' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'sobrando',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'sobrando' ? 'todas' : 'sobrando'));
      },
      title: tr('Filtrar referências listadas mas não citadas no texto', 'Filter unused reference list entries'),
    },
    {
      id: 'figuras_tabelas',
      titulo: tr('Figuras e Tabelas', 'Figures & Tables'),
      valor: alertasFigurasTabelasAtivos.length,
      sub: alertasFigurasTabelasAtivos.length ? tr('Falta Fonte / Chamada', 'Missing Source / Callout') : tr('ABNT 14724 / IBGE ok', 'ABNT 14724 / IBGE ok'),
      classeEstado: alertasFigurasTabelasAtivos.length ? 'com-aviso' : '',
      cor: alertasFigurasTabelasAtivos.length ? '#d97706' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'figuras_tabelas',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo((prev) => (prev === 'figuras_tabelas' ? 'todas' : 'figuras_tabelas'));
      },
      title: tr('Filtrar checagem de chamada e fonte em figuras/tabelas', 'Filter figure/table checks'),
    },
    {
      id: 'total_pendencias',
      titulo: tr('Total a Ajustar', 'Alerts to Fix'),
      valor: totalInconformidades,
      sub: totalInconformidades > 0 ? tr('Pontos a revisar', 'Items to adjust') : tr('100% Conforme', '100% Compliant'),
      classeEstado: totalInconformidades > 0 ? 'com-alerta' : '',
      cor: totalInconformidades > 0 ? '#dc2626' : '#16a34a',
      ativo: abaVisualizacao === 'inconformidades' && grupoIntercorrenciaAtivo === 'todas',
      onClick: () => {
        setAbaVisualizacao('inconformidades');
        setGrupoIntercorrenciaAtivo('todas');
      },
      title: tr('Exibir todos os apontamentos ativos', 'Display all items to review'),
    },
    {
      id: 'conformes',
      titulo: tr('Obras no Acervo', 'Works in Library'),
      valor: `${totalConformesComPdf} / ${obrasConformes.length}`,
      sub: `${totalConformesComPdf} ${tr('PDFs anexados', 'PDFs attached')}`,
      cor: '#16a34a',
      ativo: abaVisualizacao === 'conformes',
      onClick: () => setAbaVisualizacao('conformes'),
      title: tr('Exibir rol de obras conformes e PDFs disponíveis', 'Show verified works and attached PDFs'),
    },
  ];

  return (
    <div className="grade-metricas-auditoria">
      {cards.map((c) => (
        <button
          type="button"
          key={c.id}
          className={`card-metrica-filtro ${c.classeEstado || ''} ${c.ativo ? 'ativo' : ''}`}
          onClick={c.onClick}
          title={c.title}
        >
          <div className="topo-card-filtro">
            <span className="titulo-card-filtro">{c.titulo}</span>
          </div>
          <div className="valor-card-filtro" style={{ color: c.cor }}>
            {c.valor}
          </div>
          <div className="sub-card-filtro">{c.sub}</div>
        </button>
      ))}
    </div>
  );
}
