// 誰是牛頭王的英文版：英文房間的訊息、按鈕、DM 和指令說明
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyNimmt, type NAction, type NState } from '../src/nimmt.js';
import { nimmt } from '../src/games/nimmt.js';

const rng = () => 0.99999; // 洗牌不動：p1 手牌 1～10、p2 11～20，四列 21～24
const CJK = /[一-鿿]/;

function run(actions: NAction[], start?: NState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyNimmt(state, action, rng));
  return { state: state!, events };
}
// 再來一局的 prompt 由 Slack adapter 翻譯，這裡不檢查
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'prompt' && e.kind === 'rematch' ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' ? e.options.map((o) => o.label) : []));
const started = () => run([{ type: 'new', user: 'A', channel: 'C1', lang: 'en' }, { type: 'join', user: 'B' }, { type: 'start', user: 'A' }]);
const pick = (user: string, card: number): NAction => ({ type: 'pick', user, card, seq: 1 });

describe('nimmt/en: 誰是牛頭王的英文版', () => {
  it('英文局開始：輪次公告、牌桌、手牌 DM、選牌按鈕都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    const all = texts(events);
    expect(all).toContain('🐮 6 nimmt! round 1 begins!');
    expect(all).toContain('Row 1: 21');
    expect(all).toContain('🐮 Your hand for round 1:');
    expect(labels(events)).toEqual(['🃏 Pick a card']);
    expect(all).not.toMatch(CJK);
  });

  it('選牌選單、選牌回覆和錯誤回覆是英文', () => {
    const s = started().state;
    expect(texts(run([{ type: 'hand', user: 'A' }], s).events)).toContain('🃏 Pick a card (you can change it until the reveal)');
    expect(texts(run([pick('A', 3)], s).events)).toContain('You picked 3');
    expect(texts(run([pick('A', 50)], s).events)).toBe("You don't have 50.");
    expect(texts(run([pick('X', 1)], s).events)).toBe("You're not in this game.");
  });

  it('揭曉、選列按鈕和收牌公告是英文', () => {
    const s = started().state;
    const choose = run([pick('A', 1), pick('B', 11)], s);
    const all = texts(choose.events);
    expect(all).toContain('🃏 Reveal:');
    expect(all).toContain('is lower than every row, choose a row to take');
    expect(labels(choose.events)[0]).toBe('Row 1 (1 card 🐮1)');
    expect(all).not.toMatch(CJK);
    const took = run([{ type: 'row', user: 'A', row: 0, seq: 1 }], choose.state);
    expect(texts(took.events)).toContain('takes row 1 (🐮1)');
    expect(texts(took.events)).not.toMatch(CJK);
  });

  it('GameDef 有英文名稱、人數、介紹和指令說明', () => {
    expect(nimmt.locales.en).toMatchObject({ name: '6 nimmt!', players: '2-10 players' });
    expect(nimmt.locales.en.help).toContain('*6 nimmt! commands*');
    expect(nimmt.locales.en.help).not.toMatch(CJK);
  });
});
