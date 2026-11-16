# RELATÓRIO TÉCNICO DE HANDOVER — TRANSIÇÃO PARA O ANTIGRAVITY
**Projeto:** Bibliografia (Gerenciador Científico & Citações CSL)  
**Data de Emissão:** Novembro de 2026  
**Localização do Código:** `D:\BIBLIOGRAFIA`  
**Biblioteca Padrão de Dados:** `C:\Users\Marcos\OneDrive\Bibliografia`  

---

## 1. FORMATO E ARQUITETURA DO PROJETO

O **Bibliografia** é uma aplicação desktop nativa para gestão de referências bibliográficas científicas e citações acadêmicas, inspirada nas melhores funcionalidades do Zotero 7 e Mendeley Desktop, projetada com foco em sincronização segura na nuvem pessoal (OneDrive e Google Drive) e integração com Microsoft Word.

### Stack Tecnológica
- **Runtime Principal:** Electron (`^44.9.2`) utilizando arquitetura segura de múltiplos processos:
  - `electron/main.cjs`: Processo principal (gerenciamento de janelas, ciclo de vida, servidor HTTP do Word na porta 23119, IPC handlers e registro do protocolo personalizado `app://bibliografia/`).
  - `electron/preload.cjs`: Ponte segura via `contextBridge` expondo `window.api` isolada com validação de canais IPC.
  - `electron/library.cjs`: Engine de persistência local da biblioteca científica (arquivos JSON individuais por obra + sincronização com arquivo `library.bib`).
  - `electron/citations.cjs`: Processador CSL baseado na biblioteca oficial `citeproc-js` com suporte a ABNT, APA, Vancouver, Chicago, Harvard, Nature e mais de 10.000 estilos instaláveis via repositório CSL.
  - `electron/wordServer.cjs`: Servidor HTTP local (porta 23119) para comunicação bidirecional com macros e suplementos do Microsoft Word.
  - `electron/auditor.cjs`: Motor de auditoria reversa de manuscritos acadêmicos (.docx e .pdf), extraindo chamadas no texto e cruzando com o acervo da biblioteca.
- **Frontend / Interface:**
  - React 19 (`^19.3.1`) + React DOM 19.
  - Vite (`^8.3.4`) como empacotador e servidor de compilação rápida para o diretório `dist/`.
  - PDF.js (`pdfjs-dist ^6.4.299`) com web worker nativo para visualização, marcação e extração de texto de artigos científicos.
  - Estilização pura via CSS modular (`src/styles.css`) com suporte a temas (Modo Claro e Modo Escuro) e sem dependências pesadas de bibliotecas externas.

### Estrutura de Pastas e Arquivos Principais
```text
D:\BIBLIOGRAFIA\
├── dist/                      # Artefatos compilados pelo Vite para produção no Electron
├── electron/                  # Código do processo principal (Node.js/Electron)
│   ├── main.cjs               # Janela, IPC, protocolo app:// e ciclo de vida
│   ├── preload.cjs            # contextBridge isolado (window.api)
│   ├── library.cjs            # Sistema de arquivos e armazenamento da biblioteca
│   ├── citations.cjs          # Motor CSL (citeproc)
│   ├── wordServer.cjs         # Servidor local para Microsoft Word (porta 23119)
│   ├── auditor.cjs            # Auditoria reversa de arquivos .docx e .pdf
│   ├── metadata.cjs           # Resolução automática de DOI, PubMed e Crossref
│   ├── importers.cjs          # Importadores (.bib, .ris, .enw, PDFs)
│   ├── searchers.cjs          # Integração direta com PubMed, SciELO, CAPES, etc.
│   └── vault.cjs              # Cofre local criptografado para senhas de portais
├── resources/                 # Ícones nativos (.ico, .png)
├── src/                       # Código-fonte React (Frontend)
│   ├── components/            # Componentes especializados da interface
│   │   ├── HelpGuideView.jsx  # Manual & Tutorial interativo
│   │   ├── PdfReaderModal.jsx # Visualizador e anotador de PDFs
│   │   ├── QuickAddModal.jsx  # Modal de adição rápida por DOI/ISBN/PDF
│   │   ├── ReferenceDetail.jsx# Painel direito com metadados CSL e PICO
│   │   ├── ReverseAuditView.jsx # Módulo de Auditoria Reversa (.docx/.pdf)
│   │   ├── SearchHub.jsx      # Hub de Buscadores de Saúde e Credenciais
│   │   ├── ui.jsx             # Componentes base (Icone, Modal, Avisos)
│   │   └── WordAndPrismaView.jsx # Telas de Sincronização Word e PRISMA 2020
│   ├── lib/                   # Utilitários auxiliares (CSL helpers, PDF parser)
│   ├── App.jsx                # Componente raiz da aplicação
│   ├── main.jsx               # Ponto de entrada React com ErrorBoundary raiz
│   └── styles.css             # Folha de estilos completa do sistema
├── index.html                 # Ponto de entrada HTML com Splash Screen animada
├── package.json               # Dependências e scripts de automação
├── vite.config.cjs            # Configuração do Vite para Electron
└── boot.log                   # Registro de inicialização e diagnóstico
```

---

## 2. ONDE ESTAVA SALVO E DADOS DO USUÁRIO

- **Diretório do Código e Aplicação:**  
  `D:\BIBLIOGRAFIA`
- **Diretório de Armazenamento da Biblioteca Padrão:**  
  `C:\Users\Marcos\OneDrive\Bibliografia`
  - Dentro deste diretório ficam salvos os metadados das obras (arquivos `.json` com identificadores únicos), o catálogo mestre sincronizado `library.bib`, a pasta de anexos `storage/` contendo os PDFs e o arquivo de coleções `colecoes.json`.
- **Scripts de Execução e Inicialização:**
  - `npm run dev`: Inicia o Vite e o Electron em modo de desenvolvimento conectado.
  - `npm run build`: Compila o código React/Vite para a pasta `dist/`.
  - `npm start`: Compila e inicia o Electron apontando para os arquivos de produção.
  - `npm run dist`: Gera o instalador executável (.exe via NSIS) na pasta `release/`.
  - `Iniciar Bibliografia.bat`: Script em lote para inicialização direta no Windows.

---

## 3. ALTERAÇÕES RECENTES REALIZADAS

1. **Splash Screen Animada & Dinâmica com Logo do Bibliografia:**
   - Adicionada tela de abertura em gradiente radial (`#1e293b` a `#0f172a`) com logotipo vetorial dinâmico (livro aberto em perspectiva com anéis orbitais giratórios e brilho pulsante).
   - Tipografia de alto contraste com gradiente metálico e barra de progresso contínua.
   - Implementado temporizador de segurança automático (`window.__removerSplash`) que força o desvanecimento da tela de splash caso haja demora de I/O na nuvem, eliminando travamentos.
2. **Resolução de Falhas Críticas de Inicialização:**
   - Corrigido o erro `ReferenceError: useRef is not defined` no componente raiz `App.jsx`.
   - Adicionado `ErrorBoundary` protetor no arquivo `src/main.jsx` para impedir falhas em cascata que pudessem causar tela branca no Electron.
3. **Menu Lateral Vertical Definitivo (Rail Lateral):**
   - Substituição do menu horizontal de abas (que sofria quebra de layout e corte de textos em telas de resolução intermediária) por uma barra lateral de navegação vertical permanente (`rail-vertical-zotero`).
   - Todos os módulos do sistema (Biblioteca, Buscadores, Word, Auditoria, PRISMA, ResearchRabbit e Tutorial) agora residem nesse menu vertical ergonômico, com acesso em um único clique e sem necessidade de rolagem horizontal.
4. **Paleta de Cores Sóbria Estilo Mendeley / Elsevier:**
   - Ajustada a identidade cromática em `src/styles.css` substituindo gradientes azuis saturados por tons acadêmicos sóbrios:
     - Destaque em vermelho carmim acadêmico Mendeley (`--primaria: #a81c24` / `#c42b34`).
     - Fundos e painéis em ardósia grafite neutra (`#141b24`, `#161d27`, `#0f141c` no modo escuro; `#f4f6f8` no modo claro).
     - Bordas técnicas discretas de 1px.
5. **Barra Superior Limpa & Gestão de Documentos:**
   - Barra superior simplificada contendo exclusivamente o seletor de pastas de projetos (`Pasta: [Nome] ▾`), abas individuais de artigos e PDFs abertos para leitura (com fechamento em `×`), e o indicador de sincronização em nuvem.
6. **Modal de Bibliografia Formatada Expandido:**
   - Interface de cópia de referências para o Word expandida para 1080px de largura com prévia rica de alto contraste, seletor de escopo (Citadas, Consultadas, Selecionadas, Todas) e campo de busca instantânea.

---

## 4. O QUE AINDA FALTA FAZER (PRÓXIMOS PASSOS NO ANTIGRAVITY)

Para dar continuidade direta ao trabalho na ferramenta Antigravity, os seguintes itens estão mapeados como prioridades:

1. **Ajuste Fino de Escala no Rail Vertical:**
   - Expandir a largura do rail vertical para ~84px–88px e aumentar a área de clique dos botões para 74px × 66px, garantindo tipografia mais destacada (12px) e ícones maiores (22px a 24px), proporcionando leitura ainda mais confortável.
2. **Reestruturação Completa do Tutorial Interativo (`HelpGuideView.jsx`):**
   - Atualizar todos os textos e roteiros para refletir a versão atual do sistema (v1.2.0).
   - Abordar com riqueza didática o novo fluxo de trabalho:
     - Etapa 1: Conexão e sincronização com OneDrive/Google Drive.
     - Etapa 2: Navegação vertical no Rail estilo Mendeley.
     - Etapa 3: Leitura e extração com o visualizador de PDFs integrado.
     - Etapa 4: Auditoria reversa de manuscritos acadêmicos (.docx/.pdf).
     - Etapa 5: Formatação CSL e cópia rica para Microsoft Word.
     - Etapa 6: Triagem sistemática de artigos e geração de diagrama PRISMA 2020.
3. **Criação do Módulo Versionador e Diagnóstico do Sistema:**
   - Criar uma aba ou modal dedicado com o histórico de versões (Changelog cronológico detalhando v1.0.0, v1.1.0 e v1.2.0).
   - Incluir painel de diagnóstico exibindo: versão do Electron, versão do Node, porta ativa do servidor Word (23119), caminho da biblioteca ativa e total de registros indexados.
4. **Modernização da Organização e Dockerização Profissional:**
   - Criar `Dockerfile` multi-stage (Node.js LTS + build Vite + servidor web/preview Nginx ou Node para visualização em container).
   - Criar `docker-compose.yml` para facilitar a inicialização da interface e testes de integração de forma isolada.
   - Criar arquivo `.dockerignore` excluindo `node_modules`, `dist`, `.git` e arquivos de log.
   - Atualizar a documentação técnica no `README.md` com instruções detalhadas de desenvolvimento, empacotamento desktop e execução via Docker.
