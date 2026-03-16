# Progress Log
Started: Mon, Mar 16, 2026 12:11:31 AM

## Codebase Patterns
- (add reusable patterns here)

---

## [2026-03-16 12:50:03 -03:00] - US-010: Exportar o import como JSON estruturado
Thread: 
Run: 20260316-102951-949 (iteration 8)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-8.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-8.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: c35ff45 feat(imports): export structured import JSON
- Post-commit status: clean
- Verification:
  - Command: `pnpm test -- --runInBand imports.service.spec.ts` -> PASS
  - Command: `pnpm test:e2e -- --runInBand imports.e2e-spec.ts` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `pnpm lint` -> PASS
  - Command: `pnpm build` -> PASS
  - Command: `pnpm test` -> PASS
  - Command: `pnpm test:e2e` -> PASS
- Files changed:
  - src/modules/imports/entities/import-export.entity.ts
  - src/modules/imports/imports.controller.ts
  - src/modules/imports/imports.service.ts
  - src/modules/imports/imports.service.spec.ts
  - test/imports.e2e-spec.ts
  - .ralph/progress.md
- What was implemented
  - Added `GET /api/v1/imports/:importId/export` with Swagger metadata and a structured JSON payload containing `import`, `decks`, `notes`, `cards`, and `media`.
  - Reused persisted Prisma records for export assembly, including named note fields, media references, deck/card linkage, and public media URLs without rebuilding data from the uploaded archive.
  - Added deterministic `409 Conflict` handling when export is requested for `PROCESSING` or `FAILED` imports, including the current status and failure reason when available.
  - Added unit and e2e coverage for successful export, missing import `404`, and unfinished import conflict responses.
- **Learnings for future iterations:**
  - Patterns discovered: the existing import entities were reusable enough to build a full export payload with one small aggregate wrapper entity instead of introducing a second mapping layer.
  - Gotchas encountered: the worktree already contained loop-managed PRD status updates and the previous iteration summary, so the operational follow-up commit must absorb those artifacts to restore a clean tree.
  - Useful context: deriving deck note/card counts from the fetched export graph avoids extra aggregate queries while keeping the export route scoped to persisted database state.
---
## [2026-03-16 12:34:54 -03:00] - US-009: Expor consulta de notas, cards e midias
Thread:
Run: 20260316-102951-949 (iteration 7)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-7.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-7.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: e3c9fdb feat(imports): expose note card and media queries
- Post-commit status: `clean`
- Verification:
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm lint` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm build` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test:e2e` -> PASS
- Files changed:
  - .agents/tasks/prd-anki-extractor.json
  - .ralph/progress.md
  - .ralph/runs/run-20260316-102951-949-iter-6.md
  - src/modules/imports/cards.controller.ts
  - src/modules/imports/dto/list-import-cards-query.dto.ts
  - src/modules/imports/dto/list-import-media-query.dto.ts
  - src/modules/imports/dto/list-import-notes-query.dto.ts
  - src/modules/imports/entities/card.entity.ts
  - src/modules/imports/entities/media.entity.ts
  - src/modules/imports/entities/note.entity.ts
  - src/modules/imports/entities/paginated-cards.entity.ts
  - src/modules/imports/entities/paginated-media.entity.ts
  - src/modules/imports/entities/paginated-notes.entity.ts
  - src/modules/imports/entities/shared-content.entity.ts
  - src/modules/imports/imports.controller.ts
  - src/modules/imports/imports.module.ts
  - src/modules/imports/imports.service.spec.ts
  - src/modules/imports/imports.service.ts
  - src/modules/imports/media.controller.ts
  - src/modules/imports/notes.controller.ts
  - src/modules/imports/schemas/import-query.schema.ts
  - test/imports.e2e-spec.ts
- What was implemented
  - Added authenticated list/detail endpoints for notes, cards, and media, including `GET /api/v1/imports/:importId/notes`, `GET /api/v1/notes/:id`, `GET /api/v1/imports/:importId/cards`, `GET /api/v1/cards/:id`, `GET /api/v1/imports/:importId/media`, `GET /api/v1/media/:id`, and `GET /api/v1/media/:id/info`.
  - Added pagination and filters for `deckId`, comma-separated `tags`, and `type`, plus stable ordering for incremental browsing of imported records.
  - Documented the new contracts in Swagger with response examples on entities and explicit 404 examples for import, note, card, media metadata, and missing media binaries.
  - Added safe media streaming that resolves files from the configured media root without exposing internal filesystem paths when the binary is missing.
  - Expanded unit and e2e coverage for list/detail behavior, filter scenarios, streamed media responses, and the removed-media 404 path.
- **Learnings for future iterations:**
  - Patterns discovered
    - Import-scoped browsing endpoints fit cleanly into the existing `ImportsService` when detail routes stay in dedicated resource controllers.
    - Prisma `jsonb` field key order is not reliable for presentation; tests should not assume persisted object order unless the service explicitly imposes one.
  - Gotchas encountered
    - Ordering list endpoints by `createdAt` and UUID produces unstable pagination inside a single import; natural Anki identifiers or ordinals are safer defaults.
    - Binary e2e assertions in Supertest need an explicit parser to preserve the raw `Buffer`.
  - Useful context
    - The negative media case is covered by deleting the stored file under `MEDIA_STORAGE_DIR/<importId>/...` and asserting the API still returns a standardized 404 payload without path leakage.
---

## [2026-03-16 12:04:41 -03:00] - US-008: Expor consulta de imports e decks
Thread: 
Run: 20260316-102951-949 (iteration 6)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-6.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-6.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: `f44cf2b feat(imports): expose import and deck queries`
- Post-commit status: `clean`
- Verification:
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `pnpm lint` -> PASS
  - Command: `pnpm build` -> PASS
  - Command: `pnpm test` -> PASS
  - Command: `pnpm test:e2e` -> PASS
- Files changed:
  - .agents/tasks/prd-anki-extractor.json
  - .ralph/progress.md
  - .ralph/runs/run-20260316-102951-949-iter-5.md
  - src/modules/imports/decks.controller.ts
  - src/modules/imports/entities/deck.entity.ts
  - src/modules/imports/entities/import-details.entity.ts
  - src/modules/imports/entities/paginated-decks.entity.ts
  - src/modules/imports/entities/paginated-imports.entity.ts
  - src/modules/imports/imports.controller.ts
  - src/modules/imports/imports.module.ts
  - src/modules/imports/imports.service.spec.ts
  - src/modules/imports/imports.service.ts
  - src/modules/imports/schemas/import-query.schema.ts
  - test/imports.e2e-spec.ts
- What was implemented
  - Added authenticated `GET /api/v1/imports`, `GET /api/v1/imports/:id`, `DELETE /api/v1/imports/:id`, `GET /api/v1/imports/:importId/decks`, and `GET /api/v1/decks/:id` endpoints with Swagger response contracts for audit-focused metadata and aggregate counts.
  - Introduced paginated import and deck response entities, including import status, file size, failure reason, and deck note/card counts computed from persisted records.
  - Finalized successful imports as `COMPLETED` once persistence succeeds, keeping the upload response contract intact while making follow-up inspection endpoints reflect the real terminal state.
  - Removed local import workspace and media directories during import deletion and relied on Prisma cascade deletes to clear related database rows.
  - Expanded unit and e2e coverage for import/deck listing, detail lookup, 404 behavior, and deletion cleanup.
- **Learnings for future iterations:**
  - Patterns discovered
    - Reusing the project’s paginated entity shape keeps new collection endpoints aligned with existing `items/page/limit/totalItems/totalPages` responses.
  - Gotchas encountered
    - The import pipeline had been leaving successful records in `PROCESSING`; inspection endpoints depend on flipping that persisted status to `COMPLETED` at the transaction boundary.
  - Useful context
    - Deck note counts are best derived with a distinct `card.groupBy` on `deckId` + `noteId`, which avoids per-deck query loops in list endpoints.
---

## [2026-03-16 11:45:00 -03:00] - US-007: Processar mapa de midias e storage local
Thread: 
Run: 20260316-102951-949 (iteration 5)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-5.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-5.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: `b76a015 feat(imports): persist mapped media files`
- Post-commit status: `clean`
- Verification:
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `pnpm lint` -> PASS
  - Command: `pnpm build` -> PASS
  - Command: `pnpm test` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test:e2e` -> PASS
- Files changed:
  - .agents/tasks/prd-anki-extractor.json
  - .ralph/progress.md
  - .ralph/runs/run-20260316-102951-949-iter-4.md
  - src/modules/imports/anki-package.service.ts
  - src/modules/imports/imports.service.spec.ts
  - src/modules/imports/imports.service.ts
  - test/imports.e2e-spec.ts
- What was implemented
  - Added media-map parsing to resolve Anki numeric indexes into original file names, detect MIME types with `mime-types`, and classify persisted media as `IMAGE`, `AUDIO`, `VIDEO`, or `OTHER`.
  - Copied extracted media files into the configurable local `MEDIA_STORAGE_DIR`, stored deterministic relative `storageUrl` values, and persisted `MediaFile` rows with `mediaCount` updates on the parent import.
  - Applied deterministic handling for mapped indexes whose binaries are missing from the package: the import logs a warning, skips the absent media record, and continues without crashing.
  - Expanded unit and e2e coverage to validate happy-path media persistence plus the missing-binary negative case.
- **Learnings for future iterations:**
  - Patterns discovered
    - Keeping media storage URLs relative to the configured media root avoids leaking absolute filesystem paths while still giving future API endpoints a stable lookup key.
  - Gotchas encountered
    - `eslint` rejects control-character regexes in filename sanitizers on this codebase, so character-by-character sanitization is the safer approach.
  - Useful context
    - The Anki `media` file is optional and only maps numeric archive entries to original names; deterministic imports should persist only files that physically exist in the package.
---
## [2026-03-16 11:30:41 -03:00] - US-006: Persistir cards e contagens do import
Thread: 
Run: 20260316-102951-949 (iteration 4)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-4.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-4.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: `b430394 feat(imports): persist import cards`
- Post-commit status: `clean`
- Verification:
  - Command: `pnpm test -- imports.service.spec.ts --runInBand` -> PASS
  - Command: `pnpm test:e2e -- imports.e2e-spec.ts --runInBand` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `pnpm lint` -> PASS
  - Command: `pnpm build` -> PASS
  - Command: `pnpm test` -> PASS
  - Command: `pnpm test:e2e` -> PASS
- Files changed:
  - .agents/tasks/prd-anki-extractor.json
  - .ralph/progress.md
  - .ralph/runs/run-20260316-102951-949-iter-3.md
  - src/modules/imports/anki-package.service.ts
  - src/modules/imports/imports.service.spec.ts
  - src/modules/imports/imports.service.ts
  - test/imports.e2e-spec.ts
- What was implemented
  - Added card parsing from SQLite `cards`, preserving `ankiCardId`, `ordinal`, `type`, `queue`, `due`, `ivl`, `factor`, `reps`, and `lapses` without introducing spaced-repetition behavior.
  - Persisted cards inside the import transaction by resolving `Deck` and `Note` through their original Anki IDs, and updated `Import.cardsCount` alongside the existing aggregate counts.
  - Covered the reverse-card example with two cards sharing the same note and deck, plus explicit failure paths for cards that reference missing notes or decks.
- **Learnings for future iterations:**
  - Patterns discovered
    - Import child entities should continue resolving persisted relation IDs from the original Anki identifiers inside the same transaction to keep rollback semantics simple.
  - Gotchas encountered
    - Nested Jest matchers on Prisma relation payloads can trip `@typescript-eslint/no-unsafe-assignment`; direct property assertions avoid that lint failure cleanly.
  - Useful context
    - Switching from `readPreparedImportNotes` to `readPreparedImportSource` is enough to extend the existing pipeline to cards because the Anki package service already exposes ordered raw `cards` rows.
---

## [2026-03-16 11:16:46 -03:00] - US-005: Parsear notas com campos nomeados e tags
Thread: 
Run: 20260316-102951-949 (iteration 3)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-3.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-3.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: `0f43de2 feat(imports): parse named note fields`
- Post-commit status: `clean`
- Verification:
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test -- imports.service.spec.ts` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test:e2e -- imports.e2e-spec.ts` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm lint` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm build` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test:e2e` -> PASS
- Files changed:
  - .agents/tasks/prd-anki-extractor.json
  - .ralph/progress.md
  - .ralph/runs/run-20260316-102951-949-iter-2.md
  - src/modules/imports/anki-package.service.ts
  - src/modules/imports/imports.service.spec.ts
  - src/modules/imports/imports.service.ts
  - test/imports.e2e-spec.ts
- What was implemented
  - Added note parsing from SQLite `notes`, splitting `flds` by `\u001f`, mapping values to the corresponding `NoteModel` field names, and preserving the original HTML/Anki field content.
  - Persisted parsed notes with tag arrays and per-field media references for `<img src>` and `[sound:arquivo.ext]`, while keeping note insertion inside the import transaction.
  - Added explicit import failure when a note references a missing note model and covered the happy path plus failure path in unit and e2e tests.
- **Learnings for future iterations:**
  - Patterns discovered
    - Ordering note fields by the model field ordinal is the deterministic way to map raw `flds` values to named keys.
  - Gotchas encountered
    - Prisma relation matchers in Jest e2e assertions can trigger `@typescript-eslint/no-unsafe-assignment` when nested directly inside object literals.
  - Useful context
    - Parsing notes before opening the write transaction keeps invalid `mid` references from creating partial note rows while still marking the import as `FAILED`.
---

## [2026-03-16 11:04:16 -03:00] - US-004: Persistir decks e modelos de nota
Thread: 
Run: 20260316-102951-949 (iteration 2)
Run log: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-2.log
Run summary: D:/DEVJUANMARCOS/PROJETOS/KIKITO/anki-extractor-api/.ralph/runs/run-20260316-102951-949-iter-2.md
- Guardrails reviewed: yes
- No-commit run: false
- Commit: `21fbc7b feat(imports): persist decks and note models`
- Post-commit status: `clean`
- Verification:
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:generate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm prisma:migrate` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm lint` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm build` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test` -> PASS
  - Command: `$env:DATABASE_URL='postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public'; pnpm test:e2e` -> PASS
- Files changed:
  - src/modules/imports/anki-package.service.ts
  - src/modules/imports/imports.service.ts
  - src/modules/imports/imports.service.spec.ts
  - test/imports.e2e-spec.ts
  - .ralph/progress.md
- What was implemented
  - Extended the import pipeline to parse `col.models` and `col.decks`, preserving original Anki identifiers for `NoteModel` and `Deck`.
  - Persisted note model field names and card template metadata as JSON, keeping hierarchical deck names like `English::Vocabulary::Advanced` unchanged.
  - Added a collection-only read path plus transactional persistence so invalid `col.models` or `col.decks` JSON fails the import without leaving partial deck or note model rows.
  - Covered the success path and both invalid-JSON failure paths with unit and e2e tests.
- **Learnings for future iterations:**
  - Patterns discovered
    - `col.models` and `col.decks` are keyed by Anki IDs, so parsing the whole payload before any insert is the cleanest way to keep relational writes atomic.
    - `createMany` handles the current PostgreSQL JSON columns correctly for note model field/template payloads.
  - Gotchas encountered
    - Loading the full notes/cards tables during `US-004` would be unnecessary overhead, so a collection-only read path keeps this step bounded to the metadata needed now.
    - The imports e2e suite benefits from a per-file timeout override because Nest bootstrap plus PostgreSQL can occasionally exceed Jest's 5-second default on this Windows setup.
  - Useful context
    - Keeping the import status as `PROCESSING` after deck/model persistence preserves the existing contract while leaving later stories room to continue the pipeline with notes and cards.
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
