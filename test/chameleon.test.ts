import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyChameleon, type CAction, type CState } from '../src/chameleon.js';
import { CHAMELEON_CARDS } from '../src/chameleonCards.js';

const rng = () => 0.99999;

function run(actions: CAction[], start?: CState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyChameleon(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

// 依序回傳指定的亂數，用完之後固定 0.99999
const seq = (...vals: number[]) => {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0.99999);
};

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as CAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[], kind = 'chameleon') =>
  events.filter((e) => e.type === 'prompt' && e.kind === kind) as Extract<GameEvent, { type: 'prompt' }>[];
const values = (p: { options: { value: string }[] }) => p.options.map((o) => o.value);
const dmTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text);
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;

// 亂數依序：主題卡（第 1 張「水果」）、祕密詞（第 6 格 B2「葡萄」）、變色龍、起始玩家
const CARD = CHAMELEON_CARDS[0];
const SECRET = CARD.words[5];
// n 人局：變色龍是最後一位 pN，起始玩家是 p1（說詞順序 p1 → … → pN）
const started = (n = 4) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, seq(0, 5.5 / 16, (n - 0.5) / n, 0.5 / n));

describe('chameleon/setup: 變色龍的房間', () => {
  it('開房：公告標示變色龍', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'chameleon', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '變色龍', players: ['A'] });
  });

  it('一個頻道一局：進行中不能再開房', () => {
    const { state, events } = run([{ type: 'new', user: 'B', channel: 'C1' }], lobbyWith(3).state);
    expect(state.host).toBe('p1');
    expect(ephemeralTo(events, 'B')!.text).toContain('已經有遊戲');
  });

  it('人數不足：至少 3 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')!.text).toContain('目前 2 人，至少需要 3 人');
  });

  it('房間已滿：最多 8 人', () => {
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(8).state);
    expect(full.state.players).toHaveLength(8);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const lobby = lobbyWith(3).state;
    expect(ephemeralTo(run([{ type: 'addBot', user: 'p1', count: 1 }], lobby).events, 'p1')!.text).toBe('變色龍不支援 bot。');
    expect(ephemeralTo(run([{ type: 'removeBot', user: 'p1', count: 1 }], lobby).events, 'p1')!.text).toBe('變色龍不支援 bot。');
  });

  it('加入、離開、房主離開取消；非房主不能開始', () => {
    const lobby = lobbyWith(4).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(3);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    const notHost = run([{ type: 'start', user: 'p2' }], lobby);
    expect(notHost.state.phase).toBe('lobby');
    expect(ephemeralTo(notHost.events, 'p2')!.text).toContain('只有房主可以開始遊戲');
  });
});

describe('chameleon/setup: 主題卡、祕密詞與身分', () => {
  it('公告主題和 A1～D4 的 4×4 格，不洩漏祕密詞和變色龍', () => {
    const { state, events } = started();
    expect(state.phase).toBe('speak');
    expect(state.topic).toBe(CARD.topic);
    expect(state.words).toEqual(CARD.words);
    const text = announces(events).join('\n');
    expect(text).toContain(CARD.topic);
    CARD.words.forEach((w, i) => expect(text).toContain(`${'ABCD'[Math.floor(i / 4)]}${(i % 4) + 1} ${w}`));
    expect(text).not.toContain('變色龍是');
    expect(text).not.toContain('祕密詞是');
  });

  it('祕密詞是主題卡上的詞（任何亂數都一樣）', () => {
    for (const r of [0, 0.3, 0.7, 0.99999]) {
      const { state } = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state, () => r);
      const card = CHAMELEON_CARDS.find((c) => c.topic === state.topic)!;
      expect(card.words[state.secret!]).toBeDefined();
    }
  });

  it('剛好 1 位變色龍；平民私訊有座標和祕密詞，變色龍沒有', () => {
    const { state, events } = started(5);
    expect(state.chameleon).toBe('p5');
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      const dm = dmTo(events, id).join('\n');
      expect(dm).toContain('B2');
      expect(dm).toContain(SECRET);
    }
    const dm = dmTo(events, 'p5').join('\n');
    expect(dm).toContain('變色龍');
    expect(dm).not.toContain(SECRET);
    expect(dm).not.toContain('B2');
  });

  it('開局公告說詞順序：起始玩家隨機、依加入順序繞一圈', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, seq(0, 0, 0, 2.5 / 4));
    expect(state.order).toEqual(['p3', 'p4', 'p1', 'p2']);
    expect(announces(events).join('\n')).toContain('<@p3> → <@p4> → <@p1> → <@p2>');
  });

  it('取消：公告祕密詞和變色龍，沒有再來一局；非房主被拒', () => {
    const game = started().state;
    const notHost = run([{ type: 'cancel', user: 'p2' }], game);
    expect(notHost.state.phase).toBe('speak');
    expect(ephemeralTo(notHost.events, 'p2')!.text).toContain('只有房主');
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], game);
    expect(state.phase).toBe('ended');
    const text = announces(events).join('\n');
    expect(text).toContain('已取消');
    expect(text).toContain(SECRET);
    expect(text).toContain('<@p4>');
    expect(prompts(events, 'rematch')).toHaveLength(0);
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state).state).toBe(state);
  });
});

// n 人局：p1 → … → pN 依序說完，進入討論
const say = (user: string, text: string): CAction => ({ type: 'say', user, text });
const spoken = (n = 4) =>
  run(
    Array.from({ length: n }, (_, i) => say(`p${i + 1}`, `詞${i + 1}`)),
    started(n).state,
  );
const voting = (n = 4) => run([{ type: 'startVote', user: 'p1' }], spoken(n).state);
const vote = (user: string, target: string): CAction => ({ type: 'vote', user, target });

describe('chameleon/rounds: 輪流說詞', () => {
  it('輪到的人看到說詞按鈕；openSay 開視窗；不是輪到的人被拒', () => {
    const { state, events } = started();
    const p = prompts(events).at(-1)!;
    expect(p.text).toContain('🎤 輪到 <@p1> 說詞（2 分鐘）');
    expect(values(p)).toEqual(['say']);
    expect(lastTimer(events).ms).toBe(120_000);
    const open = run([{ type: 'openSay', user: 'p1' }], state);
    expect(open.events).toContainEqual(expect.objectContaining({ type: 'modal', to: 'p1', kind: 'chameleonWord' }));
    expect(ephemeralTo(run([{ type: 'openSay', user: 'p2' }], state).events, 'p2')!.text).toContain('還沒輪到你');
    const early = run([say('p2', '紫色')], state);
    expect(early.state).toBe(state);
    expect(ephemeralTo(early.events, 'p2')!.text).toContain('還沒輪到你');
  });

  it('說詞成功：公告並換下一位', () => {
    const { state, events } = run([say('p1', '  紫色 ')], started().state);
    expect(announces(events)).toContain('🗣️ <@p1>：紫色');
    expect(state.said.p1).toBe('紫色');
    expect(prompts(events).at(-1)!.text).toContain('輪到 <@p2>');
  });

  it('空白、超過 20 字、主題卡上的詞被拒，還是輪到他（變色龍也一樣）', () => {
    const game = started().state;
    for (const text of ['   ', '一'.repeat(21)]) {
      const r = run([say('p1', text)], game);
      expect(r.state).toBe(game);
      expect(ephemeralTo(r.events, 'p1')).toBeDefined();
    }
    const onCard = run([say('p1', ` ${CARD.words[0]} `)], game);
    expect(onCard.state).toBe(game);
    expect(ephemeralTo(onCard.events, 'p1')!.text).toContain('不能直接說主題卡上的詞');
    // 變色龍 p4：說到祕密詞也是同一句拒絕，不會洩漏
    const atP4 = run([say('p1', 'a'), say('p2', 'b'), say('p3', 'c')], game).state;
    const cham = run([say('p4', SECRET)], atP4);
    expect(cham.state).toBe(atP4);
    expect(ephemeralTo(cham.events, 'p4')!.text).toContain('不能直接說主題卡上的詞');
  });

  it('大小寫不同也算主題卡上的詞', () => {
    const idx = CHAMELEON_CARDS.findIndex((c) => c.words.some((w) => /[A-Za-z]/.test(w)));
    const word = CHAMELEON_CARDS[idx].words.find((w) => /[A-Za-z]/.test(w))!;
    const game = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state, seq((idx + 0.5) / CHAMELEON_CARDS.length, 0, 0, 0)).state;
    const flipped = word.toLowerCase() === word ? word.toUpperCase() : word.toLowerCase();
    const r = run([say('p1', flipped)], game);
    expect(ephemeralTo(r.events, 'p1')!.text).toContain('不能直接說主題卡上的詞');
  });

  it('超時：公告沒有說詞並換下一位；舊計時器被忽略', () => {
    const game = started();
    const id = lastTimer(game.events).id;
    const t = run([{ type: 'timeout', id }], game.state);
    expect(announces(t.events)).toContain('⌛ <@p1> 沒有說詞');
    expect(t.state.turn).toBe(1);
    const after = run([say('p1', 'x')], game.state).state;
    const stale = run([{ type: 'timeout', id }], after);
    expect(stale.state).toBe(after);
    expect(stale.state.turn).toBe(1);
  });

  it('房主 next 跳過；非房主被拒', () => {
    const game = started().state;
    expect(run([{ type: 'next', user: 'p1' }], game).state.turn).toBe(1);
    const no = run([{ type: 'next', user: 'p2' }], game);
    expect(no.state).toBe(game);
    expect(ephemeralTo(no.events, 'p2')!.text).toContain('只有房主');
  });

  it('最後一位說完進入討論：公告每個人說的詞和開始投票按鈕', () => {
    const { state, events } = run([say('p1', '紫色'), { type: 'next', user: 'p1' }, say('p3', '酸'), say('p4', '圓')], started().state);
    expect(state.phase).toBe('discuss');
    const text = [...announces(events), ...prompts(events).map((p) => p.text)].join('\n');
    expect(text).toContain('<@p2>：（沒有說詞）');
    expect(text).toContain('<@p4>：圓');
    expect(text).toContain('找出變色龍');
    expect(values(prompts(events).at(-1)!)).toEqual(['startVote']);
    expect(lastTimer(events).ms).toBe(120_000);
  });
});

describe('chameleon/rounds: 討論與投票', () => {
  it('討論超時進入投票；舊計時器被忽略', () => {
    const game = spoken();
    const id = lastTimer(game.events).id;
    const t = run([{ type: 'timeout', id }], game.state);
    expect(t.state.phase).toBe('vote');
    expect(run([{ type: 'timeout', id }], t.state).state).toBe(t.state);
  });

  it('房主提早投票；非房主被拒', () => {
    const game = spoken().state;
    expect(run([{ type: 'startVote', user: 'p1' }], game).state.phase).toBe('vote');
    const no = run([{ type: 'startVote', user: 'p2' }], game);
    expect(no.state).toBe(game);
    expect(ephemeralTo(no.events, 'p2')!.text).toContain('只有房主可以提早投票');
  });

  it('投票：每位玩家都有按鈕、不能投自己、改票、只讓投票者看到、旁觀者被拒', () => {
    const { state, events } = voting();
    expect(values(prompts(events).at(-1)!)).toEqual(['vote:p1', 'vote:p2', 'vote:p3', 'vote:p4']);
    expect(lastTimer(events).ms).toBe(120_000);
    const self = run([vote('p3', 'p3')], state);
    expect(ephemeralTo(self.events, 'p3')!.text).toContain('不能投自己');
    const v = run([vote('p2', 'p3'), vote('p2', 'p4')], state);
    expect(v.state.votes.p2).toBe('p4');
    expect(ephemeralTo(v.events, 'p2')!.text).toBe('你投給了 <@p4>');
    expect(announces(v.events)).toHaveLength(0);
    expect(ephemeralTo(run([vote('z', 'p1')], state).events, 'z')!.text).toContain('不在遊戲裡');
  });

  it('全部投完提早結束；超時公告沒投票', () => {
    const all = run([vote('p1', 'p2'), vote('p2', 'p1'), vote('p3', 'p2'), vote('p4', 'p2')], voting().state);
    expect(announces(all.events).join('\n')).toContain('<@p4> → <@p2>');
    expect(all.state.phase).toBe('ended');
    const v = voting();
    const t = run([vote('p1', 'p2'), { type: 'timeout', id: lastTimer(v.events).id }], v.state);
    expect(announces(t.events).join('\n')).toContain('<@p3> → 沒投票');
  });

  it('指認錯人：變色龍逃脫獲勝', () => {
    const { state, events } = run([vote('p1', 'p2'), vote('p2', 'p1'), vote('p3', 'p2'), vote('p4', 'p2')], voting().state);
    expect(state.phase).toBe('ended');
    const text = announces(events).join('\n');
    expect(text).toContain('被指認的是 <@p2>');
    expect(text).toContain('變色龍獲勝');
  });

  it('平手由起始玩家的票決定', () => {
    // p1（起始玩家）投 p4、p2 投 p4、p3 投 p2、p4 投 p2 → 平手，p1 投的 p4 被指認
    const { state } = run([vote('p1', 'p4'), vote('p2', 'p4'), vote('p3', 'p2'), vote('p4', 'p2')], voting().state);
    expect(state.phase).toBe('guess');
  });

  it('平手但起始玩家沒投其中一人：沒有指認', () => {
    const { state, events } = run(
      [vote('p1', 'p3'), vote('p2', 'p4'), vote('p3', 'p2'), vote('p4', 'p2'), vote('p5', 'p4')],
      voting(5).state,
    );
    expect(state.phase).toBe('ended');
    const text = announces(events).join('\n');
    expect(text).toContain('沒有指認');
    expect(text).toContain('變色龍獲勝');
  });

  it('沒有人投票：變色龍逃脫獲勝', () => {
    const v = voting();
    const { state, events } = run([{ type: 'timeout', id: lastTimer(v.events).id }], v.state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('變色龍獲勝');
  });
});

// 4 人局抓到變色龍 p4
const caught = () => run([vote('p1', 'p4'), vote('p2', 'p4'), vote('p3', 'p4'), vote('p4', 'p1')], voting().state);

describe('chameleon/rounds: 猜祕密詞、勝負', () => {
  it('抓到變色龍：公告並貼 16 個按鈕', () => {
    const { state, events } = caught();
    expect(state.phase).toBe('guess');
    expect(announces(events).join('\n')).toContain('抓到變色龍 <@p4>');
    const p = prompts(events).at(-1)!;
    expect(p.perRow).toBe(4);
    expect(values(p)).toEqual(Array.from({ length: 16 }, (_, i) => `guess:${i}`));
    expect(p.options[5].label).toBe(`B2 ${SECRET}`);
    expect(lastTimer(events).ms).toBe(120_000);
  });

  it('按鈕猜中：變色龍獲勝；猜錯：平民獲勝', () => {
    const game = caught().state;
    const right = run([{ type: 'guess', user: 'p4', cell: 5 }], game);
    expect(right.state.phase).toBe('ended');
    expect(announces(right.events).join('\n')).toContain('變色龍獲勝');
    const wrong = run([{ type: 'guess', user: 'p4', cell: 0 }], game);
    expect(wrong.state.phase).toBe('ended');
    expect(announces(wrong.events).join('\n')).toContain('平民獲勝');
  });

  it('指令用詞或座標猜，大小寫不拘；不在主題卡上被拒且可以再猜', () => {
    const game = caught().state;
    expect(announces(run([{ type: 'guess', user: 'p4', text: ' b2 ' }], game).events).join('\n')).toContain('變色龍獲勝');
    expect(announces(run([{ type: 'guess', user: 'p4', text: SECRET }], game).events).join('\n')).toContain('變色龍獲勝');
    const bad = run([{ type: 'guess', user: 'p4', text: '火龍果' }], game);
    expect(bad.state).toBe(game);
    expect(ephemeralTo(bad.events, 'p4')).toBeDefined();
  });

  it('非變色龍被拒；不在猜詞階段被拒', () => {
    const game = caught().state;
    const no = run([{ type: 'guess', user: 'p2', cell: 5 }], game);
    expect(no.state).toBe(game);
    expect(ephemeralTo(no.events, 'p2')!.text).toContain('只有變色龍可以猜');
    const early = run([{ type: 'guess', user: 'p4', cell: 5 }], started().state);
    expect(ephemeralTo(early.events, 'p4')).toBeDefined();
    expect(early.state.phase).toBe('speak');
  });

  it('只能猜一次；超時視為猜錯', () => {
    const c = caught();
    const once = run([{ type: 'guess', user: 'p4', cell: 0 }], c.state).state;
    const second = run([{ type: 'guess', user: 'p4', cell: 5 }], once);
    expect(second.state).toBe(once);
    expect(second.events).toHaveLength(0);
    const t = run([{ type: 'timeout', id: lastTimer(c.events).id }], c.state);
    expect(t.state.phase).toBe('ended');
    expect(announces(t.events).join('\n')).toContain('平民獲勝');
  });

  it('結束公告獲勝方、祕密詞和座標、變色龍、每個人說的詞，有再來一局', () => {
    const { events } = run([{ type: 'guess', user: 'p4', cell: 5 }], caught().state);
    const text = announces(events).join('\n');
    expect(text).toContain(`B2「${SECRET}」`);
    expect(text).toContain('變色龍：<@p4>');
    expect(text).toContain('<@p3>：詞3');
    expect(prompts(events, 'rematch')).toHaveLength(1);
  });

  it('再來一局：上一局玩家才能按，新房間房主是按的人', () => {
    const ended = run([{ type: 'guess', user: 'p4', cell: 5 }], caught().state).state;
    const again = run([{ type: 'rematch', user: 'p3', channel: 'C1' }], ended);
    expect(again.state).toMatchObject({ phase: 'lobby', host: 'p3', players: [{ id: 'p3' }] });
    const z = run([{ type: 'rematch', user: 'z', channel: 'C1' }], ended);
    expect(z.state).toBe(ended);
    expect(ephemeralTo(z.events, 'z')!.text).toContain('上一局的玩家');
  });
});
