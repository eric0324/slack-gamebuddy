import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyCockroach, BUGS, type Bug, type CrAction, type CrState } from '../src/cockroach.js';

const rng = () => 0.99999;

function run(actions: CrAction[], start?: CrState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyCockroach(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as CrAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) => events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const dmTo = (events: GameEvent[], user: string) => events.find((e) => e.type === 'dm' && e.to === user) as { text: string } | undefined;
type Prompt = Extract<GameEvent, { type: 'prompt' }>;
const prompts = (events: GameEvent[]) => events.filter((e): e is Prompt => e.type === 'prompt');
const lastChannelPrompt = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel').at(-1)!;
const menuFor = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user)!;
const values = (p: Prompt) => p.options.map((o) => o.value);

// rng 固定為 0.99999：洗牌不換位置、第一位出牌的是最後一位
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const timeout = (s: CrState): CrAction => ({ type: 'timeout', id: s.timers.phase! });
const give = (s: CrState, user: string, bug: Bug, target: string, claim: Bug): CrAction => ({ type: 'give', user, step: s.step, bug, target, claim });
const answer = (s: CrState, user: string, yes: boolean): CrAction => ({ type: 'answer', user, step: s.step, yes });
const peek = (s: CrState, user: string): CrAction => ({ type: 'peek', user, step: s.step });
const pass = (s: CrState, user: string, target: string, claim: Bug): CrAction => ({ type: 'pass', user, step: s.step, target, claim });
const step = (s: CrState, make: (s: CrState) => CrAction, r: () => number = rng) => run([make(s)], s, r);

// 直接擺好手牌和面前的牌，輪到第 turn 位出牌
function table(hands: Bug[][], fronts: Bug[][] = [], turn = 0): CrState {
  const s = structuredClone(started(hands.length).state);
  s.phase = 'give';
  s.turn = turn;
  s.step += 1;
  s.card = undefined;
  s.players.forEach((p, i) => {
    p.hand = [...hands[i]];
    p.front = [...(fronts[i] ?? [])];
  });
  return s;
}

describe('cockroach/setup: 房間', () => {
  it('開房：公告標示蟑螂撲克', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'cockroach', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '蟑螂撲克', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 2 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')!.text).toContain('至少需要 2 人');
  });

  it('房間已滿 (6 人) 時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(6).state);
    expect(state.players).toHaveLength(6);
    expect(ephemeralTo(events, 'x')!.text).toContain('房間已滿');
  });

  it('用 bot 補人數；bot 超過上限只加到 6 人；非房主不能加；可以移除', () => {
    const { state } = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state);
    expect(state.players).toHaveLength(3);
    expect(state.players.slice(1).every((p) => p.id.startsWith('bot:'))).toBe(true);
    const full = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(5).state);
    expect(full.state.players).toHaveLength(6);
    expect(ephemeralTo(full.events, 'p1')!.text).toContain('房間已滿');
    expect(ephemeralTo(run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state).events, 'p2')!.text).toContain('只有房主');
    expect(run([{ type: 'removeBot', user: 'p1', count: 1 }], state).state.players).toHaveLength(2);
  });

  it('離開房間；房主開始前離開就取消', () => {
    expect(run([{ type: 'leave', user: 'p2' }], lobbyWith(3).state).state.players).toHaveLength(2);
    const { state, events } = run([{ type: 'leave', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
  });

  it('頻道已經有遊戲時不能開新房', () => {
    const { events } = run([{ type: 'new', user: 'x', channel: 'C1' }], lobbyWith(2).state);
    expect(ephemeralTo(events, 'x')!.text).toContain('這個頻道已經有遊戲了');
  });
});

describe('cockroach/setup: 牌堆與發牌', () => {
  it('64 張，8 種各 8 張', () => {
    expect(BUGS).toHaveLength(8);
    const s = started(4).state;
    const all = s.players.flatMap((p) => p.hand);
    expect(all).toHaveLength(64);
    for (const b of BUGS) expect(all.filter((x) => x === b.bug)).toHaveLength(8);
  });

  it('4 人每人 16 張、面前 0 張；第一位出牌的是隨機 (rng 最大時是最後一位)', () => {
    const { state } = started(4);
    expect(state.players.map((p) => p.hand.length)).toEqual([16, 16, 16, 16]);
    expect(state.players.every((p) => p.front.length === 0)).toBe(true);
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state.phase).toBe('give');
    expect(state.turn).toBe(3);
  });

  it('6 人除不盡：前 4 位 11 張、後 2 位 10 張', () => {
    expect(started(6).state.players.map((p) => p.hand.length)).toEqual([11, 11, 11, 11, 10, 10]);
  });

  it('真人收到手牌和規則私訊，bot 不收；開始公告有座位、張數、輸的條件，不含手牌', () => {
    const lobby = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(2).state).state;
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobby);
    expect(dmTo(events, 'p1')!.text).toContain('你的手牌');
    expect(dmTo(events, 'p2')).toBeDefined();
    expect(events.some((e) => e.type === 'dm' && e.to.startsWith('bot:'))).toBe(false);
    const text = announces(events)[0];
    for (const s of ['蟑螂撲克', '<@p1>', '<@p2>', `${state.players[0].hand.length} 張`, '4 張']) expect(text).toContain(s);
    for (const b of BUGS) expect(text).not.toContain(`${b.name} ×`);
  });
});

describe('cockroach/setup: 我的手牌', () => {
  it('只讓自己看到每種張數和面前的牌，不改狀態；不在遊戲被拒', () => {
    const s = table([['cockroach', 'bat', 'cockroach', 'bat', 'cockroach'], ['rat']], [['fly'], []]);
    const r = run([{ type: 'hand', user: 'p1' }], s);
    expect(r.state).toBe(s);
    const text = ephemeralTo(r.events, 'p1')!.text;
    expect(text).toContain('🪳 蟑螂 ×3、🦇 蝙蝠 ×2，共 5 張');
    expect(text).toContain('🪰 蒼蠅 ×1');
    expect(ephemeralTo(run([{ type: 'hand', user: 'D' }], s).events, 'D')!.text).toContain('你不在這局遊戲裡');
  });
});

describe('cockroach/rounds: 輪到出牌', () => {
  const s = table([['cockroach', 'rat', 'rat'], ['fly'], ['bat']], [[], ['toad', 'toad'], []]);

  it('公告列出手牌張數和面前的牌；按鈕有出牌和我的手牌', () => {
    const st = started(3);
    expect(announces(st.events).at(-1)).toContain('輪到 <@p3> 出牌');
    expect(announces(st.events).at(-1)).toContain('<@p1> 手牌 22');
    expect(values(lastChannelPrompt(st.events))).toEqual(['play', 'hand']);
    const r = step(step(s, (x) => give(x, 'p1', 'rat', 'p2', 'rat')).state, (x) => answer(x, 'p2', true));
    const text = announces(r.events).at(-1)!;
    expect(text).toContain('輪到 <@p1> 出牌');
    expect(text).toContain('<@p1> 手牌 2｜面前 🐀×1');
    expect(text).toContain('<@p2> 手牌 1｜面前 🐸×2');
  });

  it('選牌選單只列手上有的種類和張數；開選單不改 state；不是輪到的人被拒', () => {
    const r = run([{ type: 'play', user: 'p1' }], s);
    expect(r.state).toBe(s);
    const m = menuFor(r.events, 'p1');
    expect(values(m)).toEqual([`card:${s.step}:cockroach`, `card:${s.step}:rat`]);
    expect(m.options.map((o) => o.label)).toEqual(['🪳 蟑螂 ×1', '🐀 老鼠 ×2']);
    expect(ephemeralTo(run([{ type: 'play', user: 'p2' }], s).events, 'p2')!.text).toContain('還沒輪到你');
  });

  it('目標選單沒有自己；宣稱選單 8 種', () => {
    const t = menuFor(run([{ type: 'card', user: 'p1', step: s.step, bug: 'rat' }], s).events, 'p1');
    expect(values(t)).toEqual([`tgt:${s.step}:rat:p2`, `tgt:${s.step}:rat:p3`]);
    const c = menuFor(run([{ type: 'target', user: 'p1', step: s.step, bug: 'rat', target: 'p3' }], s).events, 'p1');
    expect(values(c)).toEqual(BUGS.map((b) => `claim:${s.step}:rat:${b.bug}:p3`));
  });

  it('出牌並說謊：手牌少一張，頻道公告宣稱不透露真牌，進入回答', () => {
    const one = table([['bat', 'rat'], ['fly'], ['fly']]);
    const { state, events } = step(one, (x) => give(x, 'p1', 'bat', 'p2', 'cockroach'));
    expect(state.players[0].hand).toEqual(['rat']);
    expect(state.phase).toBe('respond');
    expect(state.card).toMatchObject({ bug: 'bat', claim: 'cockroach', from: 'p1', to: 'p2', seen: ['p1'] });
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> 傳了一張牌給 <@p2>：「這是 🪳 蟑螂」');
    expect(text).not.toContain('蝙蝠');
    expect(values(lastChannelPrompt(events))).toEqual([`yes:${state.step}`, `no:${state.step}`, `peek:${state.step}`, 'hand']);
  });

  it('手上沒有的種類、傳給自己、不在遊戲的目標被拒', () => {
    for (const a of [give(s, 'p1', 'bat', 'p2', 'bat'), give(s, 'p1', 'rat', 'p1', 'rat'), give(s, 'p1', 'rat', 'x', 'rat')]) {
      const r = run([a], s);
      expect(r.state).toBe(s);
      expect(ephemeralTo(r.events, 'p1')).toBeDefined();
    }
  });
});

describe('cockroach/rounds: 回答是或不是', () => {
  const base = (bug: Bug, claim: Bug) => step(table([['bat', 'toad', 'rat'], ['fly', 'fly'], ['spider']]), (x) => give(x, 'p1', bug, 'p2', claim)).state;

  it('識破謊言：牌放在宣稱的人面前', () => {
    const { state, events } = step(base('bat', 'cockroach'), (x) => answer(x, 'p2', false));
    expect(state.players[0].front).toEqual(['bat']);
    expect(announces(events).join()).toContain('翻開是 🦇 蝙蝠');
    expect(announces(events).join()).toContain('猜對');
    expect(state.turn).toBe(0);
    expect(state.phase).toBe('give');
  });

  it('相信了謊言：牌放在回答的人面前，他開始下一回合', () => {
    const { state, events } = step(base('bat', 'cockroach'), (x) => answer(x, 'p2', true));
    expect(state.players[1].front).toEqual(['bat']);
    expect(announces(events).join()).toContain('猜錯');
    expect(state.turn).toBe(1);
  });

  it('說實話被相信：宣稱的人收下；說實話被懷疑：回答的人收下', () => {
    expect(step(base('toad', 'toad'), (x) => answer(x, 'p2', true)).state.players[0].front).toEqual(['toad']);
    expect(step(base('toad', 'toad'), (x) => answer(x, 'p2', false)).state.players[1].front).toEqual(['toad']);
  });

  it('不是收到牌的人被拒', () => {
    const s = base('bat', 'cockroach');
    const r = step(s, (x) => answer(x, 'p3', true));
    expect(r.state).toBe(s);
    expect(ephemeralTo(r.events, 'p3')!.text).toContain('這張牌不在你手上');
  });
});

describe('cockroach/rounds: 偷看再傳', () => {
  const base = () => step(table([['bat', 'rat'], ['fly'], ['spider'], ['toad']]), (x) => give(x, 'p1', 'bat', 'p2', 'cockroach')).state;

  it('偷看只讓本人看到真牌、頻道公告、按鈕換成傳下去；目標只列沒看過的人', () => {
    const s = base();
    const { state, events } = step(s, (x) => peek(x, 'p2'));
    expect(state.phase).toBe('pass');
    expect(state.card!.seen).toEqual(['p1', 'p2']);
    expect(announces(events).join()).toContain('<@p2> 偷看了這張牌');
    expect(announces(events).join()).not.toContain('蝙蝠');
    const m = menuFor(events, 'p2');
    expect(m.text).toContain('🦇 蝙蝠');
    expect(values(m)).toEqual([`to:${state.step}:p3`, `to:${state.step}:p4`]);
    expect(values(lastChannelPrompt(events))).toEqual(['passmenu', 'hand']);
    const reopen = run([{ type: 'passMenu', user: 'p2' }], state);
    expect(reopen.state).toBe(state);
    expect(values(menuFor(reopen.events, 'p2'))).toEqual([`to:${state.step}:p3`, `to:${state.step}:p4`]);
    const say = menuFor(run([{ type: 'to', user: 'p2', step: state.step, target: 'p3' }], state).events, 'p2');
    expect(values(say)).toEqual(BUGS.map((b) => `say:${state.step}:${b.bug}:p3`));
  });

  it('傳下去後公告新宣稱；回答猜對時牌放在最後傳牌的人面前', () => {
    const peeked = step(base(), (x) => peek(x, 'p2')).state;
    const { state, events } = step(peeked, (x) => pass(x, 'p2', 'p3', 'bat'));
    expect(announces(events).join()).toContain('<@p2> 把牌傳給 <@p3>：「這是 🦇 蝙蝠」');
    expect(state.card).toMatchObject({ from: 'p2', to: 'p3', claim: 'bat' });
    const done = step(state, (x) => answer(x, 'p3', true)).state;
    expect(done.players[1].front).toEqual(['bat']);
    expect(done.players[0].front).toEqual([]);
  });

  it('不能傳給看過的人', () => {
    const peeked = step(base(), (x) => peek(x, 'p2')).state;
    for (const t of ['p1', 'p2']) expect(step(peeked, (x) => pass(x, 'p2', t, 'bat')).state).toBe(peeked);
  });

  it('大家都看過 (3 人局傳兩手) 和 2 人局沒有偷看再傳，送出 peek 被拒', () => {
    let s = step(table([['bat'], ['fly'], ['spider']]), (x) => give(x, 'p1', 'bat', 'p2', 'bat')).state;
    s = step(s, (x) => peek(x, 'p2')).state;
    const r = step(s, (x) => pass(x, 'p2', 'p3', 'rat'));
    expect(values(lastChannelPrompt(r.events))).toEqual([`yes:${r.state.step}`, `no:${r.state.step}`, 'hand']);
    expect(step(r.state, (x) => peek(x, 'p3')).state).toBe(r.state);
    const two = step(table([['bat'], ['fly']]), (x) => give(x, 'p1', 'bat', 'p2', 'bat'));
    expect(values(lastChannelPrompt(two.events))).toEqual([`yes:${two.state.step}`, `no:${two.state.step}`, 'hand']);
  });

  it('偷看後按舊的是／不是被拒為過期', () => {
    const s = base();
    const peeked = step(s, (x) => peek(x, 'p2')).state;
    const r = run([answer(s, 'p2', true)], peeked);
    expect(r.state).toBe(peeked);
    expect(ephemeralTo(r.events, 'p2')!.text).toContain('這個選單已經過期');
  });
});

describe('cockroach/rounds: 輸家與結束', () => {
  it('拿到其他種類不會因為別種有 3 張就輸', () => {
    const s = step(table([['rat', 'bat'], ['fly'], ['spider']], [[], ['cockroach', 'cockroach', 'cockroach'], []]), (x) =>
      give(x, 'p1', 'rat', 'p2', 'cockroach'),
    ).state;
    const { state } = step(s, (x) => answer(x, 'p2', true));
    expect(state).toMatchObject({ phase: 'give', turn: 1 });
    expect(state.players[1].front).toContain('rat');
  });

  it('拿到第 4 隻蟑螂就輸；公告原因、每人面前的牌和再來一局', () => {
    const s = step(table([['cockroach', 'bat'], ['fly'], ['spider']], [[], ['cockroach', 'cockroach', 'cockroach'], []]), (x) =>
      give(x, 'p1', 'cockroach', 'p2', 'rat'),
    ).state;
    const { state, events } = step(s, (x) => answer(x, 'p2', true));
    expect(state).toMatchObject({ phase: 'ended', loser: 'p2' });
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: state.players.map((p) => p.id), winners: ['p1', 'p3'] });
    const text = announces(events).join('\n');
    expect(text).toContain('<@p2> 輸了：面前有 4 張 🪳 蟑螂');
    expect(text).toContain('<@p1>');
    expect(lastChannelPrompt(events)).toMatchObject({ kind: 'rematch' });
  });

  it('拿到牌的人開始下一回合；輪到時沒手牌就輸', () => {
    const s = step(table([['bat', 'rat'], [], ['spider']]), (x) => give(x, 'p1', 'bat', 'p2', 'bat')).state;
    const r = step(s, (x) => answer(x, 'p2', false));
    expect(r.state).toMatchObject({ phase: 'ended', loser: 'p2' });
    expect(announces(r.events).join()).toContain('手上沒有牌');
    const ok = step(step(table([['bat', 'rat'], ['fly'], ['spider']]), (x) => give(x, 'p1', 'bat', 'p2', 'bat')).state, (x) => answer(x, 'p2', false));
    expect(ok.state).toMatchObject({ phase: 'give', turn: 1 });
    expect(announces(ok.events).join()).toContain('輪到 <@p2> 出牌');
  });

  it('再來一局只有上一局玩家；取消後沒有再來一局', () => {
    const s = step(table([['cockroach'], ['fly'], ['spider']], [[], ['cockroach', 'cockroach', 'cockroach'], []]), (x) =>
      give(x, 'p1', 'cockroach', 'p2', 'cockroach'),
    ).state;
    const ended = step(s, (x) => answer(x, 'p2', false)).state;
    expect(ended.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')!.text).toContain('上一局的玩家');
    expect(run([{ type: 'rematch', user: 'p3', channel: 'C1' }], ended).state).toMatchObject({ phase: 'lobby', host: 'p3' });
    const cancelled = run([{ type: 'cancel', user: 'p1' }], started(3).state);
    expect(cancelled.state.phase).toBe('ended');
    expect(announces(cancelled.events).join()).toContain('取消');
    expect(prompts(cancelled.events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], cancelled.state).state.phase).toBe('ended');
  });
});

describe('cockroach/rounds: 計時與過期選單', () => {
  it('出牌超時：隨機一張、隨機目標、照實宣稱、公告超時', () => {
    const s = table([['bat', 'rat'], ['fly'], ['spider']]);
    const { state, events } = step(s, timeout);
    expect(announces(events).join()).toContain('時間到');
    expect(state.card).toMatchObject({ bug: 'rat', claim: 'rat', from: 'p1', to: 'p3' });
  });

  it('回答超時當作「不是」', () => {
    const s = step(table([['bat'], ['fly'], ['spider']]), (x) => give(x, 'p1', 'bat', 'p2', 'bat')).state;
    const { state, events } = step(s, timeout);
    expect(announces(events).join()).toContain('時間到');
    expect(state.players[1].front).toEqual(['bat']);
  });

  it('偷看後超時：傳給隨機沒看過的人並沿用宣稱', () => {
    let s = step(table([['bat'], ['fly'], ['spider'], ['toad']]), (x) => give(x, 'p1', 'bat', 'p2', 'cockroach')).state;
    s = step(s, (x) => peek(x, 'p2')).state;
    expect(step(s, timeout).state.card).toMatchObject({ from: 'p2', to: 'p4', claim: 'cockroach' });
  });

  it('過期的計時器不影響', () => {
    const s = step(table([['bat'], ['fly'], ['spider']]), (x) => give(x, 'p1', 'bat', 'p2', 'bat')).state;
    const old = timeout(s);
    const answered = step(s, (x) => answer(x, 'p2', true)).state;
    expect(run([old], answered).state).toBe(answered);
  });

  it('step 不同的選單 (claim／yes／no／peek／say) 被拒，state 不變', () => {
    const s = table([['bat', 'rat'], ['fly'], ['spider'], ['toad']]);
    const old = give(s, 'p1', 'bat', 'p2', 'bat');
    const after = step(s, timeout).state;
    const r = run([old], after);
    expect(r.state).toBe(after);
    expect(ephemeralTo(r.events, 'p1')!.text).toContain('這個選單已經過期');
    const resp = step(table([['bat'], ['fly'], ['spider'], ['toad']]), (x) => give(x, 'p1', 'bat', 'p2', 'bat')).state;
    const olds: CrAction[] = [
      { type: 'answer', user: 'p2', step: 0, yes: true },
      { type: 'answer', user: 'p2', step: 0, yes: false },
      { type: 'peek', user: 'p2', step: 0 },
    ];
    for (const a of olds) {
      expect(run([a], resp).state).toBe(resp);
    }
    const peeked = step(resp, (x) => peek(x, 'p2')).state;
    expect(run([{ type: 'pass', user: 'p2', step: 0, target: 'p3', claim: 'bat' }], peeked).state).toBe(peeked);
    expect(ephemeralTo(run([{ type: 'card', user: 'p1', step: 0, bug: 'bat' }], s).events, 'p1')!.text).toContain('過期');
  });
});

describe('cockroach/bots', () => {
  const withBots = (hands: Bug[][], fronts: Bug[][], turn: number) => {
    const s = table(hands, fronts, turn);
    s.players.forEach((p, i) => {
      if (i > 0) p.id = `bot:${i}:B${i}`;
    });
    return s;
  };

  it('bot 收到牌立刻回答，輪到時立刻出牌：最多的種類給面前最多的人、rng 大時宣稱另一種', () => {
    const s = withBots([['bat', 'rat'], ['fly', 'fly', 'rat'], ['toad']], [[], [], ['fly', 'fly']], 0);
    // 真人 p1 把 rat 照實傳給 bot:1 說老鼠；bot:1 回答後拿到牌的人出牌
    const r = step(s, (x) => give(x, 'p1', 'rat', 'bot:1:B1', 'rat'), () => 0.99999);
    const text = announces(r.events).join('\n');
    // bot:1 rng 大：不偷看 (0.99999 ≥ 0.3)、回答「不是」(0.99999 ≥ 0.5)→ 猜錯收下老鼠，接著 bot:1 出牌
    expect(text).toContain('🤖B1 說「不是 🐀 老鼠」');
    expect(text).toContain('🤖B1 猜錯了，牌放在 🤖B1 面前');
    expect(text).toContain('🤖B1 傳了一張牌給 🤖B2：「這是 🦇 蝙蝠」');
    expect(text).toContain('🤖B1 傳了一張牌給 🤖B2');
  });

  it('被宣稱的害蟲 8 張都看得到時一定回答「不是」', () => {
    const s = withBots(
      [['bat'], ['cockroach', 'cockroach', 'cockroach', 'cockroach', 'cockroach'], ['toad']],
      [['cockroach'], [], ['cockroach', 'cockroach']],
      0,
    );
    const r = step(s, (x) => give(x, 'p1', 'bat', 'bot:1:B1', 'cockroach'), () => 0.1);
    expect(announces(r.events).join()).toContain('🤖B1 說「不是 🪳 蟑螂」');
  });

  it('面前已有 3 張被宣稱的害蟲而且可以傳時，一定偷看再傳', () => {
    const s = withBots([['bat'], ['fly'], ['toad']], [[], ['rat', 'rat', 'rat'], []], 0);
    const r = step(s, (x) => give(x, 'p1', 'bat', 'bot:1:B1', 'rat'), () => 0.99999);
    const text = announces(r.events).join('\n');
    expect(text).toContain('🤖B1 偷看了這張牌');
    expect(text).toContain('🤖B1 把牌傳給 🤖B2');
  });

  it('rng 小時偷看再傳 (30%)，沒得傳時 rng 小回答「是」', () => {
    const s = withBots([['bat'], ['fly'], ['toad']], [[], [], []], 0);
    expect(announces(step(s, (x) => give(x, 'p1', 'bat', 'bot:1:B1', 'rat'), () => 0.1).events).join()).toContain('偷看了');
    const two = withBots([['bat'], ['fly']], [[], []], 0);
    expect(announces(step(two, (x) => give(x, 'p1', 'bat', 'bot:1:B1', 'rat'), () => 0.4).events).join()).toContain('🤖B1 說「是 🐀 老鼠」');
  });

  it('1 位真人加 2 個 bot，真人完全不操作也會結束', () => {
    for (const seed of [1, 7, 42]) {
      let x = seed;
      const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      let s = run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state, r).state;
      for (let i = 0; i < 500 && s.phase !== 'ended'; i++) s = run([timeout(s)], s, r).state;
      expect(s.phase).toBe('ended');
      expect(s.loser).toBeDefined();
    }
  });
});

describe('cockroach/en: 英文版', () => {
  const CJK = /[一-鿿]/;
  const enLobby = (n: number) =>
    run([
      { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as CrAction,
      ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as CrAction),
    ]);
  const enStarted = (n: number) => run([{ type: 'start', user: 'p1' }], enLobby(n).state);
  const enTable = (hands: Bug[][], fronts: Bug[][] = []) => {
    const s = table(hands, fronts);
    s.lang = 'en';
    return s;
  };

  it('開局公告、出牌 prompt 和按鈕、私訊都是英文', () => {
    const { state, events } = enStarted(3);
    expect(state.lang).toBe('en');
    const text = announces(events).join('\n');
    expect(text).toContain('🪳 Cockroach Poker begins! All 64 cards are dealt');
    expect(text).toContain("👉 It's <@p3>'s turn to play (2 min)");
    expect(text).not.toMatch(CJK);
    const p = lastChannelPrompt(events);
    expect(p.text).toContain('<@p3>');
    expect(p.options.map((o) => o.label)).toEqual(['🪳 Play a card', '🃏 My hand']);
    expect(p.text).not.toMatch(CJK);
    const dm = dmTo(events, 'p1')!.text;
    expect(dm).toContain('🃏 Your hand:');
    expect(dm).not.toMatch(CJK);
  });

  it('出牌選單、宣稱選單和回答按鈕用英文卡名', () => {
    const s = enTable([['rat', 'bat'], ['fly'], ['toad']]);
    const menu = menuFor(run([{ type: 'play', user: 'p1' }], s).events, 'p1');
    expect(menu.text).not.toMatch(CJK);
    expect(menu.options.map((o) => o.label)).toEqual(['🐀 Rat ×1', '🦇 Bat ×1']);
    const claims = menuFor(run([{ type: 'target', user: 'p1', step: s.step, bug: 'rat', target: 'p2' }], s).events, 'p1');
    expect(claims.options.map((o) => o.label)).toContain('🪲 Stink Bug');
    const { events } = step(s, (x) => give(x, 'p1', 'rat', 'p2', 'bat'));
    expect(announces(events).join()).toContain('📨 <@p1> passed a card to <@p2>: "This is a 🦇 Bat"');
    const respond = lastChannelPrompt(events);
    expect(respond.options.map((o) => o.label)).toEqual(['✅ Yes, a Bat', '❌ Not a Bat', '👀 Peek & pass', '🃏 My hand']);
  });

  it('我的手牌和錯誤回覆是英文', () => {
    const s = enTable([['cockroach', 'cockroach'], ['rat']], [['fly'], []]);
    expect(ephemeralTo(run([{ type: 'hand', user: 'p1' }], s).events, 'p1')!.text).toBe('🃏 Your hand: 🪳 Cockroach ×2 (2 cards)\nIn front of you: 🪰 Fly ×1');
    expect(ephemeralTo(run([{ type: 'play', user: 'p2' }], s).events, 'p2')!.text).toBe("It's not your turn.");
  });

  it('結束公告和再來一局按鈕是英文', () => {
    const s = enTable([['cockroach', 'rat'], ['rat'], ['bat']], [[], ['cockroach', 'cockroach', 'cockroach'], []]);
    const given = step(s, (x) => give(x, 'p1', 'cockroach', 'p2', 'cockroach'));
    const { events } = step(given.state, (x) => answer(x, 'p2', false));
    const text = announces(events).join('\n');
    expect(text).toContain('<@p2> loses: 4 🪳 Cockroach cards in front of them');
    expect(text).not.toMatch(CJK);
    expect(lastChannelPrompt(events).options.map((o) => o.label)).toEqual(['Rematch']);
  });

  it('GameDef 有英文名稱、人數和說明', async () => {
    const { cockroach } = await import('../src/games/cockroach.js');
    const en = cockroach.locales.en;
    expect(en.name).toBe('Cockroach Poker');
    expect(en.players).toBe('2-6 players');
    expect(en.desc).not.toMatch(CJK);
    expect(en.help).toContain('/game cockroach new');
    expect(en.help).toContain('Cockroach-Poker');
    expect(en.help).not.toMatch(CJK);
  });
});
