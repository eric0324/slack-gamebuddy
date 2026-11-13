// 口算擂台的英文版：英文房間的設定面板、題目、揭曉、排名和被拒訊息
import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyMath, type MathAction, type MathState } from '../src/math.js';
import { math } from '../src/games/math.js';

const rng = Math.random;
const CJK = /[一-鿿]/;

function run(actions: MathAction[], start?: MathState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyMath(state, action, rng));
  return { state: state!, events };
}
const texts = (events: GameEvent[]) =>
  events.map((e) => (e.type === 'lobby' || (e.type === 'prompt' && e.kind === 'rematch') ? '' : 'text' in e ? e.text : '')).join('\n');
const labels = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'prompt' && e.kind !== 'rematch' ? e.options.map((o) => o.label) : []));
const started = () =>
  run([
    { type: 'new', user: 'A', channel: 'C1', lang: 'en' },
    { type: 'join', user: 'B' },
    { type: 'start', user: 'A' },
  ]);

describe('math/setup: 口算擂台的語系', () => {
  it('英文局：規則和設定面板都是英文', () => {
    const { state, events } = started();
    expect(state.lang).toBe('en');
    expect(texts(events)).toContain('🧮 Math Duel begins!');
    expect(labels(events)).toEqual(['Compare fractions', '✅ Arithmetic', 'Easy', '✅ Normal', 'Hard', 'Hell', '✅ 10 questions', '15 questions', '20 questions', '▶️ Start']);
    expect(texts(events) + labels(events).join()).not.toMatch(CJK);
  });

  it('`set fractions HELL 15` 不分大小寫', () => {
    expect(run([{ type: 'set', user: 'A', words: ['fractions', 'HELL', '15'] }], started().state).state).toMatchObject({ mode: 'fraction', level: 'hell', total: 15 });
  });

  it('兩種模式 × 四種難度玩完一局：題目、作答、揭曉、排名都是英文', () => {
    for (const mode of ['fraction', 'arith'] as const) {
      for (const level of ['easy', 'normal', 'hard', 'hell'] as const) {
        const s = started().state;
        let r = run([{ type: 'set', user: 'A', seq: s.seq, mode, level }, { type: 'go', user: 'A' }], s);
        const all: GameEvent[] = [...r.events];
        for (let i = 0; i < 10; i++) {
          const ok = r.state.current!.options.indexOf(r.state.current!.answer);
          r = run([{ type: 'answer', user: 'A', index: ok }, { type: 'answer', user: 'B', index: (ok + 1) % r.state.current!.options.length }], r.state);
          all.push(...r.events);
          r = run([{ type: 'timeout', id: r.state.timers.phase! }], r.state);
          all.push(...r.events);
        }
        const t = texts(all) + labels(all).join();
        expect(r.state.phase, `${mode} ${level}`).toBe('ended');
        for (const s2 of ['📐 This game:', 'Question 1/10', 'Answer received', 'answer:', '✅ Correct: <@A> +15', '❌ Wrong: <@B>', '1. <@A> 150 pts (10 correct)', '🏆 <@A> wins!']) expect(t, `${mode} ${level}`).toContain(s2);
        expect(t, `${mode} ${level}`).not.toMatch(CJK);
      }
    }
  });

  it('被拒訊息是英文', () => {
    const s = started().state;
    expect(texts(run([{ type: 'set', user: 'B', level: 'hard' }], s).events)).toBe('Only the host can change the settings');
    expect(texts(run([{ type: 'set', user: 'A', words: ['insane'] }], s).events)).toContain('Unknown setting. Available: fractions, arithmetic, easy, normal, hard, hell, 10, 15, 20');
    const q = run([{ type: 'go', user: 'A' }], s).state;
    expect(texts(run([{ type: 'answer', user: 'A', index: 0 }, { type: 'answer', user: 'A', index: 1 }], q).events)).toBe('You already answered');
  });

  it('大廳和指令說明有英文', () => {
    expect(math.locales.en).toMatchObject({ name: 'Math Duel', players: '2-8 players' });
    expect(math.locales.en.help).toContain('/game math set');
    expect(math.locales.en.help).not.toMatch(CJK);
  });
});
