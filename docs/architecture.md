# Architecture

## Objetivo

Esta base foi reorganizada para funcionar como template generico de API.

O dominio antigo foi removido para evitar que regras de negocio especificas contaminem novos projetos. Foram eliminados modulos como:

- candidates
- classes
- courses
- lessons
- companies
- sectors
- queues
- desks
- logs expostos por rota
- email e integracoes acopladas ao dominio antigo

No lugar disso, o template preserva apenas a infraestrutura reaproveitavel.

## Camadas

### Bootstrap

- `src/main.ts`: sobe a aplicacao
- `src/app.setup.ts`: aplica CORS, versionamento, prefixo global, filtro global e docs
- `src/app.module.ts`: conecta todos os modulos

### Config

- `src/config/config.ts`: le e valida variaveis de ambiente com Zod

### Common

Responsabilidade compartilhada entre todos os modulos:

- decorators
- guards
- filters
- interceptors
- pipes
- prisma module
- services utilitarios
- entities genericas

### Modules

Os modulos de dominio/template ficam em `src/modules`.

Atualmente:

- `health`: observabilidade e status
- `auth`: login, refresh, logout e sessao atual
- `users`: CRUD basico de usuarios e roles

### Persistence

- `prisma/schema.prisma`: contrato do banco
- `prisma/migrations`: historico inicial do template

## Convencoes

### Prefixo e versao

- Prefixo global: `/api`
- Versao por URI: `/api/v1`

### Autenticacao

- Access token curto
- Refresh token persistido em banco
- Roles iniciais: `ADMIN` e `MEMBER`

### Documentacao

- Swagger: `/docs/swagger`
- Redoc: `/docs`

### Validacao

- DTO para Swagger
- Zod schema para validacao runtime

## Fluxo de request

1. A request entra no controller
2. O DTO documenta o contrato
3. O `ZodValidationPipe` valida o payload
4. Guards verificam autenticacao e roles
5. O service executa a regra de negocio
6. O Prisma acessa o banco
7. A entity mapeia a resposta
8. O interceptor registra o request
9. O filtro global normaliza erros

## Modelos atuais do template

### User

Representa o usuario base da API:

- identificacao
- nome
- email
- hash de senha
- role
- status ativo/inativo
- timestamps

### RefreshToken

Representa sessoes renovaveis:

- `jti`
- hash do token
- expiracao
- revogacao
- relacionamento com usuario

### RequestLog

Registra trafego da API:

- usuario
- rota
- metodo
- status code
- payload sanitizado
- timestamp
