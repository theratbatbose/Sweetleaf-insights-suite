# Sweetleaf Suite

A local-first workbench for qualitative research: from brief, screener and discussion guide to recordings, transcripts, an analysis grid, segment views, synthesis and the topline. It runs on your own computer. There's no login, no cloud account, and nothing is uploaded unless you choose to use an AI service.

```
Setup  →  Sessions  →  Analysis grid  →  Segments  →  Inference  →  Topline
brief,    recordings,   respondent ×      cut-wise      cluster        write &
screener, transcripts,  question matrix   synthesis     insights       export
guide,    notes         (Excel export)                                 (Word)
people
```

## Install and start (Windows, macOS, Linux)

1. Install **Node.js 20 LTS or newer** from <https://nodejs.org> (one time).
2. Download this project (green **Code** button → **Download ZIP**) and unzip it somewhere permanent, e.g. `Documents\Sweetleaf`.
3. Start it:
   - **Windows:** double-click **`Start Sweetleaf.bat`**
   - **macOS:** double-click **`start-sweetleaf.command`** (first time: right-click → Open, because it isn't from the App Store)
   - **Linux:** run `./start-sweetleaf.sh`

The first start installs and prepares the app, which takes a few minutes and needs internet. After that it starts in seconds and works offline (apart from any AI services you connect). Your browser opens at <http://localhost:4317>. Keep the black window open while you work, and close it to stop Sweetleaf.

Use **Google Chrome or Microsoft Edge**. They play MP4 interview recordings; some other browsers don't.

## First run: connect your own AI

On first start, Sweetleaf asks you to connect an AI provider. You bring your own account and pay that provider directly:

| Option | What you need | Data leaves this PC? |
|---|---|---|
| Anthropic (Claude) | API key from console.anthropic.com | Yes, the text of each AI action |
| OpenAI (GPT) | API key from platform.openai.com | Yes |
| Google Gemini | API key from aistudio.google.com | Yes |
| OpenRouter | One key for many models | Yes |
| **Ollama** | Ollama installed on this PC plus a downloaded model | **No** |
| Other OpenAI-compatible | LM Studio, vLLM, Groq, a company gateway | Depends on the server |

Consumer chat subscriptions (ChatGPT Plus, Claude Pro/Max) are **not** API access. Anthropic explicitly forbids using Claude subscription logins in third-party apps, so Sweetleaf uses API keys or local models. You can skip AI entirely, and every step works manually.

**Transcription** (optional) is set up separately: OpenAI (labels speakers), Groq Whisper (fast and cheap), or any local Whisper server with an OpenAI-compatible API. Sweetleaf extracts the audio with a bundled ffmpeg and sends it in 10-minute parts. If your transcripts come from a vendor, import them instead. Word (.docx), TXT, SRT, VTT and CSV are supported, with or without timestamps and speaker labels.

## The workflow

1. **Setup**
   - Upload or paste the brief. AI can fill in client, objectives, methodology and markets.
   - Add the screener. AI detects the segments (cuts), or you add them by hand.
   - Add the discussion guide. Structure it with AI or the built-in parser; each question becomes a row in the grid.
   - Add participants by hand, or import your recruitment sheet as CSV.
2. **Sessions:** for each participant, add the recording (it is copied into the study folder) and import or auto-transcribe the transcript.
   - Click a line to jump the video there. The current line highlights while it plays.
   - Select text, or use the note button on a line, to log an observation with a code and its guide question.
   - Shortcuts: Alt+K play/pause, Alt+J / Alt+L back/forward 5 s, Alt+N new note.
3. **Analysis grid:** respondents as columns (grouped by segment), guide questions as rows, plus an "Across respondents" column.
   - AI can draft every empty cell (summary plus verbatim quotes with timestamps and English translations).
   - **Every AI quote is checked against the transcript**; quotes that can't be found are flagged in amber, including in the Excel export.
   - AI never overwrites a cell you have written or reviewed.
   - Export to Excel.
4. **Segments:** a cumulative view per cut: recurring themes, differences, contradictions, areas to explore and key excerpts. Draft with AI from the grid, or write it yourself.
5. **Inference:** your notes become cards on a canvas.
   - Drag them, lasso-select, cluster and connect them, or ask AI to suggest clusters.
   - Filter by segment.
6. **Topline:** write the story, drop clusters in as research blocks, or have AI draft from your synthesis. Export to Word or Markdown.

## Where your data lives

Everything is in **`SweetleafData`** in your home folder (for example `C:\Users\you\SweetleafData`):

```
SweetleafData/
  settings.json            AI settings and API keys (readable only by your user)
  studies/<study>/
    study.json             setup, grid, notes, clusters, topline
    transcripts/*.json
    media/*                copies of your recordings
```

- To back up everything, including recordings, copy that folder.
- To move one study to another PC, use **Topline → Study backup (.json)**, then **Import backup** there (recordings aren't included).
- To store data elsewhere, set the environment variable `SWEETLEAF_DATA_DIR` before starting.

The server only listens on `127.0.0.1` (this computer) and refuses requests from other websites.

**Privacy:** when you click an AI action, the text it needs (e.g. one transcript) goes to the provider you connected, under your account and their data terms. Recordings are never sent to the AI model; only audio goes to the transcription service if you use one. Check that this fits your client agreements and consent forms, or use Ollama to keep everything on the machine.

## For developers

```bash
npm install
npm run dev      # API on :4317 (tsx watch) + Vite on :5173 with /api proxied
npm test         # unit tests (parsers, quote verification, merging)
npm run build    # typecheck, build UI to dist/, bundle server to build/server.mjs
npm start        # serve the built app on :4317
```

- `server/`: Express API, file storage, AI providers (`ai.ts`), analysis prompts (`analysis.ts`), transcription jobs (`transcribe.ts`), Excel/Word export.
- `shared/`: data model and parsers used by both sides.
- `src/`: React UI; one view per workflow step in `src/views/`.
- `tests/mock-provider.mjs`: a fake OpenAI-compatible chat and transcription server for testing without API keys. Point the "Other OpenAI-compatible" provider at `http://127.0.0.1:4500/v1`.

## Known limitations

- Speaker labels from automatic transcription can change between the 10-minute parts of a long recording. Use **Speakers** in the transcript panel to rename them.
- Very long transcripts are processed in parts. Small local models (Ollama) may give weaker grid drafts than large hosted models.
- PDF and old `.doc` files aren't read directly. Save them as `.docx` or paste the text.
- Single user per computer. There is no real-time team collaboration.
