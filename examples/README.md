# Example study: Tea-time snacking (fictional)

Practice files for trying Sweetleaf end to end. Everything here is invented; it is not real research.

| File | Use it in |
|---|---|
| `01 Brief - Tea-time snacking.docx` | Setup → Brief |
| `02 Screener.docx` | Setup → Screener (segments are in a table) |
| `03 Discussion guide.docx` | Setup → Discussion guide (heading styles, numbered questions, bulleted probes, italic moderator notes) |
| `04 Recruitment list.xlsx` | Setup → Participants → Import recruitment list |
| `transcripts/` | Sessions → Bulk import (select all four) |

The four transcripts use different vendor layouts on purpose:
- **R01:** a Word table (Time | Speaker | Dialogue), in Hinglish
- **R02:** Word, with the speaker on its own line and no timestamps
- **R03:** PDF, with `[time] Speaker: text`
- **R04:** a Windows "Unicode" text file, in Tamil–English

`source/R03.html` is what the PDF was printed from. Regenerate everything with `node scripts/make-examples.mjs`.
