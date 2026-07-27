/** In-memory localStorage with fault injection for save-system testing. */
export class MockStorage {
  private map = new Map<string, string>();
  /** When set, setItem throws (simulates a full quota). */
  failWrites = false;
  /** Bytes allowed; further writes throw QuotaExceededError. */
  quota = Infinity;
  writes = 0;

  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    const used = [...this.map.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0);
    if (used + k.length + v.length > this.quota) throw new Error('QuotaExceededError');
    this.map.set(k, v);
    this.writes++;
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  /** Simulate a crash mid-write: leave truncated JSON behind. */
  truncate(k: string, keepFraction = 0.6) {
    const v = this.map.get(k);
    if (v) this.map.set(k, v.slice(0, Math.floor(v.length * keepFraction)));
  }
  raw() { return new Map(this.map); }
}

export function installStorageMock(): MockStorage {
  const s = new MockStorage();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = s;
  g.window = g.window ?? {};
  return s;
}
