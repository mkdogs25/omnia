# Omnia

Notes, tasks, a calendar and spaced-repetition study tools over a plain folder of Markdown files.
It runs entirely in the browser: no account, no server, nothing uploaded.

**Live site:** https://mkdogs25.github.io/omnia/ (once deployed, see below)

Works in desktop **Chrome, Edge, Brave, Arc and Opera**. Choosing a folder uses the File System Access API,
which Firefox and Safari don't offer.

## What's in it

| Area | Highlights |
| --- | --- |
| **Home** | A dashboard for the day: tasks and overdue items, deadlines, flashcards ready, notes to revise, today's events, recent notes and focus time. Quick-add a task from the top bar. Choose and reorder the cards in Settings |
| **Notes** | Live-preview Markdown editor (syntax hides away from the cursor), `[[wiki links]]` with autocomplete and rename-safe links, backlinks, outline, `#tags`, full-text search, tabs, back/forward, bookmarks, daily notes, KaTeX maths, pasted images, reading view, breadcrumbs, focus mode (Alt+F). **Templates** (lecture, Cornell, book, research log, meeting, weekly review, and any note in your `Templates` folder), a **properties** editor (subject, topic, status, difficulty, your own), **version history** with diffs and restore, a **trash** you can restore from, and a **knowledge graph** |
| **Search everything** | Ctrl+O searches note and document names, headings, flashcards, quiz questions, tasks and events together, and `#tag` lists tags. With nothing typed it shows what you opened recently |
| **Tasks** | Today, Upcoming (grouped by week and day), Deadlines, Unplanned, Recurring and Done. Natural quick-add: `Daily Notes every tuesday`, `Essay by friday`, `Lab report tomorrow, deadline 31 oct`. Separate **do-on** and **deadline** dates, subtasks, repeats, times, reminders, bulk reschedule of overdue tasks, linked notes |
| **Notifications** | A daily summary (overdue, due today, deadlines coming up) plus reminders for tasks and events, with snooze and quiet hours, shown in the app and as desktop notifications. See *Notifications* below for what browsers allow |
| **Calendar** | Month and week views showing tasks, deadlines, events, daily notes, due flashcards and note revisions. Drag tasks between days. Events with times, colours, repeats and reminders |
| **Study sidebar** | Opens from any note. **Cards**: make flashcards inside the note. **Quiz**: build quizzes, or generate them from flashcards. **Revise**: a spaced-repetition schedule for the note itself. **Auto-generate** suggests cards and questions from the note (see below) |
| **Study page** | *Overview* (cards due, forecast, maturity, heatmap, streak, decks, **import and export** of cards as CSV, Anki text or JSON), *Error log* (every wrong answer, with practice sessions and CSV export) and *Insights* (weekly summary, accuracy trend, accuracy per note, focus time) |
| **Timed exams** | Quizzes have an exam mode: a countdown, no feedback until the end, unanswered questions count as wrong |
| **Reader** | Read **PDF** and **Word (.docx)** files beside a notes pane. Select text to **highlight** it (four colours, with comments), **bookmark** pages, or *Quote to notes* with a link back to the page (`[[Book.pdf#page=12\|p. 12]]`). Page navigation, zoom, contents, search, dark pages. Drop files onto the file list to add them |
| **OCR** | PDFs with no selectable text are detected. *Run OCR* reads the pages in your browser, adds a selectable, searchable text layer, lets you correct uncertain words, and can **download a searchable PDF** (the original pages are untouched; the words are added as invisible text) |
| **Pomodoro timer** | Focus and break timer in the ribbon (Alt+P), configurable lengths, long break every few sessions, chime and notification, countdown in the tab title, optional task tracking |
| **Quick capture** | Alt+Q from anywhere: a task, a thought for your Inbox note, or a flashcard |
| **Settings** | Light and dark palettes, accent colour (with a contrast check), heading, body and code fonts (or your own), text size, line spacing, density, reduced motion, high contrast, panel widths and sides, which tools appear in the side bar and in what order, which Home cards show, week start, notification times, study limits, OCR language, rebindable keyboard shortcuts, and export/import of settings |

### Auto-generated flashcards and quizzes (no AI)

Auto-generate looks for patterns people really use in study notes and proposes cards and questions you can edit,
tick or skip before anything is written to the note:

- **Definitions**: `**Term**: meaning`, `**Term** is …`, `Term – meaning`, `X is defined as Y`, `X is called Y`
- **Highlights**: a sentence with `**bold**` or `==highlighted==` words becomes a cloze (the words are hidden)
- **Figures**: `The speed of light is 3 × 10^8 m/s` hides the number, and quiz questions get believable wrong answers in the same format
- **Lists**: a list under a heading, or after a line ending in `:`, becomes a "list them all" card
- **Headings**: a short heading followed by a paragraph becomes *heading → first sentence*

It is rule-based, so it is predictable and works offline, but it only knows these patterns. Suggestions it is less sure
about are marked *check* and start unticked. Questions it makes are plain `quiz` blocks, so they stay in your note.

### Flashcards and quizzes are plain Markdown

```markdown
Unit of force :: newton            one-way card
Unit of power ::: watt             two-way card

What is the speed of light?        multi-line card
?
3 x 10^8 m/s

The {{c1::photon}} carries the {{c2::electromagnetic}} force     cloze deletions

```quiz
Which of these is a vector?
- Speed
+ Velocity
- Mass
> Velocity has direction as well as magnitude.

Name the carrier of the strong force.
= gluon
```
```

Review uses an SM-2 style scheduler with learning steps (Again / Hard / Good / Easy). Cards are identified
by their front text, so moving a card between notes or editing its answer keeps its history.

### Where your data lives

Everything is inside the folder you choose:

```
your-folder/
  *.md                notes, exactly as you wrote them
  *.pdf  *.docx       documents you want to read (never modified)
  .omnia/
    tasks.json        tasks
    events.json       calendar events
    study.json        review history, note revision schedule, quiz scores
    settings.json     appearance, layout, shortcuts, recent notes and the rest of your settings
    mistakes.json     the error log
    history/          version history of your notes
    ocr/              text recognised from scanned PDFs
    annotations/      PDF highlights, comments and bookmarks
    trash.json        where deleted notes came from, so they can be restored
  .trash/             deleted notes (nothing is erased for good; restore them from the Trash)
```

The folder works with other Markdown tools (Obsidian, Tangent, VS Code) at the same time. Omnia re-reads
the folder when the window regains focus, so outside edits appear.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (dates, recurrence, quick-add, cards, quiz, scheduling, auto-generation, OCR, history, graph, …)
npm run check    # type check
npm run build    # static site in dist/
```

Stack: Vite, Svelte 5, TypeScript and CodeMirror 6, with KaTeX for maths, PDF.js for PDFs and mammoth for Word files (both loaded only when you open a document), and Tesseract (tesseract.js) with pdf-lib for OCR (loaded only when you run it). No backend, no database.

`npm run dev` and `npm run build` first copy the OCR engine and English language data from `node_modules` into `public/ocr/` (about 15 MB, git-ignored), so OCR works offline on the deployed site. Other OCR languages download from a CDN the first time they are used.

## Limits worth knowing

- **Notifications only fire while Omnia is open** in a browser tab or window (a pinned or minimised tab is fine). A website cannot wake a closed browser. Reminders that fell due while it was closed appear when you next open it, up to 12 hours late. Chrome also needs you to allow notifications once.
- **Chromium desktop only** (Chrome, Edge, Brave, Arc, Opera), because of the File System Access API.
- **OCR accuracy** depends on the scan. Searchable-PDF export writes Latin-alphabet text only (English, French, German, Spanish and the like); other scripts can be recognised and searched inside Omnia but are left out of the exported file. Rotated pages are left as they were.
- **Auto-generation** is rule-based (see above), not AI, so it will miss ideas that do not follow those patterns.
- Version history keeps a snapshot about every ten minutes while you write (up to 40 per note).

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds the site and publishes it to the `gh-pages` branch whenever `main` is updated.

1. In the repository, open **Settings → Pages**.
2. Set **Source** to **Deploy from a branch**, then choose branch **gh-pages** and folder **/ (root)**. This is a one-off step.
3. The site appears at `https://<user>.github.io/omnia/`.

The build uses a relative base path, so it works at any URL.

## Credits

- Note-taking approach inspired by [Tangent](https://github.com/suchnsuch/Tangent) (Apache-2.0) and Obsidian:
  `[[wiki links]]`, styled-as-you-write Markdown, backlinks. Tangent itself is an Electron desktop app whose
  editor lives in separate repositories, so Omnia is a fresh, lighter implementation rather than a fork.
- Headings use **Libron** by Nico Verbruggen (SIL OFL 1.1), built from the
  [sources](https://github.com/nicoverbruggen/libron). Body text uses **Inter** (SIL OFL 1.1).
- Editor: [CodeMirror 6](https://codemirror.net). Maths: [KaTeX](https://katex.org). PDFs: [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0). Word files: [mammoth](https://github.com/mwilliamson/mammoth.js) (BSD-2-Clause), sanitised with [DOMPurify](https://github.com/cure53/DOMPurify). OCR: [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) with English data from [@tesseract.js-data](https://github.com/naptha/tessdata) (Apache-2.0), and searchable PDFs are written with [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT).
