## Descrição das Alterações
Descreva resumidamente o que foi implementado ou corrigido.

## Tipo de Mudança (Conventional Commit)
- [ ] `feat`: Nova funcionalidade
- [ ] `fix`: Correção de bug no algoritmo ou backend
- [ ] `docs`: Alterações na documentação
- [ ] `refactor`: Refatoração sem alteração de funcionalidade
- [ ] `test`: Adição ou correção de testes

## Checklist de Validação
- [ ] O código segue a formatação do projeto (`poetry run black backend/`)
- [ ] Os linters foram executados sem erros (`poetry run ruff check backend/`)
- [ ] A análise de segurança não encontrou vulnerabilidades (`poetry run bandit -r backend/app -ll`)
- [ ] Todos os testes unitários passaram (`poetry run pytest backend/tests/`)
- [ ] Nenhum dado sensível ou chave de API está presente no código
