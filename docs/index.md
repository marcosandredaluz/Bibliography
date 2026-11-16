# Bibliografia Forense 📚🔍

Bem-vindo à documentação oficial do **Bibliografia Forense**, um ecossistema desacoplado e *offline-first* para **Gestão Bibliográfica, Auditoria Forense de Citações e Integração Nativa com Processadores de Texto (.DOCX)**.

---

## 🎯 Objetivos do Projeto

1. **Anti-Alucinação:** Detectar citações fabricadas por Inteligências Artificiais generativas (LLMs) e citações *Frankenstein* (onde o DOI pertence a um artigo, mas o texto cita outro).
2. **Integração com Processadores de Texto:** Comunicação local via HTTP localhost e automação de documentos (.dotm / Ribbon), permitindo auditoria visual no próprio arquivo.
3. **Extensibilidade por Domínio:** Sistema de plugins baseado em `pluggy` permitindo que pesquisadores de áreas específicas (como Saúde Pública, Direito ou Engenharia) instalem pacotes especializados sem poluir o núcleo universal.
4. **Resolução de Fontes Regionais:** Translators dedicados para bases latino-americanas (SciELO e BVS / LILACS).

---

## ⚡ Início Rápido

Consulte as seções:
- [Arquitetura & Clean Code](arquitetura.md)
- [Desenvolvimento de Plugins com Pluggy](plugins.md)
- [Extratores Regionais (SciELO / BVS)](extratores.md)
- [Motor de Auditoria Forense](auditoria.md)
- [Integração com Processadores de Texto (.DOCX)](integracao-word.md)
