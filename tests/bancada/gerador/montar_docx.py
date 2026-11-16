"""Monta o DOCX de cada plano a partir do HTML renderizado pelo citeproc e grava o gabarito.

Uso: python3 montar_docx.py <pasta_planos> <pasta_saida>
Para cada plano gera <nome>.docx e <nome>.gabarito.json. Para os planos "limpo" gera também a
variante "perturbado" (mesmo gabarito, formatação hostil).
"""
import html, json, os, re, subprocess, sys
from html.parser import HTMLParser
import docx
from docx.enum.text import WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Cm

AQUI = os.path.dirname(os.path.abspath(__file__))
VERBO = {'pt-BR': 'observou que', 'pt-PT': 'observou que', 'es-ES': 'observó que', 'en-US': 'observed that',
         'fr-FR': 'a observé que', 'de-DE': 'stellte fest, dass', 'it-IT': 'ha osservato che'}
NBSP = ' '


class Runs(HTMLParser):
    """Converte o HTML do citeproc em uma lista de (texto, formatação)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pilha, self.saida = [], []

    def handle_starttag(self, tag, attrs):
        st = dict(attrs).get('style', '') or ''
        f = {'i': 'i', 'em': 'i', 'b': 'b', 'strong': 'b', 'sup': 'sup', 'sub': 'sub'}.get(tag)
        if tag == 'span' and 'small-caps' in st:
            f = 'sc'
        elif tag == 'span' and 'italic' in st:
            f = 'i'
        elif tag == 'span' and 'bold' in st:
            f = 'b'
        self.pilha.append(f)

    def handle_endtag(self, tag):
        if self.pilha:
            self.pilha.pop()
        if tag == 'div':
            self.saida.append((' ', set()))

    def handle_data(self, d):
        self.saida.append((d, {x for x in self.pilha if x}))


def runs_de(h):
    p = Runs(); p.feed(h or '')
    out = []
    for t, f in p.saida:
        t = re.sub(r'\s+', ' ', t)
        if out and out[-1][1] == f:
            out[-1] = (out[-1][0] + t, f)
        else:
            out.append((t, f))
    # limpa espaços nas pontas
    if out:
        out[0] = (out[0][0].lstrip(), out[0][1]); out[-1] = (out[-1][0].rstrip(), out[-1][1])
    return [x for x in out if x[0]]


def texto_de(rs):
    return ''.join(t for t, _ in rs)


def add_runs(par, rs, perturbar=False):
    for t, f in rs:
        if perturbar:
            t = t.replace(', ', ',' + NBSP).replace('"', '“')
        r = par.add_run(t)
        r.italic = 'i' in f or None; r.bold = 'b' in f or None
        if 'sup' in f: r.font.superscript = True
        if 'sub' in f: r.font.subscript = True
        if 'sc' in f: r.font.small_caps = True


def nome_manual(item):
    a = item.get('author') or []
    if not a:
        return item.get('title', '')[:30]
    p = a[0]
    nome = p.get('literal') or ' '.join(x for x in [p.get('non-dropping-particle'), p.get('family')] if x)
    return nome + (' et al.' if len(a) > 2 else '')


def montar(plano_path, saida_dir):
    nome = os.path.basename(plano_path)[:-5]
    pl = json.load(open(plano_path))
    rend_path = os.path.join(saida_dir, nome + '.render.json')
    subprocess.run(['node', os.path.join(AQUI, 'renderizar.cjs'), plano_path, rend_path], check=True)
    rd = json.load(open(rend_path)); os.remove(rend_path)
    ag = rd['aglomerados']
    itens = {i['id']: i for i in pl['itens']}
    orfas = set(pl['injecoes']['orfas'])
    entradas = [e for e in rd['entradas'] if e['id'] not in orfas]
    idx_ref = {e['id']: i for i, e in enumerate(entradas)}

    def cluster(cl, chave):
        """Devolve runs da citação e o registro do gabarito."""
        if cl is None:
            return None, None
        ids = [x['id'] for x in cl['itens']]
        if cl.get('narrativa'):
            a = runs_de(ag.get(chave + '#a'))
            if not a or 'NO_PRINTED_FORM' in texto_de(a):
                a = [(nome_manual(itens[ids[0]]), set())]
            a = [(texto_de(a).rstrip(' ,;'), set())]
            s = runs_de(ag.get(chave + '#s'))
            rs = a + [(' ', set())] + s
            tipo = 'narrativa'
        else:
            rs = runs_de(ag.get(chave)); tipo = 'parentetica'
        g = {'texto': texto_de(rs), 'tipo': tipo, 'itens': ids,
             'referencias': [idx_ref.get(i) for i in ids]}
        return rs, g

    variantes = [pl['variante']] + (['perturbado'] if pl['variante'] == 'limpo' else [])
    for var in variantes:
        pert = var == 'perturbado'
        d = docx.Document()
        st = d.styles['Normal']; st.font.name = 'Arial'; st.font.size = Pt(12)
        gab = {'id': f"{nome.rsplit('_', 1)[0]}_{var}", 'estilo': pl['estilo'], 'sistema': pl['sistema'],
               'locale': pl['locale'], 'conjunto': pl['conjunto'], 'variante': var,
               'referencias': [], 'citacoes': [], 'alertas_esperados': [], 'nao_citacoes': [],
               'alertas_proibidos': []}
        d.add_heading('Manuscrito de teste ' + gab['id'], 0)
        d.add_heading(pl['titulo_intro'], 1)
        for p_i, frases in enumerate(pl['paragrafos']):
            par = d.add_paragraph()
            for s_i, f in enumerate(frases):
                txt = f['texto'].strip()
                rs, g = cluster(f['citacao'], f'p{p_i}s{s_i}')
                if rs is None:
                    par.add_run(txt + ' '); continue
                if g['tipo'] == 'narrativa':
                    add_runs(par, rs, pert)
                    par.add_run(f" {VERBO[pl['locale']]} {txt[0].lower() + txt[1:]} ")
                else:
                    corpo = txt[:-1] if txt.endswith('.') else txt
                    par.add_run(corpo + ' ')
                    add_runs(par, rs, pert)
                    par.add_run('. ')
                g['contexto'] = 'paragrafo'; gab['citacoes'].append(g)
        # citação direta com página
        rs, g = cluster(pl['direta']['citacao'], 'direta')
        par = d.add_paragraph()
        aspas = ('“', '”') if pert else ('"', '"')
        par.add_run(aspas[0] + pl['direta']['texto'] + aspas[1] + ' ')
        add_runs(par, rs, pert); par.add_run('.')
        g['contexto'] = 'direta'; gab['citacoes'].append(g)
        gab['alertas_proibidos'].append({'ponto': 'C', 'trecho': pl['direta']['texto']})
        # tabela com citações nas células
        t = d.add_table(rows=1 + len(pl['tabela']), cols=3); t.style = 'Table Grid'
        for j, h in enumerate(['Item', 'Descrição', 'Fonte']):
            t.rows[0].cells[j].text = h
        for i, lin in enumerate(pl['tabela']):
            t.rows[i + 1].cells[0].text = lin[0]
            t.rows[i + 1].cells[1].text = lin[1]
            rs, g = cluster(lin[2], f'tab{i}')
            c = t.rows[i + 1].cells[2].paragraphs[0]
            add_runs(c, rs, pert)
            g['contexto'] = 'tabela'; gab['citacoes'].append(g)
        # legenda com "Elaborado pela autora (2026)" (não é citação) e uma citação verdadeira
        rs, g = cluster(pl['base_fonte'], 'fonte')
        par = d.add_paragraph(); par.add_run(pl['legenda_fonte']); add_runs(par, rs, pert); par.add_run('.')
        g['contexto'] = 'legenda'; gab['citacoes'].append(g)
        gab['nao_citacoes'].append(pl['legenda_fonte'].split(',')[0].split(':', 1)[1].strip())
        # referências: um parágrafo por entrada
        d.add_heading(pl['titulo_ref'], 1)
        for i, e in enumerate(entradas):
            rs = runs_de(e['html'])
            par = d.add_paragraph()
            par.paragraph_format.left_indent = Cm(0); par.paragraph_format.space_after = Pt(12)
            if pert and i in (1, 4) and len(rs) > 0:
                # quebra de linha manual dentro da entrada
                t0, f0 = rs[0]
                meio = len(t0) // 2
                corte = t0.find(' ', meio)
                if corte > 0:
                    rs = [(t0[:corte], f0), ('\n', set()), (t0[corte + 1:], f0)] + rs[1:]
            for tt, ff in rs:
                if tt == '\n':
                    par.add_run().add_break(WD_BREAK.LINE); continue
                add_runs(par, [(tt, ff)], pert)
            gab['referencias'].append({'indice': i, 'texto': texto_de([(' ' if x[0] == '\n' else x[0], x[1]) for x in rs]), 'item': e['id']})
        # apêndice depois das referências (correto pela NBR 14724; não pode gerar alerta)
        d.add_heading(pl['titulo_apendice'], 1)
        d.add_paragraph('Lorem ipsum ' * 20)
        gab['alertas_proibidos'].append({'ponto': 'F', 'motivo': 'apendice_apos_referencias'})
        # alertas esperados por construção
        for g in gab['citacoes']:
            for it, rf in zip(g['itens'], g['referencias']):
                if rf is None:
                    gab['alertas_esperados'].append({'ponto': 'D', 'citacao': g['texto'], 'item': it})
        citados = {it for g in gab['citacoes'] for it in g['itens']}
        for r in gab['referencias']:
            if r['item'] not in citados:
                gab['alertas_esperados'].append({'ponto': 'E', 'referencia': r['indice'], 'item': r['item']})
        base = os.path.join(saida_dir, gab['id'])
        d.save(base + '.docx')
        json.dump(gab, open(base + '.gabarito.json', 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    fs = sorted(f for f in os.listdir(src) if f.endswith('.json'))
    for f in fs:
        montar(os.path.join(src, f), out)
    print('montados', len(fs))
