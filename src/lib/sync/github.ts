// A GitHub repository as the place notes are synced to, through the Git Data API: one request lists every file with its
// hash, and a whole sync becomes a single commit.

export interface RemoteFile { sha: string; size: number }

export interface Change {
  path: string
  /** New contents, or null to delete the file. */
  data: Uint8Array | null
}

export interface Remote {
  list(): Promise<Map<string, RemoteFile>>
  /** Contents of a file or of any blob that is in the repository's history. */
  blob(sha: string): Promise<Uint8Array>
  /** Commits all changes at once. Throws RemoteMovedError when someone else committed in the meantime. */
  commit(changes: Change[], message: string): Promise<void>
}

export class RemoteMovedError extends Error {
  constructor() { super('The repository changed while syncing') }
}

export class SyncAuthError extends Error {}

export interface GitHubConfig {
  /** "owner/name" */
  repo: string
  branch: string
  token: string
  /** Optional folder inside the repository that holds the notes. */
  subdir?: string
}

/** The hash git gives a file's contents, so local files can be compared with the repository without downloading it. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const all = new Uint8Array(head.length + bytes.length)
  all.set(head)
  all.set(bytes, head.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all))
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export class GitHubRemote implements Remote {
  private head: { commit: string; tree: string } | null = null
  private readonly prefix: string

  constructor(private readonly cfg: GitHubConfig, private readonly fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    const sub = (cfg.subdir ?? '').trim().replace(/^\/+|\/+$/g, '')
    this.prefix = sub ? `${sub}/` : ''
  }

  private async api<T = any>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<{ status: number; json: T }> {
    const res = await this.fetchImpl(`https://api.github.com/repos/${this.cfg.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    let json: any = null
    try { json = await res.json() } catch { /* empty body */ }
    if (res.ok || okStatuses.includes(res.status)) return { status: res.status, json }
    const msg = json?.message ? String(json.message) : `HTTP ${res.status}`
    if (res.status === 401) throw new SyncAuthError('GitHub did not accept the token. Check that it is correct and has not expired.')
    if (res.status === 403 && /rate limit/i.test(msg)) throw new Error('GitHub is limiting requests right now. Try again in a few minutes.')
    if (res.status === 403) throw new SyncAuthError(`GitHub refused access: ${msg}. The token needs read and write access to the repository’s contents.`)
    if (res.status === 404) throw new SyncAuthError(`Could not find “${this.cfg.repo}”. Check the name, and that the token can see this repository.`)
    throw new Error(`GitHub said: ${msg}`)
  }

  /** Checks the token and repository, and that the token can write. */
  async check(): Promise<{ private: boolean; canPush: boolean; defaultBranch: string }> {
    const { json } = await this.api('GET', '')
    return { private: !!json.private, canPush: !!json.permissions?.push, defaultBranch: json.default_branch ?? 'main' }
  }

  private async resolveHead(): Promise<{ commit: string; tree: string } | null> {
    const ref = await this.api('GET', `/git/ref/heads/${encodeURIComponent(this.cfg.branch).replace(/%2F/g, '/')}`, undefined, [404, 409])
    if (ref.status === 404 || ref.status === 409) return null
    const commit = ref.json.object.sha as string
    const c = await this.api('GET', `/git/commits/${commit}`)
    return { commit, tree: c.json.tree.sha }
  }

  /** Creates the branch (and, in an empty repository, the first commit) so there is something to build on. */
  private async initialise(): Promise<void> {
    const repo = await this.api('GET', '')
    const def = repo.json.default_branch as string
    const defRef = await this.api('GET', `/git/ref/heads/${def}`, undefined, [404, 409])
    if (defRef.status === 200 && def !== this.cfg.branch) {
      await this.api('POST', '/git/refs', { ref: `refs/heads/${this.cfg.branch}`, sha: defRef.json.object.sha })
      return
    }
    // Empty repository: the contents API is the one call that can make a first commit.
    await this.api('PUT', `/contents/${this.prefix}.omnia-sync`, {
      message: 'Start Omnia sync',
      content: toBase64(new TextEncoder().encode('Synced by Omnia: https://mkdogs25.github.io/omnia/\n')),
      branch: this.cfg.branch
    })
  }

  async list(): Promise<Map<string, RemoteFile>> {
    let head = await this.resolveHead()
    if (!head) {
      await this.initialise()
      head = await this.resolveHead()
      if (!head) throw new Error(`Could not set up the branch “${this.cfg.branch}”.`)
    }
    this.head = head
    const { json } = await this.api('GET', `/git/trees/${head.tree}?recursive=1`)
    if (json.truncated) throw new Error('This repository has too many files to sync with Omnia.')
    const out = new Map<string, RemoteFile>()
    for (const e of json.tree as { path: string; type: string; sha: string; size?: number }[]) {
      if (e.type !== 'blob' || !e.path.startsWith(this.prefix)) continue
      out.set(e.path.slice(this.prefix.length), { sha: e.sha, size: e.size ?? 0 })
    }
    return out
  }

  async blob(sha: string): Promise<Uint8Array> {
    const { json } = await this.api('GET', `/git/blobs/${sha}`)
    return fromBase64(json.content)
  }

  async commit(changes: Change[], message: string): Promise<void> {
    if (!changes.length) return
    if (!this.head) throw new Error('list() must run before commit()')
    // Upload contents first (a few at a time), then one tree, one commit, one ref update.
    const entries: { path: string; mode: string; type: string; sha: string | null }[] = []
    const queue = changes.filter(c => c.data !== null)
    for (const c of changes) if (c.data === null) entries.push({ path: this.prefix + c.path, mode: '100644', type: 'blob', sha: null })
    let next = 0
    const worker = async () => {
      for (;;) {
        const c = queue[next++]
        if (!c) return
        const { json } = await this.api('POST', '/git/blobs', { content: toBase64(c.data!), encoding: 'base64' })
        entries.push({ path: this.prefix + c.path, mode: '100644', type: 'blob', sha: json.sha })
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
    const tree = await this.api('POST', '/git/trees', { base_tree: this.head.tree, tree: entries })
    const commit = await this.api('POST', '/git/commits', { message, tree: tree.json.sha, parents: [this.head.commit] })
    const upd = await this.api('PATCH', `/git/refs/heads/${this.cfg.branch}`, { sha: commit.json.sha }, [422])
    if (upd.status === 422) throw new RemoteMovedError()
    this.head = { commit: commit.json.sha, tree: tree.json.sha }
  }
}
