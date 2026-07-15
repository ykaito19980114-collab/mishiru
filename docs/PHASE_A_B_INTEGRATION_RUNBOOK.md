# MISHIRU Phase A/B Integration Runbook

Updated: 2026-07-12

## Canonical application

`/Users/a38/Documents/Codex/2026-07-12/mishiru-3-1-labo-ikitai-chatgpt/work/inspection/labo-handoff/labo-ikitai-chatgpt-handoff-20260711/app`

Phase A source: `/Users/a38/Documents/Codex/2026-07-06/n/work/labo-ikitai`

## Start

```bash
cd /Users/a38/Documents/Codex/2026-07-12/mishiru-3-1-labo-ikitai-chatgpt/work/inspection/labo-handoff/labo-ikitai-chatgpt-handoff-20260711/app
pnpm install
pnpm run lint
pnpm run build
PORT=3002 NODE_ENV=production pnpm start
```

Preview: `http://localhost:3002/search`

For sample data, use a separate process and port:

```bash
PORT=3003 NODE_ENV=development MISHIRU_DATASET=sample pnpm start
```

Do not run the sample and default datasets against the same runtime file. `MISHIRU_DATASET=sample` selects the `.sample.json` repositories.

## Environment

- `PORT`: server port. The integrated preview uses `3002`.
- `MISHIRU_DATASET`: unset for default data, `sample` for the sample boundary.
- `GEMINI_API_KEY`: optional. Without it, question crafting, enrichment, and interest analysis use disclosed deterministic fallbacks.
- `MISHIRU_INTEREST_DAILY_LIMIT`: production daily interest-analysis limit. Default is one successful run per session/day.
- `MISHIRU_AI_UNLIMITED=1`: development-only override for interest-analysis usage.
- Existing mail/admin environment variables remain supported by the canonical server.

## Runtime data

- Projects: `data/runtime/research-projects.json`
- Sample projects: `data/runtime/research-projects.sample.json`
- Consultation assets: `data/runtime/consultation-exports.json`
- Sample consultation assets: `data/runtime/consultation-exports.sample.json`
- Interest analyses: `data/runtime/interest-analyses.json`
- Sample interest analyses: `data/runtime/interest-analyses.sample.json`
- Generated files: `data/runtime/exports/{dataset}/`
- Uploaded covers: `data/runtime/uploads/projects/{dataset}/{session}/{project}/`

Repositories write JSON through a temporary file and atomic rename. A corrupt existing JSON file raises `RUNTIME_JSON_CORRUPT` and is not replaced with empty data.

## Backups and recovery

Pre-merge backup:

`/Users/a38/Documents/Codex/2026-07-12/mishiru-3-1-labo-ikitai-chatgpt/work/backups/mishiru-before-phase-a-merge-20260712-220500`

Phase A source backup:

`/Users/a38/Documents/Codex/2026-07-12/mishiru-3-1-labo-ikitai-chatgpt/work/backups/phase-a-source-20260712-220500`

Resume snapshot:

`/Users/a38/Documents/Codex/2026-07-12/mishiru-3-1-labo-ikitai-chatgpt/work/backups/mishiru-partial-merge-resume-20260712-230500`

Recovery procedure:

1. Stop only the process whose current working directory is the canonical application.
2. Copy the current canonical directory to a new incident snapshot.
3. Restore only the required files from the selected backup; do not delete runtime data blindly.
4. Run `pnpm install`, `pnpm run lint`, and `pnpm run build`.
5. Start on an unused port and verify `/api/health` before switching the preview.

## Verification record

- `pnpm run lint`: passed.
- `pnpm run build`: passed.
- `pnpm run test:phase-b`: passed for question steps, Project/session boundary, PDF, PPTX 1/2/3, outdated, interest analysis, rate limit, and evidence snapshots.
- `BASE=http://localhost:3002 pnpm run test:acceptance`: 53 passed, 0 failed.
- Project repository tests: 12 passed before final acceptance.
- PDF: A4, four pages in the current sample, embedded `HiraginoSans-W3`, no blank pages.
- PPTX: one-, two-, and three-slide outputs generated; three-slide overflow test passed.
- Responsive check: `/search`, `/questions`, `/projects`, and `/reflect` at 390, 768, and 1280 px with no horizontal overflow.
- Default/sample isolation: sample health reports `mishiru-sample` and cannot read a default-session Project.
- Error paths: invalid export format 400, invalid image type 400, image over 5 MB 413, corrupt JSON preserved.

## Port ownership at completion

- `3001`: pre-existing application; not stopped or modified by the final verification.
- `3002`: this canonical integrated MISHIRU application.
- `3003`: temporary sample verification server; stopped after the test.

The exact process and working directory should always be checked with `lsof` before stopping a server.
