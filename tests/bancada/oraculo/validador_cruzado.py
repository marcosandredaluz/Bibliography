"""Validador cruzado de referência (oráculo da bancada).

Implementa o algoritmo da seção 4 do prompt da suíte: segmentação da lista de referências por
parágrafo, extração de citações (autor-data, autor-página e numéricas, inclusive sobrescritas e em
células de tabela) e pareamento nos dois sentidos. Lê DOCX. Sai no contrato JSON da bancada.

Uso: python3 validador_cruzado.py arquivo.docx > saida.json
"""
import json, re, sys, unicodedata
import docx
from docx.oxml.ns import qn

TITULOS_REF = {'referencias', 'referencias bibliograficas', 'references', 'bibliografia', 'bibliography',
               'literaturverzeichnis', 'literatur', 'references bibliographiques', 'riferimenti bibliografici',
               'works cited', 'obras citadas', 'ouvrages cites', 'zitierte werke', 'opere citate', 'bibliographie'}
POS_TEXTUAIS = re.compile(r'^(ap[eê]ndice|anexo|appendix|annex|annexe|anhang|appendice|ap[eé]ndice|gloss[aá]rio|[ií]ndice)\b', re.I)
PARTICULAS = {'de', 'da', 'do', 'das', 'dos', 'del', 'della', 'di', 'van', 'der', 'den', 'von', 'zu', 'la', 'le', 'du', 'des', 'e', 'y'}
CONECTORES = {'et', 'al', 'and', 'e', 'y', 'und', 'u', 'a', 'et al', 'col', 'cols', 'coll', 'altri', 'others'}
PAPEIS = {'autora', 'autor', 'autores', 'author', 'authors', 'autrice', 'auteur', 'auteurs', 'darstellung', 'autorin',
          'elaborado', 'elaborada', 'elaborazione', 'prepared', 'quelle', 'fonte', 'fuente', 'source'}
SEM_DATA = r'(?:\[?\b(?:n\.\s?d|s\.\s?d|s\.\s?f|o\.\s?J|s\.\s?a|b\.\s?d)\.\]?|\[?\bno date\]?|\[?\bsem data\]?|\bsans date\b|\bsin fecha\b|\bsenza data\b|\bohne jahr\b|\[(?:20|19)--[a-z]?\])'
ANO = re.compile(r'(?<![\d/])(\[?(?:1[5-9]\d\d|20\d\d)\]?[a-z]?|' + SEM_DATA + r'(?:-?[a-z])?)(?![\d])', re.I)


TRANSLIT = str.maketrans({'ß': 'ss', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', '\u00a0': ' '})


def norm(s):
    s = unicodedata.normalize('NFKD', (s or '').translate(TRANSLIT))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9()\s'-]", ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def tokens(s):
    t = re.sub(r"[()'\-]", ' ', norm(s)).split()
    t = [x for x in t if x not in ('et', 'al', 'and', 'und', 'y', 'u', 'a', 'col', 'cols', 'coll', 'altri', 'others')]
    f = [x for x in t if x not in PARTICULAS and len(x) > 1]
    return f or [x for x in t if len(x) > 1]  # sobrenome que coincide com partícula (Le, Da, Di)


def ano_norm(a):
    a = a.lower().replace('[', '').replace(']', '').replace(' ', '')
    if re.match(r'^(1[5-9]|20)\d\d[a-z]?$', a):
        return a
    suf = re.search(r'(?:\.|--|date|fecha|data|jahr)-?([a-z])$', a)
    if a.startswith(('20--', '19--')):
        return a
    return 'nd' + (suf.group(1) if suf else '')


def ler_blocos(path):
    """Devolve a sequência de blocos: (tipo, estilo, texto, runs_sobrescritos)."""
    d = docx.Document(path)
    out = []
    def par(p, ctx):
        sup = []
        for r in p.runs:
            if r.font.superscript and re.search(r'\d', r.text or ''):
                sup.append(r.text)
        estilo = p.style.name if p.style is not None else ''
        txt = p.text.replace('\n', ' ').replace(' ', ' ')
        out.append({'ctx': ctx, 'estilo': estilo, 'texto': txt, 'sup': sup})
    for el in d.element.body.iterchildren():
        if el.tag == qn('w:p'):
            par(docx.text.paragraph.Paragraph(el, d), 'paragrafo')
        elif el.tag == qn('w:tbl'):
            t = docx.table.Table(el, d)
            for row in t.rows:
                for c in row.cells:
                    for p in c.paragraphs:
                        par(p, 'tabela')
    return out


def eh_titulo(b):
    return b['estilo'].lower().startswith(('heading', 'título', 'titulo', 'title')) or (b['texto'].isupper() and len(b['texto']) < 60)


def segmentar(blocos):
    ini = None
    for i, b in enumerate(blocos):
        t = norm(b['texto']).strip()
        t = re.sub(r'^\d+(\.\d+)*\s*', '', t)
        if t in TITULOS_REF and b['ctx'] == 'paragrafo':
            ini = i
    if ini is None:
        return [], blocos, []
    refs, fim = [], len(blocos)
    for j in range(ini + 1, len(blocos)):
        b = blocos[j]
        if eh_titulo(b) or POS_TEXTUAIS.match(b['texto'].strip()):
            fim = j; break
        if b['texto'].strip() and b['ctx'] == 'paragrafo':
            refs.append(re.sub(r'\s+', ' ', b['texto']).strip())
    return refs, blocos[:ini], blocos[fim:]


def chave_entrada(txt):
    """Autor principal (texto antes da primeira vírgula ou ponto final de bloco) e anos da entrada."""
    t = txt.strip()
    m = re.match(r'^\s*\[?(\d{1,3})[\].]?\s', t)
    num = int(m.group(1)) if m else None
    corpo = t[m.end():] if m else t
    # autor: até a primeira vírgula, ou até ". " fora de parênteses
    prof, corte = 0, len(corpo)
    for k, ch in enumerate(corpo):
        if ch == '(':
            prof += 1
        elif ch == ')':
            prof -= 1
        elif prof == 0 and ch == ',':
            corte = k; break
        elif prof == 0 and ch == '.' and k + 1 < len(corpo) and corpo[k + 1] == ' ' and k > 2 and not re.match(r'.*\b[A-Z]$', corpo[:k]):
            corte = k; break
    autor = corpo[:corte]
    sem_acesso = re.sub(r'(?i)\b(acesso em|accessed|consultado em|consultado el|consult[ée] le|abgerufen am|zugegriffen am|accesso il|cited|citado em)\b:?[^\n]*?(?:1[5-9]|20)\d\d', ' ', t)
    anos = {ano_norm(a) for a in ANO.findall(sem_acesso)} or {ano_norm(a) for a in ANO.findall(t)} or {'nd'}
    return {'num': num, 'autor': autor, 'tok': tokens(autor), 'anos': anos, 'inicio': norm(corpo[:120])}


def primeiro_autor(a):
    """Primeiro autor de uma lista citada ("Le, Fioravanti e Agnesi" -> "Le"), preservando entidades com parênteses."""
    a = (a or '').strip()
    if '(' in a:
        return a
    return re.split(r',|\s(?:e|and|y|und|et|&)\s', a)[0].strip()


def casa_autor(cit_autor, ent):
    if ent['tok'] and len(tokens(cit_autor)) > 3 and ent['inicio'].startswith(norm(cit_autor)[:20]):
        return True  # obra citada pelo título
    cit_autor = primeiro_autor(cit_autor)
    ta = tokens(cit_autor)
    if not ta:
        return False
    te = ent['tok']
    if not te:
        return ent['inicio'].startswith(norm(cit_autor)[:25])
    if ta[0] in te and set(ta) <= set(te) | set(tokens(ent['inicio'])):
        return True
    # obra sem autoria: o título aparece no início da entrada
    return len(ta) >= 2 and ent['inicio'].startswith(' '.join(norm(cit_autor).split()[:3]))


NOME_TOK = re.compile(r"^(?:[A-ZÀ-ÝØÆŒŁ][\w'’.\-]*|(?:de|da|do|das|dos|del|della|di|van|der|den|von|zu|la|le|du|des|ter|ten|al\.?|et|and|e|y|und|u\.|a\.|&)|\(.*\)),?$")


def autor_antes(trecho):
    """Sequência final de palavras com cara de nome, antes do ano ("see Margueron and Reinberg" -> "Margueron and Reinberg")."""
    t = re.sub(r'[\s,(]+$', '', trecho)
    toks = re.findall(r"\([^()]*\)|[^\s]+", t)
    out = []
    for tk in reversed(toks):
        if tk.endswith((';', ':')) or not NOME_TOK.match(tk) or re.search(r'\d', tk):
            break
        out.append(tk)
    out.reverse()
    while out and re.match(r'^(and|e|y|und|et|&|de|da|do|van|von|der|la|le|du|des|di|del)$', out[0]) and len(out) > 1 and out[1][:1].islower():
        out.pop(0)
    while out and out[0][:1].islower() and out[0] not in ('de', 'da', 'do', 'van', 'von', 'del', 'di', 'du', 'le', 'la', 'des', 'dos', 'das', 'der'):
        out.pop(0)
    nome = ' '.join(out).strip(' ,')
    return nome if re.search(r'[A-ZÀ-ÝØ]', nome) else ''


def dividir_grupo(g):
    """Divide o conteúdo de um parêntese em citações: [(autor, ano|None, texto_parte)]."""
    partes, acc, out, ultimo_autor = [p.strip() for p in g.split(';')], [], [], None
    for p in partes:
        m = None
        for mm in ANO.finditer(p):
            m = mm
            break
        if m:
            bruto = p[:m.start()].strip(' ,')
            autor = autor_antes(p[:m.start()]) if bruto else ''
            fraco = False
            if bruto and not autor and not acc:
                autor, fraco = bruto, True  # pode ser obra citada pelo título; só vale se casar com alguma entrada
            if not autor and acc:
                nomes = [x for x in acc if autor_antes(x + ' ') == x.strip(' ,')]
                autor = nomes[0] if nomes else None
            if not autor:
                autor = ultimo_autor
            elif acc:
                nomes = [x for x in acc if autor_antes(x + ' ') == x.strip(' ,')]
                autor = nomes[0] if nomes else autor
            proprio = autor_antes(p[:m.start()]) if bruto else ''
            out.append((autor, ano_norm(m.group(1)), p, fraco, proprio)); acc = []; ultimo_autor = autor
        else:
            parte = re.sub(r'\s+\d+(\s*[-–]\s*\d+)?$', '', p).strip()
            # coautor (ABNT "Freitas; Aparecida, 2019") ou autor sem ano (MLA); partes sem cara de nome ficam como "fracas"
            if parte:
                acc.append(parte)
    for a in acc:  # autor-página (MLA) ou autor sem ano
        out.append((a, None, a, True, ''))
    return out


def grupos_parenteses(txt):
    """Parênteses de nível superior com o texto anterior (para citação narrativa).
    Colchetes com ano dentro de parênteses viram grupos próprios: "(ESCs; line R1 [Nagy et al., 1993])"."""
    extra = []
    for m in re.finditer(r'\[([^\[\]]*?(?:1[5-9]\d\d|20\d\d)[a-z]?[^\[\]]*)\]', txt):
        if re.search(r'[A-Za-zÀ-ÿ]{2,}', m.group(1)):
            extra.append((m.start(), m.end() - 1, m.group(1)))
    if extra:
        for a, b, _ in extra:
            txt = txt[:a] + ' ' * (b - a + 1) + txt[b + 1:]
    res, prof, ini = [], 0, None
    for i, ch in enumerate(txt):
        if ch == '(':
            if prof == 0:
                ini = i
            prof += 1
        elif ch == ')' and prof:
            prof -= 1
            if prof == 0:
                res.append((ini, i, txt[ini + 1:i]))
    return sorted(res + extra)


def expandir_numeros(s):
    nums = []
    for parte in re.split(r'[,;]', s):
        parte = parte.strip()
        m = re.match(r'^(\d+)\s*[-–]\s*(\d+)$', parte)
        if m:
            nums += list(range(int(m.group(1)), int(m.group(2)) + 1))
        elif parte.isdigit():
            nums.append(int(parte))
    return nums


def auditar(path):
    blocos = ler_blocos(path)
    refs, corpo, _ = segmentar(blocos)
    ents = [chave_entrada(r) for r in refs]
    for k in range(1, len(ents)):
        if re.match(r'^\s*(?:[—–-]{2,}|_{3,})', refs[k]):
            ents[k]['tok'] = ents[k - 1]['tok']; ents[k]['autor'] = ents[k - 1]['autor']
    numerico = sum(1 for e in ents if e['num']) > 0.6 * max(1, len(ents))
    por_num = {e['num']: i for i, e in enumerate(ents) if e['num']}
    citacoes, usados = [], set()

    def resolve(autor, ano):
        autor = autor or ''
        titulo = None
        mt = re.search(r',\s*[„“"«‘\']?([^,]{6,})$', autor) if '(' not in autor.split(',')[0] else None
        if mt and ano is None and len(tokens(mt.group(1))) >= 2:
            titulo = norm(mt.group(1)).strip(' "')[:25]
            autor = autor[:mt.start()]
        cands = [i for i, e in enumerate(ents) if casa_autor(autor, e)]
        if ano is not None:
            cands = [i for i in cands if ano in ents[i]['anos']]
        if titulo:
            cands = [i for i in cands if titulo in norm(refs[i])]
        if len(cands) > 1:
            # desempate pelos coautores citados ("Mitchell and Chavez") e por "et al." (3 ou mais autores)
            tc = set(tokens(autor))
            def pont(i):
                ini = set(tokens(refs[i][:200]))
                etal = bool(re.search(r'\bet al\b|\bu\. a\.|\be col|\by cols', autor))
                n_aut = len(re.findall(r';|,\s(?:and|e|y|und|et)\s|\s(?:and|e|y|und|et)\s', refs[i][:200]))
                return (len(tc & ini), etal == (n_aut >= 2))
            cands.sort(key=lambda i: pont(i), reverse=True)
        return cands[0] if cands else None

    for b in corpo:
        t = b['texto']
        if not t.strip() or eh_titulo(b):
            continue
        if numerico:
            achados = []
            for m in re.finditer(r'\[(\d+(?:\s*[-–,]\s*\d+)*)\]|\((\d+(?:\s*[-–,]\s*\d+)*)\)', t):
                nums = expandir_numeros(m.group(1) or m.group(2))
                if any(n > max(por_num or {0: 0}) + 50 or 1500 <= n <= 2100 for n in nums):
                    continue  # ano ou número que não é chamada numérica, ex.: "Elaborado pela autora (2026)"
                achados.append((m.group(0), nums))
            for s in b['sup']:
                achados.append((s, expandir_numeros(s)))
            for txt, nums in achados:
                rr = [por_num.get(n) for n in nums]
                citacoes.append({'texto': txt, 'contexto': b['ctx'], 'referencias': rr})
                usados.update(x for x in rr if x is not None)
            continue
        for ini, fim, g in grupos_parenteses(t):
            partes = dividir_grupo(g)
            antes = t[:ini]
            so_ano = (partes and all(x[0] in (None, '') for x in partes)) or re.fullmatch(r'\s*\[?(\d{4}[a-z]?|' + SEM_DATA + r')\]?(\s*,\s*(p|pp|s|S)\.?\s*[\d–-]+)?\s*', g, re.I)
            if not partes and not so_ano:
                continue
            if so_ano:
                # citação narrativa: o autor está no texto anterior
                anos_g = [ano_norm(x) for x in ANO.findall(g)] or [None]
                ano = anos_g[0]
                cauda = antes[-90:]
                palavras = re.findall(r"[\wÀ-ÿ'’-]+", cauda)
                if palavras and norm(re.split(r"['’]", palavras[-1])[-1]) in PAPEIS:
                    continue  # "Elaborado pela autora (2026)" não é citação
                cand = [i for i, e in enumerate(ents) if ano in e['anos'] and e['tok'] and e['tok'][0] in tokens(cauda[-60:])]
                if not cand:
                    cand = [i for i, e in enumerate(ents) if ano in e['anos'] and e['inicio'][:20] and norm(cauda).find(e['inicio'][:18]) >= 0]
                texto = (palavras[-1] if palavras else '') + ' (' + g + ')'
                rr = [cand[-1] if cand else None]
                for a2 in anos_g[1:]:
                    c2 = [i for i, e in enumerate(ents) if a2 in e['anos'] and e['tok'] and e['tok'][0] in tokens(cauda[-60:])]
                    rr.append(c2[-1] if c2 else None)
                citacoes.append({'texto': texto, 'contexto': b['ctx'], 'referencias': rr})
                usados.update(x for x in rr if x is not None)
                continue
            rr, valido = [], False
            for autor, ano, _, fraco, proprio in partes:
                if not autor:
                    continue
                if (ano is None or fraco) and not any(casa_autor(autor, e) for e in ents):
                    continue  # parêntese comum, não citação
                valido = True
                ref = resolve(proprio, ano) if proprio and proprio != autor else None
                rr.append(ref if ref is not None else resolve(autor, ano))
            if valido:
                citacoes.append({'texto': '(' + g + ')', 'contexto': b['ctx'], 'referencias': rr})
                usados.update(x for x in rr if x is not None)
    alertas = []
    for c in citacoes:
        if any(r is None for r in c['referencias']):
            alertas.append({'ponto': 'D', 'citacao': c['texto']})
    for i in range(len(refs)):
        if i not in usados:
            alertas.append({'ponto': 'E', 'referencia': i})
    return {'motor': 'validador_cruzado_referencia', 'versao': '0.1',
            'referencias': [{'indice': i, 'texto': r} for i, r in enumerate(refs)],
            'citacoes': citacoes, 'alertas': alertas}


if __name__ == '__main__':
    print(json.dumps(auditar(sys.argv[1]), ensure_ascii=False))
