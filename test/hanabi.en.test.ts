import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyHanabi, type HAction, type HState } from '../src/hanabi.js';
import { hanabi, parseHanabiCommand } from '../src/games/hanabi.js';

const rng = () => 0.99999;

function run(actions: HAction[], start?: HState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyHanabi(state, action, rng);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

// 英文局：rng 固定時不洗牌，第一位是最後一位玩家 (p2)
const english = () =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' },
    { type: 'join', user: 'p2' },
    { type: 'start', user: 'p1' },
  ]);
const texts = (events: GameEvent[]) => events.map((e) => ('text' in e ? (e.text as string) : '')).join('\n');
const prompt = (events: GameEvent[]) => events.find((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>;
const ephemeralTo = (events: GameEvent[], user: string) => (events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string }).text;

describe('hanabi/en: 花火的英文版', () => {
  it('開局公告、回合 prompt 和按鈕是英文', () => {
    const { state, events } = english();
    expect(state.lang).toBe('en');
    const all = texts(events);
    expect(all).toContain('🎆 Hanabi begins!');
    expect(all).toContain("🎇 It's <@p2>'s turn (2 min)");
    expect(all).toContain('Hints 8');
    const p = prompt(events);
    expect(p.text).toBe('<@p2>, play, discard or give a hint. Anyone can press "Peek"');
    expect(p.options.map((o) => o.label)).toEqual([
      '👀 Peek', '🗑️ Discards', '💡 Give a hint',
      'Play #1', 'Play #2', 'Play #3', 'Play #4', 'Play #5',
      'Discard #1', 'Discard #2', 'Discard #3', 'Discard #4', 'Discard #5',
    ]);
    expect(all).not.toMatch(/[一-鿿]/);
  });

  it('看牌、棄牌堆、不是你的回合：私下訊息是英文', () => {
    const { state } = english();
    expect(ephemeralTo(run([{ type: 'peek', user: 'p1' }], state).events, 'p1')).toContain("👀 Other players' hands:");
    expect(ephemeralTo(run([{ type: 'peek', user: 'p1' }], state).events, 'p1')).toContain('Card 1: ??');
    expect(ephemeralTo(run([{ type: 'discards', user: 'p1' }], state).events, 'p1')).toBe('🗑️ The discard pile is empty.');
    expect(ephemeralTo(run([{ type: 'play', user: 'p1', index: 0 }], state).events, 'p1')).toBe("It's not your turn.");
  });

  it('給提示的選單和公告是英文', () => {
    const { state } = english();
    const menu = prompt(run([{ type: 'hintMenu', user: 'p2' }], state).events);
    expect(menu.text).toBe('💡 Who do you want to hint?');
    const target = prompt(run([{ type: 'hintTarget', user: 'p2', target: 'p1' }], state).events);
    expect(target.text).toContain('Which color or number do you want to hint?');
    expect(target.options[0].label).toBe('Red');
    const { events } = run([{ type: 'hint', user: 'p2', target: 'p1', color: 'red' }], state);
    expect(texts(events)).toContain('💬 <@p2> hints <@p1>: cards 1, 2, 3, 4, 5 are red');
  });

  it('提示只指出一張牌時用單數，多張用複數', () => {
    const { state } = english();
    // p1 手上是紅 1 1 1 2 2
    expect(texts(run([{ type: 'hint', user: 'p2', target: 'p1', number: 1 }], state).events)).toContain('💬 <@p2> hints <@p1>: cards 1, 2, 3 are 1s');
    const one = { ...state, players: state.players.map((p) => (p.id === 'p1' ? { ...p, hand: [{ color: 'red' as const, n: 1 }, { color: 'blue' as const, n: 3 }] } : p)) };
    expect(texts(run([{ type: 'hint', user: 'p2', target: 'p1', number: 3 }], one).events)).toContain('💬 <@p2> hints <@p1>: card 2 is a 3');
    expect(texts(run([{ type: 'hint', user: 'p2', target: 'p1', color: 'blue' }], one).events)).toContain('💬 <@p2> hints <@p1>: card 2 is blue');
  });

  it('出牌、失誤和結束公告是英文', () => {
    const { state } = english();
    // p2 手上是紅 3 3 4 4 5；紅色打到 2 時第 1 張紅 3 可以打出
    const ok = run([{ type: 'play', user: 'p2', index: 0 }], { ...state, fireworks: { ...state.fireworks, red: 2 } });
    expect(texts(ok.events)).toContain('🎆 <@p2> plays 🟥3 — success!');
    const bad = run([{ type: 'play', user: 'p2', index: 0 }], state);
    expect(texts(bad.events)).toContain('💥 <@p2> plays 🟥3 — misfire! (1/3)');
    const end = run([{ type: 'play', user: 'p2', index: 0 }], { ...state, fuses: 2 });
    expect(texts(end.events)).toContain('💥 The fireworks exploded! Score 0: Horrible');
  });

  it('英文 hint 指令可以用英文顏色', () => {
    expect(parseHanabiCommand('hint <@U2> red', 'U1', 'C1')).toEqual({ type: 'hint', user: 'U1', target: 'U2', color: 'red' });
    expect(parseHanabiCommand('hint <@U2> Blue', 'U1', 'C1')).toEqual({ type: 'hint', user: 'U1', target: 'U2', color: 'blue' });
    expect(parseHanabiCommand('hint <@U2> 紅', 'U1', 'C1')).toEqual({ type: 'hint', user: 'U1', target: 'U2', color: 'red' });
  });

  it('GameDef 有英文名稱、人數、介紹和說明', () => {
    expect(hanabi.locales.en).toMatchObject({ name: 'Hanabi', players: '2-5 players' });
    expect(hanabi.locales.en.desc).not.toMatch(/[一-鿿]/);
    expect(hanabi.locales.en.help).toContain('*Hanabi commands*');
    expect(hanabi.locales.en.help).toContain('/game hanabi hint @someone red');
    expect(hanabi.locales.en.help).toContain('Hanabi-Commands');
    expect(hanabi.locales.en.help).not.toMatch(/[一-鿿]/);
  });
});
