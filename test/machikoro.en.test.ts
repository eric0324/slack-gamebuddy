// 骰子街的英文版：英文局的訊息、按鈕、建築與地標名稱和 GameDef 的英文翻譯
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { machikoro } from '../src/games/machikoro.js';
import { applyMachikoro, type MAction, type MState } from '../src/machikoro.js';
import { cardLabel, cardName, landmarkName } from '../src/machikoroCards.js';

const rng = () => 0.99999; // 洗牌不動；從最後一位開始；骰子都是 6

function run(actions: MAction[], start?: MState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyMachikoro(state, action, rng));
  return { state: state!, events };
}
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const ephemeralTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const menuOf = (events: GameEvent[], user: string) => prompts(events).filter((p) => p.audience === 'ephemeral' && p.user === user).at(-1)!;
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel');
const han = /[一-鿿]/u;

// 英文局 2 人開局：第一位是 p2
const startedEn = () =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as MAction,
    { type: 'join', user: 'p2' },
    { type: 'start', user: 'p1' },
  ]);

describe('machikoro/en: 建築與地標名稱', () => {
  it('用原版英文名稱', () => {
    expect(cardName('wheat', 'en')).toBe('Wheat Field');
    expect(cardName('cafe', 'en')).toBe('Cafe');
    expect(cardName('tv', 'en')).toBe('TV Station');
    expect(landmarkName('station', 'en')).toBe('Train Station');
    expect(landmarkName('radio', 'en')).toBe('Radio Tower');
    expect(cardLabel('cafe', 'en')).toBe('Cafe (Red | 2 coins | roll 3)');
    expect(cardLabel('family', 'en')).toBe('Family Restaurant (Red | 3 coins | roll 9-10)');
    expect(cardName('wheat')).toBe('麥田');
  });
});

describe('machikoro/en: 英文局', () => {
  it('開局公告、規則和市場是英文', () => {
    const text = announces(startedEn().events).join('\n');
    expect(text).toContain('🏘️ Machi Koro begins! Players (in seat order): <@p1>, <@p2>');
    expect(text).toContain('Wheat Field');
    expect(text).toContain('Market:');
    expect(text).not.toMatch(han);
  });

  it('回合面板和按鈕是英文', () => {
    const board = boards(startedEn().events).at(-1)!;
    expect(board.text).toContain("*🏘️ Round 1 | 👉 <@p2>'s turn (60s)*");
    expect(board.text).toContain('<@p1> 3 coins | Landmarks: (none) | Establishments 2');
    expect(board.options.map((o) => o.label)).toEqual(['🏘️ Action', '📋 Towns']);
    expect(board.text).not.toMatch(han);
  });

  it('擲骰選單、結算明細和買建築選單是英文', () => {
    const { state } = startedEn();
    const m = menuOf(run([{ type: 'turnMenu', user: 'p2', seq: state.seq }], state).events, 'p2');
    expect(m.text).toBe('🏘️ Your turn | Cash: 3 coins\nHow many dice?');
    expect(m.options.map((o) => o.label)).toEqual(['Roll 1 die']);
    const rolled = run([{ type: 'roll', user: 'p2', seq: state.seq, n: 1 }], state);
    expect(boards(rolled.events).at(-1)!.text).toContain('Rolled 6\n(no establishment paid out)');
    const buy = menuOf(rolled.events, 'p2');
    expect(buy.text).toContain('What will you buy?');
    expect(buy.text).toContain('• Landmark Harbor (2 coins): ');
    expect(buy.options.at(-1)!.label).toBe('Buy nothing');
    expect(buy.text).not.toMatch(han);
  });

  it('買建築的回覆、城鎮一覽和錯誤訊息是英文', () => {
    const { state } = startedEn();
    const rolled = run([{ type: 'roll', user: 'p2', seq: state.seq, n: 1 }], state).state;
    expect(ephemeralTo(run([{ type: 'buy', user: 'p2', seq: rolled.seq, code: 'harbor' }], rolled).events, 'p2')).toContain('✅ You built Harbor');
    const town = ephemeralTo(run([{ type: 'town', user: 'p1' }], state).events, 'p1').join();
    expect(town).toContain('📋 Towns');
    expect(town).toContain('Wheat Field ×1');
    expect(town).toContain('Built: City Hall');
    expect(town).not.toMatch(han);
    expect(ephemeralTo(run([{ type: 'turnMenu', user: 'p1', seq: state.seq }], state).events, 'p1')).toEqual(["It's not your turn yet."]);
  });
});

describe('machikoro/en: GameDef', () => {
  it('locales.en 有英文名稱、人數、介紹和指令說明', () => {
    expect(machikoro.locales.en.name).toBe('Machi Koro');
    expect(machikoro.locales.en.players).toBe('2-5 players');
    expect(machikoro.locales.en.desc).not.toMatch(han);
    const help = machikoro.locales.en.help;
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(help).toContain(`/game machikoro ${cmd}`);
    expect(help).toContain('🏘️ Action');
    expect(help).toContain('📋 Towns');
    expect(help).not.toMatch(han);
  });
});
