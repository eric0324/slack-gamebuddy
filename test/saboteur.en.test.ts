// 矮人礦坑的英文版：英文房間的公告、私下訊息、選單和按鈕都是英文
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { saboteur } from '../src/games/saboteur.js';
import { applySaboteur, cardName, type SAction, type SState } from '../src/saboteur.js';

const rng = () => 0.99999;

function run(actions: SAction[], start?: SState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applySaboteur(state, action, rng);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobby = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as SAction,
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as SAction),
  ]);
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobby(n).state);
const texts = (events: GameEvent[]) => events.map((e) => ('text' in e ? String(e.text) : '')).join('\n');
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const CJK = /[一-鿿]/;

describe('saboteur/en: 英文房間', () => {
  it('開始遊戲：公告、身分私訊、回合面板都是英文', () => {
    const { events } = started(4);
    const all = texts(events);
    expect(all).toContain('Saboteur begins!');
    expect(all).toContain('Round 1/3 begins!');
    expect(all).toContain('You are a 💣 Saboteur this round');
    expect(all).toContain('⛏️ Gold-Digger');
    expect(all).not.toMatch(CJK);
    const board = prompts(events).find((p) => p.kind === 'saboteur')!;
    expect(board.options.map((o) => o.label)).toEqual(['⛏️ Play', '🎒 My hand']);
  });

  it('行動選單和手牌是英文', () => {
    const { state } = started(4);
    const me = state.players[state.turn];
    const menu = run([{ type: 'turnMenu', user: me.id, seq: state.seq }], state);
    const p = prompts(menu.events)[0];
    expect(p.text).toContain('Your turn: pick a card');
    expect(p.text).toContain('🃏 Hand:');
    expect(p.options.at(-1)!.label).toBe('🗑️ Discard a card');
    expect(p.text + p.options.map((o) => o.label).join()).not.toMatch(CJK);
    const hand = run([{ type: 'hand', user: me.id }], state);
    expect(texts(hand.events)).toContain('Broken tools:');
  });

  it('人數不足的提示是英文', () => {
    const { events } = run([{ type: 'start', user: 'p1' }], lobby(2).state);
    expect(texts(events)).toContain('at least 3 players');
  });

  it('卡名英文', () => {
    expect(cardName({ kind: 'break', tool: 'pick' }, 'en')).toBe('Break Pick');
    expect(cardName({ kind: 'fix', tools: ['lamp', 'cart'] }, 'en')).toBe('Fix Lantern/Cart');
    expect(cardName({ kind: 'map' }, 'en')).toBe('Map');
    expect(cardName({ kind: 'rock' }, 'en')).toBe('Rockfall');
    expect(cardName({ kind: 'path', edges: 10, dead: true }, 'en')).toBe('━ Dead end');
    expect(cardName({ kind: 'path', edges: 10, dead: false }, 'en')).toBe('━ Tunnel');
    expect(cardName({ kind: 'map' })).toBe('藏寶圖');
  });
});

describe('saboteur/en: GameDef', () => {
  it('locales.en 有英文名稱、人數、介紹和說明', () => {
    const en = saboteur.locales!.en!;
    expect(en.name).toBe('Saboteur');
    expect(en.players).toBe('3-10 players');
    expect(en.desc).not.toMatch(CJK);
    expect(en.help).toContain('/game saboteur new');
    expect(en.help).not.toMatch(CJK);
  });
});
