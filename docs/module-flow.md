# Module Flow

## Regra principal

Todo modulo novo deve seguir o fluxo:

`controller -> dto/schema -> service -> prisma -> entity`

Essa separacao existe para manter:

- baixo acoplamento
- previsibilidade
- documentacao de rotas
- validacao consistente
- testes mais simples

## Estrutura recomendada

```text
src/modules/<resource>/
  <resource>.module.ts
  <resource>.controller.ts
  <resource>.service.ts
  dto/
  entities/
  schemas/
```

## Responsabilidade por pasta

### module.ts

Registra controller e service do modulo.

### controller.ts

Responsavel por:

- definir endpoints
- aplicar decorators Swagger
- aplicar auth e roles
- chamar pipes de validacao
- delegar regra de negocio ao service

O controller nao deve:

- falar direto com Prisma
- implementar regra de negocio complexa
- montar queries complexas

### dto/

DTO e a camada de contrato visivel para Swagger.

Use DTO para:

- request body
- query params
- path params quando necessario
- respostas quando fizer sentido

### schemas/

Use Zod para validacao runtime.

Padrao recomendado:

- um schema para create
- um schema para update
- um schema para query/list
- schemas pequenos e focados

### service.ts

Aqui fica a regra de negocio.

O service deve:

- validar regras de dominio
- coordenar persistencia
- chamar Prisma
- lidar com conflitos e not found
- retornar entities

O service nao deve:

- conhecer detalhes de transporte HTTP
- documentar Swagger

### entity/

Entity padroniza a saida.

Ela existe para:

- esconder campos internos como `passwordHash`
- manter a resposta previsivel
- facilitar evolucao sem vazar detalhes do Prisma

## Exemplo de fluxo

### Criacao de usuario

1. `POST /api/v1/users`
2. Controller recebe `CreateUserDto`
3. `createUserSchema` valida o payload
4. Service verifica email duplicado
5. Service faz hash da senha
6. Prisma cria o registro
7. `UserEntity` mapeia a resposta

### Login

1. `POST /api/v1/auth/login`
2. Controller recebe `LoginDto`
3. `loginSchema` valida email e senha
4. Service busca usuario no banco
5. Service compara senha com hash
6. Service gera access token e refresh token
7. Prisma persiste o refresh token
8. `AuthTokensEntity` retorna a sessao

## Checklist para novo modulo

1. Criar a pasta do modulo
2. Criar o `module.ts`
3. Criar DTOs documentados com Swagger
4. Criar schemas Zod
5. Criar service com regra de negocio
6. Criar entities de resposta
7. Adicionar guards e roles quando necessario
8. Registrar no `AppModule`
9. Adicionar testes unitarios/e2e
10. Atualizar o README se o modulo for parte do template base
