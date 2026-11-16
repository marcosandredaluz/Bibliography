# Extratores Regionais (SciELO e BVS / LILACS)

O núcleo do sistema inclui extratores nativos inspirados na engenharia de tradutores bibliográficos abertos, adaptados para Python com tolerância a falhas.

---

## 🔬 Extrator SciELO (`ScieloExtractor`)

O SciELO disponibiliza artigos científicos da América Latina. O extrator segue uma estratégia em três níveis:

1. **Consulta Oficial por DOI via Crossref:** Se o DOI contém o prefixo `10.1590`, consulta diretamente a API oficial do Crossref e normaliza para CSL-JSON.
2. **SciELO ArticleMeta REST API:** Se o identificador for um SciELO PID (ex: `S0102-311X2020000100001`), consome o endpoint `http://articlemeta.scielo.org/api/v1/article/`.
3. **Extração de Meta-Tags Highwire (HTML):** Caso receba uma URL web direta, analisa o HTML com BeautifulSoup extraindo as tags `citation_title`, `citation_author`, `citation_doi` e `citation_journal_title`.

---

## 🏛️ Extrator BVS / LILACS (`BvsLilacsExtractor`)

A Biblioteca Virtual em Saúde (BVS) gerencia a base LILACS através do motor **iAHx** (Solr).
O extrator envia requisições estruturadas para o endpoint JSON:
`https://pesquisa.bvsalud.org/portal/?output=json&q=<termo>`

A resposta é convertida diretamente para o padrão **CSL-JSON (Citation Style Language)**, compatível com processadores ABNT NBR 6023 e Vancouver.
