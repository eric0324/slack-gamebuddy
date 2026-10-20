// 璀璨寶石的英文版：英文局的訊息、按鈕、卡片文字和 GameDef 的英文翻譯
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { splendor } from '../src/games/splendor.js';
import { applySplendor, type SAction, type SState } from '../src/splendor.js';
import { cardText, gemsText, NOBLES, nobleText, type Color, type Gems } from '../src/splendorCards.js';

const gems = (g: Partial<Gems> = {}): Gems => ({ w: 0, b: 0, g: 0, r: 0, k: 0, o: 0, ...g });
const disc = (d: Partial<Record<Color, number>> = {}): Record<Color, number> => ({ w: 0, b: 0, g: 0, r: 0, k: 0, ...d });
const rng = () => 0.99999;

function run(actions: SAction[], start?: SState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applySplendor(state, action, rng));
  return { state: state!, events };
}
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const ephemeralTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const menuOf = (events: GameEvent[], user: string) => prompts(events).filter((p) => p.audience === 'ephemeral' && p.user === user).at(-1)!;

// 英文局 2 人開局：第一位是 p2
const startedEn = () =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as SAction,
    { type: 'join', user: 'p2' },
    { type: 'start', user: 'p1' },
  ]);

describe('splendor/en: 卡片文字', () => {
  it('寶石顏色、卡片、貴族條件用英文', () => {
    expect(gemsText(gems({ b: 1, w: 2 }), 'en')).toBe('White 2, Blue 1');
    expect(gemsText(gems(), 'en')).toBe('none');
    const card = { id: 0, level: 1 as const, color: 'g' as const, points: 1, cost: disc({ w: 4 }) };
    expect(cardText(card, '1-2', 'en')).toBe('1-2 Green 1 pt | White 4');
    expect(nobleText(NOBLES[0], 'en')).toBe('Red 4, Green 4');
  });
});

describe('splendor/en: 英文局', () => {
  it('開局公告和規則是英文，回合面板和按鈕是英文', () => {
    const { events } = startedEn();
    const text = announces(events).join('\n');
    expect(text).toContain('💍 Splendor begins! Turn order: <@p2> → <@p1>');
    expect(text).toContain('15 points');
    const board = prompts(events).find((p) => p.audience === 'channel')!;
    expect(board.text).toContain('Round 1');
    expect(board.text).toContain("👉 <@p2>'s turn (90s)");
    expect(board.text).toContain('Bank: White 4, Blue 4, Green 4, Red 4, Black 4, Gold 5');
    expect(board.text).toContain('Noble 1: Red 4, Green 4');
    expect(board.text).toContain('Level 3 (deck 16)');
    expect(board.text).toContain('1-1 White 0 pt | Red 2, Black 1');
    expect(board.options.map((o) => o.label)).toEqual(['💍 Action', '📜 My status']);
    expect(board.text).not.toMatch(/[一-鿿]/u);
  });

  it('行動選單和拿 2 個同色的選單是英文', () => {
    const { state } = startedEn();
    const m = menuOf(run([{ type: 'turnMenu', user: 'p2', seq: state.seq }], state).events, 'p2');
    expect(m.text).toContain('💍 Your turn');
    expect(m.options.map((o) => o.label)).toEqual(['Take 3 different colors', 'Take 2 of the same color', 'Reserve a card']);
    const m2 = menuOf(run([{ type: 'turnMenu', user: 'p2', seq: state.seq, sub: 'take2' }], state).events, 'p2');
    expect(m2.options.map((o) => o.label)).toEqual(['White', 'Blue', 'Green', 'Red', 'Black', '↩️ Choose another action']);
  });

  it('拿寶石的回覆和上一步是英文', () => {
    const { state } = startedEn();
    const { events } = run([{ type: 'take2', user: 'p2', seq: state.seq, color: 'w' }], state);
    expect(ephemeralTo(events, 'p2')).toContain('✅ You took White 2');
    const next = prompts(events).filter((p) => p.audience === 'channel').at(-1)!;
    expect(next.text).toContain('Last move: <@p2> took White 2');
  });

  it('我的狀態、局外人、還沒輪到你都是英文', () => {
    const { state } = startedEn();
    expect(ephemeralTo(run([{ type: 'status', user: 'p1' }], state).events, 'p1').join()).toContain('📜 Your status | 0 pts');
    expect(ephemeralTo(run([{ type: 'status', user: 'x' }], state).events, 'x')).toEqual(["You're not in this game."]);
    expect(ephemeralTo(run([{ type: 'turnMenu', user: 'p1', seq: state.seq }], state).events, 'p1')).toEqual(["It's not your turn yet."]);
  });

  it('逾時跳過的面板是英文', () => {
    const { state } = startedEn();
    const { events } = run([{ type: 'timeout', id: state.timers.phase! }], state);
    expect(prompts(events)[0].text).toBe("✅ <@p2>'s turn is over: <@p2> timed out and passes");
  });
});

describe('splendor/en: GameDef', () => {
  it('locales.en 有英文名稱、人數、介紹和指令說明', () => {
    expect(splendor.locales.en.name).toBe('Splendor');
    expect(splendor.locales.en.players).toBe('2-4 players');
    expect(splendor.locales.en.desc).not.toMatch(/[一-鿿]/u);
    const help = splendor.locales.en.help;
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(help).toContain(`/game splendor ${cmd}`);
    expect(help).toContain('💍 Action');
    expect(help).toContain('📜 My status');
    expect(help).not.toMatch(/[一-鿿]/u);
  });
});
