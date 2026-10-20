// 阿瓦隆的英文版：英文房間的公告、私訊、prompt、按鈕和 GameDef
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { applyAvalon, AVALON_BOT_LINES_EN, type AAction, type AState } from '../src/avalon.js';
import { avalon } from '../src/games/avalon.js';

const rng = () => 0.99999;

function run(actions: AAction[], start?: AState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyAvalon(state, action, rng);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number, bots = 0) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as AAction,
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as AAction),
    ...(bots ? [{ type: 'addBot', user: 'p1', count: bots } as AAction] : []),
  ]);
const started = (n: number, bots = 0) => run([{ type: 'start', user: 'p1' }], lobbyWith(n, bots).state);
const texts = (events: GameEvent[]) => events.filter((e) => 'text' in e).map((e) => (e as { text: string }).text);
const dmTo = (events: GameEvent[], user: string) => (events.find((e) => e.type === 'dm' && e.to === user) as { text: string }).text;
const prompt = (events: GameEvent[], kind: string) => events.find((e) => e.type === 'prompt' && e.kind === kind) as Extract<GameEvent, { type: 'prompt' }>;
const hasCjk = (s: string) => /[一-鿿]/.test(s);

const finishSpeech = (s: AState) => {
  let res = { state: s, events: [] as GameEvent[] };
  for (let i = 0; i < 20 && res.state.phase === 'speech'; i++) res = run([{ type: 'endSpeech', user: res.state.speaker! }], res.state);
  return res;
};

describe('avalon/en: 英文房間', () => {
  it('開局公告、身分私訊、壞人群組都是英文', () => {
    const { events } = started(5);
    const all = texts(events);
    expect(all.some((t) => t.includes('Avalon begins!'))).toBe(true);
    expect(all.some((t) => t.includes('3 good, 2 evil'))).toBe(true);
    expect(dmTo(events, 'p1')).toContain('You are Merlin');
    expect(dmTo(events, 'p2')).toContain('You are Percival');
    expect(dmTo(events, 'p2')).toContain('<@p1>, <@p5>');
    expect(dmTo(events, 'p3')).toContain('Loyal Servant of Arthur');
    expect(dmTo(events, 'p4')).toContain('You are the Assassin');
    expect(dmTo(events, 'p5')).toContain('You are Morgana');
    for (const t of all) expect(hasCjk(t)).toBe(false);
  });

  it('發言、組隊、投票的 prompt 和按鈕是英文', () => {
    const { state, events } = started(5);
    expect(prompt(events, 'endSpeech').options[0].label).toBe('End speech');
    const pick = finishSpeech(state);
    expect(prompt(pick.events, 'confirmTeam').options[0].label).toBe('Confirm team');
    const leader = pick.state.players[pick.state.leader].id;
    let s = pick.state;
    for (const p of s.players.slice(0, 2)) s = run([{ type: 'pickMember', user: leader, target: p.id }], s).state;
    const vote = run([{ type: 'confirmTeam', user: leader }], s);
    expect(prompt(vote.events, 'teamVote').options.map((o) => o.label)).toEqual(['👍 Approve', '👎 Reject']);
    let q = vote;
    for (const p of q.state.players) q = run([{ type: 'teamVote', user: p.id, vote: 'approve' }], q.state);
    const quest = prompt(q.events, 'quest');
    expect(quest.text).toContain('Quest 1');
    expect(quest.options[0].label).toBe('✅ Success');
    for (const t of texts(q.events)) expect(hasCjk(t)).toBe(false);
  });

  it('bot 用英文台詞發言', () => {
    const { state } = started(3, 2);
    let res = { state, events: [] as GameEvent[] };
    const all: string[] = [];
    for (let i = 0; i < 5 && res.state.phase === 'speech'; i++) {
      res = run([{ type: 'endSpeech', user: res.state.speaker! }], res.state);
      all.push(...texts(res.events));
    }
    const botLines = all.filter((t) => t.startsWith('🤖'));
    expect(botLines.length).toBeGreaterThan(0);
    for (const l of botLines) expect(AVALON_BOT_LINES_EN.some((x) => l.endsWith(x))).toBe(true);
  });

  it('房主以外開始、人數不足的回覆是英文', () => {
    const { events } = run([{ type: 'start', user: 'p1' }], lobbyWith(4).state);
    expect(texts(events)[0]).toContain('at least 5');
  });
});

describe('avalon/en: GameDef', () => {
  it('locales.en 有英文名稱、人數、介紹、說明', () => {
    expect(avalon.locales.en).toMatchObject({ name: 'Avalon', players: '5-10 players' });
    expect(hasCjk(avalon.locales.en.desc)).toBe(false);
    expect(avalon.locales.en.help).toContain('/game avalon new');
    expect(hasCjk(avalon.locales.en.help)).toBe(false);
  });
});
