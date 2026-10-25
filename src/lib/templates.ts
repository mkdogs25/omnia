// Note templates: a few built in for studying, plus any note kept in the Templates folder.

import { today, WEEKDAYS, fromISO } from './dates'

export interface Template {
  id: string
  name: string
  description: string
  body: string
  builtin: boolean
  /** Path of the note a custom template comes from. */
  path?: string
}

export interface TemplateVars { title: string; date?: string; time?: string }

/** Replaces {{title}}, {{date}}, {{time}} and {{weekday}}. Unknown placeholders are left alone. */
export function applyTemplate(body: string, vars: TemplateVars): string {
  const date = vars.date ?? today()
  const time = vars.time ?? new Date().toTimeString().slice(0, 5)
  return body.replace(/\{\{\s*(title|date|time|weekday)\s*\}\}/gi, (_m, k: string) => {
    switch (k.toLowerCase()) {
      case 'title': return vars.title
      case 'date': return date
      case 'time': return time
      default: return WEEKDAYS[fromISO(date).getDay()]
    }
  })
}

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'blank', name: 'Blank note', description: 'Just a title.', builtin: true,
    body: '# {{title}}\n\n'
  },
  {
    id: 'lecture', name: 'Lecture notes', description: 'Subject, key points, questions and actions.', builtin: true,
    body: `---
subject:
topic: {{title}}
status: draft
difficulty:
date: {{date}}
---
# {{title}}

## Key points

- 

## Notes



## Questions to ask

- 

## To do

- [ ] 

## Flashcards

`
  },
  {
    id: 'cornell', name: 'Cornell notes', description: 'Cues, notes and a summary, the classic study layout.', builtin: true,
    body: `---
subject:
topic: {{title}}
status: draft
date: {{date}}
---
# {{title}}

## Cues and questions

- 

## Notes



## Summary

> In two or three sentences: what is the main idea?

`
  },
  {
    id: 'book', name: 'Book notes', description: 'Summary, key ideas, quotes and reflections.', builtin: true,
    body: `---
subject:
source: {{title}}
status: reading
---
# {{title}}

## Summary



## Key ideas

- 

## Quotes

> 

## What I think

## Flashcards

`
  },
  {
    id: 'research', name: 'Research log', description: 'Question, method, observations, results, next steps.', builtin: true,
    body: `---
subject:
topic: {{title}}
status: in progress
date: {{date}}
---
# {{title}}

## Question

## Method

## Observations

- {{date}} {{time}} 

## Results

## Next steps

- [ ] 
`
  },
  {
    id: 'meeting', name: 'Meeting notes', description: 'Attendees, decisions and action items.', builtin: true,
    body: `# {{title}}

**Date:** {{date}} ({{weekday}})  
**With:** 

## Agenda

- 

## Notes

## Decisions

- 

## Action items

- [ ] 
`
  },
  {
    id: 'weekly', name: 'Weekly review', description: 'What went well, what to fix, plans for next week.', builtin: true,
    body: `# Week of {{date}}

## What went well

- 

## What was hard

- 

## Questions I still can't answer

- 

## Plan for next week

- [ ] 
`
  }
]

/** Templates kept as ordinary notes inside `folder`. */
export function userTemplates(notes: Iterable<{ path: string; text: string }>, folder: string): Template[] {
  const prefix = folder.replace(/\/+$/, '') + '/'
  const out: Template[] = []
  for (const n of notes) {
    if (!n.path.startsWith(prefix)) continue
    const name = n.path.slice(prefix.length).replace(/\.md$/i, '')
    const first = n.text.split('\n').find(l => l.trim() && !/^(---|#)/.test(l.trim()))
    out.push({ id: `user:${n.path}`, name, description: first ? first.trim().slice(0, 80) : 'Your own template', body: n.text, builtin: false, path: n.path })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
