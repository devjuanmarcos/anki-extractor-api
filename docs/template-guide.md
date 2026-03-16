# Template Guide

## Objetivo

Este repositorio foi preparado para virar um template reutilizavel no GitHub.

Use este guia antes de publicar como base oficial da sua organizacao.

## Antes de publicar

Revise estes pontos:

1. Nome do projeto em `package.json`
2. Descricao do README
3. LICENSE do repositorio
4. Variaveis de ambiente em `.env.example`
5. Rotas base que voce quer manter
6. Roles iniciais que vao existir no template
7. Banco padrao e provider do Prisma

## Como marcar como template no GitHub

1. Suba o repositorio para o GitHub
2. Abra a pagina do repositorio
3. Entre em `Settings`
4. Na secao `General`, marque `Template repository`
5. Salve

Depois disso, qualquer pessoa podera usar `Use this template`.

## O que costuma ser customizado depois

- nome do repositorio
- nome do pacote
- variaveis de ambiente
- dominio do banco
- modulos de negocio
- README do projeto final
- workflow de CI/CD

## Fluxo recomendado para novos projetos

1. Criar um novo repositorio usando este template
2. Ajustar `package.json`
3. Ajustar `.env.example`
4. Definir o schema Prisma do novo dominio
5. Criar migrations
6. Implementar os novos modulos em `src/modules`
7. Atualizar a documentacao Swagger com os novos endpoints
8. Atualizar o README do projeto final

## O que manter como base

Estas partes devem continuar no template:

- bootstrap em `src/main.ts`
- configuracao em `src/app.setup.ts`
- env config em `src/config/config.ts`
- camada comum em `src/common`
- modulo `health`
- modulo `auth`
- modulo `users`
- schema Prisma inicial

## O que normalmente nao deve entrar no template

- regras de negocio de um cliente especifico
- integracoes proprietarias
- assets de marca
- colecoes Postman de um sistema antigo
- migrations de dominios que nao existem mais

## Checklist final

Antes de marcar como template:

1. `pnpm install`
2. `pnpm prisma:generate`
3. `pnpm build`
4. `pnpm exec jest --runInBand`
5. `pnpm test:e2e`
6. Revisar README e docs
7. Confirmar rotas em `/docs/swagger`
8. Confirmar Redoc em `/docs`
