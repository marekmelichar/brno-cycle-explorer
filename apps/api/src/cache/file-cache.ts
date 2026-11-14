import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Tiny JSON file cache with atomic writes (write to temp file, then rename). */
export class FileCache<T> {
  constructor(private readonly dir: string, private readonly name: string) {}

  get file() {
    return path.join(this.dir, `${this.name}.json`);
  }

  async read(): Promise<T | null> {
    try {
      const txt = await fs.readFile(this.file, 'utf8');
      return JSON.parse(txt) as T;
    } catch {
      return null;
    }
  }

  async write(value: T): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value));
    await fs.rename(tmp, this.file);
  }

  async clear(): Promise<void> {
    await fs.rm(this.file, { force: true });
  }
}
