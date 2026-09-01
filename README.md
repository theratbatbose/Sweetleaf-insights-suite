# Sweetleaf Suite (down )

A qualitative research workspace for making sense of interviews, observations, and emerging themes.

[![Open app](https://img.shields.io/badge/Open-App-27493f?style=for-the-badge)](https://theratbatbose.github.io/Sweetleaf-insights-suite/)

Sweetleaf Suite helps qualitative researchers move from raw interview evidence to clear themes, participant cuts, and research narratives without losing context. It is designed for the messy middle of research work: capturing what was noticed, connecting observations, comparing patterns across segments, and turning evidence into a credible topline.

## Why researchers use it

- Review participant evidence in one place
- Log observations as they emerge from transcripts or recordings
- Group related moments into clusters
- Compare patterns across participant cuts
- Build a narrative story from synthesized insights
- Keep the work grounded in direct evidence rather than abstract summaries

## What the tool includes

- Observation capture with transcript-linked evidence
- Participant and cut views
- Cluster inference canvas for organizing meaning
- Relationship mapping between observations and clusters
- Cut-level summaries and recurring themes
- Topline writer for turning synthesis into a clear narrative

## Who this is for

This is especially useful for:

- Qualitative researchers
- UX researchers and insights teams
- Brand and consumer researchers
- Research operations and synthesis leads
- Anyone working with interviews, diaries, or field notes

## Open the app

Use the live app here:

https://theratbatbose.github.io/Sweetleaf-insights-suite/

## Run locally

If you want to run the project on your own machine in VS Code:

1. Install Node.js 18+
2. Open this folder in VS Code
3. Open the terminal
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

The build output is generated in the `dist/` folder.

## Prototype status

This is a frontend-first prototype built for research workflow exploration. The current version uses realistic in-browser mock data to simulate how a researcher might work through interviews, synthesis, and narrative writing.

The architecture is organized around:

- Projects
- Cuts
- Participants
- Recordings
- Transcripts
- Observations
- Clusters
- Relationships
- Topline blocks

This foundation is ready to evolve into a fuller tool with real transcription, local data storage, and AI-assisted synthesis.

## Recommended next steps

Future enhancements could include:

- Local-first persistence with SQLite or IndexedDB
- Transcription and auto-tagging
- OpenAI or local-model support for synthesis assistance
- Exporting findings to slide decks or research reports
- Team collaboration and shared research boards

## Deploy

This frontend is configured for GitHub Pages and can also be deployed to other static hosting providers such as Netlify, Vercel, or Cloudflare Pages.
