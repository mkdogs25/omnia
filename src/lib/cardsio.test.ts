import { describe, expect, it } from 'vitest'
import { extractCards } from './cards'
import { detectSeparator, parseDelimited, parseImport, toAnki, toCSV, toMarkdown, toRows } from './cardsio'

const cards = extractCards('Unit of force :: newton\n\nThe {{c1::photon}} and the {{c2::gluon}} are bosons.\n\nWhy, exactly? :: Because "reasons"', 'Physics.md')

describe('export', () => {
  it('lists each sentence once and quotes awkward text', () => {
    const rows = toRows(cards)
    expect(rows).toHaveLength(3)
    const csv = toCSV(rows)
    expect(csv.split('\n')[0]).toBe('Front,Back,Type,Note')
    expect(csv).toContain('Unit of force,newton,basic,Physics.md')
    expect(csv).toContain('"Why, exactly?","Because ""reasons""",basic,Physics.md')
  })
  it('makes Anki-readable text for basic cards', () => {
    expect(toAnki(toRows(cards))).toBe('Unit of force\tnewton\nWhy, exactly?\tBecause "reasons"\n')
  })
})

describe('import', () => {
  it('reads CSV with a header, quotes and multi-line fields', () => {
    const out = parseImport('Front,Back\n"Say ""hi"", then","line one\nline two"\nPlain,card\n')
    expect(out).toEqual([{ front: 'Say "hi", then', back: 'line one\nline two', cloze: false }, { front: 'Plain', back: 'card', cloze: false }])
  })
  it('reads tab-separated text without a header', () => {
    expect(parseImport('hola\thello\nadios\tbye\n')).toHaveLength(2)
    expect(detectSeparator('a\tb')).toBe('\t')
    expect(detectSeparator('a;b;c')).toBe(';')
  })
  it('keeps cloze sentences and skips half-empty rows', () => {
    const out = parseImport('Front,Back\nThe {{c1::sun}} is a star,\nlonely,\n,orphan\n')
    expect(out).toEqual([{ front: 'The {{c1::sun}} is a star', back: '', cloze: true }])
  })
  it('reads JSON in a few shapes', () => {
    expect(parseImport('[{"front":"a","back":"b"},{"question":"c","answer":"d"}]', 'x.json')).toHaveLength(2)
    expect(parseImport('{"cards":[{"front":"a","back":"b"}]}')).toHaveLength(1)
    expect(() => parseImport('{"nope":1}')).toThrow()
  })
  it('handles Windows line endings and a BOM', () => {
    expect(parseImport('﻿Front,Back\r\na,b\r\nc,d\r\n')).toHaveLength(2)
  })
  it('round-trips through Markdown into real cards', () => {
    const md = toMarkdown([{ front: 'Q1', back: 'A1', cloze: false }, { front: 'Q2', back: 'long\nanswer', cloze: false }, { front: 'The {{c1::x}} is here', back: '', cloze: true }], 'Imported')
    const back = extractCards(md, 'Imported.md')
    expect(back).toHaveLength(3)
    expect(back[1].back).toBe('long\nanswer')
  })
  it('splits quoted fields containing the delimiter', () => {
    expect(parseDelimited('a,"b,c",d\n', ',')).toEqual([['a', 'b,c', 'd']])
  })
})
