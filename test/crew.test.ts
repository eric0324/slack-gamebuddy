import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { applyCrew, trickWinner, type CAction, type Card, type CState } from '../src/crew.js';
import { crew } from '../src/games/crew.js';

const rng = () => 0.99999; // 洗牌不動：牌組是藍 1～9、綠、黃、紫、火箭 1～4 的順序

function run(actions: CAction[], start?: CState, now?: number) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyCrew(state, action, rng, now);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number, unlocked?: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', unlocked },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as CAction),
  ]);
const started = (n: number, unlocked?: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n, unlocked).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const promptTo = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const values = (p: { options: { value: string }[] } | undefined) => p?.options.map((o) => o.value) ?? [];
const labels = (p: { options: { label: string }[] } | undefined) => p?.options.map((o) => o.label) ?? [];

describe('crew/setup: 星際探險隊的房間', () => {
  it('開房：房間公告標示星際探險隊，預設第 1 關', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'crew', host: 'A', phase: 'lobby', mission: 1, unlocked: 1 });
    expect(events).toContainEqual({ type: 'lobby', title: '星際探險隊', host: 'A', players: ['A'], open: true });
  });

  it('房間公告顯示關卡：已解鎖第 7 關時是月背通訊站、3 個任務、🔇 通訊干擾', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1', unlocked: 7 }]);
    expect(state.mission).toBe(7);
    const info = prompts(events)[0].text;
    for (const s of ['第 7 關', '月背通訊站', '3 個任務', '🔇 通訊干擾']) expect(info).toContain(s);
  });

  it('全破 (unlocked 41) 時預設第 40 關並公告已經全破', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1', unlocked: 41 }]);
    expect(state.mission).toBe(40);
    expect(prompts(events)[0].text).toContain('全破');
  });

  it('人數不足 3 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')?.text).toContain('至少需要 3 人');
  });

  it('房間已滿 (5 人) 時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(5).state);
    expect(state.players).toHaveLength(5);
    expect(ephemeralTo(events, 'x')?.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(1).state);
    expect(state.players).toHaveLength(1);
    expect(ephemeralTo(events, 'p1')?.text).toContain('星際探險隊不支援 bot');
  });

  it('頻道已經有遊戲時不能再開房', () => {
    const { events } = run([{ type: 'new', user: 'x', channel: 'C1' }], lobbyWith(2).state);
    expect(ephemeralTo(events, 'x')?.text).toContain('已經有遊戲');
  });

  it('加入、離開、房主離開取消、非房主不能開始', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(2);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'start', user: 'p2' }], lobby).events, 'p2')).toBeDefined();
  });
});

describe('crew/setup: 牌組與發牌', () => {
  it('4 人：每人 10 張，40 張不重複，總共 10 墩', () => {
    const { state } = started(4);
    expect(state.players.map((p) => p.hand.length)).toEqual([10, 10, 10, 10]);
    const all = state.players.flatMap((p) => p.hand);
    expect(new Set(all).size).toBe(40);
    expect(all.filter((c) => c.startsWith('rocket')).sort()).toEqual(['rocket:1', 'rocket:2', 'rocket:3', 'rocket:4']);
    expect(state.tricks).toBe(10);
  });

  it('3 人：一人 14 張、兩人各 13 張，總共 13 墩', () => {
    const { state } = started(3);
    expect(state.players.map((p) => p.hand.length).sort()).toEqual([13, 13, 14]);
    expect(state.tricks).toBe(13);
  });

  it('5 人：每人 8 張，總共 8 墩', () => {
    const { state } = started(5);
    expect(state.players.map((p) => p.hand.length)).toEqual([8, 8, 8, 8, 8]);
    expect(state.tricks).toBe(8);
  });

  it('手牌依藍、綠、黃、紫、火箭，同色由小到大', () => {
    const { state } = started(3);
    const order = ['blue', 'green', 'yellow', 'purple', 'rocket'];
    for (const p of state.players) {
      const key = (c: Card) => order.indexOf(c.split(':')[0]) * 10 + Number(c.split(':')[1]);
      expect(p.hand.map(key)).toEqual([...p.hand.map(key)].sort((a, b) => a - b));
    }
  });
});

describe('crew/setup: 指揮官與開局公告', () => {
  it('持有火箭 4 的人是指揮官，公告指揮官、關卡、劇情、墩數、規則摘要和不要討論手牌', () => {
    const { state, events } = started(4);
    const cmd = state.players[state.commander];
    expect(cmd.hand).toContain('rocket:4');
    const text = announces(events).join('\n');
    for (const s of [`<@${cmd.id}> 是指揮官`, '第 1 關', '點火測試', '新組員第一次坐上駕駛艙', '10 墩', '跟', '火箭', '通訊', '請不要在頻道討論手牌']) expect(text).toContain(s);
    expect(state.phase).toBe('assign');
  });

  it('每位玩家收到手牌私訊，頻道公告不洩漏手牌', () => {
    const { state, events } = started(3);
    const dms = events.filter((e) => e.type === 'dm') as { to: string; text: string }[];
    expect(dms.map((d) => d.to).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(dms.find((d) => d.to === 'p1')!.text).toContain('你的手牌');
    expect(announces(events).join()).not.toContain('你的手牌');
    expect(state.phase).toBe('assign');
  });

  it('「🃏 手牌」只讓自己看到手牌和任務，沒輪到時沒有出牌按鈕；非玩家被拒', () => {
    const { state } = started(3);
    const mine = run([{ type: 'hand', user: 'p2' }], state);
    expect(mine.state).toBe(state);
    const p = promptTo(mine.events, 'p2');
    expect(p?.text).toContain('你的手牌');
    expect(p?.options).toEqual([]);
    expect(ephemeralTo(run([{ type: 'hand', user: 'Z' }], state).events, 'Z')?.text).toContain('不在遊戲中');
  });
});

// 3 人局、洗牌不動：p3 拿到 🚀4 是指揮官，挑任務的順序是 p3、p1、p2
const timeoutOf = (s: CState): CAction => ({ type: 'timeout', id: s.timers.phase! });
const owners = (s: CState) => s.tasks.map((t) => t.owner);

describe('crew/missions: 任務分配', () => {
  it('抽任務並依抽出順序配上標記', () => {
    const { state } = started(3, 3);
    expect(state.tasks).toEqual([
      { card: 'blue:1', token: '1', done: false },
      { card: 'blue:2', token: '2', done: false },
    ]);
  });

  it('公告所有任務和標記，從指揮官開始輪流挑', () => {
    const { state, events } = started(3, 3);
    expect(state.players[state.commander].id).toBe('p3');
    const p = prompts(events).find((x) => x.audience === 'channel' && x.text.includes('挑任務'))!;
    for (const s of ['🟦1 (1)', '🟦2 (2)', '輪到 <@p3> 挑任務']) expect(p.text).toContain(s);
    expect(values(p)).toContain(`pick:${state.seq}:0`);
    expect(values(p)).toContain('hand');
  });

  it('輪流挑：指揮官起依加入順序；不是輪到的人被拒', () => {
    const s0 = started(3, 4).state;
    const s1 = run([{ type: 'pick', user: 'p3', seq: s0.seq, task: 1 }], s0).state;
    expect(owners(s1)).toEqual([undefined, 'p3', undefined]);
    const wrong = run([{ type: 'pick', user: 'p2', seq: s1.seq, task: 0 }], s1);
    expect(wrong.state).toBe(s1);
    expect(ephemeralTo(wrong.events, 'p2')?.text).toContain('還沒輪到你');
    const s2 = run([{ type: 'pick', user: 'p1', seq: s1.seq, task: 0 }], s1).state;
    expect(owners(s2)).toEqual(['p1', 'p3', undefined]);
    expect(ephemeralTo(run([{ type: 'pick', user: 'p2', seq: s0.seq, task: 2 }], s2).events, 'p2')).toBeDefined(); // 過期按鈕
  });

  it('60 秒逾時替他挑剩下的第一張', () => {
    const s0 = started(3, 4).state;
    const s1 = run([{ type: 'pick', user: 'p3', seq: s0.seq, task: 0 }], s0).state;
    const s2 = run([timeoutOf(s1)], s1).state;
    expect(owners(s2)).toEqual(['p3', 'p1', undefined]);
    expect(run([timeoutOf(s0)], s1).state).toBe(s1); // 舊計時器
  });

  it('挑完公告每個人的任務，開始第一墩，指揮官領出', () => {
    const s0 = started(3, 4).state;
    const { state, events } = run(
      [
        { type: 'pick', user: 'p3', seq: s0.seq, task: 0 },
        { type: 'pick', user: 'p1', seq: s0.seq + 1, task: 1 },
        { type: 'pick', user: 'p2', seq: s0.seq + 2, task: 2 },
      ],
      s0,
    );
    expect(owners(state)).toEqual(['p3', 'p1', 'p2']);
    expect(state).toMatchObject({ phase: 'trick', trickNo: 1, leader: 2, turn: 2 });
    const text = announces(events).join('\n');
    for (const s of ['<@p3>：⬜🟦1', '<@p1>：⬜🟦2', '<@p2>：⬜🟦3']) expect(text).toContain(s);
  });
});

describe('crew/missions: 指揮官指派', () => {
  it('任務一張一張翻開，要／不要公開顯示，指揮官指定後翻開下一張', () => {
    const s0 = started(3, 18).state;
    expect(s0.step).toBe('commander');
    const answered = run([{ type: 'answer', user: 'p1', seq: s0.seq, yes: true }], s0);
    const p = prompts(answered.events).find((x) => x.audience === 'channel')!;
    expect(p.text).toContain('第 1/5 張任務：🟦1');
    expect(p.text).toContain('<@p1> 🙋 要');
    expect(values(p)).toEqual(expect.arrayContaining([`answer:${s0.seq}:yes`, `answer:${s0.seq}:no`, `assign:${s0.seq}:p1`, `assign:${s0.seq}:p3`]));
    const s1 = run([{ type: 'assign', user: 'p3', seq: s0.seq, target: 'p1' }], answered.state).state;
    expect(owners(s1)[0]).toBe('p1');
    expect(s1.picker).toBe(1);
    expect(s1.answers).toEqual({});
  });

  it('只有指揮官能指定', () => {
    const s0 = started(3, 18).state;
    const r = run([{ type: 'assign', user: 'p1', seq: s0.seq, target: 'p1' }], s0);
    expect(r.state).toBe(s0);
    expect(ephemeralTo(r.events, 'p1')?.text).toContain('只有指揮官可以指派');
  });

  it('會讓某人比最少的人多 2 張的指定被拒絕', () => {
    const s0 = started(3, 18).state;
    const s1 = run([{ type: 'assign', user: 'p3', seq: s0.seq, target: 'p1' }], s0).state;
    const r = run([{ type: 'assign', user: 'p3', seq: s1.seq, target: 'p1' }], s1);
    expect(r.state).toBe(s1);
    expect(ephemeralTo(r.events, 'p3')?.text).toContain('任務要平均分配');
  });

  it('90 秒逾時給目前任務最少的人 (同數從指揮官開始)', () => {
    const s0 = started(3, 18).state;
    const s1 = run([{ type: 'assign', user: 'p3', seq: s0.seq, target: 'p1' }], s0).state;
    const s2 = run([timeoutOf(s1)], s1).state;
    expect(owners(s2).slice(0, 2)).toEqual(['p1', 'p3']);
    const s3 = run([timeoutOf(s2)], s2).state;
    expect(owners(s3)[2]).toBe('p2');
  });
});

describe('crew/missions: 單人任務', () => {
  it('只公告任務張數和標記，不公開任務內容', () => {
    const { state, events } = started(3, 10);
    expect(state.step).toBe('solo');
    const p = prompts(events).find((x) => x.audience === 'channel' && x.text.includes('單人任務'))!;
    expect(p.text).toContain('2 張任務');
    expect(p.text).not.toContain('🟦1');
    expect(values(p)).toEqual(expect.arrayContaining([`answer:${state.seq}:yes`, `solo:${state.seq}:p1`, `solo:${state.seq}:p2`]));
    expect(values(p)).not.toContain(`solo:${state.seq}:p3`);
  });

  it('回答公開顯示；指揮官選人後翻開任務全部歸他', () => {
    const s0 = started(3, 10).state;
    const answered = run([{ type: 'answer', user: 'p2', seq: s0.seq, yes: true }], s0);
    expect(prompts(answered.events).find((x) => x.audience === 'channel')!.text).toContain('<@p2> 🙋 可以');
    const { state, events } = run([{ type: 'solo', user: 'p3', seq: s0.seq, target: 'p2' }], answered.state);
    expect(owners(state)).toEqual(['p2', 'p2']);
    expect(announces(events).join()).toContain('🟦1');
    expect(state.phase).toBe('trick');
  });

  it('不能選自己；不是指揮官不能選', () => {
    const s0 = started(3, 10).state;
    expect(ephemeralTo(run([{ type: 'solo', user: 'p3', seq: s0.seq, target: 'p3' }], s0).events, 'p3')?.text).toContain('不能選自己');
    expect(ephemeralTo(run([{ type: 'solo', user: 'p1', seq: s0.seq, target: 'p2' }], s0).events, 'p1')?.text).toContain('只有指揮官');
  });

  it('逾時：選指揮官下家起第一個回答可以的人，沒有就選指揮官下家', () => {
    const s0 = started(3, 10).state;
    const s1 = run(
      [
        { type: 'answer', user: 'p1', seq: s0.seq, yes: false },
        { type: 'answer', user: 'p2', seq: s0.seq, yes: true },
      ],
      s0,
    ).state;
    expect(owners(run([timeoutOf(s1)], s1).state)).toEqual(['p2', 'p2']);
    expect(owners(run([timeoutOf(s0)], s0).state)).toEqual(['p1', 'p1']);
  });
});

describe('crew/missions: 隊員失能', () => {
  it('分配前指揮官指定失能的人，挑任務時跳過他', () => {
    const s0 = started(3, 14).state;
    expect(s0.step).toBe('sick');
    const { state, events } = run([{ type: 'sick', user: 'p3', seq: s0.seq, target: 'p2' }], s0);
    expect(state.sick).toBe('p2');
    expect(announces(events).join()).toContain('<@p2> 失能');
    expect(state.step).toBe('pick');
    let s = state;
    for (const who of ['p3', 'p1', 'p3', 'p1']) s = run([{ type: 'pick', user: who, seq: s.seq, task: s.tasks.findIndex((t) => !t.owner) }], s).state;
    expect(owners(s)).toEqual(['p3', 'p1', 'p3', 'p1']);
  });

  it('只有指揮官能指定、不能指定自己；90 秒逾時指定指揮官下家', () => {
    const s0 = started(3, 14).state;
    expect(ephemeralTo(run([{ type: 'sick', user: 'p1', seq: s0.seq, target: 'p2' }], s0).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([{ type: 'sick', user: 'p3', seq: s0.seq, target: 'p3' }], s0).events, 'p3')?.text).toContain('不能選自己');
    expect(run([timeoutOf(s0)], s0).state.sick).toBe('p1');
  });
});

// 分配任務一律逾時自動挑，停在第一墩的通訊時間
function assigned(n: number, mission: number, now?: number) {
  let r = started(n, mission);
  while (r.state.phase === 'assign') r = run([timeoutOf(r.state)], r.state, now);
  return r;
}
// 通訊時間結束，可以出牌
const ready = (n = 3, mission = 1) => {
  const s = assigned(n, mission).state;
  return run([timeoutOf(s)], s).state;
};
// 換掉手牌 (依玩家 id) 和其他欄位
function withHands(s: CState, hands: Record<string, Card[]>, extra: Partial<CState> = {}): CState {
  const c = structuredClone(s);
  for (const p of c.players) if (hands[p.id]) p.hand = hands[p.id];
  return { ...c, ...extra };
}
const play = (user: string, s: CState, card: Card): CAction => ({ type: 'play', user, seq: s.seq, card });
const table = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel' && p.ref?.startsWith('crew:'));

describe('crew/tricks: 牌桌訊息', () => {
  it('第一墩開始時發牌桌訊息：墩數、輪到誰、任務、手牌張數，按鈕有手牌和通訊', () => {
    const { state, events } = assigned(3, 1);
    const t = table(events).at(-1)!;
    expect(t.ref).toBe(`crew:${state.seq}:1`);
    for (const s of ['第 1/13 墩', '<@p3>', '⬜🟦1', '14 張', '通訊時間']) expect(t.text).toContain(s);
    expect(values(t)).toEqual(['hand', 'comm']);
  });

  it('出牌時更新同一則牌桌訊息', () => {
    const s = withHands(ready(), { p3: ['blue:5', 'green:1'], p1: ['blue:8', 'green:2'], p2: ['green:9', 'green:3'] });
    const { events } = run([play('p3', s, 'blue:5')], s);
    const t = table(events);
    expect(t).toHaveLength(1);
    expect(t[0].ref).toBe(s.ref);
    expect(t[0].text).toContain('<@p3> 🟦5');
    expect(t[0].text).toContain('輪到 <@p1>');
  });

  it('📴 無線電靜默的關卡只有手牌按鈕', () => {
    const t = table(assigned(3, 17).events).at(-1)!;
    expect(values(t)).toEqual(['hand']);
  });
});

describe('crew/tricks: 出牌與跟牌', () => {
  const base = () => withHands(ready(), { p3: ['blue:5', 'rocket:2', 'green:1'], p1: ['blue:2', 'rocket:1', 'green:2'], p2: ['green:9', 'rocket:3', 'yellow:3'] });

  it('指揮官領第一墩；領出的人可以出任何牌', () => {
    const s = base();
    expect(s.turn).toBe(s.commander);
    expect(values(promptTo(run([{ type: 'hand', user: 'p3' }], s).events, 'p3'))).toEqual([`play:${s.seq}:blue:5`, `play:${s.seq}:green:1`, `play:${s.seq}:rocket:2`]);
  });

  it('必須跟花色：A 領出 🟦5，B 有 🟦2 和 🚀1 時只能出 🟦2', () => {
    const s = run([play('p3', base(), 'blue:5')], base()).state;
    expect(values(promptTo(run([{ type: 'hand', user: 'p1' }], s).events, 'p1'))).toEqual([`play:${s.seq}:blue:2`]);
    const r = run([play('p1', s, 'rocket:1')], s);
    expect(r.state).toBe(s);
    expect(ephemeralTo(r.events, 'p1')?.text).toContain('要跟');
  });

  it('沒有領出的顏色時可以出任何牌，包含火箭', () => {
    const s = run([play('p3', base(), 'blue:5')], base()).state;
    const s2 = run([play('p1', s, 'blue:2')], s).state;
    expect(labels(promptTo(run([{ type: 'hand', user: 'p2' }], s2).events, 'p2'))).toEqual(['🟩9', '🟨3', '🚀3']);
  });

  it('火箭領出要跟火箭', () => {
    const s = run([play('p3', base(), 'rocket:2')], base()).state;
    expect(labels(promptTo(run([{ type: 'hand', user: 'p1' }], s).events, 'p1'))).toEqual(['🚀1']);
  });

  it('不是輪到的人、手上沒有的牌、過期按鈕被拒', () => {
    const s = base();
    expect(ephemeralTo(run([play('p1', s, 'blue:2')], s).events, 'p1')?.text).toContain('還沒輪到你');
    expect(ephemeralTo(run([play('p3', s, 'blue:9')], s).events, 'p3')).toBeDefined();
    const s1 = run([play('p3', s, 'blue:5')], s).state;
    expect(ephemeralTo(run([{ type: 'play', user: 'p1', seq: s.seq, card: 'blue:2' }], s1).events, 'p1')?.text).toContain('過期');
  });
});

describe('crew/tricks: 吃墩判定', () => {
  it('領出顏色最大的贏，其他顏色不會贏', () => {
    expect(trickWinner([{ id: 'A', card: 'blue:5' }, { id: 'B', card: 'blue:8' }, { id: 'C', card: 'green:9' }])).toBe('B');
  });

  it('有火箭時最大的火箭贏', () => {
    expect(trickWinner([{ id: 'A', card: 'blue:9' }, { id: 'B', card: 'rocket:1' }, { id: 'C', card: 'rocket:3' }])).toBe('C');
  });

  it('公告這墩的牌和贏家，贏家領下一墩', () => {
    const s = withHands(ready(), { p3: ['blue:5', 'green:1'], p1: ['blue:8', 'green:2'], p2: ['green:9', 'green:3'] });
    const { state, events } = run([play('p3', s, 'blue:5'), play('p1', { ...s, seq: s.seq + 1 }, 'blue:8'), play('p2', { ...s, seq: s.seq + 2 }, 'green:9')], s);
    expect(announces(events).join()).toContain('<@p1> 贏了第 1 墩');
    expect(state).toMatchObject({ trickNo: 2, leader: 0, turn: 0, trick: [] });
    expect(table(events).at(-1)!.ref).toBe(`crew:${state.seq}:2`);
  });
});

describe('crew/tricks: 每墩開始的通訊時間', () => {
  it('前 10 秒出牌被拒，顯示還要等幾秒', () => {
    const s = assigned(3, 1, 1_000).state;
    expect(s.ready).toBe(false);
    const r = run([play('p3', s, s.players[2].hand[0])], s, 4_000);
    expect(r.state).toBe(s);
    expect(ephemeralTo(r.events, 'p3')?.text).toContain('通訊時間，7 秒後才能出牌');
  });

  it('通訊時間是 10 秒計時；結束後才開始 2 分鐘出牌計時，可以出牌', () => {
    const { state, events } = assigned(3, 1);
    expect(events.filter((e) => e.type === 'startTimer').at(-1)).toMatchObject({ ms: 10_000 });
    const r = run([timeoutOf(state)], state);
    expect(r.state.ready).toBe(true);
    expect(r.events.filter((e) => e.type === 'startTimer')).toMatchObject([{ ms: 120_000 }]);
    const p = run([play('p3', r.state, r.state.players[2].hand[0])], r.state);
    expect(p.state.trick).toHaveLength(1);
  });
});

describe('crew/tricks: 出牌計時', () => {
  it('2 分鐘逾時代出最小的合法彩色牌 (同數依藍綠黃紫)，公告是系統代出', () => {
    const s = withHands(ready(), { p3: ['green:4', 'blue:4', 'rocket:2'] });
    const { state, events } = run([timeoutOf(s)], s);
    expect(state.trick).toEqual([{ id: 'p3', card: 'blue:4' }]);
    expect(announces(events).join()).toContain('⏰ 逾時，系統替 <@p3> 出了 🟦4');
  });

  it('只剩火箭可出時出最小的火箭', () => {
    const s = withHands(ready(), { p3: ['rocket:3', 'rocket:2'] });
    expect(run([timeoutOf(s)], s).state.trick).toEqual([{ id: 'p3', card: 'rocket:2' }]);
  });

  it('出牌後舊的計時器被忽略', () => {
    const s = withHands(ready(), { p3: ['blue:5', 'green:1'], p1: ['blue:8', 'green:2'] });
    const s1 = run([play('p3', s, 'blue:5')], s).state;
    expect(run([timeoutOf(s)], s1).state).toBe(s1);
  });
});

// 依序出牌 (每一墩開始時先跳過通訊時間)；回傳最後的 state 和所有 events
function playAll(s: CState, cards: [string, Card][]) {
  let state = s;
  const events: GameEvent[] = [];
  for (const [user, card] of cards) {
    if (state.phase === 'trick' && !state.ready) {
      const r = run([timeoutOf(state)], state);
      state = r.state;
      events.push(...r.events);
    }
    const r = run([play(user, state, card)], state);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}
const task = (card: Card, owner: string, token?: CState['tasks'][number]['token']) => ({ card, owner, done: false, ...(token ? { token } : {}) });
// 3 人局，p3 領出：p3、p1、p2
const judged = (hands: Record<string, Card[]>, tasks: CState['tasks'], extra: Partial<CState> = {}) => withHands(ready(), hands, { tasks, ...extra });
const H = { p3: ['blue:9', 'green:9', 'yellow:9'], p1: ['blue:1', 'green:1', 'yellow:1'], p2: ['blue:2', 'green:2', 'yellow:2'] } as Record<string, Card[]>;
const trickOf = (color: string): [string, Card][] => [
  ['p3', `${color}:9` as Card],
  ['p1', `${color}:1` as Card],
  ['p2', `${color}:2` as Card],
];

describe('crew/missions: 任務完成與順序標記', () => {
  it('擁有者贏下包含任務牌的一墩時完成，牌桌標 ✅', () => {
    const s = judged(H, [task('blue:9', 'p3'), task('green:9', 'p3')]);
    const { state, events } = playAll(s, trickOf('blue'));
    expect(state.tasks.map((t) => t.done)).toEqual([true, false]);
    expect(announces(events).join()).toContain('完成任務 ✅🟦9');
    expect(table(events).at(-1)!.text).toContain('✅🟦9');
  });

  it('同一墩可以完成多個任務', () => {
    const s = judged(H, [task('blue:9', 'p3'), task('blue:1', 'p3'), task('green:9', 'p3')]);
    expect(playAll(s, trickOf('blue')).state.tasks.map((t) => t.done)).toEqual([true, true, false]);
  });

  it('數字標記：照順序完成', () => {
    const s = judged(H, [task('blue:9', 'p3', '1'), task('green:9', 'p3', '2'), task('yellow:9', 'p3')]);
    const { state } = playAll(s, [...trickOf('blue'), ...trickOf('green')]);
    expect(state.tasks.map((t) => t.done)).toEqual([true, true, false]);
    expect(state.phase).toBe('trick');
  });

  it('數字標記：同一墩完成 1 和 2 都算符合', () => {
    const s = judged(H, [task('blue:9', 'p3', '2'), task('blue:1', 'p3', '1'), task('green:9', 'p3')]);
    expect(playAll(s, trickOf('blue')).state.phase).toBe('trick');
  });

  it('數字標記：跳號失敗', () => {
    const s = judged(H, [task('blue:9', 'p3', '1'), task('green:9', 'p3', '2'), task('yellow:9', 'p3')]);
    const { state, events } = playAll(s, trickOf('green'));
    expect(state).toMatchObject({ phase: 'ended', outcome: 'fail' });
    expect(announces(events).join()).toContain('順序');
  });

  it('Ω：最後完成成功、提前完成失敗', () => {
    const tasks = [task('blue:9', 'p3', 'Ω'), task('green:9', 'p3')];
    expect(playAll(judged(H, tasks), [...trickOf('green'), ...trickOf('blue')]).state.outcome).toBe('success');
    const early = playAll(judged(H, tasks), trickOf('blue'));
    expect(early.state.outcome).toBe('fail');
    expect(announces(early.events).join()).toContain('Ω');
  });

  it('箭頭：> 在 >> 之前、同墩完成都可以，順序錯失敗', () => {
    const tasks = [task('blue:9', 'p3', '>'), task('green:9', 'p3', '>>'), task('yellow:9', 'p3')];
    expect(playAll(judged(H, tasks), [...trickOf('blue'), ...trickOf('green')]).state.phase).toBe('trick');
    expect(playAll(judged(H, [task('blue:9', 'p3', '>>'), task('blue:1', 'p3', '>'), task('green:9', 'p3')]), trickOf('blue')).state.phase).toBe('trick');
    expect(playAll(judged(H, tasks), trickOf('green')).state.outcome).toBe('fail');
  });
});

describe('crew/missions: 成功與失敗', () => {
  it('任務被別人吃走：失敗並公告原因', () => {
    const s = judged(H, [task('blue:1', 'p1'), task('green:9', 'p3')]);
    const { state, events } = playAll(s, trickOf('blue'));
    expect(state).toMatchObject({ phase: 'ended', outcome: 'fail' });
    expect(announces(events).join()).toContain('🟦1 是 <@p1> 的任務，被 <@p3> 吃走了');
  });

  it('失能的人贏下一墩：失敗', () => {
    const s = judged({ p3: ['blue:1', 'green:9'], p1: ['blue:9', 'green:1'], p2: ['blue:2', 'green:2'] }, [task('green:9', 'p3')], { sick: 'p1' });
    const { state, events } = playAll(s, [
      ['p3', 'blue:1'],
      ['p1', 'blue:9'],
      ['p2', 'blue:2'],
    ]);
    expect(state.outcome).toBe('fail');
    expect(announces(events).join()).toContain('<@p1> 失能時不能贏墩');
  });

  it('全部任務完成就提前成功，不再發下一墩', () => {
    const s = judged(H, [task('blue:9', 'p3')]);
    const { state, events } = playAll(s, trickOf('blue'));
    expect(state).toMatchObject({ phase: 'ended', outcome: 'success', trickNo: 1 });
    expect(table(events).some((t) => t.ref === `crew:${state.seq}:2`)).toBe(false);
  });

  it('牌都打完還有任務沒完成：失敗 (3 人局剩下的那張是任務牌)', () => {
    const s = judged({ p3: ['blue:9', 'green:5'], p1: ['blue:1'], p2: ['blue:2'] }, [task('blue:9', 'p3'), task('green:5', 'p3')], { tricks: 1 });
    const { state, events } = playAll(s, trickOf('blue'));
    expect(state.outcome).toBe('fail');
    expect(announces(events).join()).toContain('有任務沒有完成');
  });
});

const COMM_HAND: Card[] = ['blue:2', 'blue:7', 'green:3', 'yellow:1', 'yellow:4', 'yellow:6', 'rocket:1'];
const commCard = (user: string, s: CState, card: Card): CAction => ({ type: 'commCard', user, seq: s.seq, card });

describe('crew/missions: 通訊', () => {
  it('選單只列每色最大、最小、唯一，沒有火箭', () => {
    const s = withHands(ready(), { p1: COMM_HAND });
    const p = promptTo(run([{ type: 'comm', user: 'p1' }], s).events, 'p1');
    expect(labels(p)).toEqual(['🟦2 (最小)', '🟦7 (最大)', '🟩3 (唯一)', '🟨1 (最小)', '🟨6 (最大)']);
    expect(values(p)).toContain(`commCard:${s.seq}:blue:7`);
  });

  it('通訊時間內可以通訊：公告「A 通訊：🟦7 是我藍色最大的」，牌桌顯示通訊牌', () => {
    const s = withHands(assigned(3, 1).state, { p1: COMM_HAND });
    expect(s.ready).toBe(false);
    const { state, events } = run([commCard('p1', s, 'blue:7')], s);
    expect(announces(events)).toContain('📡 <@p1> 通訊：🟦7 是我藍色最大的');
    expect(table(events).at(-1)!.text).toContain('📡 🟦7 (最大)');
    expect(state.players[0]).toMatchObject({ commUsed: true, comm: { card: 'blue:7', pos: 'top' } });
  });

  it('領出的人可以先通訊再出牌；只有一張的顏色是「唯一」', () => {
    const s = withHands(ready(), { p3: COMM_HAND });
    const { state, events } = run([commCard('p3', s, 'green:3')], s);
    expect(announces(events)).toContain('📡 <@p3> 通訊：🟩3 是我綠色唯一的');
    expect(run([play('p3', state, 'green:3')], state).state.players[2].comm).toBeUndefined(); // 打出後從牌桌拿掉
  });

  it('這墩已經有人出牌時被拒', () => {
    const s = withHands(ready(), { p3: ['blue:5', 'green:1'], p1: COMM_HAND });
    const s1 = run([play('p3', s, 'blue:5')], s).state;
    expect(ephemeralTo(run([{ type: 'comm', user: 'p1' }], s1).events, 'p1')?.text).toContain('要等這墩結束');
    expect(ephemeralTo(run([commCard('p1', s1, 'blue:7')], s1).events, 'p1')?.text).toContain('要等這墩結束');
  });

  it('每關一次；不能通訊的牌被拒；非玩家被拒', () => {
    const s = withHands(ready(), { p1: COMM_HAND });
    const used = run([commCard('p1', s, 'blue:7')], s).state;
    expect(ephemeralTo(run([{ type: 'comm', user: 'p1' }], used).events, 'p1')?.text).toContain('這關已經通訊過了');
    expect(ephemeralTo(run([commCard('p1', s, 'yellow:4')], s).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([commCard('p1', s, 'rocket:1')], s).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([{ type: 'comm', user: 'Z' }], s).events, 'Z')?.text).toContain('不在遊戲中');
  });

  it('🔇 通訊干擾：照樣只能選最大／唯一／最小，但不公開位置', () => {
    const s = withHands(ready(3, 7), { p1: COMM_HAND });
    const { events } = run([commCard('p1', s, 'blue:7')], s);
    expect(announces(events)).toContain('📡 <@p1> 通訊：🟦7 (位置不公開)');
    expect(table(events).at(-1)!.text).not.toContain('最大');
  });

  it('⏳ 通訊延遲：第 N 墩前被拒', () => {
    const s = withHands(ready(3, 12), { p1: COMM_HAND }, { trickNo: 2 });
    expect(ephemeralTo(run([{ type: 'comm', user: 'p1' }], s).events, 'p1')?.text).toContain('從第 3 墩起才能通訊');
    expect(promptTo(run([{ type: 'comm', user: 'p1' }], { ...s, trickNo: 3 }).events, 'p1')).toBeDefined();
  });

  it('📴 無線電靜默：不能通訊', () => {
    const s = withHands(ready(3, 17), { p1: COMM_HAND });
    expect(ephemeralTo(run([{ type: 'comm', user: 'p1' }], s).events, 'p1')?.text).toContain('無線電靜默');
  });
});

// 5 人局、洗牌不動：p4 是指揮官，任務依序被 p4、p5、p1、p2、p3、p4 自動挑走，p1 拿到 🟦3
describe('crew/missions: 5 人局轉交任務', () => {
  it('第 15 關以後、沒有單人／指派的 5 人局才有「🔁 轉交任務」', () => {
    expect(values(table(assigned(5, 21).events).at(-1))).toEqual(['hand', 'comm', 'transfer']);
    expect(values(table(assigned(5, 8).events).at(-1))).not.toContain('transfer');
    expect(values(table(assigned(5, 22).events).at(-1))).not.toContain('transfer');
    expect(values(table(assigned(4, 21).events).at(-1))).not.toContain('transfer');
    expect(values(table(assigned(3, 21).events).at(-1))).not.toContain('transfer');
  });

  it('選自己一張任務和另一位玩家轉交，公告，之後沒有人能再轉交', () => {
    const s = ready(5, 21);
    const menu = promptTo(run([{ type: 'transfer', user: 'p1' }], s).events, 'p1');
    expect(values(menu)).toContain(`transferTo:${s.seq}:2:p4`);
    expect(values(menu)).not.toContain(`transferTo:${s.seq}:2:p1`);
    const { state, events } = run([{ type: 'transferTo', user: 'p1', seq: s.seq, task: 2, target: 'p4' }], s);
    expect(state.tasks[2].owner).toBe('p4');
    expect(announces(events).join()).toContain('<@p1> 把任務 🟦3 轉交給 <@p4>');
    expect(values(table(events).at(-1))).not.toContain('transfer');
    expect(ephemeralTo(run([{ type: 'transfer', user: 'p2' }], state).events, 'p2')?.text).toContain('已經轉交過');
  });

  it('第一墩已經出牌就不能轉交；沒有任務的人不能轉交', () => {
    const s = ready(5, 21);
    const s1 = run([play('p4', s, s.players[3].hand[0])], s).state;
    expect(ephemeralTo(run([{ type: 'transfer', user: 'p1' }], s1).events, 'p1')?.text).toContain('只能在第一墩出牌前轉交');
    const none = withHands(s, {}, { tasks: s.tasks.map((t) => ({ ...t, owner: 'p4' })) });
    expect(ephemeralTo(run([{ type: 'transfer', user: 'p1' }], none).events, 'p1')?.text).toContain('沒有任務');
  });

  it('不能交給失能的人；3、4 人局不能轉交', () => {
    const s = ready(5, 26);
    expect(s.sick).toBe('p5');
    const owner = s.tasks[0].owner!;
    expect(ephemeralTo(run([{ type: 'transferTo', user: owner, seq: s.seq, task: 0, target: 'p5' }], s).events, owner)).toBeDefined();
    const four = ready(4, 21);
    expect(ephemeralTo(run([{ type: 'transfer', user: four.tasks[0].owner! }], four).events, four.tasks[0].owner!)?.text).toContain('不能轉交');
  });
});

// 第 mission 關、頻道已解鎖到 unlocked：一墩就成功或失敗
const finish = (outcome: 'success' | 'fail', mission: number, unlocked: number) =>
  playAll(judged(H, [task('blue:9', outcome === 'success' ? 'p3' : 'p1')], { mission, unlocked }), trickOf('blue'));
const progress = (events: GameEvent[]) => events.filter((e) => e.type === 'crewProgress');
const rematchPrompt = (events: GameEvent[]) => prompts(events).find((p) => p.kind === 'rematch');

describe('crew/missions: 頻道戰役進度', () => {
  it('成功解鎖下一關：送 crewProgress { unlocked: L+1 }', () => {
    const { state, events } = finish('success', 5, 5);
    expect(progress(events)).toEqual([{ type: 'crewProgress', unlocked: 6 }]);
    expect(state.unlocked).toBe(6);
  });

  it('重打舊關卡成功不倒退；第 40 關成功是 41，最多 41', () => {
    expect(progress(finish('success', 3, 9).events)).toEqual([{ type: 'crewProgress', unlocked: 9 }]);
    expect(progress(finish('success', 40, 40).events)).toEqual([{ type: 'crewProgress', unlocked: 41 }]);
    expect(progress(finish('success', 40, 41).events)).toEqual([{ type: 'crewProgress', unlocked: 41 }]);
  });

  it('失敗不改變進度', () => {
    const { state, events } = finish('fail', 5, 5);
    expect(progress(events)).toEqual([]);
    expect(state.unlocked).toBe(5);
  });
});

describe('crew/missions: 選關', () => {
  it('房主選已解鎖的關卡，房間公告用同一個 ref 更新', () => {
    const lobby = lobbyWith(3, 9).state;
    const { state, events } = run([{ type: 'level', user: 'p1', n: 4 }], lobby);
    expect(state.mission).toBe(4);
    const info = prompts(events).find((p) => p.ref === lobby.ref)!;
    expect(info.text).toContain('第 4 關「太空站對接」');
  });

  it('選還沒解鎖或不存在的關卡被拒，顯示可以選的範圍', () => {
    const lobby = lobbyWith(3, 9).state;
    for (const n of [15, 0, 41]) {
      const r = run([{ type: 'level', user: 'p1', n }], lobby);
      expect(r.state).toBe(lobby);
      expect(ephemeralTo(r.events, 'p1')?.text).toContain('可以選第 1～9 關');
    }
  });

  it('非房主、遊戲已經開始時被拒', () => {
    expect(ephemeralTo(run([{ type: 'level', user: 'p2', n: 2 }], lobbyWith(3, 9).state).events, 'p2')?.text).toContain('只有房主可以選關');
    const s = started(3, 9).state;
    const r = run([{ type: 'level', user: 'p1', n: 2 }], s);
    expect(r.state).toBe(s);
    expect(ephemeralTo(r.events, 'p1')?.text).toContain('遊戲已經開始');
  });

  it('不帶數字：只讓他看到已解鎖的關卡清單 (有沒有房間都可以)', () => {
    const r = run([{ type: 'level', user: 'Z', unlocked: 3 }], lobbyWith(3, 3).state);
    const text = ephemeralTo(r.events, 'Z')!.text;
    for (const s of ['第 1 關「點火測試」1 個任務', '第 2 關', '第 3 關「繞地軌道」2 個任務，順序標記 1 2']) expect(text).toContain(s);
    expect(text).not.toContain('第 4 關');
    expect(ephemeralTo(applyCrew(undefined, { type: 'level', user: 'Z', unlocked: 7 }, rng).events, 'Z')!.text).toContain('第 7 關「月背通訊站」3 個任務，🔇 通訊干擾');
  });
});

describe('crew/missions: 重設進度', () => {
  it('房主輸入 reset 只看到確認訊息和按鈕，進度不變', () => {
    const lobby = lobbyWith(3, 20).state;
    const { state, events } = run([{ type: 'reset', user: 'p1' }], lobby);
    expect(state.unlocked).toBe(20);
    expect(progress(events)).toEqual([]);
    const p = promptTo(events, 'p1')!;
    expect(p.options).toEqual([{ value: 'resetConfirm', label: '⚠️ 確定重設' }]);
  });

  it('按確認後重設為第 1 關、房間改第 1 關、送 crewProgress、頻道公告', () => {
    const lobby = lobbyWith(3, 20).state;
    const { state, events } = run([{ type: 'resetConfirm', user: 'p1' }], lobby);
    expect(state).toMatchObject({ unlocked: 1, mission: 1 });
    expect(progress(events)).toEqual([{ type: 'crewProgress', unlocked: 1 }]);
    expect(announces(events).join()).toContain('進度已重設');
    expect(prompts(events).find((p) => p.ref === lobby.ref)!.text).toContain('第 1 關');
  });

  it('非房主、遊戲已經開始時不能重設', () => {
    const lobby = lobbyWith(3, 20).state;
    expect(ephemeralTo(run([{ type: 'reset', user: 'p2' }], lobby).events, 'p2')?.text).toContain('只有房主可以重設進度');
    expect(run([{ type: 'resetConfirm', user: 'p2' }], lobby).state).toBe(lobby);
    const s = started(3, 20).state;
    expect(progress(run([{ type: 'resetConfirm', user: 'p1' }], s).events)).toEqual([]);
  });
});

describe('crew/missions: 結束與戰績', () => {
  it('成功：公告結果、剩下的手牌、進度；result 的 score 是關卡編號；貼「🚀 下一關 (第 6 關)」', () => {
    const { events } = finish('success', 5, 5);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: [], score: 5 });
    const text = announces(events).join('\n');
    for (const s of ['第 5 關「補給艙回收」成功', '剩下的手牌', '🟩9', '解鎖到第 6 關']) expect(text).toContain(s);
    expect(labels(rematchPrompt(events))).toEqual(['🚀 下一關 (第 6 關)']);
  });

  it('失敗：公告原因，score 是 0，貼「🔁 重打第 5 關」', () => {
    const { events } = finish('fail', 5, 5);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: [], score: 0 });
    expect(announces(events).join()).toContain('被 <@p3> 吃走了');
    expect(labels(rematchPrompt(events))).toEqual(['🔁 重打第 5 關']);
  });

  it('第 40 關成功公告全破，按鈕是「🔁 再打第 40 關」', () => {
    const { events } = finish('success', 40, 40);
    expect(announces(events).join()).toContain('全破');
    expect(labels(rematchPrompt(events))).toEqual(['🔁 再打第 40 關']);
  });

  it('按鈕開的新房間是對應的關卡，按的人是房主；只有上一局的玩家可以按', () => {
    const won = finish('success', 5, 5).state;
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], won).state).toMatchObject({ host: 'p2', mission: 6, unlocked: 6, phase: 'lobby' });
    const lost = finish('fail', 5, 5).state;
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], lost).state).toMatchObject({ host: 'p2', mission: 5 });
    expect(run([{ type: 'rematch', user: 'p3', channel: 'C1' }], finish('success', 40, 41).state).state.mission).toBe(40);
    expect(ephemeralTo(run([{ type: 'rematch', user: 'Z', channel: 'C1' }], won).events, 'Z')).toBeDefined();
  });

  it('房主取消：公告已取消，沒有 result、沒有 crewProgress、沒有按鈕；非房主被拒', () => {
    const s = ready();
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('已取消');
    expect(events.some((e) => e.type === 'result' || e.type === 'crewProgress')).toBe(false);
    expect(rematchPrompt(events)).toBeUndefined();
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).state).toBe(state);
    expect(ephemeralTo(run([{ type: 'cancel', user: 'p2' }], s).events, 'p2')).toBeDefined();
  });
});

describe('crew/setup: 遊戲清單與指令說明', () => {
  it('GameDef：代號、名稱、人數、合作分類、不支援 bot', () => {
    expect(crew).toMatchObject({ kind: 'crew', emoji: '🚀', name: '星際探險隊', players: '3～5 人', category: 'coop', noBots: true });
  });

  it('指令說明條列所有指令，包含選關、重設進度和不要討論手牌的提醒', () => {
    for (const s of ['/game crew new', '/game crew start', '/game crew cancel', '/game crew level', '/game crew level <n>', '/game crew reset', '不要在頻道討論手牌']) expect(crew.help).toContain(s);
  });

  it('指令解析', () => {
    const p = (text: string) => crew.parse(text, 'U1', 'C1');
    expect(p('new')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(p('start')).toEqual({ type: 'start', user: 'U1' });
    expect(p('cancel')).toEqual({ type: 'cancel', user: 'U1' });
    expect(p('addbot')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(p('level')).toEqual({ type: 'level', user: 'U1' });
    expect(p('level 12')).toEqual({ type: 'level', user: 'U1', n: 12 });
    expect(p('reset')).toEqual({ type: 'reset', user: 'U1' });
    for (const t of ['help', 'xyz', 'level abc', '']) expect(p(t)).toBeNull();
  });

  it('按鈕路由', () => {
    const b = (kind: string, value: string) => crew.button(kind, value, 'U1', 'C1');
    expect(b('join', 'join')).toEqual({ type: 'join', user: 'U1' });
    expect(b('leave', 'leave')).toEqual({ type: 'leave', user: 'U1' });
    expect(b('start', 'start')).toEqual({ type: 'start', user: 'U1' });
    expect(b('rematch', 'rematch')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
    expect(b('crew', 'hand')).toEqual({ type: 'hand', user: 'U1' });
    expect(b('crew', 'comm')).toEqual({ type: 'comm', user: 'U1' });
    expect(b('crew', 'transfer')).toEqual({ type: 'transfer', user: 'U1' });
    expect(b('crew', 'resetConfirm')).toEqual({ type: 'resetConfirm', user: 'U1' });
    expect(b('crew', 'play:7:blue:3')).toEqual({ type: 'play', user: 'U1', seq: 7, card: 'blue:3' });
    expect(b('crew', 'commCard:7:green:9')).toEqual({ type: 'commCard', user: 'U1', seq: 7, card: 'green:9' });
    expect(b('crew', 'pick:7:2')).toEqual({ type: 'pick', user: 'U1', seq: 7, task: 2 });
    expect(b('crew', 'assign:7:U2')).toEqual({ type: 'assign', user: 'U1', seq: 7, target: 'U2' });
    expect(b('crew', 'answer:7:yes')).toEqual({ type: 'answer', user: 'U1', seq: 7, yes: true });
    expect(b('crew', 'answer:7:no')).toEqual({ type: 'answer', user: 'U1', seq: 7, yes: false });
    expect(b('crew', 'solo:7:U2')).toEqual({ type: 'solo', user: 'U1', seq: 7, target: 'U2' });
    expect(b('crew', 'sick:7:U2')).toEqual({ type: 'sick', user: 'U1', seq: 7, target: 'U2' });
    expect(b('crew', 'transferTo:7:1:U2')).toEqual({ type: 'transferTo', user: 'U1', seq: 7, task: 1, target: 'U2' });
    expect(b('crew', 'nope')).toBeNull();
    expect(b('guess', '1')).toBeNull();
  });

  it('apply 帶入現在的時間：通訊時間內出牌顯示剩下的秒數', () => {
    const s = assigned(3, 1).state;
    const r = crew.apply(s, { type: 'play', user: 'p3', seq: s.seq, card: s.players[2].hand[0] }, rng);
    expect(ephemeralTo(r.events, 'p3')?.text).toContain('秒後才能出牌');
  });
});
