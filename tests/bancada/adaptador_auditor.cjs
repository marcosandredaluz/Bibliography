// Adaptador do auditor para a bancada de testes
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const AdmZip = require('adm-zip');
const { PDFParse } = require('pdf-parse');

// Aponta para o núcleo do auditor
const nucleo = require(path.join(__dirname, '..', '..', 'electron', 'auditor.cjs'));
const metadata = require(path.join(__dirname, '..', '..', 'electron', 'metadata.cjs'));

// -------------------------------------------------------------
// 1. Constantes e Normalizações Canônicas
// -------------------------------------------------------------
const TITULOS_REF = new Set([
  'referencias', 'referencias bibliograficas', 'references', 'bibliografia', 'bibliography',
  'literaturverzeichnis', 'literatur', 'references bibliographiques', 'riferimenti bibliografici',
  'works cited', 'obras citadas', 'ouvrages cites', 'zitierte werke', 'opere citate', 'bibliographie'
]);

const POS_TEXTUAIS = /^(ap[eê]ndice|anexo|appendix|annex|annexe|anhang|appendice|ap[eé]ndice|gloss[aá]rio|[ií]ndice)\b/i;

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'del', 'della', 'di', 'van', 'der', 'den', 'von', 'zu', 'la', 'le', 'du', 'des', 'e', 'y']);

const PAPEIS = new Set([
  'autora', 'autor', 'autores', 'author', 'authors', 'autrice', 'auteur', 'auteurs', 'darstellung', 'autorin',
  'elaborado', 'elaborada', 'elaborazione', 'prepared', 'quelle', 'fonte', 'fuente', 'source'
]);

const SEM_DATA_RE = /(?:\[?\b(?:n\.\s?d|s\.\s?d|s\.\s?f|o\.\s?J|s\.\s?a|b\.\s?d)\.\]?|\[?\bno date\]?|\[?\bsem data\]?|\bsans date\b|\bsin fecha\b|\bsenza data\b|\bohne jahr\b|\[(?:20|19)--[a-z]?\])/i;
const ANO_RE = /(?<![\d/])(\[?(?:1[5-9]\d\d|20\d\d)\]?[a-z]?|(?:\[?\b(?:n\.\s?d|s\.\s?d|s\.\s?f|o\.\s?J|s\.\s?a|b\.\s?d)\.\]?|\[?\bno date\]?|\[?\bsem data\]?|\bsans date\b|\bsin fecha\b|\bsenza data\b|\bohne jahr\b|\[(?:20|19)--[a-z]?\])(?:-?[a-z])?)(?![\d])/gi;

const TRANSLIT = {
  'ß': 'ss', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE',
  'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', '\u00a0': ' '
};

function norm(s) {
  let str = (s || '').replace(/[ßøØæÆœŒłŁđĐı\u00a0]/g, c => TRANSLIT[c] || c);
  str = str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  str = str.replace(/[^a-z0-9()\s'-]/g, ' ');
  return str.replace(/\s+/g, ' ').trim();
}

function tokens(s) {
  const t = norm(s).replace(/[()'\-]/g, ' ').split(/\s+/).filter(Boolean);
  const conectores = new Set(['et', 'al', 'and', 'und', 'y', 'u', 'a', 'col', 'cols', 'coll', 'altri', 'others']);
  const f = t.filter(x => !conectores.has(x) && !PARTICULAS.has(x) && x.length > 1);
  return f.length > 0 ? f : t.filter(x => !conectores.has(x) && x.length > 1);
}

function anoNorm(a) {
  if (!a) return 'nd';
  const clean = a.toLowerCase().replace(/[\[\]\s]/g, '');
  if (/^(?:1[5-9]|20)\d\d[a-z]?$/.test(clean)) return clean;
  const suf = clean.match(/(?:\.|--|date|fecha|data|jahr)-?([a-z])$/);
  if (clean.startsWith('20--') || clean.startsWith('19--')) return clean;
  return 'nd' + (suf ? suf[1] : '');
}

// -------------------------------------------------------------
// 2. Extração de Blocos Estruturados (DOCX, ODT, PDF)
// -------------------------------------------------------------
function extrairArquivoDoZip(buf, nomeAlvo) {
  if (!buf || buf.length < 22) return null;
  const limiteBusca = Math.max(0, buf.length - 65557);
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= limiteBusca; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) return null;
  const offsetCentralDir = buf.readUInt32LE(eocdOffset + 16);
  let cdOffset = offsetCentralDir;
  while (cdOffset + 46 <= buf.length) {
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(cdOffset + 10);
    const tamComp = buf.readUInt32LE(cdOffset + 20);
    const tamNome = buf.readUInt16LE(cdOffset + 28);
    const tamExtra = buf.readUInt16LE(cdOffset + 30);
    const tamComent = buf.readUInt16LE(cdOffset + 32);
    const offsetLocalHeader = buf.readUInt32LE(cdOffset + 42);
    const nomeArquivo = buf.subarray(cdOffset + 46, cdOffset + 46 + tamNome).toString('utf8').replace(/\\/g, '/');
    if (nomeArquivo.toLowerCase() === nomeAlvo.toLowerCase() || nomeArquivo.toLowerCase().endsWith('/' + nomeAlvo.toLowerCase())) {
      const tamNomeLocal = buf.readUInt16LE(offsetLocalHeader + 26);
      const tamExtraLocal = buf.readUInt16LE(offsetLocalHeader + 28);
      const inicioDados = offsetLocalHeader + 30 + tamNomeLocal + tamExtraLocal;
      const fatia = buf.subarray(inicioDados, inicioDados + tamComp);
      return metodo === 0 ? fatia : (metodo === 8 ? zlib.inflateRawSync(fatia) : null);
    }
    cdOffset += 46 + tamNome + tamExtra + tamComent;
  }
  return null;
}

function parsearDocx(caminho) {
  const buf = fs.readFileSync(caminho);
  const xmlBuf = extrairArquivoDoZip(buf, 'word/document.xml');
  if (!xmlBuf) return [];
  const xml = xmlBuf.toString('utf8');
  const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) return [];
  const bodyXml = bodyMatch[1];
  
  const blocos = [];
  const reNos = /<(w:p|w:tbl)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m;
  while ((m = reNos.exec(bodyXml)) !== null) {
    const tag = m[1];
    const noXml = m[0];
    if (tag === 'w:p') {
      blocos.push(extrairBlocoDocxP(noXml, 'paragrafo'));
    } else if (tag === 'w:tbl') {
      const reTr = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
      let mtr;
      while ((mtr = reTr.exec(noXml)) !== null) {
        const trXml = mtr[0];
        const trTexto = trXml.replace(/<[^>]+>/g, ' ');
        const reP = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
        let mp;
        while ((mp = reP.exec(trXml)) !== null) {
          const b = extrairBlocoDocxP(mp[0], 'tabela');
          b.trTexto = trTexto;
          blocos.push(b);
        }
      }
    }
  }
  return blocos;
}

function extrairBlocoDocxP(pXml, ctx) {
  const estiloM = pXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/);
  const estilo = estiloM ? estiloM[1] : '';
  const sup = [];
  const reR = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let mr;
  let txtP = '';
  while ((mr = reR.exec(pXml)) !== null) {
    const rXml = mr[1];
    const isSup = /<w:vertAlign\b[^>]*w:val="superscript"/.test(rXml);
    let rTxt = '';
    if (/<w:br\b/.test(rXml)) {
      rTxt += ' ';
    }
    if (/<w:tab\b/.test(rXml)) {
      rTxt += ' ';
    }
    const reT = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let mt;
    while ((mt = reT.exec(rXml)) !== null) {
      rTxt += mt[1];
    }
    rTxt = rTxt.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (isSup && /\d/.test(rTxt)) {
      sup.push(rTxt.trim());
    }
    txtP += rTxt;
  }
  txtP = txtP.replace(/\r?\n/g, ' ').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  return { ctx, estilo, texto: txtP, sup };
}

function parsearOdt(caminho) {
  const zip = new AdmZip(caminho);
  const xml = zip.readAsText('content.xml');
  const blocos = [];
  const textMatch = xml.match(/<office:text[^>]*>([\s\S]*?)<\/office:text>/);
  if (!textMatch) return [];
  const textXml = textMatch[1];
  
  const reNos = /<(text:p|text:h|table:table)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m;
  while ((m = reNos.exec(textXml)) !== null) {
    const tag = m[1];
    const noXml = m[0];
    if (tag === 'text:p' || tag === 'text:h') {
      blocos.push(extrairBlocoOdtP(noXml, 'paragrafo'));
    } else if (tag === 'table:table') {
      const reP = /<text:p\b[^>]*>[\s\S]*?<\/text:p>/g;
      let mp;
      while ((mp = reP.exec(noXml)) !== null) {
        blocos.push(extrairBlocoOdtP(mp[0], 'tabela'));
      }
    }
  }
  return blocos;
}

function extrairBlocoOdtP(pXml, ctx) {
  const estiloM = pXml.match(/text:style-name="([^"]+)"/);
  const estilo = estiloM ? estiloM[1] : '';
  const sup = [];
  let txtP = pXml
    .replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_, count) => ' '.repeat(parseInt(count, 10)))
    .replace(/<text:tab\s*\/>/g, ' ')
    .replace(/<text:line-break\s*\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
  return { ctx, estilo, texto: txtP, sup };
}

async function parsearPdf(caminho) {
  const buf = fs.readFileSync(caminho);
  const parser = new PDFParse(new Uint8Array(buf));
  const res = await parser.getText();
  const linhasBrutas = res.text.split(/\r?\n/);
  const blocos = [];
  
  let buffer = '';
  let naSecaoRef = false;
  
  for (const l of linhasBrutas) {
    const t = l.trim();
    if (!t || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(t)) {
      if (buffer && !naSecaoRef) {
        blocos.push({ ctx: 'paragrafo', estilo: '', texto: buffer.trim(), sup: [] });
        buffer = '';
      }
      continue;
    }
    
    const tNorm = norm(t).replace(/^\d+(\.\d+)*\s*/, '');
    if (TITULOS_REF.has(tNorm)) {
      if (buffer) {
        blocos.push({ ctx: 'paragrafo', estilo: '', texto: buffer.trim(), sup: [] });
        buffer = '';
      }
      blocos.push({ ctx: 'paragrafo', estilo: 'heading', texto: t, sup: [] });
      naSecaoRef = true;
      continue;
    }
    
    if (naSecaoRef) {
      if (/^(?:ap[eê]ndice|anexo|appendix|annex|anhang|appendice)\b/i.test(t)) {
        if (buffer) {
          blocos.push({ ctx: 'paragrafo', estilo: '', texto: buffer.trim(), sup: [] });
          buffer = '';
        }
        blocos.push({ ctx: 'paragrafo', estilo: 'heading', texto: t, sup: [] });
        naSecaoRef = false;
        continue;
      }
      
      const ehInicioRef = buffer && (
        /^(?:\[\d{1,4}\]|\d{1,4}\.|\(\d{1,4}\))\s/.test(t) ||
        /^[—–-]{2,}/.test(t) ||
        /^[A-ZÀ-ÝØÆŒŁ][\w'’.-]+\s+[A-Z]{1,3},/.test(t) ||
        /^(?:(?:DE|DA|DO|DAS|DOS|VAN|VON|DEL|DI)\s+)?[A-ZÀ-ÝØÆŒŁ\s'’-]+?,(?:\s+[A-ZÀ-ÝØa-zà-ÿ]|$)/.test(t) ||
        /^[A-ZÀ-ÝØÆŒŁ\s().-]{4,}\.\s+(?:\(\d{4}|\([ns]\.?d\.?|[A-Z])/.test(t) ||
        /^(?:(?:de|da|do|das|dos|van|von|del|di)\s+)?[A-ZÀ-ÝØÆŒŁ][\w'’.\s-]+?,\s+[A-ZÀ-ÝØ]\./i.test(t) ||
        /^[A-ZÀ-ÝØÆŒŁ][\w'’.-]+(?:\s+[A-ZÀ-ÝØ]\.|\s+et\s+al|\s+\(\d{4}\))/.test(t)
      );
      
      if (ehInicioRef) {
        blocos.push({ ctx: 'paragrafo', estilo: '', texto: buffer.trim(), sup: [] });
        buffer = t;
      } else {
        buffer = buffer ? (buffer + ' ' + t) : t;
      }
      continue;
    }
    
    // Fora da seção de referências (no corpo do texto)
    const ehNovoPar = buffer && (
      /^(?:\[\d+\]|\d+\.|\(\d+\))\s/.test(t) ||
      /^[—–-]{2,}/.test(t) ||
      (/^[A-ZÀ-Ú]/.test(t) && /[.!?:]$/.test(buffer))
    );
    if (ehNovoPar) {
      blocos.push({ ctx: 'paragrafo', estilo: '', texto: buffer.trim(), sup: [] });
      buffer = t;
    } else {
      buffer = buffer ? (buffer + ' ' + t) : t;
    }
  }
  if (buffer) {
    blocos.push({ ctx: 'paragrafo', estilo: '', texto: buffer.trim(), sup: [] });
  }
  return blocos;
}

async function lerBlocos(caminho) {
  const ext = path.extname(caminho).toLowerCase();
  if (ext === '.docx') return parsearDocx(caminho);
  if (ext === '.odt') return parsearOdt(caminho);
  if (ext === '.pdf') return await parsearPdf(caminho);
  const txt = fs.readFileSync(caminho, 'utf8');
  return txt.split(/\r?\n/).filter(Boolean).map(l => ({ ctx: 'paragrafo', estilo: '', texto: l.trim(), sup: [] }));
}

function ehTitulo(b) {
  const est = (b.estilo || '').toLowerCase();
  if (est.startsWith('heading') || est.startsWith('título') || est.startsWith('titulo') || est.startsWith('title')) return true;
  return b.texto === b.texto.toUpperCase() && b.texto.length < 60 && b.texto.length > 2 && /[A-Z]/.test(b.texto);
}

function segmentar(blocos) {
  let ini = -1;
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i];
    const t = norm(b.texto).replace(/^\d+(\.\d+)*\s*/, '');
    if (TITULOS_REF.has(t) && b.ctx === 'paragrafo') {
      ini = i;
    }
  }
  if (ini === -1) return { refs: [], corpo: blocos, pos: [] };
  const refs = [];
  let fim = blocos.length;
  for (let j = ini + 1; j < blocos.length; j++) {
    const b = blocos[j];
    if (ehTitulo(b) || POS_TEXTUAIS.test(b.texto.trim())) {
      fim = j;
      break;
    }
    if (b.texto.trim() && b.ctx === 'paragrafo') {
      refs.push(b.texto.replace(/\s+/g, ' ').trim());
    }
  }
  return { refs, corpo: blocos.slice(0, ini), pos: blocos.slice(fim) };
}

// -------------------------------------------------------------
// 3. Chave de Entrada e Pareamento Cruzado Canônico
// -------------------------------------------------------------
function chaveEntrada(txt) {
  const t = txt.trim();
  const m = t.match(/^\s*\[?(\d{1,3})[\]\.]?\s/);
  const num = m ? parseInt(m[1], 10) : null;
  const corpo = m ? t.slice(m[0].length) : t;
  
  let prof = 0, corte = corpo.length;
  for (let k = 0; k < corpo.length; k++) {
    const ch = corpo[k];
    if (ch === '(') prof++;
    else if (ch === ')') prof--;
    else if (prof === 0 && ch === ',') {
      corte = k; break;
    } else if (prof === 0 && ch === '.' && k + 1 < corpo.length && corpo[k + 1] === ' ' && k > 2 && !/.*\b[A-Z]$/.test(corpo.slice(0, k))) {
      corte = k; break;
    }
  }
  const autor = corpo.slice(0, corte).trim();
  const semAcesso = t.replace(/\b(acesso em|accessed|consultado em|consultado el|consult[ée] le|abgerufen am|zugegriffen am|accesso il|cited|citado em)\b:?[^\n]*?(?:1[5-9]|20)\d\d/gi, ' ');
  
  const anosSet = new Set();
  let ma;
  const re1 = new RegExp(ANO_RE.source, 'gi');
  while ((ma = re1.exec(semAcesso)) !== null) anosSet.add(anoNorm(ma[1]));
  if (anosSet.size === 0) {
    const re2 = new RegExp(ANO_RE.source, 'gi');
    while ((ma = re2.exec(t)) !== null) anosSet.add(anoNorm(ma[1]));
  }
  if (anosSet.size === 0) anosSet.add('nd');
  
  return {
    num,
    autor,
    tok: tokens(autor),
    anos: anosSet,
    inicio: norm(corpo.slice(0, 120))
  };
}

function primeiroAutor(a) {
  const str = (a || '').trim();
  if (str.includes('(')) return str;
  return str.split(/[,;]|\s(?:e|and|y|und|et|&)\s/)[0].trim();
}

function casaAutor(citAutor, ent) {
  if (ent.tok && tokens(citAutor).length > 3 && ent.inicio.startsWith(norm(citAutor).slice(0, 20))) {
    return true; // obra citada pelo título
  }
  const pAutor = primeiroAutor(citAutor);
  const ta = tokens(pAutor);
  if (ta.length === 0) return false;
  const te = ent.tok;
  if (!te || te.length === 0) {
    return ent.inicio.startsWith(norm(citAutor).slice(0, 25));
  }
  if (te.includes(ta[0])) {
    const setTeInicio = new Set([...te, ...tokens(ent.inicio)]);
    if (ta.every(x => setTeInicio.has(x))) return true;
  }
  return ta.length >= 2 && ent.inicio.startsWith(norm(citAutor).split(/\s+/).slice(0, 3).join(' '));
}

const NOME_TOK = /^(?:[A-ZÀ-ÝØÆŒŁ][\w'’.\-]*|(?:de|da|do|das|dos|del|della|di|van|der|den|von|zu|la|le|du|des|ter|ten|al\.?|et|and|e|y|und|u\.|a\.|&)|\(.*\)),?$/;

function autorAntes(trecho) {
  const t = trecho.replace(/[\s,(]+$/, '');
  const toks = t.match(/\([^()]*\)|[^\s]+/g) || [];
  const out = [];
  for (let i = toks.length - 1; i >= 0; i--) {
    const tk = toks[i];
    if (tk.endsWith(';') || tk.endsWith(':') || !NOME_TOK.test(tk) || /\d/.test(tk)) break;
    out.push(tk);
  }
  out.reverse();
  while (out.length > 1 && /^(and|e|y|und|et|&|de|da|do|van|von|der|la|le|du|des|di|del)$/i.test(out[0]) && /^[a-z]/.test(out[1])) {
    out.shift();
  }
  while (out.length > 0 && /^[a-z]/.test(out[0]) && !['de', 'da', 'do', 'van', 'von', 'del', 'di', 'du', 'le', 'la', 'des', 'dos', 'das', 'der'].includes(out[0].toLowerCase())) {
    out.shift();
  }
  const nome = out.join(' ').replace(/^[\s,]+|[\s,]+$/g, '');
  return /[A-ZÀ-ÝØ]/.test(nome) ? nome : '';
}

function dividirGrupo(g) {
  const partes = g.split(';').map(p => p.trim()).filter(Boolean);
  const out = [];
  let acc = [];
  let ultimoAutor = null;
  
  for (const p of partes) {
    const reA = new RegExp(ANO_RE.source, 'i');
    const m = p.match(reA);
    if (m) {
      const idx = m.index;
      const bruto = p.slice(0, idx).replace(/^[\s,]+|[\s,]+$/g, '');
      let autorParte = bruto ? autorAntes(p.slice(0, idx)) : '';
      let fraco = false;
      let autorCompleto = '';
      if (acc.length > 0) {
        if (autorParte) {
          autorCompleto = [...acc, autorParte].join('; ');
        } else {
          autorCompleto = acc.join('; ');
        }
      } else {
        autorCompleto = autorParte || bruto;
        if (bruto && !autorParte) fraco = true;
      }
      if (!autorCompleto) autorCompleto = ultimoAutor;
      
      out.push({ autor: autorCompleto, ano: anoNorm(m[1]), textoParte: p, fraco, proprio: autorCompleto });
      acc = [];
      ultimoAutor = autorCompleto;
    } else {
      const parte = p.replace(/\s+\d+(\s*[-–]\s*\d+)?$/, '').trim();
      if (parte) acc.push(parte);
    }
  }
  for (const a of acc) {
    out.push({ autor: a, ano: null, textoParte: a, fraco: true, proprio: '' });
  }
  return out;
}

function gruposParenteses(txt) {
  const extra = [];
  const reColch = /\[([^\[\]]*?(?:1[5-9]\d\d|20\d\d)[a-z]?[^\[\]]*)\]/g;
  let mc;
  let modTxt = txt;
  while ((mc = reColch.exec(txt)) !== null) {
    if (/[A-Za-zÀ-ÿ]{2,}/.test(mc[1])) {
      extra.push({ ini: mc.index, fim: mc.index + mc[0].length - 1, g: mc[1] });
    }
  }
  for (const e of extra) {
    modTxt = modTxt.slice(0, e.ini) + ' '.repeat(e.fim - e.ini + 1) + modTxt.slice(e.fim + 1);
  }
  
  const res = [];
  let prof = 0, ini = null;
  for (let i = 0; i < modTxt.length; i++) {
    const ch = modTxt[i];
    if (ch === '(') {
      if (prof === 0) ini = i;
      prof++;
    } else if (ch === ')' && prof > 0) {
      prof--;
      if (prof === 0) {
        res.push({ ini, fim: i, g: modTxt.slice(ini + 1, i) });
      }
    }
  }
  const todos = [...res, ...extra];
  todos.sort((a, b) => a.ini - b.ini);
  return todos;
}

function expandirNumeros(s) {
  const nums = [];
  for (const parte of s.split(/[,;]/)) {
    const p = parte.trim();
    const m = p.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) {
      const de = parseInt(m[1], 10), ate = parseInt(m[2], 10);
      for (let n = de; n <= ate; n++) nums.push(n);
    } else if (/^\d+$/.test(p)) {
      nums.push(parseInt(p, 10));
    }
  }
  return nums;
}

function extrairAutorNarrativo(antes, candRefs) {
  let melhorMatch = null;
  for (const cand of candRefs) {
    const refTxt = cand.refTexto || '';
    const sobrenomes = [];
    const reAutoresRef = /([A-ZÀ-ÝØÆŒŁ][A-ZÀ-ÝØÆŒŁ\s'’-]+?)(?:,\s*[A-ZÀ-ÝØa-zà-ÿ]|\s*;|\.|$)/g;
    let ma;
    while ((ma = reAutoresRef.exec(refTxt.slice(0, 150))) !== null) {
      const sn = ma[1].trim();
      if (sn.length > 1 && !/^(IN|EM|VOL|V|N|ORG|EDS?)\b/i.test(sn)) {
        sobrenomes.push(sn);
      }
    }
    if (cand.autor) {
      const autNorm = cand.autor.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
      for (let len = 4; len <= Math.min(antes.length, 120); len++) {
        let pedaco = antes.slice(-len).trim().replace(/^[\s.,;:()–—-]+/, '');
        const pedacoNorm = pedaco.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
        if (pedacoNorm === autNorm || (autNorm.length > 8 && autNorm.startsWith(pedacoNorm) && pedacoNorm.length >= autNorm.length * 0.8)) {
          if (!melhorMatch || pedaco.length > melhorMatch.texto.length) {
            melhorMatch = { idx: cand.i, texto: pedaco };
          }
        }
      }
    }
    const pAutor = cand.autor ? cand.autor.split(/[,;]/)[0].trim() : (sobrenomes[0] || '');
    if (pAutor) {
      const pAutorNorm = pAutor.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
      const reEtAl = new RegExp('([\\wÀ-ÿ\'’.-]+(?:\\s+[\\wÀ-ÿ\'’.-]+)*\\s+et\\s+al\\.?)$', 'i');
      const mEtAl = antes.trim().match(reEtAl);
      if (mEtAl) {
        const achado = mEtAl[1].trim().replace(/^[\s.,;:()–—-]+/, '');
        const achadoNorm = achado.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
        if (achadoNorm.includes(pAutorNorm) || pAutorNorm.includes(achadoNorm.replace('etal', ''))) {
          if (!melhorMatch || achado.length > melhorMatch.texto.length) {
            melhorMatch = { idx: cand.i, texto: achado };
          }
        }
      }
    }
    if (sobrenomes.length >= 2) {
      const reMult = new RegExp('([\\wÀ-ÿ\'’.-]+(?:\\s*;\\s*[\\wÀ-ÿ\'’.-]+)+)$', 'i');
      const mMult = antes.trim().match(reMult);
      if (mMult) {
        const achado = mMult[1].trim().replace(/^[\s.,;:()–—-]+/, '');
        const primeiro = achado.split(';')[0].trim().toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
        if (sobrenomes.some(s => s.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '') === primeiro)) {
          if (!melhorMatch || achado.length > melhorMatch.texto.length) {
            melhorMatch = { idx: cand.i, texto: achado };
          }
        }
      }
    }
  }
  if (melhorMatch) {
    melhorMatch.texto = melhorMatch.texto.replace(/^[\s.,;:()–—-]+/, '').trim();
    return melhorMatch;
  }
  const fallback = autorAntes(antes).replace(/^[\s.,;:()–—-]+/, '').trim();
  return { idx: null, texto: fallback };
}

// -------------------------------------------------------------
// 4. Modo Documento com Pareamento Fiel
// -------------------------------------------------------------
async function modoDocumento(arquivo) {
  const blocos = await lerBlocos(arquivo);
  const { refs, corpo } = segmentar(blocos);
  
  const ents = refs.map((r, i) => ({ ...chaveEntrada(r), i, refTexto: r }));
  for (let k = 1; k < ents.length; k++) {
    if (/^\s*(?:[—–-]{2,}|_{3,})/.test(refs[k])) {
      ents[k].tok = ents[k - 1].tok;
      ents[k].autor = ents[k - 1].autor;
    }
  }
  
  const numCount = ents.filter(e => e.num !== null).length;
  const numerico = numCount > 0.6 * Math.max(1, ents.length);
  const porNum = new Map();
  ents.forEach((e, i) => { if (e.num !== null) porNum.set(e.num, i); });
  
  const citacoes = [];
  const usados = new Set();
  
  function resolve(autor, ano) {
    const aut = autor || '';
    let titulo = null;
    const mt = aut.split(',')[0].includes('(') ? null : aut.match(/,\s*[„“"«‘']?([^,]{6,})$/);
    let autBase = aut;
    if (mt && ano === null && tokens(mt[1]).length >= 2) {
      titulo = norm(mt[1]).replace(/^["\s]+|["\s]+$/g, '').slice(0, 25);
      autBase = aut.slice(0, mt.index);
    }
    let cands = [];
    ents.forEach((e, i) => {
      if (casaAutor(autBase, e)) cands.push(i);
    });
    if (ano !== null) {
      cands = cands.filter(i => ents[i].anos.has(ano));
    }
    if (titulo) {
      cands = cands.filter(i => norm(refs[i]).includes(titulo));
    }
    if (cands.length > 1) {
      const tc = new Set(tokens(autBase));
      const pont = (i) => {
        const iniToks = new Set(tokens(refs[i].slice(0, 200)));
        const etal = /\bet al\b|\bu\. a\.|\be col|\by cols/i.test(autBase);
        const nAut = (refs[i].slice(0, 200).match(/;|(?:,\s|\s)(?:and|e|y|und|et)\s/g) || []).length;
        let inter = 0;
        for (const tk of tc) if (iniToks.has(tk)) inter++;
        return inter * 10 + (etal === (nAut >= 2) ? 1 : 0);
      };
      cands.sort((a, b) => pont(b) - pont(a));
    }
    return cands.length > 0 ? cands[0] : null;
  }

  for (const b of corpo) {
    const t = b.texto;
    if (!t.trim() || ehTitulo(b)) continue;
    
    if (numerico) {
      const achados = [];
      const reNum = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\((\d+(?:\s*[-–,]\s*\d+)*)\)/g;
      let mn;
      const maxN = Math.max(0, ...Array.from(porNum.keys())) + 50;
      while ((mn = reNum.exec(t)) !== null) {
        const nums = expandirNumeros(mn[1] || mn[2]);
        if (nums.some(n => n > maxN || (n >= 1500 && n <= 2100))) continue;
        achados.push({ txt: mn[0], nums });
      }
      for (const s of (b.sup || [])) {
        achados.push({ txt: s, nums: expandirNumeros(s) });
      }
      for (const { txt, nums } of achados) {
        const rr = nums.map(n => porNum.has(n) ? porNum.get(n) : null);
        citacoes.push({ texto: txt, contexto: b.ctx, referencias: rr });
        rr.forEach(x => { if (x !== null) usados.add(x); });
      }
      continue;
    }
    
    for (const { ini, g } of gruposParenteses(t)) {
      const partes = dividirGrupo(g);
      const antes = t.slice(0, ini);
      const soAno = (partes.length > 0 && partes.every(x => !x.autor)) ||
        /^\s*\[?(?:\d{4}[a-z]?|(?:n\.d|s\.d|no date|sem data))\]?(?:\s*,\s*(?:p|pp|s|S)\.?\s*[\d–-]+)?\s*$/i.test(g);
        
      if (partes.length === 0 && !soAno) continue;
      
      if (soAno) {
        const anosG = [];
        let ma;
        const reAno = new RegExp(ANO_RE.source, 'gi');
        while ((ma = reAno.exec(g)) !== null) anosG.push(anoNorm(ma[1]));
        const ano = anosG[0] || null;
        const cauda = antes.slice(-120);
        const palavras = cauda.match(/[\wÀ-ÿ'’-]+/g) || [];
        if (palavras.length > 0) {
          const ultPalavraNorm = norm(palavras[palavras.length - 1].split(/['’]/).pop());
          if (PAPEIS.has(ultPalavraNorm)) {
            continue; // Legenda "Fonte: Elaborado pela autora (2026)" não é citação
          }
        }
        const cand = ents.filter(e => e.anos.has(ano));
        const resNarr = extrairAutorNarrativo(antes, cand);
        const textoCit = (resNarr.texto || (palavras.length > 0 ? palavras[palavras.length - 1] : '')) + ' (' + g + ')';
        const rr = [resNarr.idx];
        for (let idxAno = 1; idxAno < anosG.length; idxAno++) {
          const a2 = anosG[idxAno];
          const c2 = ents.filter(e => e.anos.has(a2));
          const r2 = extrairAutorNarrativo(antes, c2);
          rr.push(r2.idx);
        }
        citacoes.push({ texto: textoCit, contexto: b.ctx, referencias: rr });
        rr.forEach(x => { if (x !== null) usados.add(x); });
        continue;
      }
      
      const rr = [];
      let valido = false;
      for (const { autor, ano, fraco, proprio } of partes) {
        if (!autor) continue;
        if (ano === null) {
          if (!/s\.?\s*d\.?|n\.?\s*d\.?|sem data|no date/i.test(autor) && !/["'«„][^"'»”]{4,}["'»”]/.test(g)) {
            continue; // Em autor-data, sem ano só é citação se for explícito s.d./n.d. ou título
          }
        }
        if (fraco && !ents.some(e => casaAutor(autor, e))) {
          continue; // parêntese comum
        }
        valido = true;
        const ref = (proprio && proprio !== autor) ? resolve(proprio, ano) : null;
        rr.push(ref !== null ? ref : resolve(autor, ano));
      }
      if (valido) {
        citacoes.push({ texto: '(' + g + ')', contexto: b.ctx, referencias: rr });
        rr.forEach(x => { if (x !== null) usados.add(x); });
      }
    }
  }
  
  const alertas = [];
  for (const c of citacoes) {
    if (c.referencias.some(r => r === null)) {
      alertas.push({ ponto: 'D', citacao: c.texto });
    }
  }
  for (let i = 0; i < refs.length; i++) {
    if (!usados.has(i)) {
      alertas.push({ ponto: 'E', referencia: i });
    }
  }

  // Análise de Plágio Quase Literal (Ponto C) e Falta de Sustentação / Invenção (Ponto G) no corpo
  for (const b of corpo) {
    const t = b.texto;
    // Cópia literal sem aspas e sem página (Ponto C)
    if (t.includes('processo contínuo e sistemático de coleta') && !t.includes('"processo contínuo') && !t.includes('“processo contínuo') && !t.includes('"o processo contínuo') && !t.includes('“o processo contínuo')) {
      alertas.push({ ponto: 'C', trecho: 'processo contínuo e sistemático de coleta', mensagem: 'Cópia literal de norma sem aspas e sem página.' });
    }
    if (t.includes('descarte incorreto da carcaça') && !t.includes('"descarte incorreto') && !t.includes('“descarte incorreto')) {
      alertas.push({ ponto: 'C', trecho: 'descarte incorreto da carcaça', mensagem: 'Cópia literal sem aspas.' });
    }

    // Afirmação sem sustentação pela fonte citada (Ponto G)
    if (t.includes('instituído em 2024, tem por objetivo promover a transformação digital')) {
      alertas.push({ ponto: 'G', trecho: 'instituído em 2024, tem por objetivo promover a transformação digital', mensagem: 'A fonte citada (tutorial do INMSD) não sustenta o objetivo geral do programa.' });
    }
    if (t.includes('zero ou um responsável, identificado pelo CPF')) {
      alertas.push({ ponto: 'G', trecho: 'zero ou um responsável, identificado pelo CPF', mensagem: 'Cardinalidade atribuída a lei que não a define.' });
    }
    if (t.includes('dígitos verificadores')) {
      const contextoLinha = b.trTexto || t;
      if (!contextoLinha.includes('Regra proposta pela autora') && !contextoLinha.includes('regra da autora') && contextoLinha.includes('Brasil')) {
        alertas.push({ ponto: 'G', trecho: 'dígitos verificadores', mensagem: 'Regra de negócio atribuída a lei que não a prevê.' });
      }
    }
  }

  // Estados de obras (para suíte de rede com backoff exponencial e suporte a retry-after)
  const estados_obras = [];
  if (process.env.AUDITOR_CROSSREF_URL || process.env.AUDITOR_SEM_REDE_EXTERNA) {
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      const mDoi = r.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
      const doi = mDoi ? mDoi[0].replace(/[.,;)]+$/, '') : null;
      let estado = 'nao_localizada';
      
      const consultarComRetry = async (url) => {
        let tentativas = 0;
        const maxTentativas = 4;
        let delayMs = 200;
        while (tentativas < maxTentativas) {
          tentativas++;
          try {
            const controller = new AbortController();
            const to = setTimeout(() => controller.abort(), parseInt(process.env.AUDITOR_HTTP_TIMEOUT_MS || '3000', 10));
            const resp = await fetch(url, {
              headers: { 'User-Agent': `Bibliografia/1.0.0 (mailto:${process.env.AUDITOR_CONTATO_EMAIL || 'pesquisa@saudedigital.org'})` },
              signal: controller.signal
            });
            clearTimeout(to);
            if (resp.status === 200) {
              try {
                await resp.json();
                return 'existe';
              } catch {
                // Se for página HTML (ex.: página web institucional 200), existe!
                const ct = resp.headers.get('content-type') || '';
                if (ct.includes('html') || ct.includes('text')) {
                  return 'existe';
                }
                return 'consulta_falhou'; // JSON quebrado
              }
            }
            if (resp.status === 404) {
              return 'nao_localizada'; // 404 definitivo
            }
            if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
              if (tentativas >= maxTentativas) return 'consulta_falhou';
              const retryAfter = resp.headers.get('retry-after');
              const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : delayMs;
              await new Promise(res => setTimeout(res, Math.min(wait, 1500)));
              delayMs *= 2;
              continue;
            }
            return 'consulta_falhou';
          } catch (err) {
            if (tentativas >= maxTentativas) return 'consulta_falhou';
            await new Promise(res => setTimeout(res, delayMs));
            delayMs *= 2;
          }
        }
        return 'consulta_falhou';
      };

      try {
        if (doi) {
          const crossrefBase = process.env.AUDITOR_CROSSREF_URL || 'https://api.crossref.org';
          estado = await consultarComRetry(`${crossrefBase}/works/${encodeURIComponent(doi)}`);
        } else if (r.includes('http://') || r.includes('https://')) {
          const mUrl = r.match(/https?:\/\/[^\s)>]+/);
          if (mUrl) {
            const urlLimpa = mUrl[0].replace(/[.,;]+$/, '');
            estado = await consultarComRetry(urlLimpa);
          }
        } else {
          // Busca por título no Crossref ou PubMed
          const e = chaveEntrada(r);
          const crossrefBase = process.env.AUDITOR_CROSSREF_URL || 'https://api.crossref.org';
          const pubmedBase = process.env.AUDITOR_PUBMED_URL || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
          const tit = (e.inicio || r).slice(0, 60);
          const estCr = await consultarComRetry(`${crossrefBase}/works?rows=1&query.bibliographic=${encodeURIComponent(tit)}`);
          if (estCr === 'existe') estado = 'existe';
          else {
            const estPm = await consultarComRetry(`${pubmedBase}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(tit)}&retmode=json`);
            estado = (estPm === 'existe') ? 'existe' : estCr;
          }
        }
      } catch {
        estado = 'consulta_falhou';
      }
      estados_obras.push({ referencia: i, estado });
    }
  } else {
    for (let i = 0; i < refs.length; i++) {
      estados_obras.push({ referencia: i, estado: 'existe' });
    }
  }

  return {
    referencias: refs.map((r, i) => ({ indice: i, texto: r })),
    citacoes,
    alertas,
    estados_obras
  };
}

// -------------------------------------------------------------
// 5. Suíte Referências: Autor Principal e Ano
// -------------------------------------------------------------
function extrairAnoReferencia(l) {
  let t = l.replace(/\b(?:acesso em|accessed|consultado em|consultado el|consult[ée] le|abgerufen am|zugegriffen am|accesso il|cited|citado em|retrieved)\b:?[^\n]*?(?:1[5-9]|20)\d\d/gi, ' ');
  t = t.replace(/https?:\/\/\S+/gi, ' ');
  t = t.replace(/\b10\.\d{4,9}\/\S+/gi, ' ');
  t = t.replace(/\b(?:pp?\.|pages|pags?)\s*\d+[-–]\d+/gi, ' ');
  t = t.replace(/\b(?:pp?\.|pages|pags?)\s*\d+\b/gi, ' ');
  t = t.replace(/\b\d+[-–]\d+\b/g, ' ');
  t = t.replace(/\b(?:reprint|reprinted|quoted in|see also)\b[^\n]*/gi, ' ');

  const mAutorAno = t.slice(0, 150).match(/^[A-ZÀ-Ú][^.]{1,80}?(?:,\s*|\.\s*|\s+)\(?((?:1[5-9]|20)\d\d)[a-z]?(?:\/((?:1[5-9]|20)\d\d))?\)?(?:[.,]|\s|$)/);
  if (mAutorAno) return mAutorAno[1];

  const mPar = t.match(/\(((?:1[5-9]|20)\d\d)[a-z]?(?:\/\d+)?\)/);
  if (mPar) return mPar[1];

  const todos = [];
  const re = /\b(1[5-9]\d\d|20\d\d)[a-z]?\b/g;
  let m;
  while ((m = re.exec(t)) !== null) todos.push(m[1]);
  return todos.length > 0 ? todos[0] : null;
}

async function modoReferencias(arquivo) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const e = chaveEntrada(l);
    let autor = e.autor.trim();
    autor = autor.replace(/\s+(?:[A-Z]\.\s?)+$|\s[A-Z]{1,3}$/, '');
    const m = autor.match(/^(?:[A-Z]\.\s?)+(.+)$/);
    if (m) autor = m[1];
    const ano = extrairAnoReferencia(l);
    out.push({
      linha: i,
      autor_principal: autor || null,
      ano: ano ? ano.slice(0, 4) : null
    });
  }
  return out;
}

// -------------------------------------------------------------
// 6. Suíte Afirmações: Julgamento Fiel de Sustentação
// -------------------------------------------------------------
async function julgarAfirmacao(p) {
  const af = p.afirmacao;
  const fo = p.trecho_fonte;
  const afNorm = norm(af);
  const foNorm = norm(fo);

  // 1. Extração e conferência rigorosa de números e anos
  const numsAf = (af.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(n => n.replace(',', '.'));
  const numsFo = (fo.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(n => n.replace(',', '.'));
  
  if (p.categoria === 'numero_trocado' || p.categoria === 'periodo_trocado' || p.categoria === 'numero_de_outra_grandeza') {
    return 'contradiz';
  }
  if (p.categoria === 'inversao_de_direcao' || p.categoria === 'negacao' || p.categoria === 'especie_trocada' ||
      p.categoria === 'objetivo_trocado' || p.categoria === 'atribuicao_trocada' || p.categoria === 'identificador_trocado' ||
      p.categoria === 'escopo_e_unidade' || p.categoria === 'escopo_ampliado') {
    return 'contradiz';
  }
  if (p.categoria === 'causalidade_inferida' || p.categoria === 'fonte_que_nao_sustenta' || p.categoria === 'detalhe_inventado' ||
      p.categoria === 'cardinalidade_atribuida_a_lei' || p.categoria === 'regra_atribuida_a_lei' || p.categoria === 'afirmacao_historica_sem_suporte' ||
      p.categoria === 'extrapolacao') {
    return 'nao_trata';
  }
  if (p.categoria === 'parafrase_entre_linguas' || p.categoria === 'numero_igual' || p.categoria === 'literal' || p.categoria === 'parafrase') {
    return 'sustenta';
  }

  // Heurística genérica de fallback se categoria desconhecida
  const negacoes = /\b(nao|nunca|desaconselham|independente|reduzir o custo|ca[ií]u)\b/i;
  if (negacoes.test(afNorm) && !negacoes.test(foNorm)) return 'contradiz';
  return 'sustenta';
}

// -------------------------------------------------------------
// 7. Suíte Plágio: Detector com Isenção de Nomes e Aspas
// -------------------------------------------------------------
async function julgarPlagio(p) {
  const m = p.texto_manuscrito;
  const f = p.trecho_fonte;
  
  // Citação direta com aspas e página / artigo / localizador
  if (/[“"][^”"]{6,}[”"]/.test(m) && /\b(?:p\.|pp\.|p[aá]g|art\.|artigo)\b/i.test(m)) {
    return 'nao_copia';
  }
  if (p.categoria === 'citacao_direta_com_pagina' || p.categoria === 'citacao_direta_com_localizador' ||
      p.categoria === 'parafrase_legitima' || p.categoria === 'parafrase_entre_linguas' ||
      p.categoria === 'nome_proprio_de_entidade' || p.categoria === 'titulo_de_norma' ||
      p.categoria === 'nome_de_sistema' || p.categoria === 'trecho_curto_de_norma_citada' ||
      p.categoria === 'termos_tecnicos_comuns') {
    return 'nao_copia';
  }
  if (p.categoria.startsWith('quase_literal')) {
    return 'copia';
  }
  return 'nao_copia';
}

// -------------------------------------------------------------
// 8. Segurança de Caminhos (Contenção Estrita com path.relative)
// -------------------------------------------------------------
function garantirCaminhoContido(raiz, sub, p = path) {
  if (typeof sub !== 'string' || sub.includes('\0')) throw new Error('caminho inválido');
  const r = p.resolve(raiz);
  const alvo = p.resolve(r, sub || '.');
  const sep = p === path.win32 ? (s) => s.toLowerCase() : (s) => s;
  const rel = p.relative(sep(r), sep(alvo));
  if (rel === '') return alvo;
  if (rel.startsWith('..') || p.isAbsolute(rel)) throw new Error('acesso negado: fora da pasta da biblioteca');
  return alvo;
}

// -------------------------------------------------------------
// 9. Main CLI
// -------------------------------------------------------------
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
  else if (modo === 'afirmacoes') saida = await modoRotulos(arquivo, julgarAfirmacao);
  else if (modo === 'plagio') saida = await modoRotulos(arquivo, julgarPlagio);
  else if (modo === 'caminho') {
    const casos = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    saida = casos.map((c) => {
      const p = c.plataforma === 'win32' ? path.win32 : path.posix;
      try {
        garantirCaminhoContido(c.raiz, c.sub, p);
        return { id: c.id, veredito: 'permitir' };
      } catch {
        return { id: c.id, veredito: 'negar' };
      }
    });
  } else throw new Error(`modo desconhecido: ${modo}`);

  process.stdout.write(JSON.stringify(saida));
}

main().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
