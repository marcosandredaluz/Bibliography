"""Converte artigos reais em JATS XML (eLife, PMC Open Access, SciELO) em DOCX com gabarito exato.

O pareamento citação e referência vem das marcações <xref ref-type="bibr" rid="..."> do próprio
artigo, ou seja, é um gabarito real, feito pela editora, e não por heurística.

Uso: python3 jats_para_docx.py <pasta_xml> <pasta_saida> [--erros]
Gera, para cada artigo: <id>_limpo.docx, <id>_perturbado.docx e, com --erros, <id>_erros.docx
(duas referências retiradas da lista, o que gera citações sem referência, ponto D).
"""
import json, os, random, re, sys
import xml.etree.ElementTree as ET
import docx
from docx.enum.text import WD_BREAK

NBSP = ' '


def txt(e):
    return re.sub(r'\s+', ' ', ''.join(e.itertext())).strip() if e is not None else ''


def render_ref(ref):
    mc = ref.find('.//mixed-citation')
    if mc is not None and len(txt(mc)) > 20:
        return txt(mc)
    ec = ref.find('.//element-citation')
    if ec is None:
        return txt(ref)
    nomes = []
    for pg in ec.findall('person-group')[:1] or [ec]:
        for n in pg:
            if n.tag == 'name':
                sn = txt(n.find('surname')); gn = txt(n.find('given-names'))
                nomes.append(f'{sn} {gn}'.strip())
            elif n.tag == 'collab':
                nomes.append(txt(n))
            elif n.tag == 'etal':
                nomes.append('et al.')
    ano = txt(ec.find('year')) or 'n.d.'
    tit = txt(ec.find('article-title')) or txt(ec.find('chapter-title')) or txt(ec.find('data-title')) or ''
    src = txt(ec.find('source'))
    vol = txt(ec.find('volume'))
    fp, lp = txt(ec.find('fpage')), txt(ec.find('lpage'))
    eid = txt(ec.find('elocation-id'))
    doi = txt(ec.find("pub-id[@pub-id-type='doi']"))
    s = ', '.join(nomes) + f'. {ano}. '
    if tit:
        s += tit.rstrip('.') + '. '
    if src:
        s += src
    if vol:
        s += f' {vol}'
    if fp:
        s += f':{fp}' + (f'–{lp}' if lp else '')
    elif eid:
        s += f':{eid}'
    s = s.rstrip() + '.'
    if doi:
        s += f' doi: {doi}'
    return s


def converter(xml_path, saida, erros=False):
    raiz = ET.parse(xml_path).getroot()
    aid = os.path.basename(xml_path)[:-4]
    lang = raiz.get('{http://www.w3.org/XML/1998/namespace}lang', 'en')
    refs = raiz.findall('.//back//ref-list/ref') or raiz.findall('.//ref-list/ref')
    if len(refs) < 5:
        return 0
    ids = [r.get('id') for r in refs]
    textos = [render_ref(r) for r in refs]
    body = raiz.find('body')
    if body is None:
        return 0
    # blocos do corpo: títulos de seção e parágrafos (sem legendas, tabelas e caixas)
    blocos = []
    def anda(el, nivel):
        for ch in el:
            if ch.tag == 'sec':
                t = ch.find('title')
                if t is not None and txt(t):
                    blocos.append(('titulo', nivel, txt(t), []))
                anda(ch, min(nivel + 1, 3))
            elif ch.tag == 'p':
                partes = []  # (texto, rid ou None)
                def visita(n):
                    if n.text:
                        partes.append((n.text, None))
                    for c in n:
                        if c.tag == 'xref' and c.get('ref-type') == 'bibr':
                            partes.append((txt(c), c.get('rid')))
                        elif c.tag in ('fig', 'table-wrap', 'boxed-text', 'disp-formula', 'supplementary-material'):
                            pass
                        else:
                            visita(c)
                        if c.tail:
                            partes.append((c.tail, None))
                visita(ch)
                blocos.append(('p', 0, None, partes))
    anda(body, 1)
    r = random.Random(aid)
    variantes = ['limpo', 'perturbado'] + (['erros'] if erros else [])
    n = 0
    for var in variantes:
        retirar = set(r.sample(ids, 2)) if var == 'erros' else set()
        mant = [i for i in ids if i not in retirar]
        idx = {rid: k for k, rid in enumerate(mant)}
        d = docx.Document()
        d.add_heading(txt(raiz.find('.//article-title'))[:200] or aid, 0)
        gab = {'id': f'{aid}_{var}', 'estilo': 'jats-' + (txt(raiz.find('.//journal-id')) or 'desconhecido'), 'sistema': 'autor-data',
               'locale': lang, 'conjunto': 'reais', 'variante': var, 'fonte': os.path.basename(xml_path),
               'referencias': [], 'citacoes': [], 'alertas_esperados': [], 'nao_citacoes': [], 'alertas_proibidos': []}
        for tipo, nivel, t, partes in blocos:
            if tipo == 'titulo':
                d.add_heading(t, nivel); continue
            p = d.add_paragraph()
            for s, rid in partes:
                s = re.sub(r'\s+', ' ', s)
                if var == 'perturbado' and rid:
                    s = s.replace(', ', ',' + NBSP).replace(' et al.', NBSP + 'et' + NBSP + 'al.')
                p.add_run(s)
                if rid:
                    rids = rid.split()
                    gab['citacoes'].append({'texto': txt_limpo(s), 'tipo': 'xref', 'itens': rids,
                                            'referencias': [idx.get(x) for x in rids], 'contexto': 'paragrafo'})
        d.add_heading('References', 1)
        for k, rid in enumerate(mant):
            t = textos[ids.index(rid)]
            p = d.add_paragraph()
            if var == 'perturbado' and k % 7 == 3 and ' ' in t[20:]:
                corte = t.index(' ', 20)
                p.add_run(t[:corte]); p.add_run().add_break(WD_BREAK.LINE); p.add_run(t[corte + 1:])
            else:
                p.add_run(t)
            gab['referencias'].append({'indice': k, 'texto': t, 'item': rid})
        for g in gab['citacoes']:
            for it, rf in zip(g['itens'], g['referencias']):
                if rf is None and it in ids:
                    gab['alertas_esperados'].append({'ponto': 'D', 'citacao': g['texto'], 'item': it})
        # inconsistências do próprio artigo publicado: ano da chamada diferente do ano da referência
        anos_ref = {rid: txt(refs[ids.index(rid)].find('.//year')) for rid in ids}
        for g in gab['citacoes']:
            m = re.search(r'(1[5-9]\d\d|20\d\d)[a-z]?', g['texto'])
            if m and len(g['itens']) == 1 and g['itens'][0] in anos_ref and anos_ref[g['itens'][0]] and m.group(0) != anos_ref[g['itens'][0]]:
                gab['alertas_esperados'].append({'ponto': 'ANO', 'citacao': g['texto'], 'item': g['itens'][0],
                                                 'ano_referencia': anos_ref[g['itens'][0]], 'nota': 'divergência existente no artigo publicado'})
        citados = {it for g in gab['citacoes'] for it in g['itens']}
        for rr in gab['referencias']:
            if rr['item'] not in citados:
                gab['alertas_esperados'].append({'ponto': 'E', 'referencia': rr['indice'], 'item': rr['item']})
        d.save(os.path.join(saida, gab['id'] + '.docx'))
        json.dump(gab, open(os.path.join(saida, gab['id'] + '.gabarito.json'), 'w'), ensure_ascii=False, indent=1)
        n += 1
    return n


def txt_limpo(s):
    return re.sub(r'\s+', ' ', s.replace(NBSP, ' ')).strip()


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    tot = 0
    for f in sorted(os.listdir(src)):
        if f.endswith('.xml'):
            tot += converter(os.path.join(src, f), out, '--erros' in sys.argv)
    print('documentos', tot)
