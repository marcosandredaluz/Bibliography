# Guia de Implementação e Uso: Integração Microsoft Word 365 Desktop (Windows)

Este diretório contém os componentes para a integração nativa com o **Microsoft Word 365 Desktop**, baseando-se na arquitetura do **Zotero** e **Mendeley**.

## 1. Arquivos Inclusos
* **`Bibliografia.bas`**: Módulo VBA completo para importação no template Word (`.dotm`). Contém as chamadas HTTP assíncronas via `WinHttp.WinHttpRequest.5.1` e os manipuladores de grifos, comentários e campos.
* **`customUI14.xml`**: Estrutura XML da Faixa de Opções (Ribbon) que injeta a aba *"Bibliografia Forense"*.
* **`engine_server.py`**: Servidor local em Python (FastAPI/Uvicorn) na porta `23119` que executa a auditoria e serve o painel web.
* **`build_engine.bat`**: Script de compilação em 1 clique com PyInstaller (`--onefile --noconsole`).
* **`setup_word_integration.iss`**: Script do Inno Setup para gerar o instalador que copia o template silenciosamente para `%APPDATA%\Microsoft\Word\STARTUP`.

## 2. Decisões Técnicas Alinhadas
1. **Comportamento Visual Duplo:**
   - O Word recebe **grifos em cores nativas** no corpo do texto (Vermelho = Alucinação/Plágio, Amarelo = Citação Órfã, Roxo = Marcador de IA) e **Comentários Nativos** com sugestões de prompt para IA.
   - Concomitantemente, o navegador abre o **Painel Web de Diagnóstico Interativo** (`http://127.0.0.1:23119/painel-auditoria`).
2. **Formato Híbrido de Citações:**
   - O usuário pode alternar no Ribbon entre **Campos Nativos do Word** (`w:fldSimple`/`wdFieldAddin`, padrão Zotero que impede edições acidentais) e **Texto com Bookmarks** (`BIB_BREF_...`, padrão Mendeley que preserva compatibilidade com LibreOffice e Google Docs).

## 3. Passo a Passo para Gerar o Pacote Final
1. Execute `build_engine.bat` para gerar `dist\BibliografiaWordEngine.exe`.
2. Abra o Word, pressione `Alt+F11`, crie um documento em branco, importe `Bibliografia.bas`, salve como `Bibliografia.dotm` neste diretório e injete o `customUI14.xml` via *Custom UI Editor* ou empacotamento ZIP.
3. Abra `setup_word_integration.iss` no Inno Setup Compiler e clique em **Build** (F9).
4. O instalador gerado em `dist_installer\` instalará tudo silenciosamente em qualquer máquina Windows.
