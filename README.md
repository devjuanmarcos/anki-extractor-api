# NestJS Prisma API Template

Template generico de API com NestJS, Prisma e TypeScript, pronto para servir como base de novos projetos no GitHub.

Este repositorio foi limpo para remover o dominio antigo da aplicacao Biomob. Foram retiradas rotas, entidades e fluxos especificos como candidatos, cursos, aulas, empresas, filas e atendimento. No lugar disso, a base ficou enxuta e neutra, mantendo a arquitetura modular, autenticacao JWT, Prisma, validacao com Zod e documentacao OpenAPI.

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

## O que este template entrega

- Prefixo global `/api`
- Versionamento por URI com `/api/v1`
- Rotas base para `health`, `auth` e `users`
- Autenticacao com access token e refresh token persistido em banco
- Roles base `ADMIN` e `MEMBER`
- Interceptor de logging de requests com persistencia opcional
- Filtro global de excecoes
- Prisma schema neutro com `User`, `RefreshToken` e `RequestLog`
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

## Como subir localmente

1. Instale as dependencias:

```bash
pnpm install
```

2. Crie o arquivo `.env` com base em `.env.example`.

3. Suba o PostgreSQL local:

```bash
pnpm db:up
```

4. Gere o client do Prisma:

```bash
pnpm prisma:generate
```

5. Aplique as migrations:

```bash
pnpm prisma:migrate
```

6. Popule o banco local com dados de teste:

```bash
pnpm db:seed
```

7. Suba a API:

```bash
pnpm start:dev
```

## Banco local

- Compose local: `docker-compose.local.yml`
- Banco: `api_template_local`
- Usuario: `postgres`
- Senha: `postgres`
- URL padrao: `postgresql://postgres:postgres@localhost:5432/api_template_local?schema=public`

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

## Testes e build

```bash
pnpm build
pnpm exec jest --runInBand
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
