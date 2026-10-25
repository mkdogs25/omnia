# Omnia

Notes, tasks, a calendar and spaced-repetition study tools over a plain folder of Markdown files.
It runs entirely in the browser: no account, no server, nothing uploaded.

**Live site:** https://mkdogs25.github.io/omnia/ (once deployed, see below)

Works in desktop **Chrome, Edge, Brave, Arc and Opera**. Choosing a folder uses the File System Access API,
which Firefox and Safari don't offer.

## What's in it

| Area | Highlights |
| --- | --- |
| **Notes** | Live-preview Markdown editor (syntax hides away from the cursor), `[[wiki links]]` with autocomplete and rename-safe links, backlinks, outline, `#tags`, full-text search (`tag:#x`, `path:y`), tabs, back/forward, bookmarks, daily notes, KaTeX maths, pasted images, reading view, quick switcher (Ctrl+O) and command palette (Ctrl+P) |
| **Tasks** | Today, Upcoming (grouped by week and day), Unplanned, Recurrences and Done tabs. Natural quick-add: `Daily Notes every tuesday`, `Hand in essay 31 oct`. Repeating tasks, notes, times, linked notes |
| **Calendar** | Month and week views showing tasks, events, daily notes, due flashcards and note revisions. Drag tasks between days. Events with times, colours and repeats |
| **Study sidebar** | Opens from any note. **Cards**: make flashcards inside the note. **Quiz**: build quizzes, or generate them from flashcards. **Revise**: a spaced-repetition schedule for the note itself |
| **Study dashboard** | Cards due, 14-day forecast, card maturity, activity heatmap, streak, recall rate, per-note decks |

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
  .omnia/
    tasks.json        tasks
    events.json       calendar events
    study.json        review history, note revision schedule, quiz scores
    settings.json     bookmarks, daily-notes folder, limits
  .trash/             deleted notes (nothing is erased for good)
```

The folder works with other Markdown tools (Obsidian, Tangent, VS Code) at the same time. Omnia re-reads
the folder when the window regains focus, so outside edits appear.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (dates, recurrence, quick-add, cards, quiz, scheduling, parsing)
npm run check    # type check
npm run build    # static site in dist/
```

Stack: Vite, Svelte 5, TypeScript and CodeMirror 6, with KaTeX for maths. No backend, no database.

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
- Editor: [CodeMirror 6](https://codemirror.net). Maths: [KaTeX](https://katex.org).
