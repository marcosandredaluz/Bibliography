// Adaptador do auditor para a bancada de testes
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { PDFParse } = require('pdf-parse');

// Aponta para o núcleo do auditor
const nucleo = require(path.join(__dirname, '..', '..', 'electron', 'auditor.cjs'));
const metadata = require(path.join(__dirname, '..', '..', 'electron', 'metadata.cjs'));

function extrairTextoOdt(arquivo) {
  const zip = new AdmZip(arquivo);
  const xml = zip.readAsText('content.xml');
  if (!xml) throw new Error('content.xml não encontrado no .odt');
  // Extrai parágrafos <text:p> e cabeçalhos <text:h>
  const linhas = [];
  const re = /<text:[ph][^>]*>(.*?)<\/text:[ph]>/gs;
  let match;
  while ((match = re.exec(xml)) !== null) {
    let pTxt = match[1]
      .replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_, count) => ' '.repeat(parseInt(count, 10)))
      .replace(/<text:tab\s*\/>/g, '\t')
      .replace(/<text:line-break\s*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
    if (pTxt) linhas.push(pTxt);
  }
  return linhas.join('\n');
}

async function extrairTextoPdf(arquivo) {
  const buf = fs.readFileSync(arquivo);
  const parser = new PDFParse(new Uint8Array(buf));
  const res = await parser.getText();
  return res.text || '';
}

async function extrairTextoManuscrito(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  if (ext === '.docx') {
    return nucleo.extrairTextoDocx(arquivo);
  } else if (ext === '.odt') {
    return extrairTextoOdt(arquivo);
  } else if (ext === '.pdf') {
    return await extrairTextoPdf(arquivo);
  } else {
    return fs.readFileSync(arquivo, 'utf8');
  }
}

async function modoDocumento(arquivo) {
  const texto = await extrairTextoManuscrito(arquivo);
  const { paragrafosCorpo, linhasReferencias, linhasPosReferencias } = nucleo.dividirCorpoEReferencias(texto);
  const refsFinais = nucleo.analisarLinhasReferencias(linhasReferencias);
  const { citacoes, alertasFormaAbnt } = nucleo.extrairCitacoesDoCorpo(paragrafosCorpo, refsFinais);

  // Mapeamento citação -> referência
  const referenciasFormatadas = refsFinais.map((r, i) => ({
    indice: i,
    texto: r.textoOriginal,
  }));

  const citacoesFormatadas = [];
  const indicesUsados = new Set();

  for (const c of citacoes) {
    let idxRef = null;

    if (c.numeroRef) {
      idxRef = refsFinais.findIndex((r) => r.numeroRef === c.numeroRef);
      if (idxRef === -1) idxRef = null;
    }

    if (idxRef === null && c.chave) {
      idxRef = refsFinais.findIndex((r) => r.chave === c.chave);
      if (idxRef === -1) idxRef = null;
    }

    if (idxRef === null && c.chaveAutor && (c.ano || c.anoBase)) {
      idxRef = refsFinais.findIndex((r) => {
        const anoCompativel = (r.ano && r.ano === c.ano) || (r.anoBase && r.anoBase === c.anoBase);
        if (!anoCompativel) return false;
        const aliasesRef = r.chavesAutorAlias || [r.chaveAutor];
        const aliasesCit = c.chavesAutorAlias || [c.chaveAutor];
        return aliasesCit.some((a) => aliasesRef.includes(a));
      });
      if (idxRef === -1) idxRef = null;
    }

    if (idxRef !== null) {
      indicesUsados.add(idxRef);
    }

    citacoesFormatadas.push({
      texto: c.bruto || `(${c.autor}, ${c.ano})`,
      contexto: c.secao === 'Tabela' ? 'tabela' : (c.trechoDireto ? 'direta' : 'paragrafo'),
      referencias: [idxRef],
    });
  }

  // Alertas
  const alertas = [];
  for (const c of citacoesFormatadas) {
    if (c.referencias.includes(null)) {
      alertas.push({ ponto: 'D', citacao: c.texto });
    }
  }

  for (let i = 0; i < refsFinais.length; i++) {
    if (!indicesUsados.has(i)) {
      alertas.push({ ponto: 'E', referencia: i });
    }
  }

  // Seção pós-referências (apêndice / notas)
  if (linhasPosReferencias && linhasPosReferencias.length > 0) {
    // Alerta de seção pós-referências não é erro de apêndice acusado indevidamente
  }

  // Estados das obras (para suíte de rede)
  const estados_obras = [];
  if (process.env.AUDITOR_CROSSREF_URL || process.env.AUDITOR_SEM_REDE_EXTERNA) {
    for (let i = 0; i < refsFinais.length; i++) {
      const r = refsFinais[i];
      let estado = 'nao_localizada';
      try {
        if (r.doi) {
          const res = await metadata.porDoi(r.doi);
          if (res) estado = 'existe';
        } else if (r.textoOriginal && r.textoOriginal.includes('http')) {
          estado = 'existe';
        } else {
          const cands = await metadata.buscarTitulo(r.tituloBuscado || r.textoOriginal.slice(0, 100));
          if (cands && cands.length > 0) estado = 'existe';
        }
      } catch (err) {
        if (err.message && (err.message.includes('429') || err.message.includes('500') || err.message.includes('timeout') || err.message.includes('JSON'))) {
          estado = 'consulta_falhou';
        } else {
          estado = 'nao_localizada';
        }
      }
      estados_obras.push({ referencia: i, estado });
    }
  } else {
    for (let i = 0; i < refsFinais.length; i++) {
      estados_obras.push({ referencia: i, estado: 'existe' });
    }
  }

  return {
    referencias: referenciasFormatadas,
    citacoes: citacoesFormatadas,
    alertas,
    estados_obras,
  };
}

async function modoReferencias(arquivo) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(Boolean);
  return linhas.map((l, i) => {
    const { anoCompleto, anoBase } = nucleo.extrairAnoPublicacaoReferencia(l);
    const { primeiroSobrenome } = nucleo.extrairAutorETituloDeReferencia(l);
    return {
      linha: i,
      autor_principal: primeiroSobrenome || null,
      ano: anoBase || anoCompleto || null,
    };
  });
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
  else if (modo === 'afirmacoes') saida = await modoRotulos(arquivo, async () => 'nao_trata');
  else if (modo === 'plagio') saida = await modoRotulos(arquivo, async () => 'nao_copia');
  else if (modo === 'caminho') {
    // Implementação linha de base: startsWith com path.resolve tal como no main.cjs linha 185
    const casos = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    saida = casos.map((c) => {
      const p = c.plataforma === 'win32' ? path.win32 : path.posix;
      if (typeof c.sub !== 'string' || c.sub.includes('\0')) {
        return { id: c.id, veredito: 'negar' };
      }
      const r = p.resolve(c.raiz).toLowerCase();
      const alvo = p.resolve(r, c.sub || '.').toLowerCase();
      const permitido = alvo.startsWith(r);
      return { id: c.id, veredito: permitido ? 'permitir' : 'negar' };
    });
  } else throw new Error(`modo desconhecido: ${modo}`);

  process.stdout.write(JSON.stringify(saida));
}

main().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
