// 情書的英文版：英文房間的公告、按鈕、選單、DM、卡牌名稱和指令說明
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyLoveLetter, type LAction, type LState, type Role } from '../src/loveletter.js';
import { loveLetter } from '../src/games/loveletter.js';

const rng = () => 0.99999;
const CJK = /[一-鿿]/;

function run(actions: LAction[], start?: LState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyLoveLetter(state, action, rng));
  return { state: state!, events };
}
// 再來一局的 prompt 由 Slack adapter 翻譯，這裡不檢查
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'prompt' && e.kind === 'rematch' ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' && e.kind !== 'rematch' ? e.options.map((o) => o.label) : []));
const started = () => run([{ type: 'new', user: 'A', channel: 'C1', lang: 'en' }, { type: 'join', user: 'B' }, { type: 'start', user: 'A' }]);

// 英文局，輪到第一位，手上是指定的兩張牌
function table(hand: Role[], other: Role): LState {
  const s = structuredClone(started().state);
  s.turn = 0;
  s.players[0].hand = hand;
  s.players[1].hand = [other];
  return s;
}

describe('loveletter/en: 情書的英文版', () => {
  it('英文局開始：公告、手牌 DM (含卡牌說明)、出牌按鈕都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    expect(texts(events)).toContain('💌 Round 1 begins!');
    expect(texts(events)).toContain('Spy×2:');
    expect(texts(events)).toContain("👉 It's");
    expect(labels(events)).toEqual(['🃏 Play', '👀 My hand', '📜 Discards']);
    expect(texts(events)).not.toMatch(CJK);
  });

  it('出牌選單、目標、衛兵猜牌是英文', () => {
    const s = table(['guard', 'priest'], 'baron');
    const me = s.players[0].id;
    const menu = run([{ type: 'menu', user: me }], s).events;
    expect(texts(menu)).toContain('🃏 Choose a card to play');
    expect(labels(menu)).toEqual(['1 Guard', '2 Priest']);
    const tgt = run([{ type: 'target', user: me, seq: s.turnSeq, index: 0, target: s.players[1].id }], s).events;
    expect(texts(tgt)).toContain('💂 Guess');
    expect(labels(tgt)).toContain('9 Princess');
    const played = run([{ type: 'play', user: me, seq: s.turnSeq, index: 0, target: s.players[1].id, guess: 'baron' }], s).events;
    expect(texts(played)).toContain('plays 1 Guard');
    expect(texts(played)).toContain('Correct!');
    expect(texts(played)).not.toMatch(CJK);
  });

  it('我的手牌、棄牌紀錄、錯誤回覆是英文', () => {
    const s = table(['guard', 'priest'], 'baron');
    expect(texts(run([{ type: 'hand', user: s.players[0].id }], s).events)).toContain('🃏 Your hand: 1 Guard, 2 Priest');
    const log = texts(run([{ type: 'log', user: 'A' }], s).events);
    expect(log).toContain('📜 Round 1 discards');
    expect(log).not.toMatch(CJK);
    expect(texts(run([{ type: 'menu', user: s.players[1].id }], s).events)).toBe("It's not your turn.");
  });

  it('GameDef 有英文名稱、人數、介紹和指令說明', () => {
    expect(loveLetter.locales.en).toMatchObject({ name: 'Love Letter', players: '2-6 players' });
    expect(loveLetter.locales.en.help).toContain('*Love Letter commands*');
    expect(loveLetter.locales.en.help).not.toMatch(CJK);
  });
});
