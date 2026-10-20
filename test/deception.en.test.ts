// 詭影神探的英文版：英文局的訊息、按鈕、詞庫、提示板和 GameDef 的英文翻譯
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { applyDeception, type DAction, type DState } from '../src/deception.js';
import { DECKS } from '../src/deceptionCards.js';
import { deception } from '../src/games/deception.js';

const rng = () => 0.99999; // 洗牌不動：最後一位是鑑識官，p1 兇手、p2 共犯、p3 目擊者 (6 人以上)
const han = /[一-鿿]/u;

function run(actions: DAction[], start?: DState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyDeception(state, action, rng));
  return { state: state!, events };
}
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const startedEn = (n = 6) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as DAction,
    ...ids(n).slice(1).map((user) => ({ type: 'join', user }) as DAction),
    { type: 'start', user: 'p1' },
  ]);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const dmTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text);
const ephemeralTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const allWords = (d: (typeof DECKS)['en']) => [d.cause, ...d.locations, ...d.scenes].flatMap((b) => [b.title, ...b.options]);

describe('deception/en: 詞庫和提示板', () => {
  it('英文詞庫和提示板的數量和中文版相同，不重複、沒有中文', () => {
    const zh = DECKS['zh-TW'];
    const en = DECKS.en;
    expect(en.means).toHaveLength(zh.means.length);
    expect(en.clues).toHaveLength(zh.clues.length);
    expect(en.locations).toHaveLength(zh.locations.length);
    expect(en.scenes).toHaveLength(zh.scenes.length);
    for (const words of [en.means, en.clues]) expect(new Set(words).size).toBe(words.length);
    const means = new Set(en.means);
    expect(en.clues.filter((w) => means.has(w))).toEqual([]);
    for (const b of [en.cause, ...en.locations, ...en.scenes]) {
      expect(b.options).toHaveLength(6);
      expect(new Set(b.options).size).toBe(6);
    }
    const titles = [en.cause, ...en.locations, ...en.scenes].map((b) => b.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const w of [...en.means, ...en.clues, ...allWords(en)]) expect(w, w).not.toMatch(han);
    expect(en.cause.title).toBe('Cause of Death');
  });
});

describe('deception/en: 英文局', () => {
  it('發到的手段和線索是英文詞，場景板是英文', () => {
    const { state } = startedEn();
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p1.means.every((w) => DECKS.en.means.includes(w))).toBe(true);
    expect(p1.clues.every((w) => DECKS.en.clues.includes(w))).toBe(true);
    expect(state.cause.board.title).toBe('Cause of Death');
    expect(state.scenes.every((x) => DECKS.en.scenes.some((b) => b.title === x.board.title))).toBe(true);
  });

  it('開局公告、身分私訊和夜晚選單是英文', () => {
    const { events } = startedEn();
    const text = announces(events).join('\n');
    expect(text).toContain('🔎 Deception begins! Players: <@p1>, <@p2>');
    expect(text).toContain('🔬 Forensic Scientist: <@p6> (revealed)');
    expect(text).toContain('🌙 Night falls.');
    expect(text).not.toMatch(han);
    expect(dmTo(events, 'p1')[0]).toMatch(/^🔪 You are the Murderer/);
    const pick = prompts(events).find((p) => p.audience === 'user' && p.user === 'p1')!;
    expect(pick.text).toContain('Means');
    expect(pick.options.every((o) => DECKS.en.means.includes(o.label))).toBe(true);
  });

  it('天亮後的面板和按鈕是英文', () => {
    const { events } = run([{ type: 'nightMeans', user: 'p1', i: 0 }, { type: 'nightClue', user: 'p1', i: 0 }], startedEn().state);
    expect(announces(events)).toContain('🌅 Day breaks! The Forensic Scientist begins gathering evidence.');
    expect(dmTo(events, 'p6')[0]).toContain('Murderer: <@p1> | Accomplice: <@p2> | Solution: Means "');
    const panel = prompts(events).find((p) => p.audience === 'channel' && p.ref)!;
    expect(panel.text).toContain('Round 1/3 · Evidence');
    expect(panel.text).toContain('Cause of Death: ');
    expect(panel.text).toContain('Location: (not chosen yet)');
    expect(panel.options.map((o) => o.label)).toEqual(['🧪 Place bullet', '🔍 Solve', '🗂️ My role']);
    expect(panel.text).not.toMatch(han);
  });

  it('破案選單、錯誤訊息是英文', () => {
    const { state } = run([{ type: 'nightMeans', user: 'p1', i: 0 }, { type: 'nightClue', user: 'p1', i: 0 }], startedEn().state);
    const menu = prompts(run([{ type: 'solveMenu', user: 'p4' }], state).events).find((p) => p.user === 'p4')!;
    expect(menu.text).toBe('🔍 Solve (only one chance per game): who is the suspect?');
    expect(ephemeralTo(run([{ type: 'solveMenu', user: 'p6' }], state).events, 'p6')).toEqual(["The Forensic Scientist can't solve."]);
    expect(ephemeralTo(run([{ type: 'fsMenu', user: 'p4', pseq: state.pseq }], state).events, 'p4')).toEqual(['Only the Forensic Scientist can place bullets.']);
  });
});

describe('deception/en: GameDef', () => {
  it('locales.en 有英文名稱、人數、介紹和指令說明', () => {
    expect(deception.locales.en.name).toBe('Deception');
    expect(deception.locales.en.players).toBe('4-12 players');
    expect(deception.locales.en.desc).not.toMatch(han);
    const help = deception.locales.en.help;
    for (const cmd of ['new', 'start', 'cancel']) expect(help).toContain(`/game deception ${cmd}`);
    for (const label of ['🧪 Place bullet', '✅ Done', '🔍 Solve', '🗂️ My role']) expect(help).toContain(label);
    expect(help).not.toMatch(han);
  });
});
