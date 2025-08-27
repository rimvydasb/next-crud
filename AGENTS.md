# AGENTS.md

## Project Overview
- Stack: Next.js + TypeScript, Kysely ORM, Node 22+, PostgreSQL target (unit tests also run on SQLite).
- Goal: Production-grade CRUD with tests. Prefer readable variable and function names.

## Build & Run
- Install: `npm ci`
- Dev: `npm run dev`
- Build / Typecheck: `npm run build`
- Lint: `npm run lint`
- Test (unit): `npm test`
- Test (postgres): `npm run test:pg`
- Start: `npm start`

> Always run **build + lint + unit tests** before proposing a PR.

## Conventions
- Language: TypeScript.
- Formatting: Prettier + ESLint using repo config.
- Naming: snake_case in SQL; camelCase in TS; avoid single-letter identifiers or variables.
- Commits: start with `feature:` or `bugfix:`.

## Database
- PostgreSQL: use JSONB; maintain SQLite compatibility—avoid PG-only features unless guarded.
- SQL should run on both PostgreSQL and SQLite; add dialect checks if required.

## Repo Structure
- `src/datalayer/**`: database API.
- `src/datalayer/_tests_/**`: database API tests.
- `src/servicelayer/**`: Next.js REST API.
- `src/servicelayer/_tests_/**`: Next.js REST API tests.

## Security
- Never commit secrets; use `.env.example`.

## Tasks the Agent Should Prefer
- Add missing tests and fix lint or type errors.
- Refactor for clarity without changing public APIs.
- Use 4 spaces indent, line length is 120 columns.

## Tips for Agents
- Use `rg` for code search to avoid slow recursive scans.
- Place new tests in `_tests_` folders and name them `*.test.ts`.
- Update `.env.example` whenever new environment variables are introduced.

