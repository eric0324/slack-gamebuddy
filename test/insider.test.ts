import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyInsider, type IAction, type IState } from '../src/insider.js';
import { DECRYPTO_WORDS } from '../src/decryptoWords.js';

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
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as IAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[], kind = 'insider') =>
  events.filter((e) => e.type === 'prompt' && e.kind === kind) as Extract<GameEvent, { type: 'prompt' }>[];
const values = (p: { options: { value: string }[] }) => p.options.map((o) => o.value);
const dmTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text);
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;

// rng 固定時不洗牌：主持人是 p1 (也是房主)、圈內人是 p2，其他是平民；答案是詞庫第一個詞
const WORD = DECRYPTO_WORDS[0];
const started = (n = 5) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);

describe('insider/setup: 圈內人的房間', () => {
  it('開房：公告標示圈內人', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'insider', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '圈內人', players: ['A'] });
  });

  it('人數不足：至少 4 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')!.text).toContain('至少需要 4 人');
  });

  it('房間已滿：最多 8 人', () => {
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(8).state);
    expect(full.state.players).toHaveLength(8);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const { events } = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(4).state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('圈內人不支援 bot。');
  });

  it('加入、離開、房主離開取消；非房主不能開始', () => {
    const lobby = lobbyWith(4).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(3);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    const notHost = run([{ type: 'start', user: 'p2' }], lobby);
    expect(notHost.state.phase).toBe('lobby');
    expect(ephemeralTo(notHost.events, 'p2')!.text).toContain('只有房主');
  });

  it('取消：公告答案，沒有再來一局', () => {
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], started().state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain(WORD);
    expect(prompts(events, 'rematch')).toHaveLength(0);
    const again = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state);
    expect(again.state).toBe(state);
  });
});

describe('insider/setup: 角色與答案', () => {
  it('剛好 1 位主持人、1 位圈內人 (不同人)', () => {
    const { state } = started(5);
    expect(state.phase).toBe('question');
    expect(state.master).toBe('p1');
    expect(state.insider).toBe('p2');
    expect(state.word).toBe(WORD);
  });

  it('隨機的 rng 也不會讓主持人和圈內人是同一人，答案來自詞庫', () => {
    for (const x of [0, 0.3, 0.5, 0.7]) {
      const { state } = run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, () => x);
      expect(state.master).not.toBe(state.insider);
      expect(DECRYPTO_WORDS).toContain(state.word);
    }
  });

  it('主持人和圈內人的私訊有答案，平民沒有', () => {
    const { events } = started(5);
    expect(dmTo(events, 'p1').join()).toContain(WORD);
    expect(dmTo(events, 'p1').join()).toContain('主持人');
    expect(dmTo(events, 'p2').join()).toContain(WORD);
    expect(dmTo(events, 'p2').join()).toContain('圈內人');
    for (const p of ['p3', 'p4', 'p5']) {
      expect(dmTo(events, p)).toHaveLength(1);
      expect(dmTo(events, p).join()).not.toContain(WORD);
      expect(dmTo(events, p).join()).toContain('平民');
    }
  });

  it('頻道公告主持人和發問方式，不含答案和圈內人', () => {
    const { events } = started(5);
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1>');
    expect(text).toContain('/game insider ask');
    expect(text).toContain('5 分鐘');
    expect(text).not.toContain(WORD);
    expect(text).not.toContain('<@p2>');
    expect(lastTimer(events).ms).toBe(300_000);
  });
});

const ask = (user: string, text: string): IAction => ({ type: 'chat', user, text });
const answer = (question: number, value: 'yes' | 'no' | 'unknown' | 'correct', user = 'p1'): IAction => ({ type: 'answer', user, question, answer: value });

describe('insider/rounds: 發問', () => {
  it('在頻道打字發問：只讓主持人看到問題和四個按鈕', () => {
    const { state, events } = run([ask('p3', '是動物嗎？')], started().state);
    expect(events).toHaveLength(1);
    const [p] = prompts(events);
    expect(p).toMatchObject({ audience: 'ephemeral', user: 'p1' });
    expect(p.text).toContain('<@p3>');
    expect(p.text).toContain('是動物嗎？');
    expect(values(p)).toEqual(['answer:1:yes', 'answer:1:no', 'answer:1:unknown', 'answer:1:correct']);
    expect(p.options.map((o) => o.label)).toEqual(['✅ 是', '❌ 否', '🤷 不知道', '🎯 猜中了']);
    expect(state.questions).toEqual([{ id: 1, user: 'p3', text: '是動物嗎？' }]);
  });

  it('用指令發問：先在頻道公告問題', () => {
    const { events } = run([{ type: 'ask', user: 'p3', text: '比人大嗎' }], started().state);
    expect(announces(events)).toEqual(['❓ <@p3>：比人大嗎']);
    expect(prompts(events)).toHaveLength(1);
  });

  it('忽略主持人、旁觀者、空白訊息，沒有任何回應', () => {
    const s = started().state;
    for (const a of [ask('p1', '大家加油'), ask('Z', '是食物嗎？'), ask('p3', '   ')]) {
      const r = run([a], s);
      expect(r.events).toEqual([]);
      expect(r.state).toBe(s);
    }
  });

  it('問答階段以外的訊息不算問題', () => {
    const lobby = lobbyWith(4).state;
    expect(run([ask('p2', '嗨')], lobby).events).toEqual([]);
    const discuss = run([ask('p3', '是貓嗎'), answer(1, 'correct')], started().state).state;
    expect(run([ask('p3', '誰是圈內人')], discuss).events).toEqual([]);
  });

  it('主持人或旁觀者用 ask 指令被拒', () => {
    const s = started().state;
    expect(ephemeralTo(run([{ type: 'ask', user: 'p1', text: 'x' }], s).events, 'p1')!.text).toContain('主持人');
    expect(ephemeralTo(run([{ type: 'ask', user: 'Z', text: 'x' }], s).events, 'Z')!.text).toContain('不在遊戲裡');
  });

  it('超過 200 字只顯示前 200 字', () => {
    const long = '問'.repeat(250);
    const [p] = prompts(run([ask('p3', long)], started().state).events);
    expect(p.text).toContain('問'.repeat(200));
    expect(p.text).not.toContain('問'.repeat(201));
  });
});

describe('insider/rounds: 主持人回答', () => {
  const asked = () => run([ask('p3', '是動物嗎？'), ask('p4', '會飛嗎')], started().state).state;

  it('回答是／否／不知道：頻道公告', () => {
    expect(announces(run([answer(1, 'yes')], asked()).events)).toEqual(['❓ <@p3>：是動物嗎？ → ✅ 是']);
    expect(announces(run([answer(1, 'no')], asked()).events)).toEqual(['❓ <@p3>：是動物嗎？ → ❌ 否']);
    expect(announces(run([answer(1, 'unknown')], asked()).events)).toEqual(['❓ <@p3>：是動物嗎？ → 🤷 不知道']);
  });

  it('可以不照順序回答', () => {
    const { state, events } = run([answer(2, 'no')], asked());
    expect(announces(events)).toEqual(['❓ <@p4>：會飛嗎 → ❌ 否']);
    expect(state.questions[0].answer).toBeUndefined();
  });

  it('重複回答被拒', () => {
    const { events } = run([answer(1, 'yes'), answer(1, 'no')], asked());
    expect(announces(events)).toEqual([]);
    expect(ephemeralTo(events, 'p1')!.text).toBe('這題已經回答過了。');
  });

  it('問答結束後按舊按鈕被拒', () => {
    const { events } = run([answer(2, 'correct'), answer(1, 'yes')], asked());
    expect(announces(events)).toEqual([]);
    expect(ephemeralTo(events, 'p1')!.text).toBe('問答已經結束了。');
  });

  it('不是主持人不能回答', () => {
    const { state, events } = run([answer(1, 'yes', 'p3')], asked());
    expect(state.questions[0].answer).toBeUndefined();
    expect(ephemeralTo(events, 'p3')!.text).toContain('只有主持人');
  });
});

describe('insider/rounds: 猜中', () => {
  it('主持人按猜中了：記錄猜中的人、公告答案、進入討論', () => {
    const { state, events } = run([ask('p4', `是${WORD}嗎？`), answer(1, 'correct')], started().state);
    expect(state.phase).toBe('discuss');
    expect(state.guesser).toBe('p4');
    expect(announces(events).join('\n')).toContain(`🎉 <@p4> 猜中了！答案是「${WORD}」`);
  });

  it('圈內人自己猜中也算', () => {
    const { state } = run([ask('p2', WORD), answer(1, 'correct')], started().state);
    expect(state.guesser).toBe('p2');
    expect(state.phase).toBe('discuss');
  });

  it('5 分鐘到沒人猜中：全體落敗，公告答案和圈內人，有再來一局', () => {
    const s = started();
    const { state, events } = run([{ type: 'timeout', id: lastTimer(s.events).id }], s.state);
    expect(state.phase).toBe('ended');
    const text = announces(events).join('\n');
    expect(text).toContain('所有人一起落敗');
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: state.players.map((p) => p.id), winners: [] });
    expect(text).toContain(WORD);
    expect(text).toContain('圈內人：<@p2>');
    expect(prompts(events, 'rematch')).toHaveLength(1);
  });
});

// p4 猜中後進入討論；房主 p1 (也是主持人) 提早投票
const guessed = () => run([ask('p4', '是貓嗎'), answer(1, 'correct')], started().state);
const voting = () => run([{ type: 'skip', user: 'p1' }], guessed().state);
const vote = (user: string, target: string): IAction => ({ type: 'vote', user, target });

describe('insider/rounds: 討論', () => {
  it('討論 2 分鐘，附開始投票按鈕；時間到進入投票', () => {
    const g = guessed();
    expect(lastTimer(g.events).ms).toBe(120_000);
    expect(values(prompts(g.events)[0])).toEqual(['skip']);
    const { state, events } = run([{ type: 'timeout', id: lastTimer(g.events).id }], g.state);
    expect(state.phase).toBe('vote');
    expect(prompts(events)).toHaveLength(1);
  });

  it('房主提早投票', () => {
    expect(voting().state.phase).toBe('vote');
  });

  it('不是房主不能提早投票', () => {
    const { state, events } = run([{ type: 'skip', user: 'p3' }], guessed().state);
    expect(state.phase).toBe('discuss');
    expect(ephemeralTo(events, 'p3')!.text).toBe('只有房主可以提早投票。');
  });

  it('問答階段的舊計時器被忽略', () => {
    const s = started();
    const g = run([ask('p4', '是貓嗎'), answer(1, 'correct')], s.state);
    const r = run([{ type: 'timeout', id: lastTimer(s.events).id }], g.state);
    expect(r.state.phase).toBe('discuss');
  });
});

describe('insider/rounds: 投票找圈內人', () => {
  it('候選人是主持人以外的玩家，2 分鐘', () => {
    const { events } = voting();
    expect(values(prompts(events)[0])).toEqual(['vote:p2', 'vote:p3', 'vote:p4', 'vote:p5']);
    expect(lastTimer(events).ms).toBe(120_000);
  });

  it('投票只讓自己看到，可以改票', () => {
    const { state, events } = run([vote('p3', 'p4'), vote('p3', 'p5')], voting().state);
    expect(state.votes).toEqual({ p3: 'p5' });
    expect(ephemeralTo(events, 'p3')!.text).toBe('你投給了 <@p5>');
    expect(announces(events)).toEqual([]);
  });

  it('主持人可以投；不能投自己；旁觀者被拒', () => {
    const v = voting().state;
    expect(run([vote('p1', 'p2')], v).state.votes).toEqual({ p1: 'p2' });
    const self = run([vote('p3', 'p3')], v);
    expect(self.state.votes).toEqual({});
    expect(ephemeralTo(self.events, 'p3')!.text).toBe('不能投自己。');
    const z = run([vote('Z', 'p3')], v);
    expect(z.state.votes).toEqual({});
    expect(ephemeralTo(z.events, 'Z')!.text).toContain('不在遊戲裡');
  });

  it('投票階段以外不能投', () => {
    const { state, events } = run([vote('p3', 'p2')], guessed().state);
    expect(state.votes).toEqual({});
    expect(ephemeralTo(events, 'p3')!.text).toContain('現在不是投票時間');
  });

  it('全部投完提早結束，公告每個人的票', () => {
    const { state, events } = run([vote('p1', 'p2'), vote('p2', 'p3'), vote('p3', 'p2'), vote('p4', 'p2'), vote('p5', 'p3')], voting().state);
    expect(state.phase).toBe('ended');
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> → <@p2>');
    expect(text).toContain('<@p5> → <@p3>');
  });

  it('時間到：沒投的顯示沒投票', () => {
    const v = voting();
    const { state, events } = run([vote('p3', 'p2'), { type: 'timeout', id: lastTimer(v.events).id }], v.state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('<@p4> → 沒投票');
  });
});

describe('insider/rounds: 指認與勝負', () => {
  const finish = (votes: [string, string][]) => {
    const v = voting();
    const r = run(votes.map(([a, b]) => vote(a, b)), v.state);
    return r.state.phase === 'ended' ? r : run([{ type: 'timeout', id: lastTimer(v.events).id }], r.state);
  };
  const result = (votes: [string, string][]) => announces(finish(votes).events).join('\n');

  it('找到圈內人：主持人和平民獲勝，公告答案、圈內人、主持人、猜中的人', () => {
    const text = result([['p3', 'p2'], ['p4', 'p2'], ['p5', 'p3']]);
    expect(text).toContain('🎉 主持人和平民獲勝');
    const end = finish([['p3', 'p2'], ['p4', 'p2'], ['p5', 'p3']]);
    expect(end.events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: end.state.players.map((p) => p.id), winners: end.state.players.map((p) => p.id).filter((id) => id !== 'p2') });
    expect(text).toContain(`答案：「${WORD}」`);
    expect(text).toContain('圈內人：<@p2>');
    expect(text).toContain('主持人：<@p1>');
    expect(text).toContain('猜中的人：<@p4>');
  });

  it('找錯人：圈內人獲勝', () => {
    expect(result([['p3', 'p4'], ['p5', 'p4']])).toContain('🕴️ 圈內人 <@p2> 獲勝');
  });

  it('平手由主持人的票決定', () => {
    expect(result([['p1', 'p2'], ['p3', 'p2'], ['p4', 'p3'], ['p5', 'p3']])).toContain('主持人和平民獲勝');
    expect(result([['p1', 'p3'], ['p3', 'p2'], ['p4', 'p3'], ['p5', 'p2']])).toContain('圈內人 <@p2> 獲勝');
  });

  it('平手但主持人沒投其中一人：沒有指認出任何人', () => {
    const text = result([['p1', 'p5'], ['p3', 'p2'], ['p2', 'p3'], ['p4', 'p2'], ['p5', 'p3']]);
    expect(text).toContain('沒有指認出任何人');
    expect(text).toContain('圈內人 <@p2> 獲勝');
  });

  it('沒人投票：圈內人獲勝', () => {
    const text = result([]);
    expect(text).toContain('沒有指認出任何人');
    expect(text).toContain('圈內人 <@p2> 獲勝');
  });

  it('再來一局：上一局的玩家可以按，按的人當房主', () => {
    const ended = finish([['p3', 'p2']]);
    expect(prompts(ended.events, 'rematch')).toHaveLength(1);
    const z = run([{ type: 'rematch', user: 'Z', channel: 'C1' }], ended.state);
    expect(ephemeralTo(z.events, 'Z')!.text).toContain('只有上一局的玩家');
    const { state, events } = run([{ type: 'rematch', user: 'p3', channel: 'C1' }], ended.state);
    expect(state).toMatchObject({ phase: 'lobby', host: 'p3', players: [{ id: 'p3' }] });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '圈內人' });
  });
});
