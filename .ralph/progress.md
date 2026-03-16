# Progress Log
Started: Mon, Mar 16, 2026 12:11:31 AM

## Codebase Patterns
- (add reusable patterns here)

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
