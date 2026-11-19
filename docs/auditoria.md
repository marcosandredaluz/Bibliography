# Motor de Auditoria e Validação

O módulo de auditoria (`electron/auditor.cjs`) executa a verificação determinística de manuscritos `.docx` e `.pdf` em múltiplas camadas.

## Etapas Principais

1. **Extração e Segmentação Estrutural:**
   - Em `.docx`: leitura direta dos parágrafos OpenXML (`w:p`) e campos de citação (`w:instrText`).
   - Em `.pdf`: detecção geométrica de duas colunas, tratamento de legendas/figuras rotacionadas a 90°, remoção de cabeçalhos/rodapés repetidos e deshifenização de quebras de linha.
2. **Pareamento Chamada × Referência:**
   - Suporte a estilo Autor-Data (ABNT NBR 10520/6023) e estilo numérico/Vancouver (colchetes ou sobrescrito colado após texto/pontuação).
   - Sinalização de citações sem referência correspondente e obras listadas nunca citadas no corpo.
3. **Autenticação nas Bases e Cache Determinístico:**
   - Consulta DOI, PMID/PMCID e título nas APIs Crossref, PubMed e OpenAlex com cache local em disco (`~/.bibliografia_api_cache.json`) para estabilizar resultados entre execuções.
   - Falhas temporárias de rede ou limite de taxa (HTTP 429 / timeout) são marcadas como `autenticacao_indisponivel` e nunca confundidas com referências inexistentes.
   - Conferência de DOI divergente (título/autores oficiais incompatíveis com a referência declarada) e verificação de retratações.
4. **Conferência de Conteúdo e Similaridade Semântica (PT ↔ EN):**
   - Verificação de citações diretas entre aspas e numeração de página no PDF.
   - Ancoragem quantitativa (percentuais, *p*-valores, intervalos de confiança), comparação lexical e similaridade neural por janelas deslizantes via ONNX offline (`custom-forensic-minilm` INT8), incluindo avaliação de proposições atômicas.
