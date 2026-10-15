import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemeStore } from '../src/memeStore.js';

describe('meme/library: 梗圖庫', () => {
  it('add 回傳編號；list 依編號排序、只有這個頻道；get', () => {
    const store = new MemeStore(':memory:');
    expect(store.add('C1', 'https://x/a.png', '老闆的眼神', 'U1')).toBe(1);
    expect(store.add('C2', 'https://x/b.png', '別的頻道', 'U2')).toBe(2);
    expect(store.add('C1', 'https://x/c.png', '自家梗', 'U3')).toBe(3);
    expect(store.list('C1')).toEqual([
      { id: 1, url: 'https://x/a.png', name: '老闆的眼神', by: 'U1' },
      { id: 3, url: 'https://x/c.png', name: '自家梗', by: 'U3' },
    ]);
    expect(store.get('C1', 3)).toEqual({ id: 3, url: 'https://x/c.png', name: '自家梗', by: 'U3' });
    expect(store.get('C1', 2)).toBeUndefined();
  });

  it('同一個頻道重複的網址回傳已存在的編號，不新增；別的頻道可以', () => {
    const store = new MemeStore(':memory:');
    store.add('C1', 'https://x/a.png', 'A', 'U1');
    expect(store.findByUrl('C1', 'https://x/a.png')?.id).toBe(1);
    expect(store.findByUrl('C2', 'https://x/a.png')).toBeUndefined();
    expect(store.add('C2', 'https://x/a.png', 'A', 'U1')).toBe(2);
  });

  it('remove 後編號不變；刪不存在的回傳 false', () => {
    const store = new MemeStore(':memory:');
    store.add('C1', 'https://x/a.png', 'A', 'U1');
    store.add('C1', 'https://x/b.png', 'B', 'U1');
    expect(store.remove('C1', 1)).toBe(true);
    expect(store.remove('C1', 1)).toBe(false);
    expect(store.remove('C2', 2)).toBe(false);
    expect(store.list('C1').map((m) => m.id)).toEqual([2]);
    expect(store.add('C1', 'https://x/c.png', 'C', 'U1')).toBe(3);
  });

  it('存在檔案裡，重新開檔還在', () => {
    const dir = mkdtempSync(join(tmpdir(), 'memes-'));
    try {
      const file = join(dir, 'stats.db');
      new MemeStore(file).add('C1', 'https://x/a.png', 'A', 'U1');
      expect(new MemeStore(file).list('C1')).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
