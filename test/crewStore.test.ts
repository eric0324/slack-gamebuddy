import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CrewStore } from '../src/crewStore.js';

describe('crew/missions: 頻道戰役進度的儲存', () => {
  it('沒有資料時回傳 1；set 後 get 拿到新值', () => {
    const store = new CrewStore(':memory:');
    expect(store.get('C1')).toBe(1);
    store.set('C1', 6);
    expect(store.get('C1')).toBe(6);
    store.set('C1', 2);
    expect(store.get('C1')).toBe(2);
  });

  it('不同頻道各自一份', () => {
    const store = new CrewStore(':memory:');
    store.set('C1', 9);
    expect(store.get('C2')).toBe(1);
  });

  it('關掉再用同一個檔案開仍然存在', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-'));
    try {
      const file = join(dir, 'stats.db');
      new CrewStore(file).set('C1', 12);
      expect(new CrewStore(file).get('C1')).toBe(12);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
