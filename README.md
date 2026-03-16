# Anki Extractor API

API em NestJS + Prisma para receber pacotes `.apkg` do Anki, extrair decks,
modelos, notas, cards e midias, persistir o resultado em PostgreSQL local e
expor consultas e exportacao JSON da importacao.

O projeto reutiliza a arquitetura modular da base NestJS original, com JWT,
Zod, Prisma, Swagger e Redoc, mas o fluxo principal agora e o pipeline de
importacao do Anki.

## Stack

- Node.js 20+
- NestJS 11
- Prisma ORM
- TypeScript 5
- JWT com `@nestjs/jwt`
- Passport JWT
- Zod para validacao de entrada
- Swagger e Redoc para documentacao de rotas
- PostgreSQL como banco padrao

## O que a API entrega

- Prefixo global `/api`
- Versionamento por URI com `/api/v1`
- Rotas base para `health`, `auth` e `users`
- Upload autenticado de arquivos `.apkg`
- Persistencia relacional de imports, decks, modelos, notas, cards e midias
- Exportacao JSON estruturada a partir dos dados persistidos
- Autenticacao com access token e refresh token persistido em banco
- Roles base `ADMIN` e `MEMBER`
- Interceptor de logging de requests com persistencia opcional
- Filtro global de excecoes
- Prisma schema com o dominio Anki e tabelas auxiliares da base
- Documentacao pronta em Swagger e Redoc

## Rotas base

- `GET /api`
- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/users`
- `GET /api/v1/users`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id/role`
- `PATCH /api/v1/users/:id/status`
- `GET /api/v1/items`
- `POST /api/v1/items`
- `GET /api/v1/items/:id`
- `PATCH /api/v1/items/:id`
- `DELETE /api/v1/items/:id`
- `POST /api/v1/imports`
- `GET /api/v1/imports`
- `GET /api/v1/imports/:id`
- `DELETE /api/v1/imports/:id`
- `GET /api/v1/imports/:importId/decks`
- `GET /api/v1/imports/:importId/notes`
- `GET /api/v1/imports/:importId/cards`
- `GET /api/v1/imports/:importId/media`
- `GET /api/v1/imports/:importId/export`
- `GET /api/v1/decks/:id`
- `GET /api/v1/notes/:id`
- `GET /api/v1/cards/:id`
- `GET /api/v1/media/:id`
- `GET /api/v1/media/:id/info`

## Estrutura principal

```text
src/
  app.controller.ts
  app.module.ts
  app.setup.ts
  main.ts
  config/
    config.ts
  common/
    decorators/
    dto/
    entities/
    filters/
    guards/
    interceptors/
    pipes/
    prisma.module.ts
    services/
    types/
    utils/
  modules/
    auth/
    health/
    users/
    items/
prisma/
  schema.prisma
  migrations/
docs/
  architecture.md
  module-flow.md
  template-guide.md
```

## Fluxo da aplicacao

Cada modulo segue o fluxo:

`controller -> dto/schema -> service -> prisma -> entity`

Resumo rapido:

- `controller`: define as rotas, decorators Swagger, auth e validacao.
- `dto`: documenta o contrato para Swagger.
- `schema`: valida o payload com Zod em runtime.
- `service`: concentra regra de negocio e acesso ao banco.
- `prisma`: executa persistencia e consultas.
- `entity`: padroniza a saida da API.

Detalhes em [docs/module-flow.md](docs/module-flow.md).

## Desenvolvimento local

1. Instale as dependencias:

```bash
pnpm install
```

2. Se o binding nativo do SQLite nao carregar apos a instalacao, reconstrua:

```bash
pnpm rebuild better-sqlite3
```

3. Crie o arquivo `.env` com base em `.env.example` ou exporte a URL do banco
localmente.

4. Garanta um PostgreSQL local em `localhost:5432` com usuario `postgres`,
senha `2611` e um banco dedicado chamado `anki_extractor_local`.
Nao use Docker para este fluxo. Um exemplo de SQL para preparar o banco e:

```sql
CREATE DATABASE anki_extractor_local;
```

5. Configure `DATABASE_URL` para o banco local:

PowerShell:

```powershell
$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'
```

Bash:

```bash
export DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'
```

6. Gere o client do Prisma:

```bash
pnpm prisma:generate
```

7. Aplique as migrations:

```bash
pnpm prisma:migrate
```

8. Popule o banco local com dados de teste:

```bash
pnpm db:seed
```

9. Suba a API:

```bash
pnpm start:dev
```

## Banco local

- Banco: `anki_extractor_local`
- Usuario: `postgres`
- Senha: `2611`
- URL padrao: `postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public`
- Fluxo esperado: PostgreSQL instalado localmente, sem comandos Docker para subir o banco
- Comportamento de falha esperado: se o banco nao existir ou a senha estiver incorreta, `pnpm prisma:migrate` deve falhar com erro de conexao antes de aplicar estado parcial

## Storage local

- `IMPORTS_TEMP_DIR` controla o workspace temporario dos uploads.
- `MEDIA_STORAGE_DIR` controla o storage permanente das midias extraidas.
- Os valores padrao sao `.tmp/anki-imports` e `.tmp/anki-media`.
- O workspace temporario e limpo tanto em sucesso quanto em falha; apenas as
midias persistidas permanecem em `MEDIA_STORAGE_DIR/<importId>`.
- Em desenvolvimento local, valide permissao de escrita nessas pastas antes de
rodar upload ou `pnpm test:e2e`.

## Dominio Anki no Prisma

O schema Prisma inclui as tabelas `imports`, `decks`, `note_models`, `notes`,
`cards` e `media_files`, com enums para `ImportStatus` e `MediaType`.
Os relacionamentos usam `onDelete: Cascade` a partir de `Import` e indices
compostos por `importId` + ID original do Anki para apoiar o fluxo de extracao
e deduplicacao dos dados persistidos.

## Credenciais seed

- Admin: `admin@example.com` / `Admin@123`

## Prisma

Comandos principais:

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:migrate:create
pnpm prisma:push
pnpm prisma:studio
```

## Documentacao de rotas

Com a aplicacao em execucao:

- Swagger UI: `http://localhost:3000/docs/swagger`
- Redoc: `http://localhost:3000/docs`
- Root metadata: `http://localhost:3000/api`

## Verificacao

Execute a sequencia abaixo sempre que alterar o pipeline de importacao ou a
infra local:

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## Como criar um novo modulo

O caminho recomendado esta em [docs/module-flow.md](docs/module-flow.md), mas o resumo e:

1. Criar `src/modules/<recurso>/<recurso>.module.ts`
2. Criar `controller`, `service`, `dto`, `schemas` e `entities`
3. Documentar o contrato com DTOs
4. Validar entrada com Zod
5. Encapsular regra de negocio no service
6. Mapear resposta com entity
7. Registrar o modulo em `src/app.module.ts`

## Como transformar em template no GitHub

O passo a passo completo esta em [docs/template-guide.md](docs/template-guide.md).

Resumo:

1. Suba este repositorio para o GitHub
2. Acesse `Settings`
3. Marque a opcao `Template repository`
4. Ajuste nome, descricao, LICENSE e badges conforme seu uso
5. Mantenha o README e os docs como guia para novos projetos

## Leitura complementar

- [docs/architecture.md](docs/architecture.md)
- [docs/module-flow.md](docs/module-flow.md)
- [docs/template-guide.md](docs/template-guide.md)
