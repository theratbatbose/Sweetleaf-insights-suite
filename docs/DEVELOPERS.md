# Sweetleaf Suite: developer notes

Sweetleaf is a local web app. A small Node.js server (Express) listens only on `127.0.0.1:4317`, stores everything as files on disk, and serves a React UI.

## Commands

```bash
npm install
npm run dev      # API on :4317 (tsx watch) + Vite on :5173 with /api proxied
npm test         # unit tests (parsers, file matching, quote verification, AI error handling)
npm run build    # typecheck, build UI to dist/, bundle server to build/server.mjs
npm start        # serve the built app on :4317
npm run launch   # what the double-click launchers run: install/build if needed, then start
```

Environment variables:
- `PORT` (default 4317)
- `SWEETLEAF_DATA_DIR` (default `~/SweetleafData`)
- `SWEETLEAF_OPEN=1` opens the browser on start (the launchers set this)
- `FFMPEG_PATH` overrides the bundled ffmpeg

## Layout

- `server/index.ts`: routes, localhost-only protections (Host header check; `x-sweetleaf` header required on writes)
- `server/storage.ts`: studies as `studies/<id>/study.json`, transcripts as separate files, atomic writes
- `server/documents.ts`: Word (via mammoth HTML), PDF (unpdf), Excel (exceljs) and text extraction
- `server/ai.ts`: providers (Anthropic, OpenAI, Gemini, OpenRouter, Ollama, OpenAI-compatible), retries and plain-language errors
- `server/analysis.ts`: prompts for guide structuring, grid filling (with quote verification), syntheses, clusters, topline
- `server/transcribe.ts`: ffmpeg audio extraction, 10-minute chunks, background jobs
- `server/exports.ts`: Excel grid and Word topline
- `server/sample.ts`: the preloaded demo study (fictional)
- `shared/`: data model and parsers used by both sides
- `src/`: React UI; one view per workflow step in `src/views/`
- `scripts/launch.mjs`: one-click launcher logic
- `scripts/make-examples.mjs`: regenerates `examples/`
- `tests/mock-provider.mjs`: a fake OpenAI-compatible chat and transcription server for testing without keys. Point the "Other OpenAI-compatible" provider at `http://127.0.0.1:4500/v1`.

## Data model

See `shared/types.ts`. Times are in seconds; `null` means an untimed transcript line. Grid cells are `grid[participantId][questionId]` with `status` set to `ai`, `reviewed` or `manual`. AI never overwrites a cell whose status isn't `ai`.

## CI

`.github/workflows/ci.yml` runs tests, builds and smoke-tests the server on Windows, macOS and Ubuntu.
