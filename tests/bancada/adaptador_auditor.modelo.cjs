// Adaptador do auditor para a bancada de testes (MODELO: completar os pontos marcados com TODO).
//
// A bancada chama este arquivo pela linha de comando, sem abrir o Electron:
//   node adaptador_auditor.cjs documento   <arquivo.docx|.odt|.pdf>   -> contrato "documento"
//   node adaptador_auditor.cjs referencias <arquivo.txt>              -> uma referência por linha
//   node adaptador_auditor.cjs afirmacoes  <pares.jsonl>              -> sustenta | contradiz | nao_trata
//   node adaptador_auditor.cjs plagio      <pares.jsonl>              -> copia | nao_copia
//   node adaptador_auditor.cjs caminho     <casos.json>               -> permitir | negar
// A saída vai para stdout em JSON. Mensagens de log vão para stderr (nunca para stdout).
//
// Requisito de arquitetura: o núcleo do auditor precisa rodar em Node puro, sem `electron`, `app`,
// `BrowserWindow` ou `ipcMain`. Se hoje ele depende disso, separar o núcleo é a primeira tarefa.
//
// Rede: o núcleo deve ler estas variáveis (a suíte "rede" aponta para um servidor simulado):
//   AUDITOR_CROSSREF_URL (padrão https://api.crossref.org), AUDITOR_PUBMED_URL
//   (padrão https://eutils.ncbi.nlm.nih.gov/entrez/eutils), AUDITOR_OPENALEX_URL
//   (padrão https://api.openalex.org), AUDITOR_HTTP_TIMEOUT_MS, AUDITOR_CONTATO_EMAIL (mailto real
//   para o "polite pool" do Crossref; nunca um endereço inventado).

const fs = require('fs');
const path = require('path');

// TODO: apontar para o núcleo real
// const nucleo = require(path.join(__dirname, '..', '..', 'electron', 'auditor.cjs'));

async function modoDocumento(arquivo) {
  // TODO: chamar a função que audita um manuscrito e devolve o relatório interno
  // const rel = await nucleo.auditarManuscrito(arquivo, { semInterface: true });
  const rel = null;
  if (!rel) throw new Error('modo documento ainda não ligado ao núcleo');
  // Converter para o contrato da bancada:
  return {
    referencias: rel.referencias.map((r, i) => ({ indice: i, texto: r.textoOriginal })),
    citacoes: rel.citacoes.map((c) => ({
      texto: c.textoOriginal,
      contexto: c.contexto || 'paragrafo',         // paragrafo | tabela | nota | legenda
      referencias: c.indicesReferencias,           // índice na lista acima, ou null se não pareou
    })),
    alertas: rel.alertas.map((a) => ({ ponto: a.ponto, citacao: a.citacao, referencia: a.indiceReferencia, texto: a.mensagem })),
    estados_obras: rel.referencias.map((r, i) => ({ referencia: i, estado: r.estado })), // existe | consulta_falhou | nao_localizada
  };
}

async function modoReferencias(arquivo) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(Boolean);
  // TODO: usar o mesmo extrator de chave do núcleo (autor principal e ano)
  return linhas.map((l, i) => ({ linha: i, autor_principal: null, ano: null }));
}

async function modoRotulos(arquivo, funcao) {
  const pares = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const out = [];
  for (const p of pares) out.push({ id: p.id, rotulo: await funcao(p) });
  return out;
}

async function main() {
  const [modo, arquivo] = process.argv.slice(2);
  let saida;
  if (modo === 'documento') saida = await modoDocumento(arquivo);
  else if (modo === 'referencias') saida = await modoReferencias(arquivo);
  else if (modo === 'afirmacoes') saida = await modoRotulos(arquivo, async (p) => {
    // TODO: julgamento de sustentação (não basta similaridade de embeddings: ela não separa "sustenta" de "contradiz")
    return 'nao_trata';
  });
  else if (modo === 'plagio') saida = await modoRotulos(arquivo, async (p) => {
    // TODO: detector de cópia literal do núcleo
    return 'nao_copia';
  });
  else if (modo === 'caminho') {
    const { garantirCaminhoContido } = require('./suites/seguranca/caminho_contido.cjs'); // TODO: trocar pela função do main.cjs
    const casos = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    saida = casos.map((c) => {
      const p = c.plataforma === 'win32' ? path.win32 : path.posix;
      try { garantirCaminhoContido(c.raiz, c.sub, p); return { id: c.id, veredito: 'permitir' }; }
      catch { return { id: c.id, veredito: 'negar' }; }
    });
  } else throw new Error(`modo desconhecido: ${modo}`);
  process.stdout.write(JSON.stringify(saida));
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
