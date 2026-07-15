# test-report

Generated: 2026-07-08

## 実行した検証

- `pnpm exec tsc --noEmit`
  - Result: PASS
- `pnpm run build`
  - Result: PASS
  - Output: `vite build` and `esbuild server.ts` completed.
- `GET /api/research-resources/summary`
  - Result: PASS
  - Counts: fields 606, societies 1,697, journals 1,648, graphEdges 37,182
- `GET /api/discovery-cards?sessionId=verify5&batch=16&q=言語`
  - Result: PASS
  - Returned 16 cards.
  - Kinds were interleaved as question, lab, field, society, journal.
- `GET /api/question-project?sessionId=verify5`
  - Result: PASS
  - Returned 3 routes.
  - Initial state fallback returned 8 candidate labs.
  - Each route included field, society, journal, and candidate lab connections.

## 確認した主要要件

- Existing routes are preserved: `/labs`, `/discover`, `/saved`, `/profile`, `/labs/:id`.
- Navigation copy is updated to `さがす / であう / ためる / 問い / 研究室の方へ`.
- Excel source files are copied under `data/source`.
- Normalized research resources are available under `data/normalized`.
- Search and discovery now use labs plus research fields, societies, and journals.
- The `であう` deck returns mixed card types: question, lab, field, society, journal.
- The `問い` page returns routes that connect a user question to fields, methods, labs, societies, journals, carry-in ideas, and next checks.
- Lab detail pages show related research fields, societies, and journals as candidate connections.

## Known Gaps

- Society/journal to lab links are candidate-level only because the source data does not contain verified direct lab affiliations.
- Paper cards are not generated because no reliable paper dataset was provided.
- Folder and marking data remain in existing browser localStorage; server-side persistence migration is not included in this update.
- External URL save does not auto-summarize content; this is intentionally avoided until an explicit ingestion and citation design is added.
