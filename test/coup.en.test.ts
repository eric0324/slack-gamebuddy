// 政變的英文版：英文房間的訊息、按鈕、DM 和指令說明
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyCoup, type KAction, type KState } from '../src/coup.js';
import { coup } from '../src/games/coup.js';

const rng = () => 0.99999;
const CJK = /[一-鿿]/;

function run(actions: KAction[], start?: KState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyCoup(state, action, rng));
  return { state: state!, events };
}
// 再來一局的 prompt 由 Slack adapter 翻譯，這裡不檢查
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'prompt' && e.kind === 'rematch' ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' ? e.options.map((o) => o.label) : []));
const started = () =>
  run([
    { type: 'new', user: 'A', channel: 'C1', lang: 'en' },
    { type: 'join', user: 'B' },
    { type: 'join', user: 'C' },
    { type: 'start', user: 'A' },
  ]);
const turnOf = (s: KState) => s.players[s.turn].id;

describe('coup/en: 政變的英文版', () => {
  it('英文局開始：開場公告、手牌 DM、行動按鈕都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    const all = texts(events);
    expect(all).toContain('👑 Coup begins!');
    expect(all).toContain('🃏 Your cards:');
    expect(all).toContain("👉 It's");
    expect(labels(events)).toContain('💰 Income +1');
    expect(labels(events)).toContain('👑 Tax +3 (Duke)');
    expect(all + labels(events).join()).not.toMatch(CJK);
  });

  it('宣稱角色的公告和「質疑」按鈕是英文', () => {
    const s = started().state;
    const { events } = run([{ type: 'act', user: turnOf(s), kind: 'tax' }], s);
    expect(texts(events)).toContain('claims Duke');
    expect(labels(events)).toEqual(['Challenge']);
    expect(texts(events)).not.toMatch(CJK);
  });

  it('外援的阻擋按鈕和收入公告是英文', () => {
    const s = started().state;
    const aid = run([{ type: 'act', user: turnOf(s), kind: 'foreignAid' }], s);
    expect(labels(aid.events)).toEqual(['Block with Duke']);
    expect(texts(aid.events)).not.toMatch(CJK);
    expect(texts(run([{ type: 'act', user: turnOf(s), kind: 'income' }], s).events)).toContain('takes Income: 1 coin.');
  });

  it('錯誤回覆是英文', () => {
    const s = started().state;
    const other = s.players.find((p) => p.id !== turnOf(s))!.id;
    expect(texts(run([{ type: 'act', user: other, kind: 'income' }], s).events)).toBe("It's not your turn.");
    expect(texts(run([{ type: 'start', user: 'B' }], run([{ type: 'new', user: 'A', channel: 'C1', lang: 'en' }]).state).events)).toBe(
      'Only the host can start the game.',
    );
  });

  it('GameDef 有英文名稱、人數、介紹和指令說明', () => {
    expect(coup.locales.en).toMatchObject({ name: 'Coup', players: '3-6 players' });
    expect(coup.locales.en.help).toContain('*Coup commands*');
    expect(coup.locales.en.desc + coup.locales.en.help).not.toMatch(CJK);
  });
});
