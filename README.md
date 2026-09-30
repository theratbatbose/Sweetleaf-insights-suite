# Sweetleaf Suite

A private, browser-based workspace for organizing qualitative interview transcripts, observations, themes, and topline findings.

[![Open app](https://img.shields.io/badge/Open-App-27493f?style=for-the-badge)](https://theratbatbose.github.io/Sweetleaf-insights-suite/)

> **Publishing status:** The public link will work after GitHub Pages is enabled for this repository. Open [Pages settings](https://github.com/theratbatbose/Sweetleaf-insights-suite/settings/pages), select **GitHub Actions** under “Build and deployment,” and save. GitHub currently rejects the deploy workflow because Pages has not been enabled yet.

## Getting started

The app opens with an example study. Use it to explore the workflow, or replace/add participants and bring in your own transcripts.

1. Select **Add participant** in the Participants list and enter a name or pseudonym. City, age, and a participant cut are optional or editable.
2. Open that participant and choose **Import transcript**. Supported formats are TXT, SRT, VTT, and simple timestamped CSV. Timestamped lines work best, for example `00:12 A participant quote` or `00:14:21 A participant quote`.
3. Select a transcript passage to attach it as evidence, enter an observation and optional code, then choose **Log observation**.
4. Open **Inference** to select observations and group them into editable clusters. Drag cards to organize the canvas, or connect related cards.
5. Open **Topline** to edit the narrative, add research blocks, and download a Markdown draft.
6. Open **Settings → Download backup** regularly to keep a portable copy of your work. Use **Restore backup** to bring that JSON file back into the app.

Transcript and observation exports are available in the participant view. Search can navigate to matching participants, observations, and clusters.

## Privacy and saving

Your work is saved automatically in the current browser on the current device. The app does not upload transcripts or notes to a server. Clearing browser data or switching browsers/devices can remove or hide local work, so download a backup before doing so. Imported transcript files are read in the browser and are not retained as uploaded files.

This version does **not** support shared team accounts or synchronized online storage. Do not treat the demo as a substitute for your organization’s approved secure research data system.

## What is a demo, and what is not implemented yet?

The preloaded participants, transcripts, cut summaries, and findings are illustrative sample content—not real research and not AI-generated analysis. The example study has no interview recordings attached, so media playback is not available. This release supports manual transcript review and researcher-led synthesis; it does not currently provide automatic transcription, AI synthesis, team collaboration, or cloud backup.

## Run on your computer

Install Node.js 18 or newer, open this project folder in a terminal, then run:

```bash
npm install
npm run dev
```

Open the local address printed by Vite, usually `http://localhost:5173/`.

To check the production build:

```bash
npm run build
```

## For maintainers

The app is built with React, TypeScript, and Vite. GitHub Actions builds the app and deploys it to GitHub Pages when Pages is enabled for the repository. The Vite base path is configured for the repository URL.
