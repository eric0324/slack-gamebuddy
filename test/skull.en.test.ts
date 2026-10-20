// 骷髏與玫瑰的英文版：英文房間的訊息、按鈕、DM 和指令說明
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applySkull, type SkAction, type SkState } from '../src/skull.js';
import { skull } from '../src/games/skull.js';

const rng = () => 0.99999;
const CJK = /[一-鿿]/;

function run(actions: SkAction[], start?: SkState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applySkull(state, action, rng));
  return { state: state!, events };
}
const step = (s: SkState, make: (s: SkState) => SkAction) => run([make(s)], s);
// 再來一局的 prompt 由 Slack adapter 翻譯，這裡不檢查
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'prompt' && e.kind === 'rematch' ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' && e.kind !== 'rematch' ? e.options.map((o) => o.label) : []));

// rng 固定為 0.99999：起始玩家是最後一位 (p3)
const started = () =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' },
    { type: 'join', user: 'p2' },
    { type: 'join', user: 'p3' },
    { type: 'start', user: 'p1' },
  ]);
const placed = () => {
  let s = started().state;
  s = step(s, (x) => ({ type: 'disc', user: 'p1', step: x.step, disc: 'rose' })).state;
  s = step(s, (x) => ({ type: 'disc', user: 'p2', step: x.step, disc: 'rose' })).state;
  return step(s, (x) => ({ type: 'disc', user: 'p3', step: x.step, disc: 'skull' }));
};

describe('skull/en: 骷髏與玫瑰的英文版', () => {
  it('英文局開始：開場公告、規則 DM、蓋牌按鈕都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    const all = texts(events);
    expect(all).toContain('💀 Skull begins!');
    expect(all).toContain('🃏 Round 1:');
    expect(all).toContain('*Skull* rules summary');
    expect(labels(events)).toEqual(['🃏 Place', '👀 My discs']);
    expect(all).not.toMatch(CJK);
  });

  it('蓋牌選單、輪到誰、我的牌是英文', () => {
    const s = started().state;
    const menu = run([{ type: 'placeMenu', user: 'p1' }], s).events;
    expect(labels(menu)).toEqual(['🌹 Place a Rose', '💀 Place the Skull']);
    const { events } = placed();
    expect(texts(events)).toContain("👉 It's <@p3>'s turn");
    expect(labels(events)).toEqual(['🃏 Place another', '📢 Challenge', '👀 My discs']);
    expect(texts(run([{ type: 'mine', user: 'p1' }], s).events)).toContain('👀 Your discs:');
    expect(texts([...menu, ...events])).not.toMatch(CJK);
  });

  it('喊數、放棄、翻到骷髏、失去一張牌的公告和 DM 是英文', () => {
    let s = placed().state;
    const bid = step(s, (x) => ({ type: 'bid', user: 'p3', step: x.step, n: 1 }));
    expect(texts(bid.events)).toContain('📢 <@p3> bids 1');
    expect(labels(bid.events)).toContain('🙅 Pass');
    s = step(bid.state, (x) => ({ type: 'pass', user: 'p1', step: x.step })).state;
    const { events } = step(s, (x) => ({ type: 'pass', user: 'p2', step: x.step }));
    const all = texts(events);
    expect(all).toContain('flips their own discs first');
    expect(all).toContain('fails the challenge');
    expect(all).toContain('🗑️ You lost');
    expect(all).not.toMatch(CJK);
  });

  it('錯誤回覆是英文', () => {
    const s = started().state;
    expect(texts(run([{ type: 'challengeMenu', user: 'p1' }], s).events)).toBe("It's not your turn.");
    expect(texts(run([{ type: 'bid', user: 'p1', step: -1, n: 1 }], s).events)).toBe('This menu has expired.');
  });

  it('GameDef 有英文名稱、人數、介紹和指令說明', () => {
    expect(skull.locales.en).toMatchObject({ name: 'Skull', players: '3-6 players' });
    expect(skull.locales.en.help).toContain('*Skull commands*');
    expect(skull.locales.en.help).not.toMatch(CJK);
    expect(skull.locales.en.desc).not.toMatch(CJK);
  });
});
