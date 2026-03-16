# Progress Log
Started: Mon, Mar 16, 2026 12:11:31 AM

## Codebase Patterns
- (add reusable patterns here)

---

## [2026-03-16 10:49:23 -03:00] - US-003: Extrair o arquivo .apkg e localizar fontes internas
Thread: 
Run: 20260316-102951-949 (iteration 1)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-1.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-1.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: `14af679 feat(imports): extract Anki package sources`
- Post-commit status: `clean`
- Verification:
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm lint` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm build` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test:e2e` -> PASS
- Files changed:
  - AGENTS.md
  - package.json
  - src/modules/imports/anki-package.service.ts
  - src/modules/imports/imports.module.ts
  - src/modules/imports/imports.service.ts
  - src/modules/imports/imports.service.spec.ts
  - test/imports.e2e-spec.ts
  - .ralph/progress.md
- What was implemented
  - Added an internal `AnkiPackageService` to unpack `source.apkg` into a deterministic `extracted` workspace, locate `collection.anki2` or `collection.anki21`, find the optional `media` map, and enumerate numeric media files.
  - Opened the embedded SQLite collection with `better-sqlite3` in read-only mode and exposed raw `col`, `notes`, and `cards` data for downstream parsing.
  - Updated `ImportsService` to validate the extracted package immediately after upload, mark the import as `FAILED` with a persisted `failureReason`, and remove the temporary workspace when the collection file is missing or unreadable.
  - Added unit and e2e fixtures with real `.apkg` archives covering the happy path plus controlled failures for missing collection files and unreadable SQLite payloads.
- **Learnings for future iterations:**
  - Patterns discovered
    - Keeping the extracted archive under `<importsTempDir>/<importId>/extracted` gives later stories a stable handoff point without mixing temporary uploads and permanent media storage.
  - Gotchas encountered
    - `pnpm` initially ignored the native build for `better-sqlite3`; adding `pnpm.onlyBuiltDependencies` and running `pnpm rebuild better-sqlite3` fixed the binding for the local Windows setup.
  - Useful context
    - Resolving each ZIP entry against the extraction root prevents path traversal while still letting the importer support both `collection.anki2` and `collection.anki21`.
---

## [2026-03-16 10:24:14 -03:00] - US-002: Preparar dependencias e contrato de upload
Thread: 
Run: 20260316-101127-442 (iteration 1)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-101127-442-iter-1.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-101127-442-iter-1.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: c6e35eb feat(imports): add upload intake contract
- Post-commit status: `.agents/tasks/prd-anki-extractor.json`, `API Anki Extractor — Documentação Técnica.md` (pre-existing unrelated changes remained in the worktree)
- Verification:
  - Command: `pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `pnpm lint` -> PASS
  - Command: `pnpm build` -> PASS
  - Command: `pnpm test` -> PASS
  - Command: `pnpm test:e2e` -> PASS
- Files changed:
  - AGENTS.md
  - package.json
  - pnpm-lock.yaml
  - src/app.module.ts
  - src/config/config.ts
  - src/modules/imports/dto/create-import.dto.ts
  - src/modules/imports/dto/upload-import-file.dto.ts
  - src/modules/imports/entities/import.entity.ts
  - src/modules/imports/imports.controller.ts
  - src/modules/imports/imports.module.ts
  - src/modules/imports/imports.service.spec.ts
  - src/modules/imports/imports.service.ts
  - src/modules/imports/schemas/import.schema.ts
  - test/imports.e2e-spec.ts
  - .ralph/progress.md
- What was implemented
  - Installed the required upload/extraction dependencies and typings with the explicit `pnpm add` commands requested by the story.
  - Added the initial `imports` module in the project pattern `controller -> dto/schema -> service -> prisma -> entity`.
  - Exposed authenticated `POST /api/v1/imports` as `multipart/form-data` with Swagger documentation for the `file` field, `.apkg` requirement, success payload, and 400/401 responses.
  - Validated missing files, empty files, and non-`.apkg` extensions before creating any `Import` record.
  - Persisted an `Import` row with `PROCESSING` status and stored the uploaded archive under a dedicated temporary workspace separate from the permanent media directory.
  - Added unit and e2e coverage for the success case and the three required 400 error paths.
- **Learnings for future iterations:**
  - Patterns discovered: the existing NestJS modules stay very lean, with DTO/schema validation kept close to the controller boundary and entity mapping kept in dedicated response classes.
  - Gotchas encountered: Prisma CLI commands require `DATABASE_URL` in the shell when `.env` is absent, so that note was added to `AGENTS.md`.
  - Useful context: using Multer disk storage plus a deterministic `source.apkg` workspace path avoids buffering uploads in memory and gives US-003 a stable handoff point for extraction.
---

## [2026-03-16 00:25:37 -03:00] - US-001: Modelar banco local para imports do Anki
Thread: 019cf4a1-d319-7c22-8feb-d8e90624e1f6
Run: 20260316-001250-1081 (iteration 1)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-001250-1081-iter-1.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-001250-1081-iter-1.md
- Guardrails reviewed: yes
- No-commit run: true
- Commit: `none` (No-commit run)
- Post-commit status: `.env.example`, `README.md`, `AGENTS.md`, `package.json`, `prisma/migrations/20260316032044_add_anki_import_domain/migration.sql`, `prisma/migrations/migration_lock.toml`, `prisma/schema.prisma`, `src/config/config.ts`, `.ralph/progress.md`, `.ralph/runs/run-20260316-001250-1081-iter-1.md`, `.ralph/activity.log` (git status also reports CRLF-only noise on existing source files in this Windows checkout)
- Verification:
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `$env:PGPASSWORD='2611'; & 'C:/Program Files/PostgreSQL/18/bin/psql.exe' -h localhost -U postgres -d anki_extractor_local -tAc "SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('imports','decks','note_models','notes','cards','media_files');"` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:wrong2611@localhost:5432/anki_extractor_negative?schema=public'; pnpm prisma:migrate` -> PASS (failed as expected with `P1000`)
  - Command: `$env:PGPASSWORD='2611'; & 'C:/Program Files/PostgreSQL/18/bin/psql.exe' -h localhost -U postgres -d anki_extractor_negative -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';"` -> PASS
  - Command: `pnpm lint` -> PASS
  - Command: `pnpm build` -> PASS
  - Command: `pnpm test` -> PASS
  - Command: `pnpm test:e2e` -> PASS
- Files changed:
  - .env.example
  - README.md
  - AGENTS.md
  - package.json
  - prisma/migrations/20260316032044_add_anki_import_domain/migration.sql
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - src/config/config.ts
  - .ralph/progress.md
  - .ralph/runs/run-20260316-001250-1081-iter-1.md
  - .ralph/activity.log
- What was implemented
  - Added Prisma enums and models for `Import`, `Deck`, `NoteModel`, `Note`, `Card`, and `MediaFile`, with cascade relations and composite indexes keyed by `importId` plus original Anki identifiers.
  - Generated the initial Anki domain migration and verified it applies successfully to `postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public`.
  - Updated the local database convention in `.env.example`, `README.md`, `package.json`, and a new operational `AGENTS.md` to use a dedicated local PostgreSQL database without Docker commands.
  - Made `.env` loading optional in `src/config/config.ts` so the existing Jest quality gates can run in a clean checkout without a local `.env` file.
- **Learnings for future iterations:**
  - Patterns discovered
    - Prisma model/table naming in this repo uses snake_case database mappings with Prisma camelCase field names.
    - Composite unique keys on `importId` + original Anki IDs are the right baseline for later extraction joins and deduplication.
  - Gotchas encountered
    - `prisma migrate dev --create-only` auto-created the missing database when valid credentials were provided, so the deterministic negative-path verification had to use an invalid password rather than a missing database.
    - `git status` on this Windows checkout reports many CRLF-only entries; `git diff --ignore-cr-at-eol` is the reliable view of actual content changes.
  - Useful context
    - Local PostgreSQL is reachable on `localhost:5432`, and `C:/Program Files/PostgreSQL/18/bin/psql.exe` is available even though `psql` is not on `PATH`.
---
