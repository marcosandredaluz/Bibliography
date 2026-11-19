# Manual de Uso — Bibliografia Científica (v1.1.0)

Este manual explica o fluxo de trabalho completo dentro do aplicativo, do cadastro de referências à conferência final de manuscritos em `.docx` ou `.pdf`.

> Dica rápida: no painel lateral esquerdo, clique em **Tutorial** para acessar o guia interativo dentro do próprio programa, com checklist de progresso e atalhos diretos.

---

## 1. Visão Geral da Interface (Barra Lateral)

A navegação principal fica fixa na barra lateral esquerda (*Activity Rail*):

- **Biblioteca:** Painel central com coleções e filtros à esquerda, tabela de artigos ao centro (status *A ler*, *Consultada*, *Citada*) e inspetor de metadados, notas PICO e trechos citados à direita.
- **Buscadores:** Pesquisa simultânea em bases científicas abertas (PubMed, Europe PMC, Crossref, OpenAlex, ClinicalTrials.gov) e acesso às bases institucionais.
- **Manuscrito:** Gerenciamento de obras *Consultadas* vs. *Citadas*, vinculação de arquivos `.docx`, seletor rápido (`Ctrl+Shift+B`) e instalação do suplemento `.dotm` para Microsoft Word.
- **Auditoria:** Auditoria reversa de manuscritos `.docx` e `.pdf` (cruzamento de chamadas e referências, verificação em bases científicas, detecção de retratações, plágio e validação semântica offline).
- **PRISMA:** Remoção de duplicatas, triagem de títulos e resumos, diagramação PRISMA 2020 e painel de Risco de Viés (Cochrane RoB 2 / ROBINS-I).
- **Grafo:** Exploração de referências anteriores e posteriores (*backward/forward chaining*) e caderno de síntese.
- **Tutorial:** Guia passo a passo interativo e versão textual do manual.
- **Rodapé da barra lateral:** Alternância de idioma (`PT` / `EN`), tema Claro/Escuro e janela de **Versão e Diagnóstico do Sistema**.

---

## 2. Cadastro de Artigos e Download de PDFs

### Opção A — Baixar PDFs gratuitos de artigos já cadastrados
1. Na barra de ferramentas da **Biblioteca**, clique em **Buscar PDFs Gratuitos**.
2. O aplicativo consulta Unpaywall, OpenAlex e Europe PMC, baixa os arquivos em acesso aberto disponíveis e os salva na subpasta `pdfs/` com nome padronizado.
3. Para baixar um único item, clique com o botão direito sobre a linha e escolha **Buscar PDF Gratuito**.

### Opção B — Pesquisar direto nas bases científicas
1. Abra **Buscadores** na barra lateral esquerda.
2. Digite os descritores na barra de busca para consultar as bases abertas.
3. Nos resultados, clique em **+ Biblioteca** para importar os registros selecionados.

### Opção C — Cadastro rápido por DOI, PMID ou ISBN
1. Na barra de ferramentas da Biblioteca, abra **+ Novo Item** e escolha **Colar DOI / PMID / ISBN**.
2. Informe o identificador (ex.: `10.1590/...`, `32109013` ou ISBN) e confirme. Os metadados são preenchidos automaticamente.

### Opção D — Importar PDFs ou arquivos RIS / BibTeX do computador
- **Arquivos soltos:** clique em **+ Novo Item -> Adicionar Arquivos PDF** (ou arraste os arquivos para a janela).
- **Pasta inteira:** use **Importar Pasta de PDFs** para ler os arquivos locais, identificar DOIs e organizar o acervo automaticamente.
- **RIS / BibTeX / Mendeley:** importe coleções existentes em formato `.ris`, `.bib` ou banco SQLite.

---

## 3. Organização: `A ler`, `Consultada` e `Citada`

Na coluna **Uso / Status** da Biblioteca:
- **A ler:** Artigos salvos para leitura futura.
- **Consultada:** Artigos efetivamente estudados para fundamentação (listados em *Bibliografia Consultada*).
- **Citada:** Obras referenciadas nos parágrafos do manuscrito (listadas obrigatoriamente em *Referências*).

Na coluna de marcação rápida, você pode alternar entre não lido e lido, favoritar registros e distribuir artigos em **Coleções / Capítulos** na barra esquerda.

---

## 4. Leitura de PDFs, Grifos e Trechos Citados

1. Dê **duplo-clique** sobre um artigo com PDF anexado para abri-lo em uma aba dedicada na parte superior da tela. Você pode manter vários artigos abertos simultaneamente.
2. Selecione qualquer trecho no PDF e aplique uma das cores de marca-texto da barra superior.
3. Para vincular o trecho ao seu texto no Word, selecione a frase e clique em **Marcar como Trecho Citado**. O sistema grava a citação com o número exato da página e altera o status da obra para **Citada**.
4. Na aba **Citar** do inspetor direito da Biblioteca, copie a chamada formatada com página (ex.: `(SILVA, 2023, p. 14)`).

---

## 5. Formatação CSL e Integração com Word, Navegador e Pandoc

### Formatação na Biblioteca e no Word
1. Escolha o estilo na barra superior (`ABNT NBR 6023/10520`, `ABNT Numérico`, `Vancouver`, `APA 7ª ed.`) ou instale outros estilos CSL em **+ Estilos**.
2. Clique em **Citar** para copiar a chamada no texto ou em **Criar Bibliografia** para copiar a lista final já formatada (com itálico e recuo).
3. Na tela **Manuscrito**, você pode instalar o suplemento `.dotm` na pasta `STARTUP` do Microsoft Word, usar o seletor rápido `Ctrl+Shift+B` e atualizar campos dinâmicos diretamente pela porta local `23119`.

### Web Clipper e Pandoc / Quarto
- Na janela de **Versão e Diagnóstico**, copie o **Token Local** caso utilize a extensão Web Clipper (`POST /api/v1/clip`) no navegador.
- Para fluxos em Markdown acadêmico, utilize o filtro em `resources/pandoc/bibliografia_filter.py` com Pandoc ou Quarto (`>= 1.4.0`).

---

## 6. Auditoria Reversa de Manuscritos (`.DOCX` e `.PDF`)

A aba **Auditoria** confere trabalhos prontos antes da submissão ou defesa:

1. Selecione um arquivo `.docx`, `.pdf` ou cole o texto na área indicada.
2. Execute a auditoria completa (ou um nível específico) para verificar:
   - **Chamadas × Referências:** identifica citações autor-data e numéricas/Vancouver no corpo (inclusive sobrescritos pós-pontuação) e cruza com a lista final.
   - **Autenticidade nas bases:** consulta Crossref, PubMed e OpenAlex por DOI, PMID/PMCID ou título para detectar referências inexistentes, DOIs trocados e artigos retratados.
   - **Conferência de PDFs e semântica PT↔EN:** localiza citações diretas e valida a compatibilidade temática entre a afirmação no texto e o artigo citado usando comparação lexical e o modelo neural ONNX offline embarcado (`custom-forensic-minilm`).
   - **Consistência adicional:** verificação estatística (statcheck), similaridade literal e normas ABNT NBR 6023 / Vancouver.
3. No caso de PDFs publicados em 2 colunas ou com figuras rotacionadas, a segmentação geométrica preserva a ordem correta das referências sem misturar colunas.

---

## 7. Triagem Sistemática (PRISMA 2020) e Risco de Viés

Na aba **PRISMA**:
1. **Duplicatas:** compare e mescle registros repetidos por DOI, PMID ou título mantendo PDFs, notas e coleções.
2. **Triagem (Screening):** avalie títulos e resumos marcando inclusão, dúvida ou motivo de exclusão.
3. **Diagrama PRISMA 2020:** visualize e exporte o fluxograma com os contadores atualizados em tempo real.
4. **Risco de Viés (RoB 2 / ROBINS-I):** gere avaliações iniciais estruturadas por domínio com âncoras de evidência, que permanecem obrigatoriamente em `pending_human_review` até confirmação manual de um revisor e registro em log encadeado por SHA-256.

---

## 8. Colaboração em Nuvem e LaTeX / Overleaf

- Em vez de um banco SQLite monolítico sujeito a corrupção por sincronização simultânea, cada referência é salva como um arquivo `.json` independente em `referencias/`.
- Para trabalhar em equipe, compartilhe a pasta da biblioteca pelo OneDrive, Google Drive ou Dropbox (marcando a opção *"Sempre manter neste dispositivo"* no Windows).
- O arquivo `library.bib` na raiz da pasta é atualizado automaticamente após cada edição para sincronização direta com LaTeX ou Overleaf.
