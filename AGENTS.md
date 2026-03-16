# Operational Notes

- Local database setup for this repo uses PostgreSQL on `localhost:5432` without Docker.
- Use `postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public` as the default `DATABASE_URL`.
- Create the `anki_extractor_local` database manually before running `pnpm prisma:migrate`.
- Verification commands for build runs are: `pnpm prisma:generate`, `pnpm prisma:migrate`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm test:e2e`.
