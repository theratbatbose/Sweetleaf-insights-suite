# Sweetleaf Suite

A local-first qualitative research workbench prototype built with React + Vite + TypeScript.

## Run locally in VS Code

1. Install Node.js 18+.
2. Open this folder in VS Code.
3. Open the integrated terminal.
4. Run:

```bash
npm install
npm run dev
```

5. Open the local URL Vite prints, usually:

```text
http://localhost:5173
```

## Production build

```bash
npm run build
```

The production build is generated in `dist/`.

## Deploy

This frontend can be deployed directly to Netlify, Vercel, Cloudflare Pages, or any static host.

## Prototype notes

This v0.1 is intentionally a frontend-first product prototype. The observation timeline, transcript selection, cut reports, spatial inference canvas, clustering, relationships, and Topline composition are implemented with local mock data so the core product loop can be tested before wiring in real media/model services.


This version intentionally uses realistic in-browser mock data.

The architecture separates the concepts for:

- Projects
- Cuts
- Participants
- Recordings
- Transcripts
- Observations
- Clusters
- Relationships
- Topline blocks

The next implementation step would be replacing the mock data layer with SQLite/IndexedDB and connecting local transcription/model services (for example Whisper/Ollama) through a desktop shell such as Tauri.
