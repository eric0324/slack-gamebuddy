import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyInsider, type IAction, type IState } from '../src/insider.js';
import { INSIDER_WORDS } from '../src/insiderWords.js';
import { insider } from '../src/games/insider.js';

const rng = () => 0.99999;

function run(actions: IAction[], start?: IState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyInsider(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as IAction,
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as IAction),
  ]);
const started = (n = 5) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt' && e.kind === 'insider') as Extract<GameEvent, { type: 'prompt' }>[];
const dmTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text).join();
const ephTo = (events: GameEvent[], user: string) => (events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined)?.text;

const WORD = INSIDER_WORDS.en[0];

describe('insider/en: 英文版', () => {
  it('英文詞庫和中文一樣多、不重複，英文局抽英文詞', () => {
    expect(INSIDER_WORDS.en).toHaveLength(INSIDER_WORDS['zh-TW'].length);
    expect(new Set(INSIDER_WORDS.en.map((w) => w.toLowerCase())).size).toBe(INSIDER_WORDS.en.length);
    expect(started().state.word).toBe(WORD);
    for (let i = 0; i < 10; i++) expect(INSIDER_WORDS.en).toContain(run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, Math.random).state.word);
  });

  it('開局公告和身分私訊是英文', () => {
    const { events } = started();
    const text = announces(events).join('\n');
    expect(text).toContain('Insider');
    expect(text).toContain('<@p1>');
    expect(text).toContain('5 minutes');
    expect(text).toContain('/game insider ask');
    expect(text).not.toMatch(/[一-鿿]/);
    expect(dmTo(events, 'p1')).toContain('Master');
    expect(dmTo(events, 'p1')).toContain(WORD);
    expect(dmTo(events, 'p2')).toContain('Insider');
    expect(dmTo(events, 'p3')).toContain('Commons');
    expect(dmTo(events, 'p3')).not.toContain(WORD);
  });

  it('主持人的回答按鈕和公告是英文', () => {
    const asked = run([{ type: 'chat', user: 'p3', text: 'Is it an animal?' }], started().state);
    const p = prompts(asked.events)[0];
    expect(p.options.map((o) => o.label)).toEqual(['✅ Yes', '❌ No', "🤷 Don't know", '🎯 Correct']);
    const yes = run([{ type: 'answer', user: 'p1', question: 1, answer: 'yes' }], asked.state);
    expect(announces(yes.events)).toEqual(['❓ <@p3>: Is it an animal? → ✅ Yes']);
    expect(ephTo(run([{ type: 'answer', user: 'p3', question: 1, answer: 'no' }], asked.state).events, 'p3')).toBe('Only the Master can answer.');
  });

  it('猜中、討論、投票、結果是英文', () => {
    const asked = run([{ type: 'chat', user: 'p4', text: WORD }], started().state);
    const hit = run([{ type: 'answer', user: 'p1', question: 1, answer: 'correct' }], asked.state);
    expect(announces(hit.events).join()).toContain(`🎉 <@p4> guessed it! The word is "${WORD}"`);
    expect(prompts(hit.events)[0].options[0].label).toBe('🗳️ Start voting');
    const vote = run([{ type: 'skip', user: 'p1' }], hit.state);
    expect(prompts(vote.events)[0].text).toContain('Vote');
    const votes: IAction[] = ['p1', 'p3', 'p4', 'p5'].map((u) => ({ type: 'vote', user: u, target: 'p2' }));
    const end = run([...votes, { type: 'vote', user: 'p2', target: 'p3' }], vote.state);
    const text = announces(end.events).join('\n');
    expect(text).toContain('The Master and Commons win');
    expect(text).not.toMatch(/[一-鿿]/);
  });

  it('不支援 bot、人數不足的訊息是英文', () => {
    expect(ephTo(run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(4).state).events, 'p1')).toBe("Insider doesn't support bots.");
    expect(ephTo(run([{ type: 'start', user: 'p1' }], lobbyWith(3).state).events, 'p1')).toContain('at least 4');
  });

  it('GameDef 有英文名稱、人數、介紹和說明', () => {
    expect(insider.locales.en).toMatchObject({ name: 'Insider', players: '4-8 players' });
    expect(insider.locales.en.desc).not.toMatch(/[一-鿿]/);
    expect(insider.locales.en.help).toContain('/game insider ask');
    expect(insider.locales.en.help).not.toMatch(/[一-鿿]/);
  });
});
