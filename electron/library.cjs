// Biblioteca em pasta sincronizada (OneDrive / Google Drive).
// Cada referência é um arquivo JSON separado, para que a sincronização na
// nuvem nunca corrompa a biblioteca inteira (problema clássico de colocar
// um banco SQLite único dentro do OneDrive).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { gerarInsightsCompletos } = require('./insights.cjs');
const { sincronizarLibraryBib } = require('./bibtexSync.cjs');
const { escreverJsonAtomico, copiarArquivoAtomico } = require('./atomicWrite.cjs');

const PASTAS = ['referencias', 'pdfs', 'grifos', 'documentos', 'estilos', 'lixeira'];

const LEIA_ME = `BIBLIOGRAFIA - pasta da biblioteca
===================================

Esta pasta é gerenciada pelo programa "Bibliografia". Ela pode ficar no
OneDrive ou no Google Drive: a sincronização é feita pela própria nuvem.

  referencias\\   um arquivo .json por referência (metadados, status, tags, notas)
  pdfs\\          PDFs dos artigos (mesmo nome da referência)
  grifos\\        grifos e anotações dos PDFs
  documentos\\    registro de quais referências cada documento do Word citou
  estilos\\       coloque aqui arquivos .csl extras (ex.: modelo ABNT da sua universidade)
  lixeira\\       referências excluídas (podem ser recuperadas movendo de volta)
  colecoes.json  lista de coleções/projetos

Os arquivos são texto comum e continuam legíveis mesmo sem o programa.
`;

/** Escrita "atômica" com novas tentativas (o OneDrive às vezes trava o arquivo por instantes). */
async function escreverJson(arquivo, dados) {
  return escreverJsonAtomico(arquivo, dados);
}

function slug(texto, max = 40) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

const PALAVRAS_VAZIAS = new Set(
  'a o as os um uma de da do das dos e em no na nos nas para por com sem sobre the of and in on for to an at from with'.split(' ')
);

function gerarIdBase(csl) {
  const ano = csl?.issued?.['date-parts']?.[0]?.[0] || 'sd';
  const a = csl?.author?.[0] || csl?.editor?.[0];
  const autor = slug(a?.family || a?.literal || 'anonimo', 20) || 'anonimo';
  const palavras = slug(csl?.title || 'sem-titulo', 200)
    .split('-')
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .slice(0, 3)
    .join('-');
  return `${ano}-${autor}-${palavras || 'sem-titulo'}`;
}

class Biblioteca {
  constructor(raiz) {
    this.raiz = raiz;
    this.refs = new Map();
    this.conflitos = [];
  }

  p(...partes) {
    return path.join(this.raiz, ...partes);
  }

  async iniciar() {
    for (const d of PASTAS) await fsp.mkdir(this.p(d), { recursive: true });
    if (!fs.existsSync(this.p('colecoes.json'))) await escreverJson(this.p('colecoes.json'), { colecoes: [] });
    if (!fs.existsSync(this.p('LEIA-ME.txt'))) await fsp.writeFile(this.p('LEIA-ME.txt'), LEIA_ME, 'utf8');
    await this.carregarTudo();
  }

  async carregarTudo() {
    this.refs.clear();
    this.conflitos = [];
    const arquivos = (await fsp.readdir(this.p('referencias'))).filter((f) => f.toLowerCase().endsWith('.json'));
    await Promise.all(
      arquivos.map(async (f) => {
        const id = f.slice(0, -5);
        try {
          const ref = JSON.parse(await fsp.readFile(this.p('referencias', f), 'utf8'));
          if (ref.id && ref.id !== id) {
            // Ex.: cópia de conflito criada pelo OneDrive ("x-NOTEBOOK.json")
            this.conflitos.push({ arquivo: f, motivo: `cópia de conflito de "${ref.id}"` });
          }
          ref.id = id;
          ref.csl = { ...(ref.csl || {}), id };
          if (!ref.insights || !ref.pico?.p || !ref.notas) {
            const auto = await gerarInsightsCompletos(ref, { consultarOnline: false });
            ref.csl = { ...auto.csl, id };
            ref.nivelEvidencia = ref.nivelEvidencia || auto.nivelEvidencia;
            ref.pico = { ...(auto.pico || {}), ...(ref.pico || {}) };
            ref.notas = ref.notas || auto.notas;
            ref.insights = ref.insights || auto.insights;
          }
          this.refs.set(id, ref);
        } catch (e) {
          this.conflitos.push({ arquivo: f, motivo: `arquivo ilegível (${e.message})` });
        }
      })
    );
    sincronizarLibraryBib(this.raiz, [...this.refs.values()]).catch(() => {});
    return this.estado();
  }

  async estado() {
    return {
      raiz: this.raiz,
      refs: [...this.refs.values()],
      colecoes: await this.lerColecoes(),
      documentos: await this.listarDocumentos(),
      conflitos: this.conflitos,
    };
  }

  idUnico(base) {
    let id = base;
    for (let n = 2; this.refs.has(id) || fs.existsSync(this.p('referencias', `${id}.json`)); n++) id = `${base}-${n}`;
    return id;
  }

  porDoi(doi) {
    if (!doi) return null;
    const d = doi.toLowerCase();
    for (const r of this.refs.values()) if ((r.csl?.DOI || '').toLowerCase() === d) return r;
    return null;
  }

  async salvar(ref) {
    ref.modificadoEm = new Date().toISOString();
    await escreverJson(this.p('referencias', `${ref.id}.json`), ref);
    this.refs.set(ref.id, ref);
    sincronizarLibraryBib(this.raiz, [...this.refs.values()]).catch(() => {});
    return ref;
  }

  async criar(dados = {}) {
    const csl = { type: 'article-journal', title: '', ...(dados.csl || {}) };
    const id = this.idUnico(gerarIdBase(csl));
    const agora = new Date().toISOString();
    const ref = {
      status: 'a_ler',
      tags: [],
      colecoes: [],
      notas: '',
      pdf: null,
      favorito: false,
      metadadosIncompletos: false,
      adicionadoEm: agora,
      ...dados,
      id,
      csl: { ...csl, id },
    };
    try {
      const auto = await gerarInsightsCompletos(ref, {
        consultarOnline: !!(ref.csl?.DOI || ref.csl?.PMID || ref.csl?.ISSN),
      });
      ref.csl = { ...auto.csl, id };
      ref.nivelEvidencia = ref.nivelEvidencia || auto.nivelEvidencia;
      ref.pico = auto.pico;
      ref.notas = ref.notas || auto.notas;
      ref.insights = auto.insights;
      ref.retratado = ref.retratado || auto.retratado;
    } catch {
      /* fallback silencioso */
    }
    return this.salvar(ref);
  }

  async atualizar(id, patch) {
    const atual = this.refs.get(id);
    if (!atual) throw new Error('Referência não encontrada');
    const ref = { ...atual, ...patch, id };
    ref.csl = { ...(patch.csl ? patch.csl : atual.csl), id };
    if (patch.status === 'consultada' && atual.status !== 'consultada' && !atual.lidoEm) ref.lidoEm = new Date().toISOString();
    // Se acabou de receber textoExtraido do PDF ou novo abstract/DOI, atualiza PICO e Notas automaticamente
    if ((patch.textoExtraido && !atual.textoExtraido) || (patch.csl && (!ref.pico?.p || !ref.notas || !ref.insights))) {
      try {
        const auto = await gerarInsightsCompletos(ref, { consultarOnline: false });
        ref.csl = { ...auto.csl, id };
        ref.nivelEvidencia = ref.nivelEvidencia || auto.nivelEvidencia;
        ref.pico = auto.pico;
        ref.notas = auto.notas;
        ref.insights = auto.insights;
      } catch { /* ignora */ }
    }
    return this.salvar(ref);
  }

  async enriquecerInsights(id, { consultarOnline = true, forcarReescrita = false } = {}) {
    const atual = this.refs.get(id);
    if (!atual) throw new Error('Referência não encontrada');
    const baseRef = forcarReescrita ? { ...atual, pico: {}, notas: '' } : atual;
    const auto = await gerarInsightsCompletos(baseRef, { consultarOnline });
    return this.atualizar(id, {
      csl: { ...auto.csl, id },
      nivelEvidencia: auto.nivelEvidencia,
      pico: auto.pico,
      notas: auto.notas,
      insights: auto.insights,
      retratado: auto.retratado,
    });
  }

  async mover(origem, destinoDir) {
    let destino = path.join(destinoDir, path.basename(origem));
    if (fs.existsSync(destino)) {
      const ext = path.extname(destino);
      destino = destino.slice(0, -ext.length) + `-${Date.now()}${ext}`;
    }
    await fsp.rename(origem, destino);
  }

  /** Exclui movendo para a pasta "lixeira" (recuperável). */
  async excluir(id) {
    const ref = this.refs.get(id);
    if (!ref) return;
    const lixeira = this.p('lixeira');
    const json = this.p('referencias', `${id}.json`);
    if (fs.existsSync(json)) await this.mover(json, lixeira);
    if (ref.pdf && fs.existsSync(this.p('pdfs', ref.pdf))) await this.mover(this.p('pdfs', ref.pdf), lixeira);
    const grifos = this.p('grifos', `${id}.json`);
    if (fs.existsSync(grifos)) await this.mover(grifos, lixeira);
    this.refs.delete(id);
  }

  /** Copia um PDF para a pasta "pdfs" com o mesmo nome da referência. */
  async anexarPdf(id, origem) {
    const ref = this.refs.get(id);
    if (!ref) throw new Error('Referência não encontrada');
    let nome = `${id}.pdf`;
    for (let n = 2; fs.existsSync(this.p('pdfs', nome)) && nome !== ref.pdf; n++) nome = `${id}-${n}.pdf`;
    const destino = this.p('pdfs', nome);
    if (path.resolve(origem).toLowerCase() !== path.resolve(destino).toLowerCase()) {
      await copiarArquivoAtomico(origem, destino);
    }
    if (ref.pdf && ref.pdf !== nome && fs.existsSync(this.p('pdfs', ref.pdf))) {
      await this.mover(this.p('pdfs', ref.pdf), this.p('lixeira'));
    }
    return this.atualizar(id, { pdf: nome });
  }

  caminhoPdf(id) {
    const ref = this.refs.get(id);
    return ref?.pdf ? this.p('pdfs', ref.pdf) : null;
  }

  async lerColecoes() {
    try {
      return JSON.parse(await fsp.readFile(this.p('colecoes.json'), 'utf8')).colecoes || [];
    } catch {
      return [];
    }
  }

  async salvarColecoes(colecoes) {
    await escreverJson(this.p('colecoes.json'), { colecoes });
    return colecoes;
  }

  // ---------- Grifos e anotações dos PDFs (Fase 2) ----------
  async lerGrifos(id) {
    try {
      const dados = JSON.parse(await fsp.readFile(this.p('grifos', `${id}.json`), 'utf8'));
      return dados.grifos || [];
    } catch {
      return [];
    }
  }

  async salvarGrifos(id, grifos) {
    await escreverJson(this.p('grifos', `${id}.json`), {
      id,
      atualizadoEm: new Date().toISOString(),
      grifos: grifos || [],
    });
    return grifos;
  }

  // ---------- Sincronização com Documentos do Word (Fase 3) ----------
  async listarDocumentos() {
    const dir = this.p('documentos');
    await fsp.mkdir(dir, { recursive: true });
    const arqs = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
    const lista = [];
    for (const f of arqs) {
      try {
        lista.push(JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8')));
      } catch { /* ignora */ }
    }
    return lista.sort((a, b) => String(b.sincronizadoEm || '').localeCompare(String(a.sincronizadoEm || '')));
  }

  /**
   * Registra quais referências estão citadas em um documento do Word e atualiza
   * automaticamente o status "citada" vs "consultada" na biblioteca inteira.
   */
  async sincronizarDocumentoWord({ docId, id, titulo, nome, estilo, citadasIds, idsCitados }) {
    const idLimpo = slug(docId || id || titulo || nome || 'documento-word', 50) || 'documento-word';
    const listaEntrada = citadasIds || idsCitados || [];
    const idsValidos = [...new Set(listaEntrada.filter((x) => this.refs.has(x)))];
    const doc = {
      id: idLimpo,
      titulo: titulo || nome || idLimpo,
      estilo: estilo || 'associacao-brasileira-de-normas-tecnicas',
      citadasIds: idsValidos,
      idsCitados: idsValidos,
      sincronizadoEm: new Date().toISOString(),
    };
    await escreverJson(this.p('documentos', `${idLimpo}.json`), doc);

    // Calcula o conjunto de todas as referências citadas em qualquer documento sincronizado
    const todosDocs = await this.listarDocumentos();
    const todasCitadas = new Set(todosDocs.flatMap((d) => d.citadasIds || []));

    for (const r of this.refs.values()) {
      if (todasCitadas.has(r.id) && r.status !== 'citada') {
        await this.atualizar(r.id, { status: 'citada' });
      }
    }
    return doc;
  }

  // ---------- Mesclar duplicatas (Fase 2/4) ----------
  async mesclar(idPrincipal, idsDuplicados) {
    const principal = this.refs.get(idPrincipal);
    if (!principal) throw new Error('Referência principal não encontrada.');
    const tags = new Set(principal.tags || []);
    const colecoes = new Set(principal.colecoes || []);
    let notas = principal.notas || '';
    let pdf = principal.pdf;
    let csl = { ...principal.csl };
    const prioridadeStatus = { citada: 4, consultada: 3, a_ler: 2, descartada: 1 };
    let melhorStatus = principal.status;

    for (const dupId of idsDuplicados) {
      if (dupId === idPrincipal) continue;
      const dup = this.refs.get(dupId);
      if (!dup) continue;
      for (const t of dup.tags || []) tags.add(t);
      for (const c of dup.colecoes || []) colecoes.add(c);
      if (dup.notas && !notas.includes(dup.notas)) {
        notas = [notas, dup.notas].filter(Boolean).join('\n\n---\n\n');
      }
      if ((prioridadeStatus[dup.status] || 0) > (prioridadeStatus[melhorStatus] || 0)) {
        melhorStatus = dup.status;
      }
      for (const [k, v] of Object.entries(dup.csl || {})) {
        if (k !== 'id' && (csl[k] == null || csl[k] === '')) csl[k] = v;
      }
      if (!pdf && dup.pdf && fs.existsSync(this.p('pdfs', dup.pdf))) {
        await this.anexarPdf(idPrincipal, this.p('pdfs', dup.pdf));
        pdf = this.refs.get(idPrincipal).pdf;
      }
      await this.excluir(dupId);
    }

    return this.atualizar(idPrincipal, {
      csl,
      tags: [...tags],
      colecoes: [...colecoes],
      notas,
      status: melhorStatus,
    });
  }

  /**
   * JabRef Feature: Padroniza o nome de todos os arquivos PDF no disco no padrão acadêmico:
   * [Sobrenome]_[Ano]_[TituloLimpo].pdf
   */
  async padronizarNomesPdfs() {
    let renomeados = 0;
    const erros = [];

    for (const [id, ref] of this.refs.entries()) {
      if (!ref.pdf) continue;
      const caminhoAtual = this.p('pdfs', ref.pdf);
      if (!fs.existsSync(caminhoAtual)) continue;

      const autor = ref.csl?.author?.[0]?.family || ref.csl?.author?.[0]?.literal || 'Artigo';
      const ano = ref.csl?.issued?.['date-parts']?.[0]?.[0] || 'ND';
      const titulo = String(ref.csl?.title || 'Documento')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 5)
        .join('_');

      const autorLimpo = autor.replace(/[^a-zA-Z0-9]/g, '');
      let baseNome = `${autorLimpo}_${ano}_${titulo}`;
      if (baseNome.length < 8) baseNome = `${autorLimpo}_${ano}_${id}`;
      let novoNome = `${baseNome}.pdf`;

      if (ref.pdf === novoNome) continue;

      let destino = this.p('pdfs', novoNome);
      let contador = 2;
      while (fs.existsSync(destino) && novoNome !== ref.pdf) {
        novoNome = `${baseNome}_${contador}.pdf`;
        destino = this.p('pdfs', novoNome);
        contador++;
      }

      try {
        await fsp.rename(caminhoAtual, destino);
        await this.atualizar(id, { pdf: novoNome });
        renomeados++;
      } catch (err) {
        erros.push({ id, pdf: ref.pdf, erro: err.message });
      }
    }

    return { total: this.refs.size, renomeados, erros };
  }

  /**
   * JabRef Feature: Verificador de Integridade Bibliográfica do Catálogo.
   * Audita se as referências possuem dados essenciais para ABNT / Vancouver:
   * Autor, Ano, Título, Periódico, DOI e integridade do arquivo PDF no disco.
   */
  verificarIntegridade() {
    const problemas = [];
    let conformes = 0;

    for (const [id, ref] of this.refs.entries()) {
      const csl = ref.csl || {};
      const pendencias = [];

      const temAutor = Array.isArray(csl.author) && csl.author.length > 0 && (csl.author[0].family || csl.author[0].literal);
      if (!temAutor) pendencias.push('Falta Autor (elemento essencial ABNT)');

      const ano = csl.issued?.['date-parts']?.[0]?.[0];
      if (!ano) pendencias.push('Falta Ano de publicação');

      const tit = String(csl.title || '').trim();
      if (!tit || tit.length < 4) pendencias.push('Título incompleto ou ausente');

      const temFonte = csl['container-title'] || csl.publisher;
      if (!temFonte && csl.type === 'article-journal') pendencias.push('Falta Periódico (Revista)');

      if (csl.DOI && !/^10\.\d{4,9}\//.test(csl.DOI)) pendencias.push('DOI com formato irregular');

      if (ref.pdf && !fs.existsSync(this.p('pdfs', ref.pdf))) {
        pendencias.push(`Arquivo PDF não localizado no disco (${ref.pdf})`);
      }

      if (pendencias.length > 0) {
        problemas.push({
          id,
          titulo: csl.title || 'Sem título',
          autor: csl.author?.[0]?.family || csl.author?.[0]?.literal || 'Sem autor',
          ano: ano || 'S/D',
          pdf: ref.pdf,
          pendencias,
        });
      } else {
        conformes++;
      }
    }

    return {
      total: this.refs.size,
      conformes,
      inconformidades: problemas.length,
      problemas,
    };
  }
}

module.exports = { Biblioteca };
