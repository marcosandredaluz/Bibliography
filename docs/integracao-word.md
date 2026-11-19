# Integração com Word, Navegador e Pandoc/Quarto

A integração com ferramentas externas de escrita ocorre pelo servidor HTTP local restrito a loopback (`127.0.0.1:23119`) em `electron/wordServer.cjs`.

## Componentes

1. **Suplemento Microsoft Word (`.dotm` / `customUI14.xml`):**
   - Instalado na pasta `STARTUP` do Word diretamente pela aba **Manuscrito**.
   - Permite inserir citações no cursor, atualizar campos em lote e sincronizar citações/referências via endpoints locais.
2. **Web Clipper (Manifest V3 — `resources/web-clipper/`):**
   - Envia capturas de páginas científicas para `POST /api/v1/clip`.
   - Autenticado via cabeçalho `X-Bibliography-Local-Token` (token gerado localmente e acessível na janela de Versão/Diagnóstico), com sanitização HTML e deduplicação.
3. **API Pandoc / Quarto (`electron/citationsApiRoute.cjs` e `resources/pandoc/bibliografia_filter.py`):**
   - Endpoints `/api/v1/citations/resolve` e `/api/v1/citations/bibliography` para resolução de chaves e geração de `.bib` filtrado apenas para as obras citadas.
   - Compatível com Pandoc e Quarto a partir da versão `1.4.0` (licença MIT).
