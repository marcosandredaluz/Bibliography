"""Gera planos de manuscritos sintéticos (itens CSL-JSON + plano de citações + injeções).

Cada plano descreve um manuscrito: estilo, locale, itens, parágrafos com aglomerados de
citação, tabela, legenda "Fonte: Elaborado pela autora", citação direta com página,
seção de referências e apêndice. O gabarito é derivado por construção.

Uso: python3 gen_planos.py --semente 7 --saida ../planos/treino --conjunto treino
"""
import argparse, json, os, random
from faker import Faker

ESTILOS = {
    'abnt': ('associacao-brasileira-de-normas-tecnicas', 'autor-data'),
    'apa': ('apa', 'autor-data'),
    'vancouver': ('nlm-citation-sequence', 'numerico'),
    'ama': ('american-medical-association', 'numerico'),
    'chicago-ad': ('chicago-author-date', 'autor-data'),
    'harvard': ('harvard-cite-them-right', 'autor-data'),
    'ieee': ('ieee', 'numerico'),
    'mla': ('modern-language-association', 'autor-pagina'),
    'iso690-ad': ('iso690-author-date-en', 'autor-data'),
    'iso690-num': ('iso690-numeric-en', 'numerico'),
}
LOCALES = {'pt-BR': 'pt_BR', 'pt-PT': 'pt_PT', 'es-ES': 'es_ES', 'en-US': 'en_US',
           'fr-FR': 'fr_FR', 'de-DE': 'de_DE', 'it-IT': 'it_IT'}
TITULOS_REF = {'pt-BR': 'REFERÊNCIAS', 'pt-PT': 'Referências bibliográficas', 'es-ES': 'Referencias',
               'en-US': 'References', 'fr-FR': 'Références', 'de-DE': 'Literaturverzeichnis',
               'it-IT': 'Riferimenti bibliografici'}
TITULOS_MLA = {'pt-BR': 'Obras citadas', 'pt-PT': 'Obras citadas', 'es-ES': 'Obras citadas',
               'en-US': 'Works Cited', 'fr-FR': 'Ouvrages cités', 'de-DE': 'Zitierte Werke',
               'it-IT': 'Opere citate'}
TITULOS_INTRO = {'pt-BR': '1 INTRODUÇÃO', 'pt-PT': '1 Introdução', 'es-ES': '1 Introducción',
                 'en-US': '1 Introduction', 'fr-FR': '1 Introduction', 'de-DE': '1 Einleitung',
                 'it-IT': '1 Introduzione'}
TITULOS_APEND = {'pt-BR': 'APÊNDICE A – INSTRUMENTO', 'pt-PT': 'Apêndice A', 'es-ES': 'Apéndice A',
                 'en-US': 'Appendix A', 'fr-FR': 'Annexe A', 'de-DE': 'Anhang A', 'it-IT': 'Appendice A'}
LEGENDA_FONTE = {'pt-BR': 'Fonte: Elaborado pela autora ({ano}), com base em ',
                 'pt-PT': 'Fonte: Elaborado pela autora ({ano}), com base em ',
                 'es-ES': 'Fuente: Elaborado por la autora ({ano}), con base en ',
                 'en-US': 'Source: Prepared by the author ({ano}), based on ',
                 'fr-FR': "Source : élaboré par l'autrice ({ano}), d'après ",
                 'de-DE': 'Quelle: Eigene Darstellung ({ano}), basierend auf ',
                 'it-IT': "Fonte: elaborazione dell'autrice ({ano}), sulla base di "}

# Dois grupos disjuntos de autores entidade: um para treino e outro para o conjunto reservado.
# O motor não pode conter estes nomes em listas fixas; o conjunto reservado existe para detectar
# correções feitas sob medida para os nomes vistos nos testes.
ENTIDADES = {
    'treino': ['Conselho Nacional de Saúde (Brasil)', 'São Paulo (Estado)', 'National Library of Medicine (Estados Unidos)',
               'Virginia-Maryland College of Veterinary Medicine', 'Organização Pan-Americana da Saúde',
               'Instituto Nacional de Câncer (Brasil)', 'Ministerio de Sanidad (España)', 'Robert Koch-Institut',
               'Haute Autorité de Santé (France)', 'Istituto Superiore di Sanità'],
    'reservado': ['Agência Nacional de Vigilância Sanitária (Brasil)', 'Minas Gerais (Estado)', 'Public Health Agency of Canada',
                  'Conselho Federal de Medicina Veterinária', 'Secretaria Municipal da Saúde (Curitiba)',
                  'Organización Mundial de la Salud', 'Santé publique France', 'Bundesinstitut für Risikobewertung',
                  'Agenzia Italiana del Farmaco', 'Australian Institute of Health and Welfare (Australia)'],
}
PERIODICOS = ['Revista de Saúde Pública', 'Cadernos de Saúde Pública', 'Epidemiologia e Serviços de Saúde',
              'Gaceta Sanitaria', 'Journal of the American Medical Informatics Association', 'Medical Mycology',
              'Revue d\'Épidémiologie et de Santé Publique', 'Das Gesundheitswesen', 'Epidemiologia & Prevenzione',
              'BMC Public Health', 'One Health', 'Preventive Veterinary Medicine']


def nome_pessoal(fk, r, especial=None):
    if especial == 'composto':
        return {'family': f"{fk.last_name()}-{fk.last_name()}", 'given': fk.first_name()}
    if especial == 'particula':
        p = r.choice(['de', 'da', 'van der', 'von', 'dos', 'del', 'di'])
        return {'family': fk.last_name(), 'given': fk.first_name(), 'non-dropping-particle': p}
    if especial == 'hispanico':
        f2 = Faker('es_ES'); f2.seed_instance(r.randint(0, 10**9))
        return {'family': f"{f2.last_name()} {f2.last_name()}", 'given': f2.first_name()}
    if especial in ('zh', 'ko', 'vi'):
        loc = {'zh': 'zh_CN', 'ko': 'ko_KR', 'vi': 'vi_VN'}[especial]
        f2 = Faker(loc); f2.seed_instance(r.randint(0, 10**9))
        fam = {'zh': ['Wang', 'Li', 'Zhang', 'Liu', 'Chen'], 'ko': ['Kim', 'Lee', 'Park', 'Choi'],
               'vi': ['Nguyen', 'Tran', 'Le', 'Pham']}[especial]
        giv = {'zh': ['Xiaoming', 'Wei', 'Jing', 'Hao'], 'ko': ['Min-jun', 'Seo-yeon', 'Ji-ho'],
               'vi': ['Van Anh', 'Thi Hoa', 'Minh']}[especial]
        return {'family': r.choice(fam), 'given': r.choice(giv)}
    if especial == 'acento':
        return {'family': r.choice(['Gremião', 'Müller', 'Ñúñez', 'Çelik', 'Łukasz', 'Øster', 'Groß', 'D\'Ávila', 'O\'Connor']),
                'given': fk.first_name()}
    return {'family': fk.last_name(), 'given': fk.first_name()}


def titulo(fk, r):
    try:
        t = fk.sentence(nb_words=r.randint(6, 12)).rstrip('.')
    except Exception:
        t = 'Estudo ' + str(r.randint(1, 999))
    return t


def gerar_itens(fk, r, conjunto, n):
    itens = []
    especiais = ['composto', 'particula', 'hispanico', 'zh', 'ko', 'vi', 'acento']
    entidades = ENTIDADES[conjunto]
    tipos = ['article-journal'] * 6 + ['book', 'chapter', 'thesis', 'webpage', 'legislation', 'report']
    for i in range(n):
        tipo = r.choice(tipos)
        it = {'id': f'it{i:03d}', 'type': tipo, 'title': titulo(fk, r), 'language': fk.locales[0] if hasattr(fk, 'locales') else ''}
        ano = r.randint(1976, 2026)
        it['issued'] = {'date-parts': [[ano]]}
        k = r.random()
        if i < len(especiais):
            autores = [nome_pessoal(fk, r, especiais[i])] + [nome_pessoal(fk, r) for _ in range(r.randint(0, 3))]
        elif i < len(especiais) + 3 or tipo in ('legislation', 'report', 'webpage') and k < 0.7:
            autores = [{'literal': r.choice(entidades)}]
        else:
            autores = [nome_pessoal(fk, r) for _ in range(r.choice([1, 1, 2, 3, 4, 6]))]
        it['author'] = autores
        if tipo == 'article-journal':
            it['container-title'] = r.choice(PERIODICOS)
            it['volume'] = str(r.randint(1, 80)); it['issue'] = str(r.randint(1, 12))
            p0 = r.randint(1, 900); it['page'] = f'{p0}-{p0 + r.randint(4, 20)}'
            if r.random() < 0.7:
                it['DOI'] = f'10.99999/teste.{conjunto}.{r.randint(10000, 99999)}'
        elif tipo in ('book', 'thesis', 'report'):
            it['publisher'] = fk.company(); it['publisher-place'] = fk.city()
        elif tipo == 'chapter':
            it['container-title'] = titulo(fk, r); it['publisher'] = fk.company(); it['publisher-place'] = fk.city()
            it['editor'] = [nome_pessoal(fk, r)]; p0 = r.randint(1, 300); it['page'] = f'{p0}-{p0 + 15}'
        elif tipo == 'webpage':
            it['URL'] = f'https://exemplo-{conjunto}.org/{r.randint(1000, 9999)}'
            it['accessed'] = {'date-parts': [[2026, 11, r.randint(1, 16)]]}
        elif tipo == 'legislation':
            it['number'] = str(r.randint(100, 15000)); it['URL'] = f'https://leis-{conjunto}.gov/{r.randint(1, 9999)}'
        itens.append(it)
    # mesmo autor e mesmo ano (força sufixo a/b nos estilos autor-data)
    if n < 5:
        return itens
    a, b = itens[-1], itens[-2]
    b['author'] = json.loads(json.dumps(a['author'])); b['issued'] = json.loads(json.dumps(a['issued']))
    # uma obra sem data
    itens[-3].pop('issued', None)
    return itens


def plano(semente, estilo, locale, conjunto, variante):
    r = random.Random(semente)
    fk = Faker(LOCALES[locale]); fk.seed_instance(semente)
    n = r.randint(22, 34)
    itens = gerar_itens(fk, r, conjunto, n)
    ids = [it['id'] for it in itens]
    paragrafos = []
    citados = set()
    for p in range(r.randint(14, 22)):
        frases = []
        for s in range(r.randint(1, 3)):
            cl = None
            if r.random() < 0.8:
                k = r.choice([1, 1, 1, 2, 3])
                escolha = r.sample(ids, k)
                narr = (k == 1 and r.random() < 0.3) and estilo != 'mla'  # MLA não tem ano: a forma narrativa é só o nome
                cl = {'itens': [{'id': x} for x in escolha], 'narrativa': narr}
                citados.update(escolha)
            frases.append({'texto': fk.paragraph(nb_sentences=r.randint(1, 3)), 'citacao': cl})
        paragrafos.append(frases)
    # garante que todos os itens sejam citados ao menos uma vez
    faltam = [x for x in ids if x not in citados]
    for x in faltam:
        paragrafos[r.randrange(len(paragrafos))].append({'texto': fk.sentence(), 'citacao': {'itens': [{'id': x}], 'narrativa': False}})
    # citação direta com página
    alvo = r.choice(ids)
    direta = {'texto': fk.sentence(nb_words=12).rstrip('.'), 'citacao': {'itens': [{'id': alvo, 'locator': str(r.randint(2, 300)), 'label': 'page'}], 'narrativa': False}}
    # tabela com citações nas células
    tabela = [[fk.word().capitalize(), fk.sentence(nb_words=6), {'itens': [{'id': r.choice(ids)}], 'narrativa': False}] for _ in range(3)]
    base_fonte = {'itens': [{'id': r.choice(ids)}], 'narrativa': estilo != 'mla'}
    inj = {'orfas': [], 'nao_citadas': [], 'ano_trocado': None}
    if variante == 'erros':
        # obras retiradas da lista (geram citação sem referência, ponto D)
        inj['orfas'] = r.sample(ids, 2)
        # obras extras na lista sem citação (ponto E)
        extras = gerar_itens(fk, r, conjunto, 2)
        for j, e in enumerate(extras):
            e['id'] = f'extra{j}'
        itens += extras
        inj['nao_citadas'] = [e['id'] for e in extras]
    if estilo == 'abnt':
        # o estilo CSL da ABNT omite o ano em páginas web; usa-se "report" com URL para manter o documento coerente
        for it in itens:
            if it['type'] == 'webpage':
                it['type'] = 'book'
                it['publisher'] = 'Editora Exemplo'; it['publisher-place'] = 'Curitiba'
    return {
        'semente': semente, 'estilo': estilo, 'csl': ESTILOS[estilo][0], 'sistema': ESTILOS[estilo][1],
        'locale': locale, 'conjunto': conjunto, 'variante': variante,
        'titulo_ref': TITULOS_MLA[locale] if estilo == 'mla' else TITULOS_REF[locale],
        'titulo_intro': TITULOS_INTRO[locale], 'titulo_apendice': TITULOS_APEND[locale],
        'legenda_fonte': LEGENDA_FONTE[locale].format(ano=2026),
        'itens': itens, 'paragrafos': paragrafos, 'direta': direta, 'tabela': tabela,
        'base_fonte': base_fonte, 'injecoes': inj,
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--semente', type=int, default=7)
    ap.add_argument('--saida', required=True)
    ap.add_argument('--conjunto', default='treino', choices=['treino', 'reservado'])
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    r = random.Random(a.semente)
    n = 0
    for estilo in ESTILOS:
        locs = ['pt-BR'] if estilo == 'abnt' else list(LOCALES)
        for loc in locs:
            for variante in ('limpo', 'erros'):
                s = r.randint(1, 10**9)
                pl = plano(s, estilo, loc, a.conjunto, variante)
                nome = f'{a.conjunto}_{estilo}_{loc}_{variante}'
                json.dump(pl, open(os.path.join(a.saida, nome + '.json'), 'w'), ensure_ascii=False)
                n += 1
    print('planos', n)
