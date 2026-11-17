# Bibliografia Forense 📚🔍

[![CI Pipeline](https://github.com/marcosandredaluz/Bibliography/actions/workflows/ci.yml/badge.svg)](https://github.com/marcosandredaluz/Bibliography/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker Multi-Stage](https://img.shields.io/badge/Docker-Multi--Stage-2496ED.svg)](docker/Dockerfile)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

Plataforma de código aberto, *offline-first* e neutra para **Apoio à Escrita Acadêmica, Gestão de Referências, Triagem Sistemática em Duplo-Cego (PRISMA 2020) e Auditoria Forense de Citações**.

> 🌐 **English Version:** Please check [README.md](README.md) for the English documentation.

---

## 🌟 Principais Funcionalidades

1. **🔍 Central de Buscadores Federados:** Consulta paralela e contagem em tempo real em bases de dados abertas (PubMed, Europe PMC, Crossref, ClinicalTrials.gov, OpenAlex) com barra de progresso visual.
2. **📊 Gestão Metodológica PRISMA 2020:** Desduplicação segura de artigos (sem perda de notas ou PDFs), triagem rápida em duplo-cego de resumos com motivos de inclusão/exclusão e geração automática do fluxograma oficial.
3. **🔗 Grafo de Citações & Linhagem Científica:** Exploração bidirecional da cadeia de citações (*backward & forward chaining* / *snowballing*) a partir de artigos-semente.
4. **🔬 Motor de Auditoria Forense Anti-Alucinação:** Validação de integridade referencial em manuscritos `.docx` e `.pdf`, detecção de citações fabricadas por IA, DOIs sequestrados e citações Frankenstein (via distância Levenshtein e similaridade semântica multilíngue).
5. **📝 Integração Nativa com Processadores de Texto (.DOCX):** Comunicação local via microsserviço HTTP (porta 23119) com suporte a mais de 2.800 estilos bibliográficos CSL (ABNT, Vancouver, APA, etc.).

---

## 🏛️ Arquitetura do Sistema (Clean Architecture)

```
D:\BIBLIOGRAFIA\
├── .github/workflows/         # Pipelines de CI/CD (Lint, SAST Bandit, Pytest)
├── backend/
│   ├── app/
│   │   ├── main.py            # Servidor FastAPI (Porta 23119) & Lifespan
│   │   ├── core/              # Regras de Negócio e Algoritmos Fundamentais
│   │   │   ├── citation_regex.py       # Extração ABNT NBR 10520 (Parentéticas e Narrativas)
│   │   │   ├── semantic_inference.py   # Inferência Semântica Multilíngue & Entidades Numéricas
│   │   │   ├── fulltext_scanner.py     # Varredura em 2 Estágios (Abstract -> Texto Completo & Tabelas)
│   │   │   ├── chronological_rules.py  # Tolerância Cronológica (Crossref vs PubMed / Epub vs Print)
│   │   │   └── typographical_norm.py   # Normalização Numérica Canônica de Edições e Fascículos
│   │   ├── integration_word/  # Adaptadores de Entrada/Saída para Processadores de Texto (.DOCX / VBA)
│   │   ├── validation_engine/ # Motores Anti-Alucinação e Verificação de Integridade
│   │   ├── regional_extractors/ # Tradutores para Bases Abertas (SciELO e BVS / LILACS)
│   │   ├── plugin_system/     # Mecanismo de Extensibilidade Pluggy (Hooks e Contratos)
│   │   └── plugins/           # Pacotes de Extensão Isolados (ex: Módulo de Saúde Pública)
│   └── tests/                 # Bateria de Testes Automatizados (5.000+ Casos de Teste)
├── docker/
│   └── Dockerfile             # Multi-stage build otimizado para produção
├── docker-compose.yml         # Orquestração do Backend + Frontend
├── pyproject.toml             # Gerenciamento moderno de dependências (Poetry)
├── CONTRIBUTING.md            # Guia de contribuição e governança
└── LICENSE                    # Licença de Código Aberto (Apache 2.0)
```

---

## 🚀 Início Rápido com Docker

```bash
docker-compose up --build -d
```
- **Backend FastAPI:** `http://localhost:23119`
- **Documentação Swagger:** `http://localhost:23119/docs`
- **Interface Web:** `http://localhost:5173`

---

## 🧪 Qualidade de Código e Testes Automatizados

O repositório conta com suíte industrial e adversarial com mais de **5.000 testes automatizados** aprovados com 100% de sucesso:

```bash
# Executar bateria de testes do backend
poetry run pytest backend/tests/ -v

# Executar bateria massiva de calibração forense e red-team
npm run test:calibracao
```

---

## 👥 Colaboração em Grupo e Sincronização em Nuvem (Multi-Pesquisador)

Diferente dos gerenciadores tradicionais que utilizam um único arquivo binário SQLite (que frequentemente corrompe ou gera arquivos de conflito quando múltiplos pesquisadores salvam ao mesmo tempo em pastas de nuvem compartilhadas), o **Bibliografia** adota uma **Arquitetura de Arquivos Atômicos Desacoplados**:

- **Armazenamento Atômico em JSON:** Cada referência é salva como um arquivo `.json` individual e isolado em `referencias/`. Quando um coautor insere 3 artigos, a nuvem sincroniza apenas esses 3 arquivos leves para o restante da equipe sem bloqueio de banco de dados.
- **Sincronização em Tempo Real com LaTeX / Overleaf:** O arquivo `library.bib` na raiz da biblioteca é atualizado automaticamente a cada edição, mantendo as chaves de citação sincronizadas para toda a equipe.
- **Auditoria Cruzada de Manuscritos:** Coautores podem auditar rascunhos compartilhados em `.docx` para garantir que parágrafos redigidos por outros membros contenham citações válidas e sem alucinações.

### 💡 Chamada para a Comunidade de Código Aberto (RFC):
Estamos desenhando as próximas soluções para colaboração científica multi-autor e convidamos a comunidade a propor ideias:
- **Repositórios de Referências Versionados em Git:** Versionamento completo de coleções com histórico de inclusão de artigos por autor.
- **Pacotes Portáteis de Estudo (`.bibpack`):** Exportação em 1 clique de referências, PDFs e matriz PRISMA em `.zip`.
- **Triagem em Duplo-Cego Distribuída:** Consenso automatizado entre múltiplos revisores.

👉 **Participe:** Abra uma issue ou contribua com ideias em [GitHub Issues](https://github.com/marcosandredaluz/Bibliography/issues)!

---

## 🤝 Inspirações Open Source e Reconhecimentos

Este projeto utiliza exclusivamente padrões abertos, APIs científicas públicas e inspirações arquiteturais/algorítmicas limpas da comunidade de código aberto e cientometria (sem referenciar soluções comerciais proprietárias):

- **Integração com Word e Extração de Campos:** Arquitetura inspirada em [`zotero/zotero-word-for-windows-integration`](https://github.com/zotero/zotero-word-for-windows-integration) (Ribbon OOXML `.dotm` / VBA `wdFieldAddin`), [`rmzelle/ref-extractor`](https://github.com/rmzelle/ref-extractor) (leitura reversa de campos `<w:instrText>` no `.docx`), [`Future-Scholars/paperlib`](https://github.com/Future-Scholars/paperlib) (ponte HTTP local) e [`citation-style-language/styles`](https://github.com/citation-style-language/styles).
- **Anti-Alucinação e Auditoria de Evidências:** Decomposição atômica e pontuação composta por campo inspiradas em [`amazon-science/RefChecker`](https://github.com/amazon-science/RefChecker), [`markrussinovich/refchecker`](https://github.com/markrussinovich/refchecker), [`atomgptlab/hallucination_detector`](https://github.com/atomgptlab/hallucination_detector), [`Vikranth3140/Citation-Hallucination-Detection`](https://github.com/Vikranth3140/Citation-Hallucination-Detection), [`hadipourh/verifyref`](https://github.com/hadipourh/verifyref) e [`allenai/scicite`](https://github.com/allenai/scicite).
- **NER Jurídico/Institucional, Recuperação e Cientometria:** Taxonomia [`peluz/lener-br`](https://github.com/peluz/lener-br) / `pierreguillou/ner-bert-large-cased-pt-lenerbr`; Okapi BM25 (`rank_bm25`) & TF-IDF (`scikit-learn`); **statcheck** (*Nuijten et al.*); **Problematic Paper Screener** (*Cabanac, Labbé & Magazinov*); checagem gênica (*Ziemann et al. / HGNC*); **Winnowing** (MOSS), **RKR-GST** (JPlag), `diff-match-patch`, [`Imalwayshere/Open-Detector`](https://github.com/Imalwayshere/Open-Detector) e [`irgifebry/plagiarism-checker`](https://github.com/irgifebry/plagiarism-checker).

O manifesto completo de dependências, repositórios e normas sob a licença Apache 2.0 está documentado em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## 👤 Autor e Mantenedor

Desenvolvido e mantido por:
* **[Marcos André da Luz](https://www.linkedin.com/in/marcos-andre-da-luz-847039141)** — Pesquisador de Pós-Graduação em Tecnologia e Informática em Saúde.

---

## 📄 Licença

Distribuído sob a licença **Apache 2.0**. Consulte o arquivo [LICENSE](LICENSE) para obter mais informações.
