# Guia de Contribuição - Bibliografia Forense

Agradecemos o interesse em contribuir com o **Bibliografia Forense**! Este documento orienta as diretrizes de código, padrões de commit e fluxo de desenvolvimento para manter a integridade arquitetural do projeto.

---

## 1. Princípios Arquiteturais e Diretrizes Gerais

- **Clean Architecture & SOLID:** Mantenha a separação entre camadas (`Core`, `Integration Word`, `Validation Engine`, `Regional Extractors` e `Plugins`).
- **Offline-First & Privacidade:** O núcleo não deve depender de serviços de nuvem externos para processar os textos dos usuários.
- **Isolamento via Pluggy:** Módulos de domínio específico (como o pacote de Saúde Pública) devem ser implementados como plugins isolados utilizando hooks (`@hookimpl`).

---

## 2. Padrão de Commits (Conventional Commits)

Adotamos a especificação [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/) para permitir versionamento semântico automatizado (SemVer) e geração contínua do `CHANGELOG.md`:

```
<tipo>(<escopo>): <descrição curta no imperativo>

[corpo opcional explicando motivação]

[rodapé opcional com BREAKING CHANGE ou número de issue]
```

### Tipos Permitidos:
- **`feat`**: Nova funcionalidade para o usuário (dispara bump `MINOR`).
- **`fix`**: Correção de bug no algoritmo ou servidor (dispara bump `PATCH`).
- **`docs`**: Alterações exclusivamente em documentação.
- **`style`**: Formatação, ponto-e-vírgula, sem alteração de lógica.
- **`refactor`**: Refatoração interna que não corrige bug nem adiciona funcionalidade.
- **`perf`**: Melhoria de desempenho ou otimização de busca.
- **`test`**: Adição ou correção de testes unitários.
- **`chore`**: Atualizações de tarefas de build, dependências ou CI/CD.

*Exemplo:*
```bash
git commit -m "feat(abnt): adicionar suporte a citacoes narrativas corporativas"
git commit -m "fix(cronologia): corrigir aceitacao de ano epub ahead of print"
```

---

## 3. Fluxo de Trabalho com Git & Pull Requests

1. Crie um fork do repositório.
2. Crie uma branch descritiva a partir de `main`:
   ```bash
   git checkout -b feat/validador-bvs-iahx
   ```
3. Instale as dependências com Poetry:
   ```bash
   poetry install
   ```
4. Execute os linters e a bateria de testes antes de submeter:
   ```bash
   poetry run ruff check backend/
   poetry run black --check backend/
   poetry run pytest backend/tests/
   poetry run bandit -r backend/app -ll
   ```
5. Envie um Pull Request direcionado à branch `main` com uma descrição clara das mudanças e testes realizados.

---

## 4. Segurança e Código Estático (SAST)

Todo Pull Request passa automaticamente pelos seguintes checks:
1. **Ruff & Black**: Padronização de estilo e boas práticas PEP-8.
2. **Bandit**: Análise estática contra vulnerabilidades conhecidas em Python.
3. **TruffleHog**: Varredura estrita para impedir o envio acidental de chaves de API, senhas ou tokens privados.

---

## 5. Internacionalização & Novos Pacotes de Idiomas (Translations)

Deseja adicionar o seu idioma nativo ou melhorar uma tradução existente?
1. Acesse o diretório `src/locales/`.
2. Duplique o arquivo base `en.json` nomeando-o com o código ISO do seu idioma (ex.: `de.json` para Alemão, `it.json` para Italiano, `zh.json` para Chinês, `ar.json` para Árabe).
3. Traduza os valores das chaves mantendo a estrutura original intacta.
4. Abra um Pull Request com o título: `feat(i18n): adicionar pacote de idioma <idioma>`.

---

## 6. Licença

Ao contribuir com este projeto, você concorda que suas contribuições serão licenciadas sob a **Apache License 2.0**.
