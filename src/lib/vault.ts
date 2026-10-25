// A vault is a folder on disk, accessed through the File System Access API (Chromium browsers).
// Notes are plain .md files. App data (tasks, events, review history) lives in <vault>/.omnia/*.json.

export interface FileEntry {
  kind: 'file'
  name: string
  path: string
  mtime: number
  size: number
}

export interface FolderEntry {
  kind: 'folder'
  name: string
  path: string
  children: Entry[]
}

export type Entry = FileEntry | FolderEntry

export const DATA_DIR = '.omnia'
const IGNORED_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash', DATA_DIR])
export const NOTE_EXT = '.md'

export const isNote = (path: string) => path.toLowerCase().endsWith(NOTE_EXT)
/** Documents Omnia can read alongside your notes. */
export const isDoc = (path: string) => /\.(pdf|docx)$/i.test(path)
export const docKind = (path: string): 'pdf' | 'docx' | null => (/\.pdf$/i.test(path) ? 'pdf' : /\.docx$/i.test(path) ? 'docx' : null)
/** The Markdown note that goes with a document, e.g. "Physics.pdf" -> "Physics notes.md". */
export const companionPath = (docPath: string) =>
  joinPath(dirname(docPath), `${basename(docPath).replace(/\.(pdf|docx)$/i, '')} notes.md`)
export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
export const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
export const noteTitle = (path: string) => basename(path).replace(/\.md$/i, '')
export const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/')

export function fsSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return (window as any).showDirectoryPicker({ id: 'omnia-vault', mode: 'readwrite' })
}

export async function ensurePermission(handle: FileSystemDirectoryHandle, request: boolean): Promise<boolean> {
  const h = handle as any
  const opts = { mode: 'readwrite' }
  if ((await h.queryPermission(opts)) === 'granted') return true
  if (!request) return false
  return (await h.requestPermission(opts)) === 'granted'
}

export class Vault {
  constructor(public readonly root: FileSystemDirectoryHandle) {}

  get name() {
    return this.root.name
  }

  private async dir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let cur = this.root
    for (const part of path.split('/').filter(Boolean)) cur = await cur.getDirectoryHandle(part, { create })
    return cur
  }

  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const dir = await this.dir(dirname(path), create)
    return dir.getFileHandle(basename(path), { create })
  }

  /** Lists every folder, Markdown note and PDF/DOCX document. Other files are ignored. */
  async scan(): Promise<{ tree: FolderEntry; notes: FileEntry[]; docs: FileEntry[] }> {
    const notes: FileEntry[] = []
    const docs: FileEntry[] = []
    const walk = async (dir: FileSystemDirectoryHandle, path: string): Promise<Entry[]> => {
      const out: Entry[] = []
      const pending: Promise<void>[] = []
      for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        if (name.startsWith('.') || IGNORED_DIRS.has(name)) continue
        const p = joinPath(path, name)
        if (handle.kind === 'directory') {
          pending.push(walk(handle as FileSystemDirectoryHandle, p).then(children => {
            out.push({ kind: 'folder', name, path: p, children })
          }))
        } else if (isNote(name) || isDoc(name)) {
          pending.push((handle as FileSystemFileHandle).getFile().then(f => {
            const entry: FileEntry = { kind: 'file', name, path: p, mtime: f.lastModified, size: f.size }
            ;(isNote(name) ? notes : docs).push(entry)
            out.push(entry)
          }))
        }
      }
      await Promise.all(pending)
      return out
    }
    const children = await walk(this.root, '')
    return { tree: { kind: 'folder', name: this.name, path: '', children }, notes, docs }
  }

  async readText(path: string): Promise<string> {
    return (await (await this.fileHandle(path)).getFile()).text()
  }

  async stat(path: string): Promise<{ mtime: number; size: number } | null> {
    try {
      const f = await (await this.fileHandle(path)).getFile()
      return { mtime: f.lastModified, size: f.size }
    } catch {
      return null
    }
  }

  async readBlob(path: string): Promise<Blob> {
    return (await this.fileHandle(path)).getFile()
  }

  /** Writes a file and returns its new modification time. */
  async writeText(path: string, text: string): Promise<number> {
    const fh = await this.fileHandle(path, true)
    const w = await (fh as any).createWritable()
    await w.write(text)
    await w.close()
    return (await fh.getFile()).lastModified
  }

  async writeBlob(path: string, blob: Blob): Promise<void> {
    const fh = await this.fileHandle(path, true)
    const w = await (fh as any).createWritable()
    await w.write(blob)
    await w.close()
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.fileHandle(path)
      return true
    } catch {
      try {
        await this.dir(path)
        return true
      } catch {
        return false
      }
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.dir(path, true)
  }

  async remove(path: string): Promise<void> {
    const parent = await this.dir(dirname(path))
    await parent.removeEntry(basename(path), { recursive: true })
  }

  /** Moves or renames a note or folder. */
  async move(from: string, to: string): Promise<void> {
    if (from === to) return
    if (await this.exists(to)) throw new Error(`"${basename(to)}" already exists`)
    const isFile = await this.fileHandle(from).then(() => true, () => false)
    if (isFile) {
      await this.copyFile(from, to)
      await this.remove(from)
    } else {
      await this.copyDir(from, to)
      await this.remove(from)
    }
  }

  private async copyFile(from: string, to: string) {
    const blob = await this.readBlob(from)
    await this.writeBlob(to, blob)
  }

  private async copyDir(from: string, to: string) {
    await this.mkdir(to)
    const src = await this.dir(from)
    for await (const [name, handle] of (src as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'directory') await this.copyDir(joinPath(from, name), joinPath(to, name))
      else await this.copyFile(joinPath(from, name), joinPath(to, name))
    }
  }

  /** Finds a file anywhere in the vault by name (used for attachments such as images). */
  async findByName(name: string, dir: FileSystemDirectoryHandle = this.root, path = ''): Promise<string | null> {
    for await (const [entry, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (entry.startsWith('.')) continue
      if (handle.kind === 'file' && entry === name) return joinPath(path, entry)
    }
    for await (const [entry, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (entry.startsWith('.') || IGNORED_DIRS.has(entry) || handle.kind !== 'directory') continue
      const found = await this.findByName(name, handle as FileSystemDirectoryHandle, joinPath(path, entry))
      if (found) return found
    }
    return null
  }

  async readJSON<T>(name: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await this.readText(joinPath(DATA_DIR, name))) as T
    } catch {
      return fallback
    }
  }

  async writeJSON(name: string, data: unknown): Promise<void> {
    await this.writeText(joinPath(DATA_DIR, name), JSON.stringify(data, null, 2))
  }
}

// ---------------------------------------------------------------------------
// Remembering the chosen folder between visits (handles can be stored in IndexedDB).

const DB = 'omnia'
const STORE = 'handles'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, 'vault')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get('vault')
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function forgetHandle(): Promise<void> {
  const db = await openDB()
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete('vault')
    tx.oncomplete = () => resolve()
  })
}
