// 默契問答的英文版：英文房間的主題按鈕、題目、選項、揭曉和結算
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applySync, type SyncAction, type SyncState } from '../src/sync.js';
import { sync } from '../src/games/sync.js';

const rng = () => 0.99999;
const CJK = /[一-鿿]/;

function run(actions: SyncAction[], start?: SyncState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applySync(state, action, rng));
  return { state: state!, events };
}
// 房間公告標題和再來一局由 Slack adapter 翻譯，這裡不檢查
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'lobby' || (e.type === 'prompt' && e.kind === 'rematch') ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' && e.kind !== 'rematch' ? e.options.map((o) => o.label) : []));
const started = () =>
  run([
    { type: 'new', user: 'A', channel: 'C1', lang: 'en' },
    { type: 'join', user: 'B' },
    { type: 'start', user: 'A' },
  ]);

describe('sync/setup: 默契問答的語系', () => {
  it('英文局開始：規則和主題按鈕都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    expect(texts(events)).toContain('🎯 In Sync begins!');
    expect(labels(events)).toContain('Genshin Impact');
    expect(labels(events)).toContain('Coworkers & Classmates');
    expect(texts(events) + labels(events).join()).not.toMatch(CJK);
  });

  it('theme 指令接受英文名稱、不分大小寫', () => {
    expect(run([{ type: 'theme', user: 'A', name: 'genshin impact' }], started().state).state.theme).toBe('genshin');
  });

  it('每個主題的題目、選項、作答、揭曉、結算都是英文', () => {
    for (const theme of ['mix', 'daily', 'friends', 'food', 'travel', 'movies', 'music', 'games', 'football', 'genshin', 'love', 'family', 'work'] as const) {
      const s = started().state;
      let r = run([{ type: 'theme', user: 'A', seq: s.seq, theme }], s);
      const all: GameEvent[] = [...r.events];
      for (let i = 0; i < 10; i++) {
        r = run([{ type: 'pick', user: 'A', option: 0 }, { type: 'pick', user: 'B', option: i % 2 }], r.state);
        all.push(...r.events);
      }
      expect(r.state.phase).toBe('ended');
      const t = texts(all) + labels(all).join();
      expect(t, theme).toContain('Question 1/10');
      expect(t, theme).toContain('You picked "');
      expect(t, theme).toContain('Everyone picked the same on 5/10 questions');
      expect(t, theme).toContain('📝 Answer log:');
      expect(t, theme).not.toMatch(CJK);
    }
  });

  it('被拒訊息是英文', () => {
    const s = run([{ type: 'theme', user: 'A', name: 'Food & Drink' }], started().state).state;
    const again = run([{ type: 'pick', user: 'A', option: 0 }, { type: 'pick', user: 'A', option: 1 }], s);
    expect(texts(again.events)).toBe('You already picked. No changes allowed');
    expect(texts(run([{ type: 'theme', user: 'A', name: 'Astrology' }], started().state).events)).toContain('No such theme. Choose from: General Mix');
  });

  it('大廳和指令說明有英文', () => {
    expect(sync.locales.en).toMatchObject({ name: 'In Sync', players: '2-8 players' });
    expect(sync.locales.en.help).toContain('/game sync theme');
    expect(sync.locales.en.help).not.toMatch(CJK);
  });
});
