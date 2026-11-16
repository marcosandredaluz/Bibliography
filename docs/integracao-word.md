# Integração com Processador de Texto (.DOCX)

A comunicação entre o processador de texto desktop (.DOCX) e o motor local Python ocorre via HTTP localhost na porta `23119`, baseada em arquitetura desacoplada de microsserviço local para automação documental.

---

## 💻 Componentes da Integração

1. **Template de Automação VBA (.dotm):** Instalado no diretório de modelos de inicialização do processador de texto. Executa chamadas assíncronas via `WinHttp.WinHttpRequest.5.1` enviando o texto do documento para o endpoint `/api/word/auditar`.
2. **Faixa de Opções Customizada (`customUI14.xml`):** Injeta a aba **Bibliografia Forense** na barra de ferramentas superior do editor de documentos.
3. **Comportamento Visual de Diagnóstico:** Inconformidades são apontadas através de grifos coloridos nativos no documento (vermelho para citações Frankenstein, amarelo para órfãs e violeta para estilo de IA) ou comentários no próprio texto.
