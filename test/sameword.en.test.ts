// 同詞相遇的英文版：英文房間的面板、揭曉、判定、被拒訊息和結束公告
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applySameword, type SamewordAction, type SamewordState } from '../src/sameword.js';
import { sameword } from '../src/games/sameword.js';

const rng = () => 0.5;
const CJK = /[一-鿿]/;

function run(actions: SamewordAction[], start?: SamewordState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applySameword(state, action, rng));
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
    { type: 'join', user: 'C' },
    { type: 'start', user: 'A' },
  ]);
const word = (user: string, text: string): SamewordAction => ({ type: 'word', user, text });

describe('sameword/setup: 同詞相遇的語系', () => {
  it('英文局開始：開局公告和寫詞面板都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    expect(texts(events)).toContain('💞 Same Word begins!');
    expect(texts(events)).toContain('Round 1/10');
    expect(labels(events)).toEqual(['✍️ Write']);
    expect(texts(events)).not.toMatch(CJK);
  });

  it('寫詞、揭曉、判定按鈕、被拒訊息都是英文', () => {
    const s = started().state;
    const w = run([word('A', 'apple')], s);
    expect(texts(w.events)).toContain('Got it');
    const rejected = run([{ type: 'same', user: 'B' }], run([word('B', 'pie'), word('C', 'fruit')], w.state).state);
    const revealed = run([word('B', 'pie'), word('C', 'fruit')], w.state);
    expect(labels(revealed.events)).toEqual(['🤝 Count as same', '➡️ Next round']);
    expect(texts(revealed.events)).toContain('Round 1 reveal');
    expect(texts(rejected.events)).toBe('Only the host can judge');
    const r2 = run([{ type: 'next', user: 'A' }], revealed.state);
    expect(texts(r2.events)).toContain("Last round's words");
    const used = run([word('A', 'APPLE')], r2.state);
    expect(texts(used.events)).toContain('has already come up');
    for (const e of [w.events, revealed.events, r2.events, used.events]) expect(texts(e)).not.toMatch(CJK);
  });

  it('結束公告是英文', () => {
    const { events } = run([word('A', 'pie'), word('B', 'pie'), word('C', 'Pie!')], started().state);
    const t = texts(events);
    expect(t).toContain('Minds met in round 1');
    expect(t).toContain('Team score: 10');
    expect(t).toContain('Round 1: pie, pie, Pie!');
    expect(t).not.toMatch(CJK);
  });

  it('大廳、指令說明和視窗提示有英文', () => {
    expect(sameword.locales.en).toMatchObject({ name: 'Same Word', players: '3-10 players' });
    expect(sameword.locales.en.help).toContain('/game sameword word');
    expect(sameword.locales.en.help).not.toMatch(CJK);
    expect(sameword.modals.samewordWord.fallbackLocales.en).toContain('/game sameword word <word>');
  });
});
