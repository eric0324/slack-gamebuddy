// 吹牛骰的英文版：英文房間的訊息、按鈕、DM 和指令說明
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyLiarsDice, type LAction, type LState } from '../src/liarsdice.js';
import { liarsDice } from '../src/games/liarsdice.js';

const rng = () => 0.99999;
const CJK = /[一-鿿]/;

function run(actions: LAction[], start?: LState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyLiarsDice(state, action, rng));
  return { state: state!, events };
}
// 再來一局的 prompt 由 Slack adapter 翻譯，這裡不檢查
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'prompt' && e.kind === 'rematch' ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' ? e.options.map((o) => o.label) : []));
const started = () => run([{ type: 'new', user: 'A', channel: 'C1', lang: 'en' }, { type: 'join', user: 'B' }, { type: 'start', user: 'A' }]);

describe('liarsdice/en: 吹牛骰的英文版', () => {
  it('英文局開始：公告回合、私訊骰子、輪到誰都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    const all = texts(events);
    expect(all).toContain('🎲 Round 1:');
    expect(all).toContain('your dice:');
    expect(all).toContain("👉 It's");
    expect(all).not.toMatch(CJK);
  });

  it('喊數之後的「開！」按鈕和公告是英文', () => {
    const s = started().state;
    const { events } = run([{ type: 'bid', user: s.players[s.turn].id, quantity: 2, face: 3 }], s);
    expect(texts(events)).toContain('bids "2 × 3"');
    expect(labels(events)).toEqual(['Liar!']);
    expect(texts(events)).not.toMatch(CJK);
  });

  it('開和錯誤回覆是英文', () => {
    const s = started().state;
    const id = s.players[s.turn].id;
    expect(texts(run([{ type: 'bid', user: id, quantity: 1, face: 7 }], s).events)).toBe('Face must be 1-6.');
    const bid = run([{ type: 'bid', user: id, quantity: 9, face: 3 }], s).state;
    const { events } = run([{ type: 'challenge', user: bid.players[bid.turn].id }], bid);
    expect(texts(events)).toContain('calls liar on "9 × 3"');
    expect(texts(events)).not.toMatch(CJK);
  });

  it('GameDef 有英文名稱、人數、介紹和指令說明', () => {
    expect(liarsDice.locales.en).toMatchObject({ name: "Liar's Dice", players: '2-8 players' });
    expect(liarsDice.locales.en.help).toContain("*Liar's Dice commands*");
    expect(liarsDice.locales.en.help).not.toMatch(CJK);
  });
});
