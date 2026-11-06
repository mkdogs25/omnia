// A tiny in-memory imitation of the parts of the GitHub API that sync uses, for tests. Not shipped in the app.

import { gitBlobSha } from './github'

interface Commit { sha: string; tree: string; parents: string[] }

export class FakeGitHub {
  blobs = new Map<string, Uint8Array>()
  commits = new Map<string, Commit>()
  trees = new Map<string, Map<string, { sha: string; size: number }>>()
  refs = new Map<string, string>()
  private n = 0
  empty: boolean
  calls: string[] = []

  constructor(opts: { empty?: boolean; private?: boolean; defaultBranch?: string } = {}) {
    this.empty = opts.empty ?? false
    this.isPrivate = opts.private ?? true
    this.defaultBranch = opts.defaultBranch ?? 'main'
    if (!this.empty) this.seed()
  }
  isPrivate: boolean
  defaultBranch: string

  private id(prefix: string) { return prefix + String(++this.n).padStart(8, '0').padEnd(40, 'a').slice(0, 40 - prefix.length) }

  private seed() {
    const tree = this.id('t')
    this.trees.set(tree, new Map())
    const commit = this.id('c')
    this.commits.set(commit, { sha: commit, tree, parents: [] })
    this.refs.set(`heads/${this.defaultBranch}`, commit)
  }

  /** Files on a branch, for assertions. */
  async files(branch = this.defaultBranch): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const ref = this.refs.get(`heads/${branch}`)
    if (!ref) return out
    for (const [path, f] of this.trees.get(this.commits.get(ref)!.tree)!) out.set(path, new TextDecoder().decode(this.blobs.get(f.sha)!))
    return out
  }

  /** Puts files straight into the repository, as if pushed from another computer. */
  async put(files: Record<string, string>, branch = this.defaultBranch) {
    const ref = this.refs.get(`heads/${branch}`)
    const tree = new Map(ref ? this.trees.get(this.commits.get(ref)!.tree)! : [])
    for (const [path, text] of Object.entries(files)) {
      const bytes = new TextEncoder().encode(text)
      const sha = await gitBlobSha(bytes)
      this.blobs.set(sha, bytes)
      tree.set(path, { sha, size: bytes.length })
    }
    const t = this.id('t'); this.trees.set(t, tree)
    const c = this.id('c'); this.commits.set(c, { sha: c, tree: t, parents: ref ? [ref] : [] })
    this.refs.set(`heads/${branch}`, c)
    this.empty = false
  }

  /** Handles one request. */
  async handle(method: string, url: string, body: any, token = 'ok'): Promise<{ status: number; json: any }> {
    const u = new URL(url)
    const path = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '')
    this.calls.push(`${method} ${path}`)
    if (token === 'bad') return { status: 401, json: { message: 'Bad credentials' } }
    const ok = (json: any, status = 200) => ({ status, json })
    const notFound = () => ({ status: 404, json: { message: 'Not Found' } })

    if (method === 'GET' && path === '') return ok({ private: this.isPrivate, default_branch: this.defaultBranch, permissions: { push: true } })

    let m: RegExpMatchArray | null
    if (method === 'GET' && (m = path.match(/^\/git\/ref\/(.+)$/))) {
      const sha = this.refs.get(m[1])
      return sha ? ok({ object: { sha } }) : this.empty ? { status: 409, json: { message: 'Git Repository is empty.' } } : notFound()
    }
    if (method === 'GET' && (m = path.match(/^\/git\/commits\/(.+)$/))) {
      const c = this.commits.get(m[1]); return c ? ok({ sha: c.sha, tree: { sha: c.tree } }) : notFound()
    }
    if (method === 'GET' && (m = path.match(/^\/git\/trees\/(.+)$/))) {
      const t = this.trees.get(m[1]); if (!t) return notFound()
      return ok({ truncated: false, tree: [...t].map(([p, f]) => ({ path: p, type: 'blob', sha: f.sha, size: f.size })) })
    }
    if (method === 'GET' && (m = path.match(/^\/git\/blobs\/(.+)$/))) {
      const b = this.blobs.get(m[1]); if (!b) return notFound()
      let s = ''; for (const x of b) s += String.fromCharCode(x)
      return ok({ content: btoa(s), encoding: 'base64' })
    }
    if (method === 'POST' && path === '/git/blobs') {
      const bin = atob(body.content); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const sha = await gitBlobSha(bytes); this.blobs.set(sha, bytes); return ok({ sha }, 201)
    }
    if (method === 'POST' && path === '/git/trees') {
      const base = new Map(this.trees.get(body.base_tree) ?? [])
      for (const e of body.tree as { path: string; sha: string | null }[]) {
        if (e.sha === null) { if (!base.delete(e.path)) return { status: 422, json: { message: 'GitRPC::BadObjectState' } } }
        else base.set(e.path, { sha: e.sha, size: this.blobs.get(e.sha)!.length })
      }
      const t = this.id('t'); this.trees.set(t, base); return ok({ sha: t }, 201)
    }
    if (method === 'POST' && path === '/git/commits') {
      const c = this.id('c'); this.commits.set(c, { sha: c, tree: body.tree, parents: body.parents }); return ok({ sha: c }, 201)
    }
    if (method === 'PATCH' && (m = path.match(/^\/git\/refs\/(.+)$/))) {
      const cur = this.refs.get(m[1]); const next = this.commits.get(body.sha)
      if (!cur || !next) return notFound()
      if (!next.parents.includes(cur)) return { status: 422, json: { message: 'Update is not a fast forward' } }
      this.refs.set(m[1], body.sha); return ok({})
    }
    if (method === 'POST' && path === '/git/refs') {
      this.refs.set(String(body.ref).replace(/^refs\//, ''), body.sha); return ok({}, 201)
    }
    if (method === 'PUT' && (m = path.match(/^\/contents\/(.+)$/))) {
      const bin = atob(body.content)
      await this.put({ [m[1]]: bin }, body.branch ?? this.defaultBranch)
      return ok({}, 201)
    }
    return { status: 404, json: { message: `Unhandled ${method} ${path}` } }
  }

  /** A fetch that talks to this fake. */
  fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? ''
    const r = await this.handle(init?.method ?? 'GET', String(input), init?.body ? JSON.parse(String(init.body)) : undefined, auth.includes('bad') ? 'bad' : 'ok')
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}
