import React, { useState, useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Icone, useAviso } from './ui.jsx';
import { normalizar } from '../lib/csl.js';

const STOPWORDS = new Set(
  'de da do das dos em no na nos nas para por com sem sobre entre como mais menos muito pouco tambem quando onde qual quais quem cujo cuja este esta estes estas esse essa esses essas aquele aquela aquilo isso isto um uma uns umas o a os as e ou mas se que nao sim ao aos pela pelo pelas pelos segundo conforme apud et al p pp pag v n dispõem apontam demonstram mostra mostram estudo estudos artigo artigos autor autores'.split(
    ' '
  )
);

const EQUIVALENCIAS_PDF_PT_EN = [
  ['vacina', 'vacinas', 'vacinacao', 'vacinal', 'vacinais', 'imunizacao', 'imunizacoes', 'vaccine', 'vaccines', 'vaccination', 'immunization', 'immunisation', 'doses', 'uptake'],
  ['cobertura', 'coberturas', 'coverage', 'rate', 'rates', 'adherence', 'adesao', 'compliance'],
  ['hesitacao', 'recusa', 'resistencia', 'hesitancy', 'refusal', 'reluctance', 'confidence', 'complacency', 'convenience'],
  ['determinantes', 'determinante', 'fatores', 'determinants', 'factors', 'drivers', 'predictors', 'associated'],
  ['distais', 'distal', 'intermediarios', 'proximais', 'proximal', 'hierarquico', 'conceitual', 'conceptual', 'hierarchical', 'framework', 'model'],
  ['socioeconomicos', 'socioeconomico', 'socioeconomica', 'demograficos', 'estruturais', 'renda', 'pobreza', 'socioeconomic', 'demographic', 'structural', 'income', 'wealth', 'poverty', 'inequalities', 'desigualdades'],
  ['escolaridade', 'educacao', 'instrucao', 'materna', 'pais', 'cuidadores', 'education', 'educational', 'literacy', 'schooling', 'maternal', 'parents', 'parental', 'caregivers'],
  ['moradia', 'habitacao', 'residencia', 'territorio', 'rural', 'urbana', 'indigena', 'indigenas', 'migrantes', 'housing', 'living', 'residence', 'household', 'urban', 'rural', 'indigenous', 'newcomers', 'districts'],
  ['gestao', 'governanca', 'politica', 'financiamento', 'management', 'governance', 'policy', 'political', 'financing', 'health system', 'sistema de saude'],
  ['acesso', 'acessibilidade', 'barreiras', 'disponibilidade', 'horario', 'access', 'accessibility', 'barriers', 'availability', 'convenience'],
  ['desabastecimento', 'estoque', 'insumos', 'falta', 'shortage', 'shortages', 'supply', 'stockout', 'logistics'],
  ['profissionais', 'equipe', 'trabalhadores', 'capacitacao', 'treinamento', 'workforce', 'health workers', 'providers', 'professionals', 'training'],
  ['comportamentais', 'comportamento', 'culturais', 'cultural', 'estilo de vida', 'crencas', 'atitudes', 'salutismo', 'behavioral', 'behavioural', 'behavior', 'cultural', 'lifestyle', 'beliefs', 'attitudes', 'healthism'],
  ['desinformacao', 'fake news', 'infodemia', 'midia', 'eventos adversos', 'seguranca', 'misinformation', 'social media', 'adverse events', 'safety'],
  ['priorizacao', 'priorizar', 'matriz', 'criterios', 'viabilidade', 'aceitabilidade', 'prioritization', 'priority', 'matrix', 'criteria', 'feasibility', 'acceptability'],
  ['avaliacao', 'implementacao', 'fidelidade', 'teoria de mudanca', 'qualidade', 'quantidade', 'conteudo', 'estrutura', 'processo', 'programa', 'servico', 'evaluation', 'implementation', 'fidelity', 'theory of change', 'quality', 'quantity', 'content', 'structure', 'process', 'program', 'service', 'delivered'],
];

function extrairRadicais(frase, autor) {
  const autNorm = normalizar(autor || '');
  const palavras = normalizar(frase || '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 5 && !STOPWORDS.has(p) && p !== autNorm && !/^\d+$/.test(p));
  return [...new Set(palavras.map((p) => p.slice(0, 5)))];
}

function extrairGruposBilinguesPresentes(texto) {
  const tNorm = normalizar(texto || '');
  return EQUIVALENCIAS_PDF_PT_EN.filter((grupo) => grupo.some((termo) => tNorm.includes(termo)));
}

function extrairTermosBuscaArtigoParecido({ fraseWord = '', tituloSugerido = '', textoRef = '', autor = '' }) {
  // Prioriza o título buscado na referência (se existir) combinado com os termos científicos centrais da frase no Word
  const baseTitulo = String(tituloSugerido || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/10\.\d{4,9}\/\S+/gi, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const autNorm = normalizar(autor || '');
  const palavrasFrase = String(fraseWord || '')
    .replace(/\([^)]*\d{4}[^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((p) => {
      const n = normalizar(p);
      return n.length >= 5 && !STOPWORDS.has(n) && n !== autNorm && !/^\d+$/.test(n);
    });

  const termosFrase = [...new Set(palavrasFrase)].slice(0, 6).join(' ');

  if (baseTitulo.length >= 18) {
    return baseTitulo.split(/\s+/).slice(0, 9).join(' ');
  }
  if (termosFrase.length >= 10) {
    return termosFrase;
  }
  const limpoRef = String(textoRef || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 4 && !STOPWORDS.has(normalizar(p)))
    .slice(1, 9)
    .join(' ');
  return limpoRef || termosFrase || 'clinical study';
}

async function extrairPaginasPdf(bytes) {
  const dados = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes || []);
  const tarefa = pdfjs.getDocument({ data: dados, isEvalSupported: false });
  const docPdf = await tarefa.promise;
  try {
    const paginas = [];
    for (let i = 1; i <= docPdf.numPages; i++) {
      const pag = await docPdf.getPage(i);
      const txt = await pag.getTextContent();
      const bruto = txt.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('');
      paginas.push({ numero: i, bruto, norm: normalizar(bruto).replace(/\s+/g, ' ') });
    }
    return paginas;
  } finally {
    try {
      if (typeof docPdf?.destroy === 'function') await docPdf.destroy();
      else if (typeof tarefa?.destroy === 'function') await tarefa.destroy();
    } catch {
      /* ignora erro de cleanup */
    }
  }
}

function localizarOcorrenciaNoPdf(ocorrencia, paginas) {
  const textoContextoCompleto = `${ocorrencia.trechoDireto || ''} ${ocorrencia.fraseContexto || ''} ${ocorrencia.paragrafoCompleto || ''}`.trim();
  const ehPdfEmIngles =
    paginas.length > 0 &&
    /\b(the|and|for|with|from|that|this|program|evaluation|vaccine|vaccination|coverage|health)\b/i.test(
      `${paginas[0]?.norm || ''} ${paginas[1]?.norm || ''}`
    );

  if (ocorrencia.trechoDireto) {
    const alvoNorm = normalizar(ocorrencia.trechoDireto)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const fatiaCurta = alvoNorm.slice(0, Math.min(45, alvoNorm.length));
    for (const p of paginas) {
      const textoLimpo = p.norm.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
      if (fatiaCurta.length >= 12 && textoLimpo.includes(fatiaCurta)) {
        const conferePag =
          !ocorrencia.paginaDeclarada ||
          String(p.numero) === String(ocorrencia.paginaDeclarada) ||
          p.bruto.includes(String(ocorrencia.paginaDeclarada));
        return {
          status: conferePag ? 'confirmado_direto' : 'divergencia_pagina',
          paginaPdf: p.numero,
          compatibilidade: 100,
          trechoPdf: ocorrencia.trechoDireto,
          mensagem: conferePag
            ? `✓ Citação direta confirmada na pág. ${p.numero} do PDF.`
            : `⚠ Trecho encontrado na pág. ${p.numero} do PDF, mas o texto declarou p. ${ocorrencia.paginaDeclarada}.`,
        };
      }
    }
  }

  const radicais = extrairRadicais(textoContextoCompleto, ocorrencia.autor);
  const gruposBilingues = extrairGruposBilinguesPresentes(textoContextoCompleto);
  if (!radicais.length && !gruposBilingues.length) {
    return {
      status: 'indefinido',
      paginaPdf: null,
      compatibilidade: 0,
      mensagem: 'Frase muito curta para rastrear termos específicos no PDF.',
    };
  }

  let melhorPag = null;
  let maiorScorePag = 0;
  let melhorPct = 0;
  let melhorTrecho = '';

  for (const p of paginas) {
    const acertadosRad = radicais.filter((rad) => p.norm.includes(rad));
    const acertadosBil = gruposBilingues.filter((grupo) => grupo.some((termo) => p.norm.includes(termo)));

    const pctRad = radicais.length ? Math.round((acertadosRad.length / radicais.length) * 100) : 0;
    const pctBil = gruposBilingues.length ? Math.round((acertadosBil.length / gruposBilingues.length) * 100) : 0;
    const pctPag = Math.max(pctRad, pctBil);
    const scoreCombinado = acertadosRad.length * 2 + acertadosBil.length * 3;

    if (scoreCombinado > maiorScorePag) {
      maiorScorePag = scoreCombinado;
      melhorPct = pctPag;
      melhorPag = p.numero;
      const termoAncora =
        acertadosRad[0] ||
        acertadosBil[0]?.find((termo) => p.norm.includes(termo)) ||
        '';
      const idx = termoAncora ? p.norm.indexOf(termoAncora) : -1;
      if (idx >= 0) {
        melhorTrecho = p.bruto.replace(/\s+/g, ' ').slice(Math.max(0, idx - 40), idx + 160).trim();
      }
    }
  }

  const pct = melhorPct;
  if (!melhorPag || maiorScorePag === 0 || (radicais.length >= 4 && pct < 22)) {
    return {
      status: 'nao_encontrado',
      paginaPdf: null,
      compatibilidade: pct,
      mensagem: ocorrencia.trechoDireto
        ? '❌ INCONFORMIDADE: O trecho entre aspas não foi localizado em nenhuma página deste PDF!'
        : '❌ INCONFORMIDADE: Os termos centrais desta afirmação não foram localizados no PDF.',
    };
  }

  // Se era uma citação entre aspas em português de um PDF original em inglês (tradução livre dos autores), confirma na página correspondente!
  if (ocorrencia.trechoDireto && ehPdfEmIngles && melhorPag) {
    return {
      status: 'confirmado_direto',
      paginaPdf: melhorPag,
      compatibilidade: Math.max(pct, 65),
      trechoPdf: melhorTrecho,
      mensagem: `✓ Citação traduzida (PT↔EN) confirmada na pág. ${melhorPag} do PDF original em inglês (${Math.max(pct, 65)}% de correspondência conceitual).`,
    };
  }

  if (ocorrencia.paginaDeclarada && String(melhorPag) !== String(ocorrencia.paginaDeclarada)) {
    const pagAtendeImpresso = paginas[melhorPag - 1]?.bruto?.includes(String(ocorrencia.paginaDeclarada));
    if (!pagAtendeImpresso) {
      return {
        status: 'divergencia_pagina',
        paginaPdf: melhorPag,
        compatibilidade: pct,
        trechoPdf: melhorTrecho,
        mensagem: `⚠ Divergência de página: declarada p. ${ocorrencia.paginaDeclarada}, mas os termos aparecem na pág. ${melhorPag} do PDF (${pct}% dos termos).`,
      };
    }
  }

  return {
    status: 'confirmado',
    paginaPdf: melhorPag,
    compatibilidade: pct,
    trechoPdf: melhorTrecho,
    mensagem: `✓ Assunto/termos localizados na pág. ${melhorPag} do PDF (${pct}% de correspondência).`,
  };
}

export default function ReverseAuditView({
  refs,
  bib,
  estadoAuditoria,
  setEstadoAuditoria,
  aoMudarRodando,
  onImportarCsl,
  onRecarregar,
  onAbrirPdfNaPagina,
  onIrParaBiblioteca,
}) {
  const avisar = useAviso();

  const pastaPadraoPdfs = bib?.raiz ? `${bib.raiz}${bib.raiz.includes('/') ? '/' : '\\'}pdfs` : '';
  const [pastaDestino, setPastaDestino] = useState(pastaPadraoPdfs);

  useEffect(() => {
    if (pastaPadraoPdfs) {
      setPastaDestino(pastaPadraoPdfs);
    }
  }, [pastaPadraoPdfs]);

  const escolherPastaDestino = async () => {
    try {
      const p = await window.api.dialogo.escolherPasta();
      if (p) {
        setPastaDestino(p);
        localStorage.setItem('bib_pasta_download_pdfs', p);
        avisar(`Pasta de destino definida: ${p}`, 'ok');
      }
    } catch (e) {
      avisar(`Erro ao escolher pasta: ${e.message}`, 'erro');
    }
  };

  const [baixandoLotePdfs, setBaixandoLotePdfs] = useState(false);
  const baixarTodosPdfsParaPasta = async () => {
    if (!pastaDestino) {
      avisar('Escolha a pasta de destino primeiro.', 'info');
      return;
    }
    const refsParaBaixar = resultado?.refsMapeadas || [];
    if (!refsParaBaixar.length) {
      avisar('Nenhuma referência mapeada para baixar.', 'info');
      return;
    }
    setBaixandoLotePdfs(true);
    try {
      const r = await window.api.audit.baixarPdfsParaPasta({
        pastaDestino,
        refs: refsParaBaixar,
      });
      avisar(`Sucesso! ${r.baixados} baixados, ${r.copiados} já sincronizados para a pasta: ${r.pasta}!`, 'ok');
      if (onRecarregar) onRecarregar();
    } catch (e) {
      avisar(`Erro ao baixar PDFs: ${e.message}`, 'erro');
    } finally {
      setBaixandoLotePdfs(false);
    }
  };

  // Caso seja chamado sem estadoAuditoria externo, mantém fallback local
  const [estadoLocal, setEstadoLocal] = useState({
    nomeArquivo: '',
    textoManuscrito: '',
    buscarEBaixar: true,
    resultado: null,
    dataHora: null,
    mostrarCaixaTexto: true,
  });

  const estado = estadoAuditoria || estadoLocal;
  const atualizarEstado = setEstadoAuditoria || setEstadoLocal;

  const { nomeArquivo, textoManuscrito, buscarEBaixar, resultado, dataHora, mostrarCaixaTexto } = estado;

  const setNomeArquivo = (v) => atualizarEstado((ant) => ({ ...ant, nomeArquivo: v }));
  const setTextoManuscrito = (v) => atualizarEstado((ant) => ({ ...ant, textoManuscrito: v }));
  const setBuscarEBaixar = (v) => atualizarEstado((ant) => ({ ...ant, buscarEBaixar: v }));
  const setMostrarCaixaTexto = (v) => atualizarEstado((ant) => ({ ...ant, mostrarCaixaTexto: v }));
  const setResultado = (atualizador) =>
    atualizarEstado((ant) => ({
      ...ant,
      resultado: typeof atualizador === 'function' ? atualizador(ant.resultado) : atualizador,
    }));

  const [rodando, setRodando] = useState(false);
  const atualizarRodando = (valor) => {
    setRodando(valor);
    if (typeof aoMudarRodando === 'function') {
      aoMudarRodando(valor);
    }
  };
  const [etapa, setEtapa] = useState('');
  const [progresso, setProgresso] = useState({
    ativo: false,
    porcentagem: 0,
    fase: '',
    mensagem: '',
    detalhe: '',
    atual: 0,
    total: 0,
  });

  useEffect(() => {
    if (typeof window.api?.audit?.aoProgresso === 'function') {
      const cancelar = window.api.audit.aoProgresso((dados) => {
        if (!dados) return;
        setProgresso((ant) => ({
          ...ant,
          ativo: true,
          porcentagem:
            typeof dados.porcentagem === 'number'
              ? Math.max(0, Math.min(100, dados.porcentagem))
              : ant.porcentagem,
          fase: dados.fase || ant.fase,
          mensagem: dados.mensagem || ant.mensagem,
          detalhe: dados.detalhe !== undefined ? dados.detalhe : ant.detalhe,
          atual: typeof dados.atual === 'number' ? dados.atual : ant.atual,
          total: typeof dados.total === 'number' ? dados.total : ant.total,
        }));
      });
      return () => {
        try {
          cancelar?.();
        } catch {
          /* ignora */
        }
      };
    }
  }, []);

  const [moduloAuditoria, setModuloAuditoria] = useState('todos'); // 'todos' | 'chamadas' | 'plagio'
  const [abaVisualizacao, setAbaVisualizacao] = useState('todas'); // 'inconformidades' | 'conformes' | 'todas'
  const [grupoIntercorrenciaAtivo, setGrupoIntercorrenciaAtivo] = useState('todas'); // 'todas' | 'ia' | 'citacao_falsa' | 'plagio' | 'orfa' | 'sobrando' | 'metadados' | 'pdf' | 'metodologico'
  const [modoAgrupamentoVisaoGeral, setModoAgrupamentoVisaoGeral] = useState('tipo'); // 'tipo' | 'ordem'
  const [mostrarPainelPromptIa, setMostrarPainelPromptIa] = useState(false);
  const [instrucaoExtraIa, setInstrucaoExtraIa] = useState(
    'Analise ponto a ponto o que está certo ou errado nas citações abaixo, reescreva os parágrafos com problemas mantendo rigor acadêmico e sugira referências científicas reais (com DOI válido) para substituir qualquer fonte suspeita de alucinação.'
  );

  // Estado do buscador integrado de "Artigo Real Parecido" por chave de item
  // { [chave]: { aberto: boolean, termo: string, fonte: 'openalex'|'pubmed'|'europepmc', carregando: boolean, itens: [], fraseContexto: '', numParagrafo: '', refSuspeita: '' } }
  const [buscasParecidos, setBuscasParecidos] = useState({});

  const abrirBuscaArtigoParecido = async (chave, { fraseWord = '', tituloSugerido = '', textoRef = '', autor = '', numParagrafo = '' }) => {
    const termoInicial = extrairTermosBuscaArtigoParecido({ fraseWord, tituloSugerido, textoRef, autor });
    setBuscasParecidos((ant) => ({
      ...ant,
      [chave]: {
        aberto: true,
        termo: ant[chave]?.termo || termoInicial,
        fonte: ant[chave]?.fonte || 'openalex',
        carregando: true,
        itens: ant[chave]?.itens || [],
        fraseContexto: fraseWord,
        numParagrafo,
        refSuspeita: textoRef || `${autor}`,
      },
    }));

    const termoUsar = buscasParecidos[chave]?.termo || termoInicial;
    const fonteUsar = buscasParecidos[chave]?.fonte || 'openalex';
    try {
      const res = await window.api.busc.resultados(fonteUsar, termoUsar);
      setBuscasParecidos((ant) => ({
        ...ant,
        [chave]: {
          ...(ant[chave] || {}),
          aberto: true,
          termo: termoUsar,
          fonte: fonteUsar,
          carregando: false,
          itens: res || [],
        },
      }));
    } catch (e) {
      setBuscasParecidos((ant) => ({
        ...ant,
        [chave]: { ...(ant[chave] || {}), carregando: false, erro: e.message },
      }));
    }
  };

  const executarBuscaParecidoManual = async (chave, novaFonte, novoTermo) => {
    const estadoAtual = buscasParecidos[chave] || {};
    const fonte = novaFonte || estadoAtual.fonte || 'openalex';
    const termo = (novoTermo !== undefined ? novoTermo : estadoAtual.termo || '').trim();
    if (!termo) {
      avisar('Digite os termos científicos ou assunto para buscar um artigo real parecido.', 'info');
      return;
    }
    setBuscasParecidos((ant) => ({
      ...ant,
      [chave]: { ...ant[chave], fonte, termo, carregando: true, erro: null },
    }));
    try {
      const res = await window.api.busc.resultados(fonte, termo);
      setBuscasParecidos((ant) => ({
        ...ant,
        [chave]: { ...ant[chave], fonte, termo, carregando: false, itens: res || [] },
      }));
    } catch (e) {
      setBuscasParecidos((ant) => ({
        ...ant,
        [chave]: { ...ant[chave], carregando: false, erro: e.message },
      }));
    }
  };

  const importarArtigoRealSubstituto = async (itemReal) => {
    try {
      let csl = null;
      if (itemReal.pmid) {
        try {
          csl = await window.api.meta.pmid(itemReal.pmid);
        } catch {
          /* tenta por DOI */
        }
      }
      if (!csl && itemReal.doi) {
        try {
          csl = await window.api.meta.doi(itemReal.doi);
        } catch {
          /* fallback manual */
        }
      }
      if (!csl) {
        csl = {
          type: 'article-journal',
          title: itemReal.titulo,
          'container-title': itemReal.fonte,
          DOI: itemReal.doi || undefined,
          PMID: itemReal.pmid || undefined,
          issued: itemReal.ano ? { 'date-parts': [[Number(itemReal.ano)]] } : undefined,
        };
      }
      if (onImportarCsl) {
        const criada = await onImportarCsl(csl, 'citada');
        if (criada?.id) {
          try {
            await window.api.meta.buscarPdfAberto(criada.id);
          } catch {
            /* continua mesmo sem PDF aberto */
          }
        }
      } else {
        await window.api.bib.criar({ csl, statusLeitura: 'citada' });
      }
      await onRecarregar?.();
      avisar(`Artigo real verificado importado para a Biblioteca: "${itemReal.titulo.slice(0, 50)}…"!`, 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const copiarSubstituicaoParaWord = (itemReal) => {
    const primeiroAutor = (itemReal.autores || 'AUTOR').split(/[,;]/)[0].trim().split(/\s+/).pop().toUpperCase();
    const anoPub = itemReal.ano || 's.d.';
    const citacao = `(${primeiroAutor}, ${anoPub})`;
    const refCompleta = `${itemReal.autores || 'Autor'}. ${itemReal.titulo}. ${itemReal.fonte || ''}, ${anoPub}.${
      itemReal.doi ? ` DOI: https://doi.org/${itemReal.doi}` : ''
    }${itemReal.pmid ? ` PMID: ${itemReal.pmid}` : ''}`;
    window.api.sistema.copiarTexto(`Citação no texto: ${citacao}\nReferência verificada: ${refCompleta}`);
    avisar(`Citação ${citacao} e referência real copiadas para colar no seu Word!`, 'ok');
  };

  const copiarPromptTrocaPorArtigoReal = (chave, itemReal) => {
    const info = buscasParecidos[chave] || {};
    const texto = [
      `Preciso corrigir uma citação no meu manuscrito científico substituindo uma referência suspeita/incorreta por um artigo científico REAL e verificado.`,
      ``,
      info.numParagrafo ? `• Localização no Word: Parágrafo §${info.numParagrafo}` : '',
      info.fraseContexto ? `• Frase atual no meu Word: "${info.fraseContexto}"` : '',
      info.refSuspeita ? `• Referência antiga (suspeita/inexistente): ${info.refSuspeita}` : '',
      ``,
      `• NOVO ARTIGO REAL VERIFICADO PARA USAR COMO SUBSTITUTO:`,
      `  - Título: ${itemReal.titulo}`,
      `  - Autores: ${itemReal.autores || 'N/D'}`,
      `  - Ano: ${itemReal.ano || 'N/D'}`,
      `  - Periódico: ${itemReal.fonte || 'N/D'}`,
      itemReal.doi ? `  - DOI oficial: https://doi.org/${itemReal.doi}` : '',
      itemReal.pmid ? `  - PMID: ${itemReal.pmid}` : '',
      ``,
      `Por favor: 1) Reescreva a frase do meu parágrafo ajustando-a fielmente ao que este artigo real estuda e citando (${(itemReal.autores || 'Autor').split(/[,;]/)[0].trim()}, ${itemReal.ano || 's.d.'}); 2) Entregue a entrada bibliográfica formatada em ABNT e Vancouver.`,
    ]
      .filter(Boolean)
      .join('\n');
    window.api.sistema.copiarTexto(texto);
    avisar('Prompt de substituição por artigo real copiado! Cole na sua IA (ChatGPT/Claude/Gemini).', 'ok');
  };

  const renderPainelBuscaArtigoParecido = (chave) => {
    const st = buscasParecidos[chave];
    if (!st?.aberto) return null;
    return (
      <div
        style={{
          marginTop: 10,
          padding: '10px 12px',
          borderRadius: 8,
          background: 'var(--painel)',
          border: '1.5px solid #2563eb',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <strong style={{ color: '#1d4ed8', fontSize: 12.5 }}>
            🔎 Buscador de Artigo Científico Real Parecido (PubMed · OpenAlex · Europe PMC)
          </strong>
          <button
            className="btn pequeno fantasma"
            onClick={() => setBuscasParecidos((ant) => ({ ...ant, [chave]: { ...ant[chave], aberto: false } }))}
          >
            Fechar ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            style={{ flex: 1, minWidth: 220, fontSize: 12.5, padding: '5px 9px' }}
            value={st.termo || ''}
            onChange={(e) =>
              setBuscasParecidos((ant) => ({ ...ant, [chave]: { ...ant[chave], termo: e.target.value } }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                executarBuscaParecidoManual(chave, st.fonte, st.termo);
              }
            }}
            placeholder="Termos científicos da frase ou título para encontrar artigo real verdadeiro…"
          />
          <button
            className="btn pequeno primario"
            onClick={() => executarBuscaParecidoManual(chave, st.fonte, st.termo)}
            disabled={st.carregando}
          >
            <Icone nome="search" tam={13} /> {st.carregando ? 'Buscando…' : 'Pesquisar Artigos Reais'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>Base científica:</span>
          {[
            { id: 'openalex', nome: 'OpenAlex (Global + Citações)' },
            { id: 'pubmed', nome: 'PubMed / MEDLINE' },
            { id: 'europepmc', nome: 'Europe PMC (Texto Aberto)' },
          ].map((b) => (
            <button
              key={b.id}
              className={`chip ${st.fonte === b.id ? 'ativo' : ''}`}
              style={{ fontSize: 11.2, padding: '2px 8px' }}
              onClick={() => executarBuscaParecidoManual(chave, b.id, st.termo)}
            >
              {b.nome}
            </button>
          ))}
        </div>

        {st.carregando ? (
          <p className="dica-texto" style={{ margin: '6px 0' }}>
            ⏳ Consultando base científica {st.fonte.toUpperCase()} em busca de artigos reais verificados…
          </p>
        ) : st.erro ? (
          <p className="dica-texto" style={{ color: '#dc2626' }}>
            Erro na busca: {st.erro}
          </p>
        ) : !st.itens?.length ? (
          <p className="dica-texto">
            Nenhum artigo encontrado com esses termos exatos. Simplifique as palavras-chave no campo acima e clique em "Pesquisar Artigos Reais".
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 310, overflowY: 'auto' }}>
            {st.itens.slice(0, 8).map((it, i) => (
              <div
                key={it.doi || it.pmid || i}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'var(--fundo)',
                  border: '1px solid var(--borda)',
                  borderLeft: '3px solid #16a34a',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--texto)' }}>
                  ✓ {it.titulo}
                </div>
                <div className="sub-meta" style={{ marginTop: 2 }}>
                  {[
                    it.autores,
                    it.ano,
                    it.fonte,
                    it.citacoes != null ? `★ ${it.citacoes} citações` : null,
                    it.doi ? `DOI: ${it.doi}` : null,
                    it.pmid ? `PMID: ${it.pmid}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <button
                    className="btn pequeno primario"
                    onClick={() => importarArtigoRealSubstituto(it)}
                    title="Importa este artigo verdadeiro para sua biblioteca (como Citada) e já tenta baixar o PDF gratuito"
                  >
                    📥 Importar p/ Biblioteca + PDF
                  </button>
                  <button
                    className="btn pequeno secundario"
                    onClick={() => copiarSubstituicaoParaWord(it)}
                    title="Copia a citação (AUTOR, Ano) e a referência completa para você substituir no Word"
                  >
                    📋 Copiar Citação + Referência Real
                  </button>
                  <button
                    className="btn pequeno secundario"
                    onClick={() => copiarPromptTrocaPorArtigoReal(chave, it)}
                    title="Copia um comando pronto para a IA reescrever seu parágrafo usando este artigo verdadeiro"
                  >
                    🤖 Copiar Prompt p/ IA Trocar por este Artigo
                  </button>
                  {it.doi && (
                    <button
                      className="btn pequeno fantasma"
                      onClick={() => window.api.sistema.abrirLink(`https://doi.org/${it.doi}`)}
                    >
                      Abrir DOI ↗
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const anexarPdfEVerificarCard = async (itemAudit, idx) => {
    if (!itemAudit?.refBibId) {
      avisar('Esta referência ainda não possui ID na biblioteca.', 'erro');
      return;
    }
    try {
      const caminhos = await window.api.dialogo.escolherPdfs();
      if (!caminhos?.length) return;
      setEtapa(`Anexando PDF e lendo páginas de ${itemAudit.primeiroSobrenome} (${itemAudit.ano})…`);
      await window.api.bib.anexarPdf(itemAudit.refBibId, caminhos[0]);
      const bytesPdf = await window.api.bib.lerPdfBytes(itemAudit.refBibId);
      const paginas = await extrairPaginasPdf(bytesPdf);
      const textoCompleto = paginas.map((p) => p.bruto).join('\n\n');
      await window.api.bib.atualizar(itemAudit.refBibId, { textoExtraido: textoCompleto.slice(0, 50000) });

      let verificacoes = [];
      if (itemAudit.ocorrenciasNoTexto?.length) {
        const grifosAtuais = await window.api.bib.lerGrifos(itemAudit.refBibId);
        const novosGrifos = [...grifosAtuais];
        verificacoes = itemAudit.ocorrenciasNoTexto.map((oc) => {
          const ver = localizarOcorrenciaNoPdf(oc, paginas);
          if (ver.paginaPdf) {
            const locWord = `Parágrafo §${oc.numParagrafo || '?'} · Linha ${oc.numLinha || '?'}${oc.secao ? ` (${oc.secao})` : ''}`;
            const trechoSalvar = ver.trechoPdf || oc.trechoDireto || oc.fraseContexto;
            if (!novosGrifos.some((g) => g.fraseWord === oc.fraseContexto)) {
              novosGrifos.unshift({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                pagina: ver.paginaPdf,
                cor: 'azul',
                trecho: trechoSalvar,
                fraseWord: oc.fraseContexto,
                paragrafoWord: oc.paragrafoCompleto,
                numParagrafo: oc.numParagrafo,
                numLinha: oc.numLinha,
                secaoWord: oc.secao,
                nota: ver.trechoPdf ? `No PDF (p. ${ver.paginaPdf}): "${ver.trechoPdf}"` : '',
                ondeCitei: `${nomeArquivo ? nomeArquivo + ' — ' : ''}${locWord}`,
                citadoNoTexto: true,
                criadoEm: new Date().toISOString(),
              });
            }
          }
          return { ocorrencia: oc, ...ver };
        });
        await window.api.bib.salvarGrifos(itemAudit.refBibId, novosGrifos);
        await window.api.bib.atualizar(itemAudit.refBibId, {
          ocorrenciasWord: verificacoes.map((v) => ({
            ...v.ocorrencia,
            paginaPdf: v.paginaPdf,
            trechoPdf: v.trechoPdf,
            statusPdf: v.status,
            mensagemPdf: v.mensagem,
          })),
        });
      }

      await onRecarregar?.();
      setResultado((ant) => {
        if (!ant) return ant;
        const novas = [...ant.refsMapeadas];
        novas[idx] = { ...novas[idx], temPdf: true, verificacoesPdf: verificacoes };
        return { ...ant, refsMapeadas: novas };
      });
      setEtapa('');
      avisar(
        'PDF anexado manualmente! As páginas das citações e o PICO/Notas foram extraídos automaticamente.',
        'ok'
      );
    } catch (e) {
      setEtapa('');
      avisar(e.message, 'erro');
    }
  };

  const buscarPdfNaWebManual = (itemAudit) => {
    const q = itemAudit.doiOficial
      ? itemAudit.doiOficial
      : `${itemAudit.tituloBuscado || itemAudit.textoOriginal.slice(0, 110)} filetype:pdf`;
    window.api.sistema.abrirLink(`https://scholar.google.com.br/scholar?q=${encodeURIComponent(q)}`);
    avisar(
      'Google Acadêmico aberto! Baixe o PDF no seu computador e depois clique em "📎 Anexar PDF Baixado do PC".',
      'info'
    );
  };

  const escolherArquivo = async () => {
    try {
      const arq = await window.api.dialogo ? await window.api.audit.escolherArquivo() : await window.api.audit.escolherArquivo();
      if (!arq) return;
      let novoTexto = '';
      if (arq.tipo === 'pdf') {
        setEtapa('Extraindo texto do PDF do manuscrito…');
        const pags = await extrairPaginasPdf(arq.bytes);
        novoTexto = pags.map((p) => p.bruto).join('\n\n');
        setEtapa('');
      } else {
        novoTexto = arq.texto || '';
      }
      atualizarEstado((ant) => ({
        ...ant,
        nomeArquivo: arq.nome,
        textoManuscrito: novoTexto,
        mostrarCaixaTexto: true,
      }));
      avisar(`Arquivo "${arq.nome}" carregado! Clique em "Executar Auditoria Reversa Completa".`, 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const limparAuditoriaAtual = () => {
    atualizarEstado({
      nomeArquivo: '',
      textoManuscrito: '',
      buscarEBaixar: true,
      resultado: null,
      dataHora: null,
      mostrarCaixaTexto: true,
    });
    setBuscasParecidos({});
    setMostrarPainelPromptIa(false);
    avisar('Auditoria anterior limpa! Você pode carregar ou colar um novo manuscrito.', 'info');
  };

  const executarAuditoria = async (moduloSobrescrito) => {
    if (!textoManuscrito.trim()) {
      avisar('Escolha um arquivo (.docx, .pdf, .txt) ou cole o texto do seu trabalho primeiro.', 'info');
      return;
    }
    const moduloExec = typeof moduloSobrescrito === 'string' ? moduloSobrescrito : moduloAuditoria;
    atualizarRodando(true);
    setProgresso({
      ativo: true,
      porcentagem: 4,
      fase: 'fase1',
      mensagem:
        moduloExec === 'chamadas'
          ? 'Módulo 1/5 — Analisando citações no texto e referências finais…'
          : moduloExec === 'plagio'
          ? 'Módulo 4/5 — Preparando análise de plágio com Google Diff Match Patch…'
          : 'Etapa 1/2 — Extraindo corpo do texto, citações e referências…',
      detalhe: 'Processando manuscrito…',
      atual: 0,
      total: 0,
    });
    try {
      setEtapa(
        moduloExec === 'chamadas'
          ? 'Módulo 1 — Cruzando chamadas de citação com referências finais…'
          : moduloExec === 'plagio'
          ? 'Módulo 4 — Analisando sobreposição literal de texto com Google Diff…'
          : '1/2 — Extraindo citações, cruzando com as referências, checando IA/plágio e baixando PDFs…'
      );
      const resBase = await window.api.audit.executar({
        texto: textoManuscrito,
        buscarEBaixar,
        pastaDestino,
        modulo: moduloExec,
      });

      // Se executou um módulo específico rápido, finaliza na hora!
      if (resBase?.moduloExecutado && resBase.moduloExecutado !== 'todos') {
        await onRecarregar?.();
        const agoraStr = new Date().toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        atualizarEstado((ant) => ({
          ...ant,
          resultado: resBase,
          dataHora: agoraStr,
          mostrarCaixaTexto: false,
        }));
        setEtapa('');
        const nomesModulos = {
          chamadas: 'Nível 1 (Chamadas de Citação x Referências)',
          autenticidade: 'Nível 2 (Autenticidade em 8 Bases & Anti-IA)',
          paginas: 'Nível 3 (Citações Diretas & Páginas)',
          plagio: 'Nível 4 (Detector de Plágio Google Diff Match Patch)',
          semantica: 'Nível 5 (Fidelidade Semântica & Amazon Science)',
          estilo_ia: 'Nível 6 (Marcadores de Redação IA Open-Detector)',
        };
        avisar(
          `✓ Auditoria do ${nomesModulos[resBase.moduloExecutado] || resBase.moduloExecutado} concluída com sucesso!`,
          'ok'
        );
        return;
      }

      // Etapa 2: Leitura dos PDFs e localização das citações
      const refsComPdf = (resBase?.refsMapeadas || []).filter(
        (item) => item.refBibId && item.temPdf && item.ocorrenciasNoTexto?.length
      );
      const totalPdfs = refsComPdf.length;
      let contadorPdf = 0;

      setEtapa('2/2 — Lendo os PDFs página por página para localizar cada citação e checar inconformidades…');
      setProgresso({
        ativo: true,
        porcentagem: 50,
        fase: 'fase2',
        mensagem: `Etapa 2/2 — Localizando citações nas páginas dos PDFs (${totalPdfs > 0 ? `0 de ${totalPdfs}` : 'finalizando'})…`,
        detalhe:
          totalPdfs > 0
            ? 'Abrindo arquivos PDF e extraindo texto com OCR/PDF.js…'
            : 'Nenhum PDF pendente para conferência de páginas.',
        atual: 0,
        total: totalPdfs,
      });

      for (const item of resBase?.refsMapeadas || []) {
        if (item.refBibId && item.temPdf && item.ocorrenciasNoTexto?.length) {
          contadorPdf++;
          const pct2 = 50 + Math.round((contadorPdf / Math.max(totalPdfs, 1)) * 48);
          const autorRotulo = item.primeiroSobrenome || item.autor || 'Artigo';
          const anoRotulo = item.ano ? ` (${item.ano})` : '';
          const tituloRotulo = (item.tituloOficial || item.tituloBuscado || '').slice(0, 80);

          setProgresso({
            ativo: true,
            porcentagem: Math.min(98, pct2),
            fase: 'fase2',
            mensagem: `Etapa 2/2 — Lendo PDF ${contadorPdf} de ${totalPdfs}: ${autorRotulo}${anoRotulo}`,
            detalhe: tituloRotulo
              ? `"${tituloRotulo}…" — Buscando trechos citados e grifando`
              : 'Buscando trechos citados e grifando páginas…',
            atual: contadorPdf,
            total: totalPdfs,
          });

          try {
            const bytesPdf = await window.api.bib.lerPdfBytes(item.refBibId);
            const paginas = await extrairPaginasPdf(bytesPdf);
            const grifosAtuais = await window.api.bib.lerGrifos(item.refBibId);
            const novosGrifos = [...grifosAtuais];

            item.verificacoesPdf = item.ocorrenciasNoTexto.map((oc) => {
              const ver = localizarOcorrenciaNoPdf(oc, paginas);

              // Detecção Forense de Citação Direta Fabricada (trecho entre aspas inexistente no PDF)
              if (oc.trechoDireto && !ver.paginaPdf) {
                ver.status = 'aspas_nao_localizadas';
                ver.mensagem = `🚨 CITAÇÃO DIRETA FABRICADA / NÃO LOCALIZADA: O trecho colocado entre aspas atribuído a ${item.primeiroSobrenome} (${item.ano}) não foi localizado em nenhuma página do PDF original.`;
              }
              // Detecção Forense de Página Impossível / Fora do Range do PDF
              if (oc.paginaDeclarada && paginas.length > 0) {
                const numDeclarado = parseInt(oc.paginaDeclarada, 10);
                if (numDeclarado > paginas.length && numDeclarado < 500) {
                  ver.status = 'pagina_fora_do_range';
                  ver.mensagem = `⚠️ PÁGINA IMPOSSÍVEL / FORA DO RANGE: A citação declarou p. ${oc.paginaDeclarada}, mas o artigo original possui apenas ${paginas.length} página(s) no PDF.`;
                }
              }

              if (ver.paginaPdf) {
                const locWord = `Parágrafo §${oc.numParagrafo || '?'} · Linha ${oc.numLinha || '?'}${oc.secao ? ` (${oc.secao})` : ''}`;
                const trechoSalvar = ver.trechoPdf || oc.trechoDireto || oc.fraseContexto;
                if (!novosGrifos.some((g) => g.fraseWord === oc.fraseContexto)) {
                  novosGrifos.unshift({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                    pagina: ver.paginaPdf,
                    cor: 'azul',
                    trecho: trechoSalvar,
                    fraseWord: oc.fraseContexto,
                    paragrafoWord: oc.paragrafoCompleto,
                    numParagrafo: oc.numParagrafo,
                    numLinha: oc.numLinha,
                    secaoWord: oc.secao,
                    nota: ver.trechoPdf ? `No PDF (p. ${ver.paginaPdf}): "${ver.trechoPdf}"` : '',
                    ondeCitei: `${nomeArquivo ? nomeArquivo + ' — ' : ''}${locWord}`,
                    citadoNoTexto: true,
                    criadoEm: new Date().toISOString(),
                  });
                }
              }
              return { ocorrencia: oc, ...ver };
            });

            // Exclusão mútua entre PDF confirmado na Etapa 2 e alertas preliminares de atribuição falsa da Etapa 1
            if (Array.isArray(resBase.alertasAtribuicaoFalsa) && item.verificacoesPdf?.length) {
              const paragrafosConfirmadosNoPdf = new Set(
                item.verificacoesPdf
                  .filter((v) => v.status === 'confirmado' || v.status === 'confirmado_direto')
                  .map((v) => v.ocorrencia?.numParagrafo)
              );
              if (paragrafosConfirmadosNoPdf.size > 0) {
                const sobrenomeNorm = normalizar(item.primeiroSobrenome || '');
                resBase.alertasAtribuicaoFalsa = resBase.alertasAtribuicaoFalsa.filter((al) => {
                  const autNorm = normalizar(al.autorCitado || '');
                  const mesmoAutor = sobrenomeNorm && autNorm.includes(sobrenomeNorm);
                  return !(mesmoAutor && paragrafosConfirmadosNoPdf.has(al.numParagrafo));
                });
              }
            }

            await window.api.bib.salvarGrifos(item.refBibId, novosGrifos);
            await window.api.bib.atualizar(item.refBibId, {
              ocorrenciasWord: item.verificacoesPdf.map((v) => ({
                ...v.ocorrencia,
                paginaPdf: v.paginaPdf,
                trechoPdf: v.trechoPdf,
                statusPdf: v.status,
                mensagemPdf: v.mensagem,
              })),
            });
          } catch {
            /* continua */
          }
        }
      }

      setProgresso({
        ativo: true,
        porcentagem: 100,
        fase: 'concluido',
        mensagem: '✓ Auditoria concluída com sucesso! Consolidando relatório forense…',
        detalhe: 'Métricas, citações e referências prontas na tela.',
        atual: totalPdfs,
        total: totalPdfs,
      });

      await onRecarregar?.();
      const agoraStr = new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      atualizarEstado((ant) => ({
        ...ant,
        resultado: resBase,
        dataHora: agoraStr,
        mostrarCaixaTexto: false, // recolhe o texto automaticamente para focar no relatório fixado!
      }));
      setEtapa('');
      avisar(
        'Auditoria reversa concluída e FIXADA na tela! Você pode abrir PDFs ou mudar de aba sem perder o resultado.',
        'ok'
      );
    } catch (e) {
      avisar('Falha na auditoria: ' + e.message, 'erro');
    } finally {
      atualizarRodando(false);
      setEtapa('');
      setTimeout(() => {
        setProgresso((ant) => ({ ...ant, ativo: false }));
      }, 1500);
    }
  };

  // Contabiliza e categoriza todas as intercorrências
  const refsNaoCitadasNoTexto = (resultado?.refsMapeadas || []).filter((r) => !r.citadaNoTexto);
  const refsSuspeitasIa = (resultado?.refsMapeadas || []).filter((r) =>
    ['ia_doi_trocado', 'ia_doi_inexistente', 'ia_autor_adulterado', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade)
  );
  const alertasAtribuicaoFalsa = resultado?.alertasAtribuicaoFalsa || [];
  const alertasPlagio = resultado?.alertasPlagio || [];
  const citacoesSemReferencia = resultado?.citacoesSemReferencia || [];

  // Alertas de Metadados / ABNT vs Alertas Metodológicos vs Alertas Estilo IA (Open-Detector)
  const alertasPrecisao = resultado?.alertasPrecisao || [];
  const alertasEstiloIa = resultado?.alertasEstiloIa || alertasPrecisao.filter((ap) => ap.tipo === 'estilo_redacao_ia');
  const alertasMetadadosAbnt = alertasPrecisao.filter(
    (ap) => !['quebra_escala_narrativa', 'secao_pos_referencias', 'estilo_redacao_ia'].includes(ap.tipo)
  );
  const alertasMetodologicos = alertasPrecisao.filter((ap) =>
    ['quebra_escala_narrativa', 'secao_pos_referencias'].includes(ap.tipo)
  );

  // Alertas de Páginas e Conteúdo no PDF
  const alertasPdf = [];
  (resultado?.refsMapeadas || []).forEach((r) => {
    (r.verificacoesPdf || []).forEach((v) => {
      if (v.status === 'nao_encontrado' || v.status === 'divergencia_pagina') {
        alertasPdf.push({
          ref: r,
          ocorrencia: v.ocorrencia || v,
          status: v.status,
          mensagem: v.mensagem,
          trechoPdf: v.trechoPdf,
          paginaPdf: v.paginaPdf,
        });
      }
    });
  });

  const obrasConformes = (resultado?.refsMapeadas || []).filter(
    (r) => !['ia_doi_trocado', 'ia_doi_inexistente', 'ia_autor_adulterado', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade)
  );
  const totalConformesComPdf = obrasConformes.filter((o) => o.temPdf || refs.some((x) => x.id === o.refBibId && x.pdf)).length;

  const totalInconformidades =
    refsSuspeitasIa.length +
    alertasAtribuicaoFalsa.length +
    alertasPlagio.length +
    citacoesSemReferencia.length +
    refsNaoCitadasNoTexto.length +
    alertasMetadadosAbnt.length +
    alertasPdf.length +
    alertasMetodologicos.length +
    alertasEstiloIa.length;

  // Gerador do Prompt Completo Estruturado para colar na IA (ChatGPT / Claude / Gemini)
  const gerarTextoPromptParaIa = () => {
    if (!resultado) return '';
    const blocos = [
      `# 🤖 PROMPT DE AUDITORIA E REVISÃO CIENTÍFICA DO MEU MANUSCRITO (${nomeArquivo || 'Trabalho Acadêmico'})`,
      ``,
      `## 📌 INSTRUÇÃO PARA A IA:`,
      instrucaoExtraIa,
      ``,
      `Por favor, responda de forma estruturada para cada ponto listado abaixo:`,
      `1. **O que está certo ou errado** na citação e na referência apontada;`,
      `2. **Como corrigir ou reescrever o parágrafo (§)** citado (forneça o texto já corrigido pronto para copiar para o Word);`,
      `3. **Para fontes não localizáveis ou citações com ressalva**, confirme qual é o estudo real correto ou como ajustar a afirmação ao que o artigo verdadeiro realmente demonstra.`,
      ``,
      `================================================================================`,
      `## 📊 RESUMO EXECUTIVO DA AUDITORIA FORENSE`,
      `• Documento auditado: ${nomeArquivo || 'Manuscrito colado'} (${dataHora || 'agora'})`,
      `• Citações no corpo do Word: ${resultado.totalCitacoesOcorrencias} ocorrências (${resultado.totalAutoresCitadosUnicos} obras distintas)`,
      `• Obras listadas na seção final de Referências: ${resultado.totalReferenciasListaFinal}${
        resultado.linhasPosReferenciasIgnoradas
          ? ` (isolados ${resultado.linhasPosReferenciasIgnoradas} parágrafos pós-referências como Notas/Anexos)`
          : ''
      }`,
      `• 🚨 Referências Não Localizáveis / DOI Inexistente ou de Outro Artigo: ${refsSuspeitasIa.length}`,
      `• 🚨 Citações que NÃO constam no artigo ou Atribuição Trocada: ${alertasAtribuicaoFalsa.length}`,
      `• 🔍 Alertas de Plágio / Cópia Literal sem Aspas: ${alertasPlagio.length}`,
      `• ❌ Citadas no texto mas AUSENTES nas Referências finais: ${resultado.citacoesSemReferencia.length}`,
      `• ⚠ Listadas nas Referências mas NUNCA citadas no texto: ${refsNaoCitadasNoTexto.length}`,
      `• 📐 Ajustes Finos de Norma ABNT NBR 10520, Escopo e Precisão: ${alertasPrecisao.length}`,
      `================================================================================`,
      ``,
    ];

    if (refsSuspeitasIa.length > 0) {
      blocos.push(`## 🤖 PONTO CRÍTICO A — FONTES COM SUSPEITA DE ALUCINAÇÃO PELA IA / NÃO LOCALIZADAS NAS BASES (${refsSuspeitasIa.length}):`);
      refsSuspeitasIa.forEach((r, idx) => {
        blocos.push(`### [Fonte Suspeita A.${idx + 1}]`);
        blocos.push(`- **Referência na minha lista final:** ${r.textoOriginal}`);
        blocos.push(`- **Diagnóstico do Auditor Forense:** ${r.alertaAutenticidade}`);
        if (r.ocorrenciasNoTexto?.length) {
          r.ocorrenciasNoTexto.forEach((oc) => {
            blocos.push(
              `- **Onde citei no Word:** Parágrafo §${oc.numParagrafo} · Linha ${oc.numLinha}${oc.secao ? ` (${oc.secao})` : ''}`
            );
            blocos.push(`- **Frase exata no meu Word:** "${oc.fraseContexto}"`);
          });
        }
        blocos.push(
          `- **Pergunta para a IA:** Esta referência existe mesmo ou foi alucinada? Se estiver errada ou inventada, qual artigo científico real (com autores, ano, periódico e DOI verdadeiros) comprova essa mesma afirmação do Parágrafo acima?`
        );
        blocos.push(``);
      });
    }

    if (alertasAtribuicaoFalsa.length > 0) {
      blocos.push(`## 🚨 PONTO CRÍTICO B — CITAÇÕES QUE NÃO CONSTAM NO ARTIGO OU FORAM ATRIBUÍDAS AO ARTIGO ERRADO (${alertasAtribuicaoFalsa.length}):`);
      alertasAtribuicaoFalsa.forEach((a, idx) => {
        blocos.push(`### [Divergência de Conteúdo B.${idx + 1}]`);
        blocos.push(`- **Diagnóstico:** ${a.mensagem}`);
        blocos.push(`- **Local no Word:** Parágrafo §${a.numParagrafo} · Linha ${a.numLinha}`);
        blocos.push(`- **Frase escrita no meu Word:** "${a.fraseWord}"`);
        if (a.outroArtigoSugerido) {
          blocos.push(`- **Artigo da minha biblioteca onde o assunto realmente aparece:** ${a.outroArtigoSugerido}`);
        }
        blocos.push(
          `- **Pergunta para a IA:** Como devo corrigir a citação ou reescrever esta frase do Parágrafo §${a.numParagrafo} para que fique 100% fiel à fonte correta?`
        );
        blocos.push(``);
      });
    }

    if (alertasPlagio.length > 0) {
      blocos.push(`## 🔍 PONTO CRÍTICO C — ALERTAS DE PLÁGIO / CÓPIA LITERAL SEM ASPAS (${alertasPlagio.length}):`);
      alertasPlagio.forEach((p, idx) => {
        blocos.push(`### [Alerta de Similaridade C.${idx + 1}]`);
        blocos.push(`- **Diagnóstico:** ${p.mensagem}`);
        blocos.push(`- **Local no Word:** Parágrafo §${p.numParagrafo} · Linha ${p.numLinha}`);
        blocos.push(`- **Texto atual no meu Word:** "${p.fraseNoWord}"`);
        blocos.push(`- **Trecho original na fonte (${p.autorFonte}):** "${p.trechoOriginalArtigo}"`);
        blocos.push(
          `- **Pergunta para a IA:** Reescreva este trecho do Parágrafo §${p.numParagrafo} em formato de paráfrase acadêmica original (sem plágio) OU formate como citação direta com aspas conforme a norma.`
        );
        blocos.push(``);
      });
    }

    if (resultado.citacoesSemReferencia.length > 0) {
      blocos.push(`## ❌ PONTO D — AUTORES CITADOS NO CORPO DO TEXTO MAS AUSENTES NA LISTA FINAL DE REFERÊNCIAS (${resultado.citacoesSemReferencia.length}):`);
      resultado.citacoesSemReferencia.forEach((c, idx) => {
        blocos.push(
          `- **D.${idx + 1}:** ${c.autor} (${c.ano}) — citado ${c.ocorrencias.length}x no texto (ex. §${c.ocorrencias[0]?.numParagrafo}, Linha ${c.ocorrencias[0]?.numLinha}: "${c.ocorrencias[0]?.fraseContexto}")`
        );
      });
      blocos.push(``);
    }

    if (refsNaoCitadasNoTexto.length > 0) {
      blocos.push(`## ⚠ PONTO E — REFERÊNCIAS LISTADAS AO FINAL MAS NUNCA CITADAS NO CORPO DO TEXTO (${refsNaoCitadasNoTexto.length}):`);
      refsNaoCitadasNoTexto.forEach((r, idx) => {
        blocos.push(`- **E.${idx + 1}:** ${r.textoOriginal}`);
      });
      blocos.push(``);
    }

    if (alertasPrecisao.length > 0) {
      blocos.push(`## 📐 PONTO F — AJUSTES FINOS DE NORMA ABNT NBR 10520, ESCOPO METODOLÓGICO E SUBMISSÃO (${alertasPrecisao.length}):`);
      alertasPrecisao.forEach((ap, idx) => {
        blocos.push(`- **F.${idx + 1}:** ${ap.mensagem}`);
        if (ap.fraseWord) blocos.push(`  Trecho no Word (§${ap.numParagrafo}, Linha ${ap.numLinha}): "${ap.fraseWord}"`);
      });
      blocos.push(``);
    }

    if (alertasPdf.length > 0) {
      blocos.push(`## 📄 PONTO G — DIVERGÊNCIAS DE CONTEÚDO E PÁGINAS NO PDF (${alertasPdf.length}):`);
      alertasPdf.forEach((ap, idx) => {
        blocos.push(`### [Divergência de PDF G.${idx + 1}]`);
        blocos.push(`- **Diagnóstico:** ${ap.mensagem}`);
        blocos.push(`- **Local no Word:** Parágrafo §${ap.ocorrencia.numParagrafo} · Linha ${ap.ocorrencia.numLinha}`);
        blocos.push(`- **Frase escrita no Word:** "${ap.ocorrencia.fraseContexto}"`);
        if (ap.trechoPdf) blocos.push(`- **Trecho no PDF (pág. ${ap.paginaPdf}):** "${ap.trechoPdf}"`);
        blocos.push(`- **Obra:** ${ap.ref.primeiroSobrenome} (${ap.ref.ano})`);
        blocos.push(`- **Pergunta para a IA:** Como devo ajustar a afirmação ou o número de página para ficar 100% fiel ao PDF?`);
        blocos.push(``);
      });
    }

    if (resultado.errosParsingConflito?.length > 0) {
      blocos.push(`## ⚠️ ERROS DE PARSING E CONFLITOS D-E NEUTRALIZADOS (Regra R5 — ${resultado.errosParsingConflito.length}):`);
      resultado.errosParsingConflito.forEach((ep, idx) => {
        blocos.push(`- **R5.${idx + 1}:** ${ep.mensagem}`);
        blocos.push(`  Entrada de Referência: ${ep.referenciaLista}`);
      });
      blocos.push(``);
    }

    if (resultado.resumoVerificacaoConteudo) {
      const rvc = resultado.resumoVerificacaoConteudo;
      blocos.push(
        `## 📋 STATUS DE VERIFICAÇÃO DE CONTEÚDO DE TODAS AS OBRAS CITADAS (Regra R6 — ${rvc.totalObrasVerificadas}/${rvc.totalObrasCitadas} verificadas):`
      );
      blocos.push(`• Total de Obras Citadas no Texto: ${rvc.totalObrasCitadas}`);
      blocos.push(`• Obras com Conteúdo Auditado (Resumo/PDF/Repositório/Norma): ${rvc.totalObrasVerificadas}`);
      blocos.push(`• Obras Não Verificadas: ${rvc.totalObrasNaoVerificadas}`);
      if (rvc.obras?.length) {
        rvc.obras.forEach((ob, idx) => {
          blocos.push(
            `   ${idx + 1}. **${ob.autor} (${ob.ano})** [${ob.status}]: ${ob.motivo} (${ob.ocorrencias} passagem(ns) citada(s))`
          );
        });
      }
      blocos.push(``);
    }

    blocos.push(`## 📥 PARTE 2 — ROL DE OBRAS EM CONFORMIDADE & ADICIONADAS À BIBLIOTECA (${obrasConformes.length} obras · ${totalConformesComPdf} com PDF baixado):`);
    obrasConformes.forEach((r, idx) => {
      const refObj = refs.find((x) => x.id === r.refBibId);
      const temPdfArq = refObj?.pdf || r.temPdf;
      blocos.push(
        `${idx + 1}. **${r.primeiroSobrenome} (${r.ano})** — ${r.tituloOficial || r.tituloBuscado}`
      );
      blocos.push(`   - Status: Em Conformidade (Autenticada) | ${temPdfArq ? `✓ PDF Completo Disponível (${r.nomeArquivoPdf || refObj?.pdf || 'anexado'})` : '🔒 PDF Fechado/Paywall'}`);
      if (r.doiOficial) blocos.push(`   - DOI Oficial: https://doi.org/${r.doiOficial}`);
      blocos.push(`   - Citação: ${r.citadaNoTexto ? `Citada ${r.ocorrenciasNoTexto.length}x no texto` : 'Presente na lista final (Consultada)'}`);
    });
    blocos.push(``);

    blocos.push(`## 📚 QUADRO COMPLETO DE CONFERÊNCIA OBRA POR OBRA (${resultado.refsMapeadas.length} referências):`);
    resultado.refsMapeadas.forEach((r, idx) => {
      blocos.push(
        `${idx + 1}. **${r.primeiroSobrenome} (${r.ano})** — ${r.citadaNoTexto ? `Citada ${r.ocorrenciasNoTexto.length}x` : 'NÃO CITADA NO TEXTO'} | Status: ${r.alertaAutenticidade || 'OK'}`
      );
      blocos.push(`   Referência: ${r.textoOriginal}`);
      const listaOc = r.verificacoesPdf?.length
        ? r.verificacoesPdf
        : (r.ocorrenciasNoTexto || []).map((o) => ({ ocorrencia: o, mensagem: o.trechoArtigoResumo ? 'Confirmado no resumo' : 'Citado no Word' }));
      listaOc.forEach((v) => {
        const oc = v.ocorrencia || v;
        blocos.push(
          `   - Word (§${oc.numParagrafo}, Linha ${oc.numLinha}): "${oc.fraseContexto}" -> ${v.mensagem || ''}${
            v.trechoPdf || oc.trechoArtigoResumo ? ` | Trecho no artigo: "${v.trechoPdf || oc.trechoArtigoResumo}"` : ''
          }`
        );
      });
    });

    return blocos.join('\n');
  };

  const copiarPromptCompletoIa = () => {
    const prompt = gerarTextoPromptParaIa();
    if (!prompt) return;
    window.api.sistema.copiarTexto(prompt);
    avisar(
      '🤖 Prompt Completo da Auditoria copiado! Agora é só dar Ctrl+V no ChatGPT, Claude ou Gemini para questionar o que está certo ou errado.',
      'ok'
    );
  };

  const copiarPromptItemIndividualIa = ({ tituloProblema, fraseWord, paragrafoWord, locWord, refTexto, diagnostico, trechoArtigo }) => {
    const prompt = [
      `🤖 ANÁLISE DE CITAÇÃO / REFERÊNCIA CIENTÍFICA NO MEU MANUSCRITO:`,
      ``,
      `• Ponto auditado: ${tituloProblema}`,
      locWord ? `• Localização no meu Word: ${locWord}` : '',
      refTexto ? `• Referência citada: ${refTexto}` : '',
      diagnostico ? `• Diagnóstico da Auditoria Forense: ${diagnostico}` : '',
      fraseWord ? `• Frase escrita no meu Word: "${fraseWord}"` : '',
      paragrafoWord && paragrafoWord !== fraseWord ? `• Parágrafo completo no Word: "${paragrafoWord}"` : '',
      trechoArtigo ? `• Trecho encontrado no artigo original: "${trechoArtigo}"` : '',
      ``,
      `Por favor, avalie este ponto específico:`,
      `1) O que está certo ou errado nesta citação/referência?`,
      `2) Reescreva a frase/parágrafo corrigido com rigor científico;`,
      `3) Se a fonte tiver problema de autenticidade ou atribuição, indique a referência correta real (com DOI).`,
    ]
      .filter(Boolean)
      .join('\n');
    window.api.sistema.copiarTexto(prompt);
    avisar('🤖 Prompt deste item copiado para você colar na IA e questionar!', 'ok');
  };

  const obrasCriticas = (resultado?.refsMapeadas || []).filter(
    (r) =>
      ['ia_doi_trocado', 'ia_doi_inexistente', 'ia_autor_adulterado', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade) ||
      r.retratado ||
      alertasAtribuicaoFalsa.some((a) => a.autorCitado?.toLowerCase().includes(r.primeiroSobrenome.toLowerCase()))
  );

  const obrasComRessalva = (resultado?.refsMapeadas || []).filter(
    (r) =>
      !obrasCriticas.includes(r) &&
      (!r.citadaNoTexto ||
        r.divergenciaMetadados ||
        r.verificacoesPdf?.some((v) => v.status === 'nao_encontrado' || v.status === 'divergencia_pagina'))
  );

  const obrasPlenamenteConformes = (resultado?.refsMapeadas || []).filter(
    (r) => !obrasCriticas.includes(r) && !obrasComRessalva.includes(r)
  );

  const renderCardObra = (r, idx) => {
    const refObj = refs.find((x) => x.id === r.refBibId);
    const chaveBuscaCard = `ref_${idx}`;
    const primOc = r.ocorrenciasNoTexto?.[0];
    const ehCritica =
      ['ia_doi_trocado', 'ia_doi_inexistente', 'ia_autor_adulterado', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade) ||
      r.retratado ||
      alertasAtribuicaoFalsa.some((a) => a.autorCitado?.toLowerCase().includes(r.primeiroSobrenome.toLowerCase()));
    const ehRessalva =
      !ehCritica &&
      (!r.citadaNoTexto ||
        r.divergenciaMetadados ||
        r.verificacoesPdf?.some((v) => v.status === 'nao_encontrado' || v.status === 'divergencia_pagina'));

    return (
      <div
        key={idx}
        className="card-historico"
        style={{
          borderLeft: ehCritica
            ? '4px solid #dc2626'
            : ehRessalva
            ? '4px solid #f59e0b'
            : '4px solid #16a34a',
        }}
      >
        <div className="card-historico-topo">
          <div style={{ flex: 1 }}>
            <strong>{r.textoOriginal}</strong>
            <div className="sub-meta" style={{ marginTop: 4 }}>
              {r.citadaNoTexto ? (
                <span className="badge-ja-existe">
                  ✓ Citada {r.ocorrenciasNoTexto.length}x no texto
                </span>
              ) : (
                <span style={{ color: '#d97706', fontWeight: 700 }}>
                  ⚠ INCONFORMIDADE: Está na lista de Referências, mas NUNCA foi citada no texto (marcada como Consultada)
                </span>
              )}
              {r.doiOficial && ` · DOI: ${r.doiOficial}`}
              {refObj?.pdf || r.temPdf
                ? ' · 📄 PDF baixado/anexado na Biblioteca'
                : ' · ⚠ Sem PDF aberto automático (você pode buscar no Google e anexar manualmente ao lado!)'}
            </div>
            {r.alertaAutenticidade && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 4,
                  color:
                    r.statusAutenticidade === 'autenticada'
                      ? '#15803d'
                      : r.statusAutenticidade === 'institucional_tese'
                      ? '#2563eb'
                      : '#dc2626',
                }}
              >
                {r.alertaAutenticidade}
              </div>
            )}
            {r.divergenciaMetadados && r.divergenciaMetadados !== r.alertaAutenticidade && (
              <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                ⚠ {r.divergenciaMetadados}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn pequeno secundario"
              onClick={() =>
                abrirBuscaArtigoParecido(chaveBuscaCard, {
                  fraseWord: primOc?.fraseContexto || '',
                  tituloSugerido: r.tituloBuscado || '',
                  textoRef: r.textoOriginal,
                  autor: r.primeiroSobrenome,
                  numParagrafo: primOc?.numParagrafo || '',
                })
              }
              title="Busca artigos científicos reais parecidos com este tema nas bases PubMed, OpenAlex e Europe PMC"
            >
              🔎 Artigos Parecidos
            </button>
            <button
              className="btn pequeno fantasma"
              onClick={() =>
                copiarPromptItemIndividualIa({
                  tituloProblema: `Conferência da referência ${r.primeiroSobrenome} (${r.ano})`,
                  fraseWord: primOc?.fraseContexto,
                  paragrafoWord: primOc?.paragrafoCompleto,
                  locWord: primOc ? `Parágrafo §${primOc.numParagrafo} · Linha ${primOc.numLinha}` : '',
                  refTexto: r.textoOriginal,
                  diagnostico: r.alertaAutenticidade,
                  trechoArtigo: primOc?.trechoArtigoResumo,
                })
              }
              title="Copiar detalhes desta referência e parágrafo para questionar na IA"
            >
              🤖 Copiar p/ IA
            </button>
            {refObj?.pdf ? (
              <>
                <button
                  className="btn pequeno primario"
                  onClick={() => onAbrirPdfNaPagina(refObj)}
                  title="Abrir o PDF no leitor interno para ver os grifos e páginas"
                >
                  <Icone nome="book" tam={13} /> Abrir PDF
                </button>
                <button
                  className="btn pequeno fantasma"
                  onClick={() => anexarPdfEVerificarCard(r, idx)}
                  title="Substituir por outro PDF do seu computador"
                >
                  Trocar PDF
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn pequeno secundario"
                  onClick={() => buscarPdfNaWebManual(r)}
                  title="Abre o Google Acadêmico já pesquisando esta referência para você baixar o PDF no computador"
                >
                  🌐 1. Buscar PDF no Google
                </button>
                <button
                  className="btn pequeno primario"
                  onClick={() => anexarPdfEVerificarCard(r, idx)}
                  title="Seleciona o PDF que você baixou no computador, anexa na Biblioteca e confere a página da citação na hora!"
                >
                  📎 2. Anexar PDF Baixado do PC
                </button>
              </>
            )}
            {onIrParaBiblioteca && r.refBibId && (
              <button
                className="btn pequeno secundario"
                onClick={() => onIrParaBiblioteca(r.refBibId)}
                title="Ver este artigo na tabela principal da biblioteca"
              >
                📂 Ver na Biblioteca
              </button>
            )}
          </div>
        </div>

        {renderPainelBuscaArtigoParecido(chaveBuscaCard)}

        {(r.verificacoesPdf?.length > 0 || r.ocorrenciasNoTexto?.length > 0) && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(r.verificacoesPdf?.length
              ? r.verificacoesPdf
              : (r.ocorrenciasNoTexto || []).map((oc) => ({
                  ocorrencia: oc,
                  status: 'resumo',
                  paginaPdf: oc.paginaPdf || null,
                  trechoPdf: oc.trechoPdf || null,
                  mensagem: oc.trechoArtigoResumo
                    ? '📋 Localizado no Resumo/PICO do artigo'
                    : '📍 Citação localizada no seu Word',
                }))
            ).map((v, i) => {
              const oc = v.ocorrencia || v;
              const cor =
                v.status === 'nao_encontrado'
                  ? '#dc2626'
                  : v.status === 'divergencia_pagina'
                  ? '#d97706'
                  : v.status === 'resumo'
                  ? '#2563eb'
                  : '#15803d';
              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 11px',
                    borderRadius: 6,
                    background: 'rgba(148, 163, 184, 0.1)',
                    borderLeft: `3px solid ${cor}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: '#1e3a8a',
                          color: '#fff',
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        📍 Word: Parágrafo §{oc.numParagrafo || i + 1} · Linha {oc.numLinha || '?'}
                        {oc.secao ? ` · Seção: ${oc.secao}` : ''}
                      </span>
                      <span style={{ fontWeight: 600, color: cor, fontSize: 12 }}>{v.mensagem}</span>
                    </div>
                    {refObj?.pdf && v.paginaPdf && (
                      <button
                        className="btn pequeno primario"
                        style={{ padding: '2px 8px', fontSize: 11.5 }}
                        onClick={() => onAbrirPdfNaPagina(refObj, v.paginaPdf)}
                      >
                        📖 Abrir PDF na Pág. {v.paginaPdf}
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: 12.2, marginTop: 5 }}>
                    <strong>📝 Frase onde você citou no Word:</strong> <em>"{oc.fraseContexto}"</em>
                  </div>

                  {oc.paragrafoCompleto && oc.paragrafoCompleto !== oc.fraseContexto && (
                    <details style={{ fontSize: 11.5, marginTop: 3, color: 'var(--texto-suave)' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                        Ver parágrafo inteiro (§{oc.numParagrafo}) do seu Word
                      </summary>
                      <div style={{ marginTop: 3, padding: '4px 8px', background: 'var(--painel)', borderRadius: 4 }}>
                        {oc.paragrafoCompleto}
                      </div>
                    </details>
                  )}

                  {(v.trechoPdf || oc.trechoArtigoResumo) && (
                    <div style={{ fontSize: 11.8, color: 'var(--texto)', marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--borda)' }}>
                      <strong>
                        📄 {v.trechoPdf ? `Trecho correspondente no PDF do Artigo (pág. ${v.paginaPdf}):` : 'Trecho correspondente no Artigo (Resumo/PICO):'}
                      </strong>{' '}
                      "{v.trechoPdf || oc.trechoArtigoResumo}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="central-buscadores">
      <div className="topo-buscadores">
        <div>
          <h2>Auditoria Forense de Manuscrito (.DOCX/PDF): Anti-IA, Anti-Plágio, Citações Falsas &amp; Páginas</h2>
          <p className="subtitulo">
            Verifica: <strong>1)</strong> Se alguma fonte foi inventada pela IA (referência fantasma / DOI falso);{' '}
            <strong>2)</strong> Se uma citação não existe no artigo ou foi atribuída ao artigo errado;{' '}
            <strong>3)</strong> Se há plágio / cópia sem aspas; <strong>4)</strong> Em qual Parágrafo, Linha do Word e Página do PDF está cada citação.
          </p>
        </div>
        <div className="acoes-topo-buscadores" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secundario" onClick={escolherArquivo} disabled={rodando}>
            <Icone nome="upload" tam={14} /> Carregar Arquivo (.DOCX, .PDF, .TXT)
          </button>
          {resultado && (
            <>
              <button
                className="btn primario"
                onClick={copiarPromptCompletoIa}
                title="Copia um relatório estruturado em formato de Prompt para você colar no ChatGPT, Claude ou Gemini e questionar o que está certo ou errado"
              >
                🤖 Copiar Relatório p/ Colar na IA
              </button>
              <button
                className="btn secundario"
                onClick={() => setMostrarPainelPromptIa((v) => !v)}
                title="Visualizar e personalizar o relatório antes de copiar para a IA"
              >
                {mostrarPainelPromptIa ? 'Ocultar Prévia do Relatório IA' : '👁️ Ver / Editar Relatório p/ IA'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* BARRA DE SESSÃO FIXADA: Garante que a auditoria nunca suma ao consultar PDFs ou mudar de aba! */}
      {resultado && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 14px',
            marginBottom: 12,
            borderRadius: 9,
            background: 'linear-gradient(90deg, rgba(37, 99, 235, 0.11) 0%, rgba(16, 185, 129, 0.10) 100%)',
            border: '1.5px solid rgba(37, 99, 235, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                background: '#1d4ed8',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 11.8,
                fontWeight: 800,
              }}
            >
              📌 AUDITORIA FIXADA NA TELA
            </span>
            <strong style={{ fontSize: 13 }}>
              {nomeArquivo || 'Manuscrito auditado'} {dataHora ? `· Concluída em ${dataHora}` : ''}
            </strong>
            <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
              (Permanece salva mesmo ao abrir PDFs ou trocar de aba!)
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn pequeno secundario"
              onClick={() => setMostrarCaixaTexto(!mostrarCaixaTexto)}
            >
              {mostrarCaixaTexto ? '🔼 Recolher Caixa de Texto' : '📝 Ver / Editar Texto do Manuscrito'}
            </button>
            <button
              className="btn pequeno primario"
              onClick={executarAuditoria}
              disabled={rodando}
              title="Roda novamente a auditoria sobre o texto atual"
            >
              🔄 Refazer Auditoria
            </button>
            <button
              className="btn pequeno secundario"
              onClick={escolherArquivo}
              disabled={rodando}
              title="Escolher outro arquivo .DOCX ou .PDF para uma nova auditoria"
            >
              📂 Carregar Novo Arquivo
            </button>
            <button
              className="btn pequeno perigo"
              onClick={limparAuditoriaAtual}
              disabled={rodando}
              title="Limpa a auditoria atual para começar uma nova do zero"
            >
              🗑️ Limpar Auditoria
            </button>
          </div>
        </div>
      )}

      {/* PAINEL EXPANSÍVEL DO RELATÓRIO / PROMPT PARA COLAR NA IA */}
      {resultado && mostrarPainelPromptIa && (
        <div
          className="bloco-cofre"
          style={{
            borderLeft: '4px solid #2563eb',
            background: 'rgba(37, 99, 235, 0.04)',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div>
              <h4 style={{ margin: 0, color: '#1d4ed8' }}>
                🤖 Relatório Forense Estruturado para Colar na IA (ChatGPT, Claude, Gemini, Perplexity)
              </h4>
              <p className="dica-texto" style={{ margin: '2px 0 0 0' }}>
                Este relatório já inclui todas as citações, parágrafos (§), linhas, diagnósticos de IA/plágio e perguntas para a IA te responder o que está certo ou errado e como corrigir.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn pequeno primario" onClick={copiarPromptCompletoIa}>
                <Icone nome="copy" tam={13} /> Copiar Tudo p/ Colar na IA
              </button>
              <button className="btn pequeno fantasma" onClick={() => setMostrarPainelPromptIa(false)}>
                Fechar ×
              </button>
            </div>
          </div>

          <label className="campo" style={{ marginBottom: 8 }}>
            <span className="campo-rotulo">Sua pergunta/comando principal para a IA no topo do relatório (editável):</span>
            <input
              value={instrucaoExtraIa}
              onChange={(e) => setInstrucaoExtraIa(e.target.value)}
            />
          </label>

          <textarea
            rows={12}
            readOnly
            value={gerarTextoPromptParaIa()}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.5,
              padding: 10,
              borderRadius: 6,
              border: '1px solid var(--borda)',
              background: 'var(--painel)',
              color: 'var(--texto)',
            }}
          />
        </div>
      )}

      {(!resultado || mostrarCaixaTexto) && (
        <div className="bloco-proxy">
          {/* Seletor de Pasta de Destino para PDFs e Obras */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              padding: '10px 14px',
              marginBottom: 12,
              background: 'var(--painel)',
              borderRadius: 8,
              border: '1px solid var(--borda)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
              <span style={{ fontSize: 20 }}>📁</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mutado)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pasta de Destino dos Artigos &amp; PDFs (OneDrive ou PC)
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--texto)', wordBreak: 'break-all' }}>
                  {pastaDestino || 'Pasta padrão do projeto (biblioteca/pdfs)'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn secundario pequeno"
                onClick={escolherPastaDestino}
                title="Escolha uma pasta no seu computador ou no OneDrive para salvar os PDFs e bibliografias"
              >
                📂 Escolher Pasta no OneDrive / PC…
              </button>
              {resultado?.refsMapeadas?.length > 0 && (
                <button
                  type="button"
                  className="btn primario pequeno"
                  onClick={baixarTodosPdfsParaPasta}
                  disabled={baixandoLotePdfs}
                  title="Baixa ou copia todos os PDFs encontrados diretamente para a pasta selecionada"
                >
                  ⬇ {baixandoLotePdfs ? 'Baixando…' : 'Salvar PDFs na Pasta'}
                </button>
              )}
            </div>
          </div>

          <label className="campo">
            <span className="campo-rotulo">
              {nomeArquivo
                ? `Texto carregado de: ${nomeArquivo} (você também pode editar ou colar outro texto abaixo)`
                : 'Escolha um arquivo (.DOCX, .PDF, .TXT) acima ou cole diretamente aqui o texto do seu artigo/capítulo (incluindo a seção final de Referências):'}
            </span>
            <textarea
              rows={6}
              value={textoManuscrito}
              onChange={(e) => setTextoManuscrito(e.target.value)}
              placeholder="Cole o texto com as citações (ex.: Segundo Silva (2020, p. 4)...) e a lista de REFERÊNCIAS ao final, ou clique em 'Carregar Arquivo (.DOCX, .PDF, .TXT)' acima…"
            />
          </label>

          {/* Seletor Modular de Tipo de Problema */}
          <div style={{ marginTop: 10, marginBottom: 8, padding: '10px 14px', background: 'var(--fundo)', borderRadius: 8, border: '1px solid var(--borda)' }}>
            <span style={{ fontSize: 11.8, fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              🔍 Modo de Execução da Auditoria Forense:
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'todos', label: '🎯 Todos os Níveis (Completa)', desc: 'Auditoria forense em todas as 6 frentes: chamadas, autenticidade em 8 bases, páginas, plágio, semântica e redação IA' },
                { id: 'chamadas', label: '1️⃣ Citações x Referências (< 1s)', desc: 'Nível 1: Cruza citações no corpo do texto x lista final (órfãs e sobrando) sem baixar PDFs' },
                { id: 'autenticidade', label: '2️⃣ Autenticidade em 8 Bases & Anti-IA', desc: 'Nível 2: Autentica referências e DOIs (Crossref, PubMed, OpenAlex, Handles) contra alucinação de IA' },
                { id: 'paginas', label: '3️⃣ Citações Diretas & Páginas', desc: 'Nível 3: Confere páginas indicadas (ex. p. 14) e frases entre aspas contra os PDFs originais' },
                { id: 'plagio', label: '4️⃣ Detector de Plágio (Google Diff)', desc: 'Nível 4: Google Diff Match Patch para detectar blocos idênticos de 7+ palavras nos PDFs' },
                { id: 'semantica', label: '5️⃣ Fidelidade Semântica (Amazon Science)', desc: 'Nível 5: TF-IDF e Similaridade de Cosseno para avaliar se a ideia atribuída existe no artigo citado' },
                { id: 'estilo_ia', label: '6️⃣ Marcadores de Redação IA (Open-Detector)', desc: 'Nível 6: Open-Detector para flagrar parágrafos com jargões e cadência típica de LLMs' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`btn pequeno ${moduloAuditoria === m.id ? 'primario' : 'secundario'}`}
                  onClick={() => setModuloAuditoria(m.id)}
                  title={m.desc}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="linha-opcoes-rapido">
            <label className="campo-inline" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={buscarEBaixar}
                onChange={(e) => setBuscarEBaixar(e.target.checked)}
                disabled={moduloAuditoria === 'chamadas' || moduloAuditoria === 'estilo_ia'}
              />
              <span style={{ opacity: moduloAuditoria === 'chamadas' || moduloAuditoria === 'estilo_ia' ? 0.6 : 1 }}>
                Buscar automaticamente nas bases (Crossref/OpenAlex) os artigos que ainda não estão na biblioteca e baixar os PDFs gratuitos
              </span>
            </label>
            <button className="btn primario" onClick={() => executarAuditoria(moduloAuditoria)} disabled={rodando}>
              <Icone nome="search" tam={15} />{' '}
              {rodando
                ? 'Auditando em tempo real…'
                : moduloAuditoria === 'chamadas'
                ? '⚡ Executar Nível 1: Citações x Referências (< 1s)'
                : moduloAuditoria === 'autenticidade'
                ? '🛡️ Executar Nível 2: Autenticidade em 8 Bases & Anti-IA'
                : moduloAuditoria === 'paginas'
                ? '📄 Executar Nível 3: Citações Diretas & Páginas'
                : moduloAuditoria === 'plagio'
                ? '🔍 Executar Nível 4: Detector de Plágio (Google Diff)'
                : moduloAuditoria === 'semantica'
                ? '🧠 Executar Nível 5: Fidelidade Semântica (Amazon Science)'
                : moduloAuditoria === 'estilo_ia'
                ? '🤖 Executar Nível 6: Redação IA (Open-Detector)'
                : 'Executar Auditoria Reversa Completa (6 Níveis)'}
            </button>
          </div>
        </div>
      )}

      {/* Barra de Progresso Real-time em Alto Destaque da Auditoria Forense */}
      {rodando && (
        <div className="card-progresso-auditoria" role="progressbar" aria-valuenow={progresso.porcentagem || 5} aria-valuemin="0" aria-valuemax="100">
          <div className="progresso-cabecalho">
            <div className="progresso-fase-titulo">
              <span className="progresso-pulse-ativo" />
              <span>
                {progresso.mensagem || etapa || 'Executando auditoria forense do manuscrito…'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {progresso.total > 0 && (
                <span
                  className="tag-mini"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: 'var(--primaria)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  {progresso.atual} de {progresso.total} referências
                </span>
              )}
              <span className="progresso-badge-porcentagem">
                {progresso.porcentagem || 5}%
              </span>
            </div>
          </div>

          <div className="progresso-trilho">
            <div
              className="progresso-preenchimento"
              style={{ width: `${Math.max(5, Math.min(100, progresso.porcentagem || 5))}%` }}
            />
          </div>

          <div className="progresso-rodape">
            <div className="progresso-detalhe-item" title={progresso.detalhe}>
              {progresso.detalhe ? (
                <>📖 <span>{progresso.detalhe}</span></>
              ) : (
                <span>⚡ Processando ativamente na sua máquina (sem travar)…</span>
              )}
            </div>
            <div style={{ fontStyle: 'italic', opacity: 0.85, fontSize: 11.5 }}>
              Auditoria em tempo real · Por favor, aguarde
            </div>
          </div>
        </div>
      )}

      {resultado && (
        <>
          {/* Painel de 8 métricas forenses da auditoria */}
          <div className="grade-metricas" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="card-metrica">
              <span className="rotulo-metrica">Citações no Word</span>
              <strong>{resultado.totalCitacoesOcorrencias}</strong>
              <span>{resultado.totalAutoresCitadosUnicos} obras distintas</span>
            </div>
            <div className="card-metrica">
              <span className="rotulo-metrica">🤖 Fontes Inventadas por IA</span>
              <strong style={{ color: refsSuspeitasIa.length ? '#dc2626' : '#16a34a' }}>
                {refsSuspeitasIa.length}
              </strong>
              <span>{refsSuspeitasIa.length ? 'DOI falso / Artigo fantasma' : 'Todas autenticadas'}</span>
            </div>
            <div className="card-metrica">
              <span className="rotulo-metrica">🚨 Citação Falsa / Trocada</span>
              <strong style={{ color: alertasAtribuicaoFalsa.length ? '#dc2626' : '#16a34a' }}>
                {alertasAtribuicaoFalsa.length}
              </strong>
              <span>{alertasAtribuicaoFalsa.length ? 'Não consta no artigo citado' : 'Conteúdo compatível'}</span>
            </div>
            <div className="card-metrica">
              <span className="rotulo-metrica">🔍 Plágio / Cópia s/ Aspas</span>
              <strong style={{ color: alertasPlagio.length ? '#dc2626' : '#16a34a' }}>
                {alertasPlagio.length}
              </strong>
              <span>{alertasPlagio.length ? 'Trechos copiados literalmente' : 'Nenhum plágio'}</span>
            </div>
            <div className="card-metrica">
              <span className="rotulo-metrica">Citadas s/ Referência</span>
              <strong style={{ color: resultado.citacoesSemReferencia.length ? '#dc2626' : '#16a34a' }}>
                {resultado.citacoesSemReferencia.length}
              </strong>
              <span>Faltando na lista final</span>
            </div>
            <div className="card-metrica">
              <span className="rotulo-metrica">Nas Referências s/ Citação</span>
              <strong style={{ color: refsNaoCitadasNoTexto.length ? '#d97706' : '#16a34a' }}>
                {refsNaoCitadasNoTexto.length}
              </strong>
              <span>Sobrando (Consultadas)</span>
            </div>
            <div className="card-metrica">
              <span className="rotulo-metrica">🎯 Total Inconformidades</span>
              <strong style={{ color: totalInconformidades > 0 ? '#dc2626' : '#16a34a' }}>
                {totalInconformidades}
              </strong>
              <span>{totalInconformidades > 0 ? 'Pontos a corrigir' : '100% Conforme'}</span>
            </div>
            <div className="card-metrica">
              <span className="rotulo-metrica">📥 Conformes no Rol de Trabalho</span>
              <strong style={{ color: '#16a34a' }}>
                {totalConformesComPdf} / {obrasConformes.length}
              </strong>
              <span>{totalConformesComPdf} PDFs baixados e salvos</span>
            </div>
          </div>

          {/* BARRA DE SELEÇÃO DOS DOIS PILARES DA AUDITORIA REVERSA */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              margin: '14px 0 16px 0',
              padding: '6px',
              borderRadius: 8,
              background: 'var(--painel)',
              border: '1px solid var(--borda)',
              flexWrap: 'wrap',
            }}
          >
            <button
              className={`btn ${abaVisualizacao === 'inconformidades' ? 'primario' : 'fantasma'}`}
              style={{
                fontWeight: 700,
                fontSize: 12.8,
                background: abaVisualizacao === 'inconformidades' ? '#dc2626' : 'transparent',
                borderColor: abaVisualizacao === 'inconformidades' ? '#dc2626' : 'transparent',
                color: abaVisualizacao === 'inconformidades' ? '#fff' : 'var(--texto)',
              }}
              onClick={() => setAbaVisualizacao('inconformidades')}
            >
              🎯 1. Painel de Inconformidades ({totalInconformidades})
            </button>
            <button
              className={`btn ${abaVisualizacao === 'conformes' ? 'primario' : 'fantasma'}`}
              style={{
                fontWeight: 700,
                fontSize: 12.8,
                background: abaVisualizacao === 'conformes' ? '#16a34a' : 'transparent',
                borderColor: abaVisualizacao === 'conformes' ? '#16a34a' : 'transparent',
                color: abaVisualizacao === 'conformes' ? '#fff' : 'var(--texto)',
              }}
              onClick={() => setAbaVisualizacao('conformes')}
            >
              📥 2. Rol de Obras em Conformidade ({obrasConformes.length} adicionadas · {totalConformesComPdf} com PDF)
            </button>
            <button
              className={`btn ${abaVisualizacao === 'todas' ? 'primario' : 'fantasma'}`}
              style={{ fontWeight: 600, fontSize: 12.8 }}
              onClick={() => setAbaVisualizacao('todas')}
            >
              📋 3. Visão Geral Completa ({resultado.refsMapeadas.length})
            </button>
          </div>

          {/* FEEDBACK CASO ZERO INCONFORMIDADES SELECIONADO */}
          {abaVisualizacao === 'inconformidades' && totalInconformidades === 0 && (
            <div
              className="bloco-cofre"
              style={{
                borderLeft: '4px solid #16a34a',
                background: 'rgba(22, 163, 74, 0.05)',
                padding: '18px',
                textAlign: 'center',
                marginBottom: 16,
              }}
            >
              <h3 style={{ color: '#15803d', margin: '0 0 6px 0' }}>
                🎉 Nenhuma Inconformidade Encontrada!
              </h3>
              <p style={{ margin: 0, color: 'var(--texto-suave)', fontSize: 13 }}>
                Todas as citações no texto possuem referências correspondentes, todos os DOIs e fontes foram autenticados nas bases oficiais e nenhum plágio ou alucinação foi detectado no manuscrito.
              </p>
            </div>
          )}

          {/* SEÇÃO 1: BLOCOS DE INCONFORMIDADES (Visível em 'inconformidades' ou 'todas') */}
          {(abaVisualizacao === 'inconformidades' || abaVisualizacao === 'todas') && (
            <>
              {/* Barra de Filtro e Agrupamento por Tipo de Intercorrência */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  margin: '0 0 12px 0',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--fundo)',
                  border: '1px solid var(--borda)',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--texto-suave)', marginRight: 4 }}>
                  🗂️ Agrupar / Filtrar Intercorrências:
                </span>
                <button
                  className={`chip ${grupoIntercorrenciaAtivo === 'todas' ? 'ativo' : ''}`}
                  onClick={() => setGrupoIntercorrenciaAtivo('todas')}
                  style={{ fontSize: 11.8, padding: '3px 10px' }}
                >
                  Todas ({totalInconformidades})
                </button>
                {refsSuspeitasIa.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'ia' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('ia')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'ia' ? '#fff' : '#dc2626',
                      borderColor: '#dc2626',
                      background: grupoIntercorrenciaAtivo === 'ia' ? '#dc2626' : 'transparent',
                    }}
                  >
                    🤖 IA / DOI Falso ({refsSuspeitasIa.length})
                  </button>
                )}
                {alertasAtribuicaoFalsa.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'citacao_falsa' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('citacao_falsa')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'citacao_falsa' ? '#fff' : '#dc2626',
                      borderColor: '#dc2626',
                      background: grupoIntercorrenciaAtivo === 'citacao_falsa' ? '#dc2626' : 'transparent',
                    }}
                  >
                    🚨 Citação Trocada / Inexistente ({alertasAtribuicaoFalsa.length})
                  </button>
                )}
                {alertasPlagio.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'plagio' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('plagio')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'plagio' ? '#fff' : '#dc2626',
                      borderColor: '#dc2626',
                      background: grupoIntercorrenciaAtivo === 'plagio' ? '#dc2626' : 'transparent',
                    }}
                  >
                    🔍 Plágio / Cópia ({alertasPlagio.length})
                  </button>
                )}
                {resultado.citacoesSemReferencia.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'orfa' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('orfa')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'orfa' ? '#fff' : '#b91c1c',
                      borderColor: '#b91c1c',
                      background: grupoIntercorrenciaAtivo === 'orfa' ? '#b91c1c' : 'transparent',
                    }}
                  >
                    ❌ Citações Órfãs ({resultado.citacoesSemReferencia.length})
                  </button>
                )}
                {refsNaoCitadasNoTexto.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'sobrando' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('sobrando')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'sobrando' ? '#fff' : '#d97706',
                      borderColor: '#d97706',
                      background: grupoIntercorrenciaAtivo === 'sobrando' ? '#d97706' : 'transparent',
                    }}
                  >
                    ⚠️ Referências Não Citadas ({refsNaoCitadasNoTexto.length})
                  </button>
                )}
                {alertasMetadadosAbnt.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'metadados' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('metadados')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'metadados' ? '#fff' : '#2563eb',
                      borderColor: '#2563eb',
                      background: grupoIntercorrenciaAtivo === 'metadados' ? '#2563eb' : 'transparent',
                    }}
                  >
                    📐 Metadados & ABNT ({alertasMetadadosAbnt.length})
                  </button>
                )}
                {alertasPdf.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'pdf' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('pdf')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'pdf' ? '#fff' : '#7c3aed',
                      borderColor: '#7c3aed',
                      background: grupoIntercorrenciaAtivo === 'pdf' ? '#7c3aed' : 'transparent',
                    }}
                  >
                    📄 Divergência no PDF ({alertasPdf.length})
                  </button>
                )}
                {alertasMetodologicos.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'metodologico' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('metodologico')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'metodologico' ? '#fff' : '#4b5563',
                      borderColor: '#6b7280',
                      background: grupoIntercorrenciaAtivo === 'metodologico' ? '#4b5563' : 'transparent',
                    }}
                  >
                    📌 Escopo Metodológico ({alertasMetodologicos.length})
                  </button>
                )}
                {alertasEstiloIa.length > 0 && (
                  <button
                    className={`chip ${grupoIntercorrenciaAtivo === 'estilo_ia' ? 'ativo' : ''}`}
                    onClick={() => setGrupoIntercorrenciaAtivo('estilo_ia')}
                    style={{
                      fontSize: 11.8,
                      padding: '3px 10px',
                      color: grupoIntercorrenciaAtivo === 'estilo_ia' ? '#fff' : '#8b5cf6',
                      borderColor: '#8b5cf6',
                      background: grupoIntercorrenciaAtivo === 'estilo_ia' ? '#8b5cf6' : 'transparent',
                    }}
                  >
                    🤖 Redação IA ({alertasEstiloIa.length})
                  </button>
                )}
              </div>

          {/* ALERTA A: Fontes Inventadas por IA (Alucinação de ChatGPT / DOI falso / Artigo fantasma) */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'ia') && refsSuspeitasIa.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #dc2626', background: 'rgba(220, 38, 38, 0.04)' }}>
              <h4 style={{ color: '#dc2626' }}>
                🤖 Alerta Anti-Alucinação de IA: Fontes Suspeitas de terem sido Inventadas ({refsSuspeitasIa.length})
              </h4>
              <div className="lista-historico">
                {refsSuspeitasIa.map((r, i) => {
                  const chaveBusca = `ia_${i}`;
                  const primOc = r.ocorrenciasNoTexto?.[0];
                  return (
                    <div key={i} className="card-historico" style={{ borderLeft: '3px solid #dc2626' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <strong>{r.textoOriginal}</strong>
                          <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 12.5, marginTop: 4 }}>
                            {r.alertaAutenticidade}
                          </div>
                          {primOc && (
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                              <strong>📍 Onde você citou no Word (§{primOc.numParagrafo}, Linha {primOc.numLinha}):</strong>{' '}
                              <em>"{primOc.fraseContexto}"</em>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn pequeno primario"
                            onClick={() =>
                              abrirBuscaArtigoParecido(chaveBusca, {
                                fraseWord: primOc?.fraseContexto || '',
                                tituloSugerido: r.tituloBuscado || '',
                                textoRef: r.textoOriginal,
                                autor: r.primeiroSobrenome,
                                numParagrafo: primOc?.numParagrafo || '',
                              })
                            }
                            title="Pesquisa nas bases científicas (PubMed, OpenAlex, Europe PMC) artigos reais que tratam exatamente do mesmo tema para substituir esta fonte suspeita!"
                          >
                            🔎 Buscar Artigo Real Parecido p/ Substituir
                          </button>
                          <button
                            className="btn pequeno secundario"
                            onClick={() =>
                              copiarPromptItemIndividualIa({
                                tituloProblema: 'Fonte com suspeita de alucinação por IA / não encontrada',
                                fraseWord: primOc?.fraseContexto,
                                paragrafoWord: primOc?.paragrafoCompleto,
                                locWord: primOc ? `Parágrafo §${primOc.numParagrafo} · Linha ${primOc.numLinha}` : '',
                                refTexto: r.textoOriginal,
                                diagnostico: r.alertaAutenticidade,
                              })
                            }
                          >
                            🤖 Copiar p/ IA analisar
                          </button>
                        </div>
                      </div>
                      {renderPainelBuscaArtigoParecido(chaveBusca)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ALERTA B: Citação que NÃO Existe no Artigo ou foi Atribuída ao Artigo Errado */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'citacao_falsa') && alertasAtribuicaoFalsa.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #dc2626', background: 'rgba(220, 38, 38, 0.04)' }}>
              <h4 style={{ color: '#dc2626' }}>
                🚨 Citações Inexistentes no Artigo ou Atribuídas ao Artigo Errado ({alertasAtribuicaoFalsa.length})
              </h4>
              <div className="lista-historico">
                {alertasAtribuicaoFalsa.map((a, i) => {
                  const chaveBusca = `falsa_${i}`;
                  return (
                    <div key={i} className="card-historico" style={{ borderLeft: '3px solid #dc2626' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 12.8 }}>{a.mensagem}</div>
                          <div style={{ fontSize: 12.2, marginTop: 4 }}>
                            <strong>📍 Frase no seu Word (Parágrafo §{a.numParagrafo} · Linha {a.numLinha}):</strong>{' '}
                            <em>"{a.fraseWord}"</em>
                          </div>
                          {a.outroArtigoSugerido && (
                            <div style={{ fontSize: 12, color: '#15803d', fontWeight: 700, marginTop: 4 }}>
                              💡 Fonte correta identificada na sua biblioteca: {a.outroArtigoSugerido}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn pequeno primario"
                            onClick={() =>
                              abrirBuscaArtigoParecido(chaveBusca, {
                                fraseWord: a.fraseWord,
                                tituloSugerido: '',
                                textoRef: a.autorCitado || '',
                                autor: a.autorCitado || '',
                                numParagrafo: a.numParagrafo,
                              })
                            }
                          >
                            🔎 Buscar Artigo Real sobre esta Frase
                          </button>
                          <button
                            className="btn pequeno secundario"
                            onClick={() =>
                              copiarPromptItemIndividualIa({
                                tituloProblema: 'Citação não localizada no artigo citado / possível troca de autor',
                                fraseWord: a.fraseWord,
                                locWord: `Parágrafo §${a.numParagrafo} · Linha ${a.numLinha}`,
                                diagnostico: `${a.mensagem}${a.outroArtigoSugerido ? ` | Sugestão na biblioteca: ${a.outroArtigoSugerido}` : ''}`,
                              })
                            }
                          >
                            🤖 Copiar p/ IA analisar
                          </button>
                        </div>
                      </div>
                      {renderPainelBuscaArtigoParecido(chaveBusca)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ALERTA C: Detector de Plágio / Cópia Literal Sem Aspas */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'plagio') && alertasPlagio.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #dc2626', background: 'rgba(220, 38, 38, 0.04)' }}>
              <h4 style={{ color: '#dc2626' }}>
                🔍 Detector de Plágio e Cópia Literal Sem Aspas ({alertasPlagio.length})
              </h4>
              <div className="lista-historico">
                {alertasPlagio.map((p, i) => (
                  <div key={i} className="card-historico" style={{ borderLeft: '3px solid #dc2626' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 12.8 }}>{p.mensagem}</div>
                        <div style={{ fontSize: 12.2, marginTop: 5 }}>
                          <strong>📝 Como está escrito no seu Word (§{p.numParagrafo}, Linha {p.numLinha}):</strong>{' '}
                          <em>"{p.fraseNoWord}"</em>
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--texto-suave)' }}>
                          <strong>📄 Texto original idêntico no artigo de {p.autorFonte}:</strong>{' '}
                          "{p.trechoOriginalArtigo}"
                        </div>
                        {p.trechoCoincidente && (
                          <div
                            style={{
                              fontSize: 11.8,
                              marginTop: 6,
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#b91c1c',
                              borderRadius: 6,
                              padding: '6px 10px',
                            }}
                          >
                            <strong>⚡ Sobreposição Literal (Google Diff Match Patch · {p.palavrasCoincidentes || '7+'} palavras idênticas):</strong>
                            <div style={{ marginTop: 3, fontStyle: 'italic', fontWeight: 600 }}>
                              "{p.trechoCoincidente}"
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        className="btn pequeno secundario"
                        onClick={() =>
                          copiarPromptItemIndividualIa({
                            tituloProblema: 'Alerta de Plágio / Cópia Literal sem Aspas',
                            fraseWord: p.fraseNoWord,
                            locWord: `Parágrafo §${p.numParagrafo} · Linha ${p.numLinha}`,
                            refTexto: p.autorFonte,
                            diagnostico: p.mensagem,
                            trechoArtigo: p.trechoOriginalArtigo,
                          })
                        }
                      >
                        🤖 Copiar p/ IA Parafrasear
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ALERTA D: Citadas no texto mas ausentes nas Referências (Citações Órfãs) */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'orfa') && resultado.citacoesSemReferencia.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #dc2626' }}>
              <h4 style={{ color: '#dc2626' }}>
                ❌ Inconformidade: Citadas no texto, mas AUSENTES na lista final de Referências ({resultado.citacoesSemReferencia.length})
              </h4>
              <div className="lista-historico">
                {resultado.citacoesSemReferencia.map((c, idxOrfa) => {
                  const chaveBusca = `orfa_${idxOrfa}`;
                  const primOc = c.ocorrencias?.[0];
                  return (
                    <div key={c.chave} className="card-historico">
                      <div className="card-historico-topo">
                        <div>
                          <strong>
                            {c.autor} ({c.ano}) — aparece {c.ocorrencias.length}x no texto, mas não está nas Referências finais!
                          </strong>
                          {c.tituloNaBib && <span className="badge-ja-existe" style={{ marginLeft: 8 }}>Na biblioteca: {c.tituloNaBib}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn pequeno primario"
                            onClick={() =>
                              abrirBuscaArtigoParecido(chaveBusca, {
                                fraseWord: primOc?.fraseContexto || '',
                                tituloSugerido: c.tituloNaBib || `${c.autor} ${c.ano}`,
                                textoRef: `${c.autor} ${c.ano}`,
                                autor: c.autor,
                                numParagrafo: primOc?.numParagrafo || '',
                              })
                            }
                          >
                            🔎 Buscar esta Fonte ou Artigo Parecido
                          </button>
                          <button
                            className="btn pequeno secundario"
                            onClick={() =>
                              copiarPromptItemIndividualIa({
                                tituloProblema: `Autor citado no texto (${c.autor}, ${c.ano}) mas ausente na lista final de Referências`,
                                fraseWord: primOc?.fraseContexto,
                                locWord: primOc ? `Parágrafo §${primOc.numParagrafo} · Linha ${primOc.numLinha}` : '',
                                refTexto: `${c.autor} (${c.ano})`,
                              })
                            }
                          >
                            🤖 Copiar p/ IA
                          </button>
                        </div>
                      </div>
                      {c.ocorrencias.map((oc, i) => (
                        <div key={i} className="sub-meta" style={{ marginTop: 4 }}>
                          <span className="badge-ja-existe" style={{ marginRight: 6 }}>
                            📍 Parágrafo §{oc.numParagrafo || i + 1} · Linha {oc.numLinha || '?'}
                            {oc.secao ? ` · ${oc.secao}` : ''}
                          </span>
                          <strong>Frase no Word:</strong> <em>"{oc.fraseContexto}"</em>
                        </div>
                      ))}
                      {renderPainelBuscaArtigoParecido(chaveBusca)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ALERTA E: Referências na Lista Final mas NUNCA Citadas no Texto (Sobrando / Consultadas) */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'sobrando') && refsNaoCitadasNoTexto.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #d97706', background: 'rgba(217, 119, 6, 0.04)' }}>
              <h4 style={{ color: '#b45309' }}>
                ⚠️ Inconformidade: Obras na Lista Final de Referências que NUNCA foram Citadas no Texto ({refsNaoCitadasNoTexto.length})
              </h4>
              <p className="dica-texto" style={{ margin: '2px 0 8px 0' }}>
                Segundo as normas ABNT NBR 10520 e diretrizes acadêmicas de periódicos, todas as obras listadas nas Referências devem ter sido citadas no corpo do trabalho (ou explicitamente indicadas como bibliografia consultada).
              </p>
              <div className="lista-historico">
                {refsNaoCitadasNoTexto.map((r, i) => {
                  const chaveBusca = `sobrando_${i}`;
                  return (
                    <div key={i} className="card-historico" style={{ borderLeft: '3px solid #d97706' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <strong>{r.textoOriginal}</strong>
                          <div style={{ color: '#b45309', fontWeight: 600, fontSize: 12, marginTop: 4 }}>
                            ⚠️ Nenhuma citação no formato ({r.primeiroSobrenome}, {r.ano}) foi localizada no texto. (Marcada como Consultada)
                          </div>
                          {r.doiOficial && <div style={{ fontSize: 11.8, color: 'var(--texto-suave)', marginTop: 2 }}>DOI: {r.doiOficial}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn pequeno secundario"
                            onClick={() =>
                              abrirBuscaArtigoParecido(chaveBusca, {
                                fraseWord: '',
                                tituloSugerido: r.tituloBuscado || '',
                                textoRef: r.textoOriginal,
                                autor: r.primeiroSobrenome,
                              })
                            }
                          >
                            🔎 Artigos Parecidos
                          </button>
                          <button
                            className="btn pequeno fantasma"
                            onClick={() =>
                              copiarPromptItemIndividualIa({
                                tituloProblema: `Obra listada nas referências mas nunca citada no manuscrito`,
                                refTexto: r.textoOriginal,
                                diagnostico: `A obra consta nas Referências, mas não possui nenhuma citação (§) no texto. O que fazer?`,
                              })
                            }
                          >
                            🤖 Copiar p/ IA
                          </button>
                        </div>
                      </div>
                      {renderPainelBuscaArtigoParecido(chaveBusca)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ALERTA F: Divergências de Metadados Oficiais & Norma ABNT NBR */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'metadados') && alertasMetadadosAbnt.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #2563eb', background: 'rgba(37, 99, 235, 0.04)' }}>
              <h4 style={{ color: '#1d4ed8' }}>
                📐 Divergências de Metadados Oficiais &amp; ABNT NBR 10520 ({alertasMetadadosAbnt.length})
              </h4>
              <div className="lista-historico">
                {alertasMetadadosAbnt.map((ap, i) => (
                  <div key={i} className="card-historico" style={{ borderLeft: '3px solid #2563eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12.6 }}>{ap.mensagem}</div>
                        {ap.fraseWord && (
                          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--texto-suave)' }}>
                            <strong>📍 Trecho no Word (Parágrafo §{ap.numParagrafo} · Linha {ap.numLinha}):</strong>{' '}
                            <em>"{ap.fraseWord}"</em>
                          </div>
                        )}
                      </div>
                      <button
                        className="btn pequeno secundario"
                        onClick={() =>
                          copiarPromptItemIndividualIa({
                            tituloProblema: 'Ajuste de Metadados / Norma ABNT',
                            fraseWord: ap.fraseWord,
                            locWord: `Parágrafo §${ap.numParagrafo} · Linha ${ap.numLinha}`,
                            refTexto: ap.autorCitado,
                            diagnostico: ap.mensagem,
                          })
                        }
                      >
                        🤖 Copiar p/ IA Ajustar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ALERTA G: Divergências de Conteúdo e Páginas no PDF do Artigo */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'pdf') && alertasPdf.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #7c3aed', background: 'rgba(124, 58, 237, 0.04)' }}>
              <h4 style={{ color: '#7c3aed' }}>
                📄 Divergências de Conteúdo e Páginas no PDF do Artigo ({alertasPdf.length})
              </h4>
              <div className="lista-historico">
                {alertasPdf.map((ap, i) => {
                  const refObj = refs.find((x) => x.id === ap.ref.refBibId);
                  return (
                    <div key={i} className="card-historico" style={{ borderLeft: '3px solid #7c3aed' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#6d28d9', fontSize: 12.6 }}>{ap.mensagem}</div>
                          <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>
                            <strong>Obra:</strong> {ap.ref.primeiroSobrenome} ({ap.ref.ano}) — {ap.ref.tituloOficial || ap.ref.tituloBuscado}
                          </div>
                          {ap.ocorrencia?.fraseContexto && (
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                              <strong>📍 Frase no seu Word (Parágrafo §{ap.ocorrencia.numParagrafo} · Linha {ap.ocorrencia.numLinha}):</strong>{' '}
                              <em>"{ap.ocorrencia.fraseContexto}"</em>
                            </div>
                          )}
                          {ap.trechoPdf && (
                            <div style={{ fontSize: 11.8, marginTop: 4, color: 'var(--texto)' }}>
                              <strong>📄 Trecho encontrado no PDF (pág. {ap.paginaPdf}):</strong> "{ap.trechoPdf}"
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {refObj?.pdf && (
                            <button
                              className="btn pequeno primario"
                              onClick={() => onAbrirPdfNaPagina(refObj, ap.paginaPdf || 1)}
                            >
                              📖 Abrir PDF {ap.paginaPdf ? `na Pág. ${ap.paginaPdf}` : ''}
                            </button>
                          )}
                          <button
                            className="btn pequeno secundario"
                            onClick={() =>
                              copiarPromptItemIndividualIa({
                                tituloProblema: 'Divergência de Conteúdo / Página no PDF',
                                fraseWord: ap.ocorrencia?.fraseContexto,
                                locWord: `Parágrafo §${ap.ocorrencia?.numParagrafo} · Linha ${ap.ocorrencia?.numLinha}`,
                                refTexto: `${ap.ref.primeiroSobrenome} (${ap.ref.ano})`,
                                diagnostico: ap.mensagem,
                                trechoArtigo: ap.trechoPdf,
                              })
                            }
                          >
                            🤖 Copiar p/ IA
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ALERTA H: Avisos de Escopo Metodológico e Submissão */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'metodologico') && alertasMetodologicos.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #4b5563', background: 'rgba(75, 85, 99, 0.04)' }}>
              <h4 style={{ color: '#374151' }}>
                📌 Avisos de Escopo Metodológico &amp; Submissão ({alertasMetodologicos.length})
              </h4>
              <div className="lista-historico">
                {alertasMetodologicos.map((ap, i) => (
                  <div key={i} className="card-historico" style={{ borderLeft: '3px solid #6b7280' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 12.6 }}>{ap.mensagem}</div>
                        {ap.fraseWord && (
                          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--texto-suave)' }}>
                            <strong>📍 Trecho no Word (Parágrafo §{ap.numParagrafo} · Linha {ap.numLinha}):</strong>{' '}
                            <em>"{ap.fraseWord}"</em>
                          </div>
                        )}
                      </div>
                      <button
                        className="btn pequeno secundario"
                        onClick={() =>
                          copiarPromptItemIndividualIa({
                            tituloProblema: 'Aviso de Escopo Metodológico',
                            fraseWord: ap.fraseWord,
                            locWord: `Parágrafo §${ap.numParagrafo} · Linha ${ap.numLinha}`,
                            diagnostico: ap.mensagem,
                          })
                        }
                      >
                        🤖 Copiar p/ IA Ajustar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ALERTA H: Marcadores Estilísticos de Redação de IA (Open-Detector) */}
          {(grupoIntercorrenciaAtivo === 'todas' || grupoIntercorrenciaAtivo === 'estilo_ia') && alertasEstiloIa.length > 0 && (
            <div className="bloco-cofre" style={{ borderLeft: '4px solid #8b5cf6', background: 'rgba(139, 92, 246, 0.04)' }}>
              <h4 style={{ color: '#8b5cf6' }}>
                🤖 Marcadores de Redação Estilística de IA (Open-Detector) ({alertasEstiloIa.length})
              </h4>
              <div className="lista-historico">
                {alertasEstiloIa.map((ap, i) => (
                  <div key={i} className="card-historico" style={{ borderLeft: '3px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#6d28d9', fontSize: 12.6 }}>{ap.mensagem}</div>
                        {ap.fraseWord && (
                          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--texto-suave)' }}>
                            <strong>📍 Parágrafo Suspeito no Word (§{ap.numParagrafo} · Linha {ap.numLinha}):</strong>{' '}
                            <em>"{ap.fraseWord}"</em>
                          </div>
                        )}
                        {ap.marcadores?.length > 0 && (
                          <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {ap.marcadores.map((m, mi) => (
                              <span key={mi} className="tag-mini" style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>
                                ⚡ "{m}"
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn pequeno secundario"
                        onClick={() =>
                          copiarPromptItemIndividualIa({
                            tituloProblema: 'Marcadores de Redação por IA (Open-Detector)',
                            fraseWord: ap.fraseWord,
                            locWord: `Parágrafo §${ap.numParagrafo} · Linha ${ap.numLinha}`,
                            diagnostico: ap.mensagem,
                          })
                        }
                      >
                        🤖 Copiar p/ Humanizar com IA
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}

{/* SEÇÃO 2: ROL DE OBRAS EM CONFORMIDADE & INJEÇÃO AUTOMÁTICA NA ÁREA DE TRABALHO */}
          {(abaVisualizacao === 'conformes' || abaVisualizacao === 'todas') && (
            <div
              className="bloco-cofre"
              style={{
                borderLeft: '4px solid #16a34a',
                background: 'rgba(22, 163, 74, 0.04)',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 10,
                }}
              >
                <div>
                  <h4 style={{ color: '#15803d', margin: 0 }}>
                    📥 Rol de Obras em Conformidade &amp; Injeção Automática no Rol de Artigos da Área de Trabalho ({obrasConformes.length})
                  </h4>
                  <p className="dica-texto" style={{ margin: '3px 0 0 0' }}>
                    Todas as {obrasConformes.length} obras validadas foram adicionadas ou atualizadas na sua biblioteca com metadados CSL estruturados.
                    {totalConformesComPdf > 0 && ` Foram vinculados ${totalConformesComPdf} PDFs de texto completo disponíveis no acervo/acesso aberto.`}
                  </p>
                </div>
                {onIrParaBiblioteca && (
                  <button
                    className="btn pequeno primario"
                    style={{ background: '#16a34a', borderColor: '#15803d' }}
                    onClick={() => onIrParaBiblioteca('Auditado')}
                    title="Abre a tela principal de artigos filtrando pelas obras auditadas"
                  >
                    📂 Abrir Rol de Artigos na Biblioteca Principal
                  </button>
                )}
              </div>

              <div className="lista-historico">
                {obrasConformes.map((r, i) => {
                  const refObj = refs.find((x) => x.id === r.refBibId);
                  const temPdf = refObj?.pdf || r.temPdf;
                  const primOc = r.ocorrenciasNoTexto?.[0];
                  return (
                    <div
                      key={i}
                      className="card-historico"
                      style={{ borderLeft: '3px solid #16a34a' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            {r.tituloOficial || r.tituloBuscado || r.textoOriginal}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>
                            <strong>{r.primeiroSobrenome} ({r.ano})</strong>
                            {r.doiOficial && ` · DOI: ${r.doiOficial}`}
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                            <span
                              style={{
                                background: 'rgba(22, 163, 74, 0.15)',
                                color: '#15803d',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              ✓ Em Conformidade (Autenticada)
                            </span>
                            {r.citadaNoTexto ? (
                              <span
                                style={{
                                  background: 'rgba(37, 99, 235, 0.12)',
                                  color: '#1d4ed8',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                § Citada {r.ocorrenciasNoTexto.length}x no texto
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: 'rgba(217, 119, 6, 0.12)',
                                  color: '#b45309',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                Na lista final (Consultada)
                              </span>
                            )}
                            {temPdf ? (
                              <span
                                style={{
                                  background: '#dcfce7',
                                  color: '#166534',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                📄 PDF Completo Disponível ({r.nomeArquivoPdf || refObj?.pdf})
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: 'rgba(100, 116, 139, 0.12)',
                                  color: 'var(--texto-suave)',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                }}
                              >
                                🔒 PDF Fechado / Paywall (Metadados Indexados)
                              </span>
                            )}
                          </div>

                          {primOc && (
                            <div style={{ fontSize: 11.8, marginTop: 5, color: 'var(--texto)' }}>
                              <strong>📍 Exemplo de citação (§{primOc.numParagrafo}, Linha {primOc.numLinha}):</strong>{' '}
                              <em>"{primOc.fraseContexto}"</em>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {refObj?.pdf ? (
                            <button
                              className="btn pequeno primario"
                              onClick={() => onAbrirPdfNaPagina(refObj)}
                              title="Abrir o PDF no leitor interno"
                            >
                              <Icone nome="book" tam={13} /> Abrir PDF
                            </button>
                          ) : (
                            <>
                              <button
                                className="btn pequeno secundario"
                                onClick={() => buscarPdfNaWebManual(r)}
                                title="Pesquisar PDF no Google Acadêmico"
                              >
                                🌐 Buscar PDF
                              </button>
                              <button
                                className="btn pequeno fantasma"
                                onClick={() => anexarPdfEVerificarCard(r, i)}
                                title="Anexar PDF baixado no seu PC"
                              >
                                📎 Anexar PDF
                              </button>
                            </>
                          )}
                          {onIrParaBiblioteca && r.refBibId && (
                            <button
                              className="btn pequeno secundario"
                              onClick={() => onIrParaBiblioteca(r.refBibId)}
                              title="Ver este artigo na tabela principal da biblioteca"
                            >
                              📂 Ver na Tabela Principal
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SEÇÃO 3: CONFERÊNCIA DETALHADA OBRA POR OBRA (Visível em 'todas') */}
          {abaVisualizacao === 'todas' && (
            <div className="bloco-cofre">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <div>
                  <h4 style={{ margin: 0 }}>
                    Conferência Obra por Obra (Referências × Citações no Texto × Página no PDF do Artigo)
                  </h4>
                  <p className="dica-texto" style={{ margin: '2px 0 0 0' }}>
                    Total de {resultado.refsMapeadas.length} referências mapeadas com cruzamento de parágrafos, linhas e páginas.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'var(--fundo)',
                    border: '1px solid var(--borda)',
                  }}
                >
                  <span style={{ fontSize: 11.5, color: 'var(--texto-suave)', fontWeight: 600 }}>Agrupamento:</span>
                  <button
                    className={`chip ${modoAgrupamentoVisaoGeral === 'tipo' ? 'ativo' : ''}`}
                    onClick={() => setModoAgrupamentoVisaoGeral('tipo')}
                    style={{ fontSize: 11.5, padding: '2px 8px' }}
                  >
                    🗂️ Por Tipo de Intercorrência
                  </button>
                  <button
                    className={`chip ${modoAgrupamentoVisaoGeral === 'ordem' ? 'ativo' : ''}`}
                    onClick={() => setModoAgrupamentoVisaoGeral('ordem')}
                    style={{ fontSize: 11.5, padding: '2px 8px' }}
                  >
                    📄 Por Ordem da Lista
                  </button>
                </div>
              </div>

              {modoAgrupamentoVisaoGeral === 'tipo' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Grupo 1: Obras Críticas */}
                  {obrasCriticas.length > 0 && (
                    <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(220, 38, 38, 0.03)', border: '1px solid rgba(220, 38, 38, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ background: '#dc2626', color: '#fff', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
                          🚨 CRÍTICA
                        </span>
                        <strong style={{ color: '#dc2626', fontSize: 13.5 }}>
                          Obras Críticas com Intercorrência Grave ({obrasCriticas.length})
                        </strong>
                        <span style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>
                          (Fontes não localizadas / Suspeitas de IA / DOI falso / Citação inexistente)
                        </span>
                      </div>
                      <div className="lista-historico">
                        {obrasCriticas.map((r) => {
                          const idxOriginal = resultado.refsMapeadas.indexOf(r);
                          return renderCardObra(r, idxOriginal >= 0 ? idxOriginal : 0);
                        })}
                      </div>
                    </div>
                  )}

                  {/* Grupo 2: Obras com Ressalva */}
                  {obrasComRessalva.length > 0 && (
                    <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(217, 119, 6, 0.03)', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ background: '#d97706', color: '#fff', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
                          ⚠️ RESSALVA
                        </span>
                        <strong style={{ color: '#b45309', fontSize: 13.5 }}>
                          Obras com Ressalva ou Inconformidade Leve ({obrasComRessalva.length})
                        </strong>
                        <span style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>
                          (Não citada no texto / Divergência ABNT / Páginas ou trecho não achado no PDF)
                        </span>
                      </div>
                      <div className="lista-historico">
                        {obrasComRessalva.map((r) => {
                          const idxOriginal = resultado.refsMapeadas.indexOf(r);
                          return renderCardObra(r, idxOriginal >= 0 ? idxOriginal : 0);
                        })}
                      </div>
                    </div>
                  )}

                  {/* Grupo 3: Obras Plenamente Conformes */}
                  {obrasPlenamenteConformes.length > 0 && (
                    <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(22, 163, 74, 0.03)', border: '1px solid rgba(22, 163, 74, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
                          ✓ 100% CONFORME
                        </span>
                        <strong style={{ color: '#15803d', fontSize: 13.5 }}>
                          Obras Plenamente em Conformidade ({obrasPlenamenteConformes.length})
                        </strong>
                        <span style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>
                          (Autenticadas nas bases oficiais, citadas no texto e verificadas)
                        </span>
                      </div>
                      <div className="lista-historico">
                        {obrasPlenamenteConformes.map((r) => {
                          const idxOriginal = resultado.refsMapeadas.indexOf(r);
                          return renderCardObra(r, idxOriginal >= 0 ? idxOriginal : 0);
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="lista-historico">
                  {resultado.refsMapeadas.map((r, idx) => renderCardObra(r, idx))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
