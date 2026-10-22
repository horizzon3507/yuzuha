import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { State } from '../../contracts.js';
import { MemoryStore } from './memory.js';
import { defaultDataPath } from './paths.js';
import { decodeState } from './state.js';

export class JsonStore extends MemoryStore {
  private loaded = false;
  constructor(public readonly path = defaultDataPath()) { super(); }

  protected override async load(): Promise<void> {
    if (this.loaded) return;
    let content: string;
    try { content = await readFile(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { this.loaded = true; return; }
      throw error;
    }
    this.state = decodeState(content);
    this.loaded = true;
  }

  protected override async commit(state: State): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(`${JSON.stringify(state, null, 2)}\n`); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, this.path);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
}
