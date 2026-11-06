import { describe, expect, it } from 'vitest'
import { mergeDataFile, mergeJson, mergeText } from './merge'
import { isSyncable, planSync } from './plan'

const fp = (o: Record<string, string>) => new Map(Object.entries(o))
const kinds = (b: Record<string, string>, l: Record<string, string>, r: Record<string, string>) =>
  Object.fromEntries(planSync(fp(b), fp(l), fp(r)).actions.map(a => [a.path, a.kind]))

describe('planSync', () => {
  it('carries one-sided changes across', () => {
    expect(kinds({ a: '1', b: '1', c: '1' }, { a: '2', b: '1', c: '1' }, { a: '1', b: '3', c: '1' })).toEqual({ a: 'upload', b: 'download' })
  })
  it('new files go where they are missing', () => {
    expect(kinds({}, { n: 'x' }, { m: 'y' })).toEqual({ n: 'upload', m: 'download' })
  })
  it('deletes follow untouched files, and edits beat deletes', () => {
    expect(kinds({ a: '1', b: '1' }, {}, { a: '1', b: '2' })).toEqual({ a: 'delete-remote', b: 'download' })
    expect(kinds({ a: '1', b: '1' }, { a: '1', b: '2' }, {})).toEqual({ a: 'delete-local', b: 'upload' })
  })
  it('identical changes are not conflicts', () => {
    const p = planSync(fp({ a: '1' }), fp({ a: '2' }), fp({ a: '2' }))
    expect(p.actions).toEqual([])
    expect(p.settled.get('a')).toBe('2')
  })
  it('both sides changed means merge; a first sync with different files does too', () => {
    expect(kinds({ a: '1' }, { a: '2' }, { a: '3' })).toEqual({ a: 'merge' })
    expect(kinds({}, { a: '2' }, { a: '3' })).toEqual({ a: 'merge' })
  })
  it('nothing to do when nothing changed', () => {
    expect(planSync(fp({ a: '1' }), fp({ a: '1' }), fp({ a: '1' })).actions).toEqual([])
  })
})

describe('isSyncable', () => {
  it('syncs notes, documents and the data that should follow you', () => {
    for (const p of ['Note.md', 'Folder/Sub/Note.md', 'Book.pdf', 'img/pic.png', '.omnia/tasks.json', '.omnia/study.json', '.omnia/annotations/x.json']) expect(isSyncable(p), p).toBe(true)
  })
  it('keeps device-only files on the device', () => {
    for (const p of ['.omnia/settings.json', '.omnia/sync.json', '.omnia/history/a.json', '.omnia/ocr/x.json', '.omnia/trash.json', '.trash/old.md', '.obsidian/app.json', '.git/HEAD', '.omnia/tasks.json.broken-123', '.DS_Store', '.omnia-sync', 'node_modules/x.md']) expect(isSyncable(p), p).toBe(false)
  })
})

describe('mergeJson', () => {
  const task = (id: string, extra: object = {}) => ({ id, title: id, done: false, ...extra })

  it('merges tasks by id: additions from both sides, edits to different tasks, edits to the same task', () => {
    const base = [task('a'), task('b')]
    const local = [task('a', { done: true }), task('b'), task('c')]
    const remote = [task('a'), task('b', { title: 'B!' }), task('d')]
    const out = mergeJson(base, local, remote) as { id: string; title: string; done: boolean }[]
    expect(out.map(t => t.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.find(t => t.id === 'a')?.done).toBe(true)
    expect(out.find(t => t.id === 'b')?.title).toBe('B!')
  })
  it('merges two edits of one task field by field', () => {
    const out = mergeJson([task('a')], [task('a', { due: '2026-11-10' })], [task('a', { notes: 'hi' })]) as Record<string, unknown>[]
    expect(out[0]).toMatchObject({ due: '2026-11-10', notes: 'hi' })
  })
  it('a delete on one side stands when the other side did not touch it, and loses to an edit', () => {
    expect((mergeJson([task('a'), task('b')], [task('b')], [task('a'), task('b')]) as unknown[]).length).toBe(1)
    expect((mergeJson([task('a')], [], [task('a', { done: true })]) as unknown[]).length).toBe(1)
  })
  it('this device wins when both set the same field', () => {
    const out = mergeJson([task('a')], [task('a', { title: 'mine' })], [task('a', { title: 'theirs' })]) as { title: string }[]
    expect(out[0].title).toBe('mine')
  })
  it('first sync (no base): unions both sides', () => {
    expect((mergeJson(undefined, [task('a')], [task('b')]) as unknown[]).length).toBe(2)
  })
  it('study data: counters add, cards take the changed side, quiz results combine', () => {
    const base = { cards: { c1: { reps: 1 } }, log: { d1: { reviews: 5, correct: 4 } }, focus: { d1: 25 }, quizzes: [{ date: 'd0', total: 5 }] }
    const local = { cards: { c1: { reps: 2 } }, log: { d1: { reviews: 8, correct: 6 } }, focus: { d1: 50 }, quizzes: [{ date: 'd0', total: 5 }, { date: 'd1', total: 3 }] }
    const remote = { cards: { c1: { reps: 1 }, c2: { reps: 1 } }, log: { d1: { reviews: 7, correct: 5 } }, focus: { d1: 25 }, quizzes: [{ date: 'd0', total: 5 }, { date: 'd2', total: 4 }] }
    const out = mergeDataFile('study.json', base, local, remote) as typeof base & { cards: Record<string, unknown> }
    expect(out.log.d1).toEqual({ reviews: 10, correct: 7 }) // 5 + 3 + 2, 4 + 2 + 1
    expect(out.focus.d1).toBe(50)
    expect(out.cards.c1).toEqual({ reps: 2 })
    expect(Object.keys(out.cards)).toEqual(['c1', 'c2'])
    expect(out.quizzes.map(q => q.date).sort()).toEqual(['d0', 'd1', 'd2'])
  })
})

describe('mergeText', () => {
  const base = 'one\ntwo\nthree\nfour\nfive'
  it('combines edits in different places', () => {
    expect(mergeText(base, 'ONE\ntwo\nthree\nfour\nfive', 'one\ntwo\nthree\nfour\nFIVE')).toBe('ONE\ntwo\nthree\nfour\nFIVE')
    expect(mergeText(base, 'one\ntwo\nnew\nthree\nfour\nfive', 'one\ntwo\nthree\nfour\nfive\nsix')).toBe('one\ntwo\nnew\nthree\nfour\nfive\nsix')
  })
  it('gives up when the same lines changed, or neighbouring ones', () => {
    expect(mergeText(base, 'one\nTWO\nthree\nfour\nfive', 'one\n2\nthree\nfour\nfive')).toBeNull()
    expect(mergeText(base, 'one\nTWO\nthree\nfour\nfive', 'one\ntwo\nTHREE\nfour\nfive')).toBeNull()
  })
  it('handles deletes and one-sided edits', () => {
    expect(mergeText(base, 'one\nthree\nfour\nfive', 'one\ntwo\nthree\nfour\nFIVE')).toBe('one\nthree\nfour\nFIVE')
    expect(mergeText(base, base, 'x')).toBe('x')
    expect(mergeText(base, 'x', base)).toBe('x')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// The whole engine against an imitation of GitHub

import { runSync, emptyState, type LocalIO, type SyncState } from './engine'
import { FakeGitHub } from './fake-github'
import { GitHubRemote } from './github'

class MemoryDisk implements LocalIO {
  files = new Map<string, { data: Uint8Array; mtime: number }>()
  private clock = 1000
  constructor(init: Record<string, string> = {}) { for (const [p, t] of Object.entries(init)) this.set(p, t) }
  set(path: string, text: string) { this.files.set(path, { data: new TextEncoder().encode(text), mtime: ++this.clock }) }
  text(path: string) { const f = this.files.get(path); return f ? new TextDecoder().decode(f.data) : undefined }
  async list() { return [...this.files].map(([path, f]) => ({ path, size: f.data.length, mtime: f.mtime })) }
  async read(path: string) { return this.files.get(path)!.data }
  async write(path: string, data: Uint8Array) { this.files.set(path, { data, mtime: ++this.clock }) }
  async remove(path: string) { this.files.delete(path) }
}

class Device {
  state: SyncState = emptyState()
  constructor(public disk: MemoryDisk, private gh: FakeGitHub, public name: string, private cfg = { subdir: '' }) {}
  async sync() {
    const remote = new GitHubRemote({ repo: 'o/r', branch: 'main', token: 'ok', subdir: this.cfg.subdir }, this.gh.fetch)
    const out = await runSync(this.disk, remote, this.state, { device: this.name, now: new Date(2026, 10, 6, 9, 5) })
    this.state = out.state
    return out.report
  }
}

describe('runSync against GitHub', () => {
  it('first sync of an empty repository uploads everything and ignores device-only files', async () => {
    const gh = new FakeGitHub({ empty: true })
    const phone = new Device(new MemoryDisk({ 'A.md': 'alpha', 'Sub/B.md': 'beta', '.omnia/settings.json': '{}', '.trash/x.md': 'bin', '.omnia/history/h.json': '[]' }), gh, 'phone')
    const r = await phone.sync()
    expect(r.uploaded.sort()).toEqual(['A.md', 'Sub/B.md'])
    const files = await gh.files()
    expect([...files.keys()].sort()).toEqual(['.omnia-sync', 'A.md', 'Sub/B.md'].sort())
    expect(files.get('A.md')).toBe('alpha')
  })

  it('carries edits both ways and settles', async () => {
    const gh = new FakeGitHub({ empty: true })
    const phone = new Device(new MemoryDisk({ 'A.md': 'one' }), gh, 'phone')
    const laptop = new Device(new MemoryDisk(), gh, 'laptop')
    await phone.sync()
    const r1 = await laptop.sync()
    expect(r1.downloaded).toContain('A.md')
    expect(laptop.disk.text('A.md')).toBe('one')

    laptop.disk.set('A.md', 'two'); laptop.disk.set('New.md', 'fresh')
    await laptop.sync()
    const r2 = await phone.sync()
    expect(r2.downloaded.sort()).toEqual(['A.md', 'New.md'])
    expect(phone.disk.text('A.md')).toBe('two')

    const again = await phone.sync()
    expect([again.downloaded, again.uploaded, again.merged].flat()).toEqual([])
    const calls = gh.calls.length
    await phone.sync()
    expect(gh.calls.slice(calls).some(c => c.startsWith('POST'))).toBe(false) // nothing to commit, nothing written
  })

  it('propagates deletes', async () => {
    const gh = new FakeGitHub({ empty: true })
    const a = new Device(new MemoryDisk({ 'A.md': 'x', 'B.md': 'y' }), gh, 'a')
    const b = new Device(new MemoryDisk(), gh, 'b')
    await a.sync(); await b.sync()
    a.disk.files.delete('A.md')
    await a.sync()
    const r = await b.sync()
    expect(r.deletedHere).toEqual(['A.md'])
    expect(b.disk.text('A.md')).toBeUndefined()
    expect(b.disk.text('B.md')).toBe('y')
  })

  it('merges edits to different parts of a note', async () => {
    const gh = new FakeGitHub({ empty: true })
    const a = new Device(new MemoryDisk({ 'N.md': 'l1\nl2\nl3\nl4\nl5' }), gh, 'a')
    const b = new Device(new MemoryDisk(), gh, 'b')
    await a.sync(); await b.sync()
    a.disk.set('N.md', 'L1\nl2\nl3\nl4\nl5'); b.disk.set('N.md', 'l1\nl2\nl3\nl4\nL5')
    await a.sync()
    const r = await b.sync()
    expect(r.merged).toEqual(['N.md'])
    expect(b.disk.text('N.md')).toBe('L1\nl2\nl3\nl4\nL5')
    await a.sync()
    expect(a.disk.text('N.md')).toBe('L1\nl2\nl3\nl4\nL5')
  })

  it('keeps both versions when the same lines were edited', async () => {
    const gh = new FakeGitHub({ empty: true })
    const a = new Device(new MemoryDisk({ 'N.md': 'hello' }), gh, 'laptop')
    const b = new Device(new MemoryDisk(), gh, 'phone')
    await a.sync(); await b.sync()
    a.disk.set('N.md', 'from laptop'); b.disk.set('N.md', 'from phone')
    await a.sync()
    const r = await b.sync()
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0].copy).toBe('N (conflict from phone 2026-11-06 09-05).md')
    expect(b.disk.text('N.md')).toBe('from laptop')
    expect(b.disk.text(r.conflicts[0].copy)).toBe('from phone')
    await a.sync()
    expect(a.disk.text(r.conflicts[0].copy)).toBe('from phone') // the copy reaches the other device too
  })

  it('merges tasks changed on both devices', async () => {
    const gh = new FakeGitHub({ empty: true })
    const tasks = (...t: object[]) => JSON.stringify(t, null, 2)
    const a = new Device(new MemoryDisk({ '.omnia/tasks.json': tasks({ id: '1', title: 'Essay', done: false }) }), gh, 'laptop')
    const b = new Device(new MemoryDisk(), gh, 'phone')
    await a.sync(); await b.sync()
    a.disk.set('.omnia/tasks.json', tasks({ id: '1', title: 'Essay', done: true }, { id: '2', title: 'Laptop task', done: false }))
    b.disk.set('.omnia/tasks.json', tasks({ id: '1', title: 'Essay', done: false, due: '2026-11-10' }, { id: '3', title: 'Phone task', done: false }))
    await a.sync()
    const r = await b.sync()
    expect(r.merged).toEqual(['.omnia/tasks.json'])
    const merged = JSON.parse(b.disk.text('.omnia/tasks.json')!)
    expect(merged.map((t: { id: string }) => t.id).sort()).toEqual(['1', '2', '3'])
    expect(merged.find((t: { id: string }) => t.id === '1')).toMatchObject({ done: true, due: '2026-11-10' })
    await a.sync()
    expect(JSON.parse(a.disk.text('.omnia/tasks.json')!)).toHaveLength(3)
  })

  it('a first sync with different files on each side merges rather than overwrites', async () => {
    const gh = new FakeGitHub({ empty: true })
    await gh.put({ 'Remote.md': 'r', 'Same.md': 'same', 'Both.md': 'remote version' })
    const phone = new Device(new MemoryDisk({ 'Local.md': 'l', 'Same.md': 'same', 'Both.md': 'local version' }), gh, 'phone')
    const r = await phone.sync()
    expect(phone.disk.text('Remote.md')).toBe('r')
    expect((await gh.files()).get('Local.md')).toBe('l')
    expect(r.conflicts).toHaveLength(1) // no base to merge from, so both are kept
    expect(phone.disk.text('Both.md')).toBe('remote version')
  })

  it('works inside a subfolder of the repository', async () => {
    const gh = new FakeGitHub({ empty: true })
    await gh.put({ 'Other/readme.md': 'not mine' })
    const a = new Device(new MemoryDisk({ 'A.md': 'x' }), gh, 'a', { subdir: 'vault' })
    await a.sync()
    const files = await gh.files()
    expect(files.has('vault/A.md')).toBe(true)
    expect(files.get('Other/readme.md')).toBe('not mine')
    const b = new Device(new MemoryDisk(), gh, 'b', { subdir: 'vault' })
    await b.sync()
    expect([...b.disk.files.keys()]).toEqual(['A.md'])
  })

  it('retries once when the repository moved during the sync', async () => {
    const gh = new FakeGitHub({ empty: true })
    const a = new Device(new MemoryDisk({ 'A.md': '1' }), gh, 'a')
    await a.sync()
    a.disk.set('A.md', '2')
    // Someone pushes right when our commit would land.
    let pushed = false
    const original = gh.handle.bind(gh)
    gh.handle = async (m, u, b, t) => {
      if (!pushed && m === 'POST' && u.endsWith('/git/commits')) { pushed = true; await gh.put({ 'Elsewhere.md': 'hi' }) }
      return original(m, u, b, t)
    }
    const r = await a.sync()
    expect(r.uploaded).toEqual(['A.md'])
    const files = await gh.files()
    expect(files.get('A.md')).toBe('2')
    expect(files.get('Elsewhere.md')).toBe('hi')
  })

  it('reports a bad token clearly', async () => {
    const gh = new FakeGitHub({ empty: true })
    const remote = new GitHubRemote({ repo: 'o/r', branch: 'main', token: 'bad' }, gh.fetch)
    await expect(remote.check()).rejects.toThrow(/token/i)
  })
})
