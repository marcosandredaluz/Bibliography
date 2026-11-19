# Extratores Regionais (SciELO e BVS / LILACS)

Para lidar com literatura científica brasileira e latino-americana fora do eixo anglófono tradicional, os módulos de metadados incluem suporte específico para SciELO e BVS/LILACS.

## Estratégia SciELO

1. **DOI com prefixo `10.1590`:** consulta direta aos registros oficiais via Crossref/DOI.org com normalização para CSL-JSON.
2. **SciELO PID / ArticleMeta:** decodificação de identificadores de 23 caracteres (`S0102-...`) e consulta à API ArticleMeta quando aplicável.
3. **Fallback HTML:** extração de metadados Highwire/Dublin Core (`citation_title`, `citation_author`, `citation_doi`, `citation_journal_title`) a partir da página do artigo.

## Extrator BVS / LILACS

Consultas estruturadas ao índice iAHx da Biblioteca Virtual em Saúde (`pesquisa.bvsalud.org`) com conversão dos resultados para o esquema **CSL-JSON**, preservando compatibilidade com normas ABNT NBR 6023 e Vancouver.
