// 不要謝謝的英文版：英文房間的牌桌、按鈕、DM、結算和指令說明
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyNoThanks, type NTAction, type NTState } from '../src/nothanks.js';
import { noThanks } from '../src/games/nothanks.js';

const rng = () => 0.99999;
const CJK = /[一-鿿]/;

function run(actions: NTAction[], start?: NTState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyNoThanks(state, action, rng));
  return { state: state!, events };
}
// 再來一局的 prompt 由 Slack adapter 翻譯，這裡不檢查
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'prompt' && e.kind === 'rematch' ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' && e.kind !== 'rematch' ? e.options.map((o) => o.label) : []));
const started = () =>
  run([
    { type: 'new', user: 'A', channel: 'C1', lang: 'en' },
    { type: 'join', user: 'B' },
    { type: 'join', user: 'C' },
    { type: 'start', user: 'A' },
  ]);
const cur = (s: NTState) => s.players[s.turn].id;

describe('nothanks/en: 不要謝謝的英文版', () => {
  it('英文局開始：開場公告、規則 DM、牌桌和按鈕都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    expect(texts(events)).toContain('🙅 No Thanks! begins!');
    expect(texts(events)).toContain('🃏 Card 1:');
    expect(labels(events)).toEqual(['🙅 No thanks!', '✋ Take', '👀 My chips']);
    expect(texts(events)).not.toMatch(CJK);
  });

  it('不要謝謝、收下、我的籌碼和錯誤回覆是英文', () => {
    const s = started().state;
    const passed = run([{ type: 'pass', user: cur(s), step: s.step }], s);
    expect(texts(passed.events)).toContain('says no thanks');
    const took = run([{ type: 'take', user: cur(passed.state), step: passed.state.step }], passed.state);
    expect(texts(took.events)).toContain('takes');
    expect(texts(took.events)).not.toMatch(CJK);
    expect(texts(run([{ type: 'mine', user: 'A' }], s).events)).toContain('👀 You have 🪙');
    expect(texts(run([{ type: 'take', user: 'A', step: -1 }], s).events)).toBe('This button has expired.');
  });

  it('結算是英文', () => {
    const s = structuredClone(started().state);
    s.deck = [];
    const { events } = run([{ type: 'take', user: cur(s), step: s.step }], s);
    expect(texts(events)).toContain('🏆 Game over,');
    expect(texts(events)).toContain('Cards removed at the start:');
    expect(texts(events)).not.toMatch(CJK);
  });

  it('GameDef 有英文名稱、人數、介紹和指令說明', () => {
    expect(noThanks.locales.en).toMatchObject({ name: 'No Thanks!', players: '3-7 players' });
    expect(noThanks.locales.en.help).toContain('*No Thanks! commands*');
    expect(noThanks.locales.en.help).not.toMatch(CJK);
  });
});
