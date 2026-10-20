import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { incan } from '../src/games/incan.js';
import { applyIncan, botChoice, hazardRisk, newDeck, type IAction, type IState } from '../src/incan.js';

const rng = () => 0.99999; // 洗牌不動：牌庫照 newDeck() 的順序，新神器在最後

function run(actions: IAction[], start?: IState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyIncan(state, action, r);
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
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'incan' && p.audience === 'channel');
const countOf = (cards: string[], pred: (c: string) => boolean) => cards.filter(pred).length;
const isGem = (c: string) => c.startsWith('gem:');
const isRelic = (c: string) => c === 'relic';
const isHazard = (c: string) => !isGem(c) && !isRelic(c);

describe('incan/setup: 印加寶藏的房間', () => {
  it('開房：公告標示印加寶藏', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'incan', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '印加寶藏', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 3 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')?.text).toContain('至少需要 3 人');
  });

  it('房間已滿 (8 人) 時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(8).state);
    expect(state.players).toHaveLength(8);
    expect(ephemeralTo(events, 'x')?.text).toContain('房間已滿');
  });

  it('加入、離開、房主離開取消、頻道已經有遊戲', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p2' }], lobby).state.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    const hostLeft = run([{ type: 'leave', user: 'p1' }], lobby);
    expect(hostLeft.state.phase).toBe('ended');
    expect(announces(hostLeft.events).join()).toContain('取消');
    const busy = run([{ type: 'new', user: 'x', channel: 'C1' }], lobby);
    expect(ephemeralTo(busy.events, 'x')?.text).toBe('這個頻道已經有遊戲了。');
  });
});

describe('incan/setup: 加入與移除 bot', () => {
  it('一個人加 2 個 bot 就能開始；removebot 從最後加入的移除', () => {
    const added = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state).state;
    expect(added.players).toHaveLength(3);
    expect(added.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    const removed = run([{ type: 'removeBot', user: 'p1', count: 1 }], added).state;
    expect(removed.players.map((p) => p.id)).toEqual(added.players.slice(0, 2).map((p) => p.id));
    expect(run([{ type: 'start', user: 'p1' }], added).state.phase).toBe('choose');
  });

  it('超過 8 人只加到滿', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(7).state);
    expect(state.players).toHaveLength(8);
    expect(ephemeralTo(events, 'p1')?.text).toContain('房間已滿');
  });

  it('非房主或開始後被拒', () => {
    expect(ephemeralTo(run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state).events, 'p2')?.text).toContain('只有房主可以加入 bot');
    const s = started(3).state;
    expect(run([{ type: 'addBot', user: 'p1', count: 1 }], s).state.players).toHaveLength(3);
  });
});

describe('incan/setup: 牌庫與開局', () => {
  it('探險牌庫 30 張：15 張寶藏 (照原版寶石數)、5 種危險各 3 張、沒有神器', () => {
    const deck = newDeck();
    expect(deck).toHaveLength(30);
    expect(deck.filter(isGem).map((c) => Number(c.slice(4)))).toEqual([1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17]);
    for (const h of ['spider', 'snake', 'fire', 'rock', 'mummy']) expect(countOf(deck, (c) => c === h)).toBe(3);
    expect(countOf(deck, isRelic)).toBe(0);
  });

  it('第一座神殿加 1 張神器共 31 張，並翻出第一張牌', () => {
    const { state } = started(4);
    const all = [...state.deck, ...state.revealed];
    expect(all).toHaveLength(31);
    expect([countOf(all, isGem), countOf(all, isHazard), countOf(all, isRelic)]).toEqual([15, 15, 1]);
    expect(state.revealed).toEqual(['gem:1']);
    expect(state).toMatchObject({ phase: 'choose', temple: 1, step: 1 });
  });

  it('開局公告玩家、5 座神殿、規則摘要，每人 0 分，然後開始第 1/5 座神殿', () => {
    const { state, events } = started(4);
    const text = announces(events).join('\n');
    for (const p of ['p1', 'p2', 'p3', 'p4']) expect(text).toContain(`<@${p}>`);
    expect(text).toContain('5 座神殿');
    expect(text).toContain('繼續探險');
    expect(text).toContain('回營地');
    expect(text).toContain('神器');
    expect(text).toContain('第 1/5 座神殿');
    expect(state.players.every((p) => p.tent === 0 && p.relics.length === 0)).toBe(true);
    expect(boards(events)).toHaveLength(1);
  });
});

// 下一張翻 card：從牌庫拿出這張 (沒有就新加) 放到最上面，洞裡還沒選的真人全部選繼續探險
function flip(state: IState, card: string) {
  const s = structuredClone(state);
  const c = card as IState['deck'][number];
  if (s.deck.includes(c)) s.deck.splice(s.deck.indexOf(c), 1);
  s.deck.unshift(c);
  const cave = s.players.filter((p) => p.inCave && !isBot(p.id) && !p.choice);
  return run(cave.map((p) => ({ type: 'choose', user: p.id, seq: s.seq, choice: 'go' }) as IAction), s);
}
const player = (s: IState, id: string) => s.players.find((p) => p.id === id)!;

describe('incan/rounds: 神殿與探險步驟', () => {
  it('寶藏平分：3 人翻到 11 顆，各 3 顆、餘數 2 顆留在路上', () => {
    const before = started(3).state;
    const { state } = flip(before, 'gem:11');
    expect(state.players.map((p) => p.carry)).toEqual([3, 3, 3]);
    expect(state.path).toBe(before.path + 2);
  });

  it('寶藏少於人數：4 人翻到 3 顆，沒有人分到，路上多 3 顆', () => {
    const before = started(4).state;
    const { state } = flip(before, 'gem:3');
    expect(state.players.every((p) => p.carry === 0)).toBe(true);
    expect(state.path).toBe(before.path + 3);
  });

  it('神器放在路上，這一步沒有人得到', () => {
    const { state } = flip(started(3).state, 'relic');
    expect(state.pathRelics).toBe(1);
    expect(state.players.every((p) => p.relics.length === 0 && p.carry === 0)).toBe(true);
  });

  it('第一張危險沒事、不同種危險也不會失敗，進入選擇', () => {
    const one = flip(started(3).state, 'spider');
    expect(one.state).toMatchObject({ phase: 'choose', seen: ['spider'], step: 2 });
    const two = flip(one.state, 'snake');
    expect(two.state).toMatchObject({ phase: 'choose', seen: ['spider', 'snake'], step: 3 });
    expect(two.state.players.every((p) => p.inCave)).toBe(true);
    expect(boards(two.events).at(-1)?.options).toHaveLength(2);
  });
});

describe('incan/rounds: 步驟訊息', () => {
  it('顯示神殿／步數、剛翻到的牌、路上的牌、寶石神器、危險、牌庫、洞裡每人寶石、營地、已選 0/2 和兩顆按鈕', () => {
    const s = structuredClone(started(3).state);
    Object.assign(s, { temple: 2, step: 2, revealed: ['gem:5', 'fire'], seen: ['fire'], path: 1, pathRelics: 0 });
    Object.assign(player(s, 'p1'), { carry: 2 });
    Object.assign(player(s, 'p2'), { carry: 2 });
    Object.assign(player(s, 'p3'), { inCave: false, tent: 37 });
    const { state, events } = flip(s, 'relic');
    const b = boards(events).at(-1)!;
    expect(b.ref).toBe(`incan:${state.seq}`);
    expect(b.text).toContain('第 2/5 座神殿第 3 步');
    expect(b.text).toContain('翻到 🏺 神器');
    expect(b.text).toContain('💎 5 顆寶石 → 🔥 火焰 → 🏺 神器');
    expect(b.text).toContain('路上剩 1 顆寶石、神器 1 個');
    expect(b.text).toContain('已出現危險：🔥 火焰');
    expect(b.text).toContain(`牌庫剩 ${state.deck.length} 張`);
    expect(b.text).toContain('<@p1> 2 顆、<@p2> 2 顆');
    expect(b.text).toMatch(/營地：<@p3>/);
    expect(b.text).toContain('已選 0/2');
    expect(b.text).not.toContain('37');
    expect(b.text).not.toContain('帳篷');
    expect(b.options).toEqual([
      { value: `go:${state.seq}`, label: '🔦 繼續探險' },
      { value: `camp:${state.seq}`, label: '⛺ 回營地' },
    ]);
  });
});

const pick = (user: string, seq: number, choice: 'go' | 'camp'): IAction => ({ type: 'choose', user, seq, choice });
// 洞裡的真人依 choices 選擇 (沒列到的選繼續探險)
function chooseAll(state: IState, choices: Record<string, 'go' | 'camp'> = {}) {
  const cave = state.players.filter((p) => p.inCave && !isBot(p.id));
  return run(cave.map((p) => pick(p.id, state.seq, choices[p.id] ?? 'go')), state);
}
// 改 state 的小工具：players 依 id 合併欄位
function patch(state: IState, fields: Partial<IState>, players: Record<string, Partial<IState['players'][number]>> = {}) {
  const s = structuredClone(state);
  Object.assign(s, fields);
  for (const [id, f] of Object.entries(players)) Object.assign(player(s, id), f);
  return s;
}

describe('incan/rounds: 同時選擇', () => {
  it('選擇不公開：私下確認，頻道同一則訊息更新為已選 1/3', () => {
    const s = started(3).state;
    const { state, events } = run([pick('p1', s.seq, 'camp')], s);
    expect(ephemeralTo(events, 'p1')?.text).toBe('你選了 ⛺ 回營地 (揭曉前可以改)');
    const [b] = boards(events);
    expect(b.ref).toBe(`incan:${s.seq}`);
    expect(b.text).toContain('已選 1/3');
    expect(b.text).not.toContain('回營地');
    expect(b.text).not.toContain('繼續探險');
    expect(announces(events)).toEqual([]);
    expect(player(state, 'p1').choice).toBe('camp');
  });

  it('改選擇：選擇改成繼續探險，已選人數不變', () => {
    const s = started(3).state;
    const { state, events } = run([pick('p1', s.seq, 'camp'), pick('p1', s.seq, 'go')], s);
    expect(player(state, 'p1').choice).toBe('go');
    expect(ephemeralTo(events, 'p1')?.text).toBe('你選了 🔦 繼續探險 (揭曉前可以改)');
    expect(boards(events)).toEqual([]);
  });

  it('已在營地、局外人、舊按鈕被拒，只讓本人看到', () => {
    const s = patch(started(3).state, {}, { p3: { inCave: false } });
    expect(ephemeralTo(run([pick('p3', s.seq, 'go')], s).events, 'p3')?.text).toBe('你已經回營地了。');
    expect(ephemeralTo(run([pick('x', s.seq, 'go')], s).events, 'x')?.text).toBe('你不在這局遊戲裡。');
    const stale = run([pick('p1', s.seq - 1, 'go')], s);
    expect(ephemeralTo(stale.events, 'p1')?.text).toContain('過期');
    expect(player(stale.state, 'p1').choice).toBeUndefined();
  });

  it('全員選完立刻揭曉，不等 30 秒', () => {
    const s = started(3).state;
    const { state } = chooseAll(s);
    expect(state.seq).toBe(s.seq + 1);
    expect(state.step).toBe(2);
  });
});

describe('incan/rounds: 揭曉與回營', () => {
  it('步驟訊息改成每人的選擇並拿掉按鈕，再發下一步的新訊息', () => {
    const s = started(3).state;
    const { events } = chooseAll(s, { p2: 'camp' });
    const [old, next] = boards(events);
    expect(old.ref).toBe(`incan:${s.seq}`);
    expect(old.options).toEqual([]);
    expect(old.text).toContain('<@p1> 🔦 繼續探險');
    expect(old.text).toContain('<@p2> ⛺ 回營地');
    expect(next.ref).toBe(`incan:${s.seq + 1}`);
  });

  it('兩人回營平分路上寶石，餘數留路上，連同這座神殿的寶石進帳篷；第三人留在洞裡', () => {
    const s = patch(started(3).state, { path: 5 }, { p1: { carry: 6 }, p2: { carry: 6 }, p3: { carry: 6 } });
    const { state, events } = chooseAll(s, { p1: 'camp', p2: 'camp' });
    expect([player(state, 'p1').tent, player(state, 'p2').tent]).toEqual([8, 8]);
    expect([player(state, 'p1').carry, player(state, 'p2').inCave, player(state, 'p3').inCave]).toEqual([0, false, true]);
    expect(state.step).toBe(2);
    expect(state.path).toBe(1 + gemsLeft(state));
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1>');
    expect(text).toContain('2 顆');
  });

  it('全部回營：平分路上寶石，這座神殿結束', () => {
    const s = patch(started(3).state, { path: 7 }, { p1: { carry: 1 } });
    const { state, events } = chooseAll(s, { p1: 'camp', p2: 'camp', p3: 'camp' });
    expect(state.players.map((p) => p.tent)).toEqual([3, 2, 2]);
    expect(state.temple).toBe(2);
    expect(announces(events).join('\n')).toContain('第 1/5 座神殿結束');
  });
});

// 下一步翻到的寶藏留在路上的餘數 (測試用：直接看最新翻的牌)
function gemsLeft(s: IState) {
  const last = s.revealed.at(-1)!;
  if (!last.startsWith('gem:')) return 0;
  const n = Number(last.slice(4));
  const cave = s.players.filter((p) => p.inCave).length;
  return n - Math.floor(n / cave) * cave;
}

describe('incan/rounds: 神器', () => {
  it('恰好一人回營：拿走路上的神器，全局第 1 個 5 分', () => {
    const s = patch(started(3).state, { pathRelics: 1 });
    const { state, events } = chooseAll(s, { p1: 'camp' });
    expect(player(state, 'p1').relics).toEqual([5]);
    expect(state).toMatchObject({ pathRelics: 0, relicsTaken: 1 });
    expect(announces(events).join('\n')).toMatch(/<@p1>.*神器/);
  });

  it('兩人同時回營：沒有人拿到，神器留在路上', () => {
    const s = patch(started(3).state, { pathRelics: 1 });
    const { state } = chooseAll(s, { p1: 'camp', p2: 'camp' });
    expect(state.players.every((p) => p.relics.length === 0)).toBe(true);
    expect(state).toMatchObject({ pathRelics: 1, relicsTaken: 0 });
  });

  it('第 4、5 個神器各 10 分；一次拿多個依序計分', () => {
    const fourth = chooseAll(patch(started(3).state, { pathRelics: 2, relicsTaken: 3 }), { p1: 'camp' }).state;
    expect(player(fourth, 'p1').relics).toEqual([10, 10]);
    const third = chooseAll(patch(started(3).state, { pathRelics: 2, relicsTaken: 2 }), { p1: 'camp' }).state;
    expect(player(third, 'p1').relics).toEqual([5, 10]);
    expect(third.relicsTaken).toBe(4);
  });
});

describe('incan/rounds: 逾時', () => {
  it('30 秒到沒選的真人視為回營地，標示「逾時，自動回營」', () => {
    const s = started(3).state;
    const chose = run([pick('p1', s.seq, 'go')], s).state;
    const { state, events } = run([{ type: 'timeout', id: chose.timers.phase! }], chose);
    expect([player(state, 'p2').inCave, player(state, 'p3').inCave, player(state, 'p1').inCave]).toEqual([false, false, true]);
    expect(boards(events)[0].text).toContain('<@p2> ⛺ 回營地 (逾時，自動回營)');
    expect(boards(events)[0].text).not.toContain('<@p1> 🔦 繼續探險 (逾時');
  });

  it('舊計時器被忽略', () => {
    const s = chooseAll(started(3).state).state;
    const { state, events } = run([{ type: 'timeout', id: s.timers.phase! - 1 }], s);
    expect(state).toBe(s);
    expect(events).toEqual([]);
  });
});

// 把牌庫裡的一張牌移到路上 (當作這座神殿已經翻過)
function onPath(state: IState, card: string) {
  const s = structuredClone(state);
  const c = card as IState['deck'][number];
  s.deck.splice(s.deck.indexOf(c), 1);
  s.revealed.push(c);
  if (c === 'relic') s.pathRelics++;
  else if (!c.startsWith('gem:')) s.seen.push(c as IState['seen'][number]);
  return s;
}
const all = (s: IState) => [...s.deck, ...s.revealed];

describe('incan/rounds: 探險失敗', () => {
  it('第二張同種危險：洞裡的人失去這座神殿的寶石，帳篷不受影響，那張危險移出、同種另一張留下', () => {
    const s = patch(onPath(started(3).state, 'fire'), {}, { p1: { carry: 9 }, p2: { carry: 9 }, p3: { inCave: false, tent: 5 } });
    const { state, events } = flip(s, 'fire');
    expect(state.players.map((p) => p.tent)).toEqual([0, 0, 5]);
    expect(state.temple).toBe(2);
    expect(countOf(all(state), (c) => c === 'fire')).toBe(2);
    const text = announces(events).join('\n');
    expect(text).toContain('🔥 火焰');
    expect(text).toContain('探險失敗');
    expect(text).toMatch(/<@p1>.*<@p2>.*空手而回/);
  });
});

describe('incan/rounds: 神殿結束', () => {
  it('沒翻到的神器留在牌庫，翻開的牌洗回：第二座 32 張、2 張神器', () => {
    const { state } = chooseAll(started(4).state, { p1: 'camp', p2: 'camp', p3: 'camp', p4: 'camp' });
    expect(state.temple).toBe(2);
    expect(all(state)).toHaveLength(32);
    expect(countOf(all(state), isRelic)).toBe(2);
  });

  it('移除的牌不回來：第二張毒蛇失敗、路上 1 個神器 → 第二座 15 寶藏、14 危險 (毒蛇 2)、1 神器', () => {
    const s = onPath(onPath(started(3).state, 'relic'), 'snake');
    const { state, events } = flip(s, 'snake');
    const cards = all(state);
    expect([countOf(cards, isGem), countOf(cards, isHazard), countOf(cards, (c) => c === 'snake'), countOf(cards, isRelic)]).toEqual([15, 14, 2, 1]);
    expect(cards).toHaveLength(30);
    expect(announces(events).join('\n')).toContain('神器沒人拿走');
  });

  it('真人私下收到帳篷，頻道不公開總分', () => {
    const s = patch(started(3).state, { path: 0 }, { p1: { inCave: false, tent: 12, relics: [5] } });
    const { events } = chooseAll(s, { p2: 'camp', p3: 'camp' });
    expect(ephemeralTo(events, 'p1')?.text).toBe('你的帳篷：12 顆寶石、神器 1 個，共 17 分');
    expect(ephemeralTo(events, 'p2')?.text).toBe('你的帳篷：0 顆寶石、神器 0 個，共 0 分');
    expect(announces(events).join('\n')).not.toContain('17');
  });

  it('牌庫翻完時洞裡的人視為全部回營地', () => {
    const s = patch(started(3).state, { deck: [], path: 0 }, { p1: { carry: 4 } });
    const { state, events } = chooseAll(s);
    expect(state.temple).toBe(2);
    expect(player(state, 'p1').tent).toBe(4);
    expect(announces(events).join('\n')).toContain('牌庫翻完');
  });
});

// 第 5 座神殿裡、大家都在營地以外的狀態：洞裡的人全部回營就結束遊戲
const lastTemple = (players: Record<string, Partial<IState['players'][number]>>) => patch(started(3).state, { temple: 5, path: 0 }, players);
const resultOf = (events: GameEvent[]) => events.find((e) => e.type === 'result');
const endAll = (s: IState) => chooseAll(s, { p1: 'camp', p2: 'camp', p3: 'camp' });

describe('incan/rounds: 勝負與結束', () => {
  it('5 座神殿後最高分獲勝：公告寶石、神器、總分、排名，送出 result，貼再來一局', () => {
    const { state, events } = endAll(lastTemple({ p1: { tent: 38, relics: [5, 5] }, p2: { tent: 40 }, p3: { tent: 31 } }));
    expect(state.phase).toBe('ended');
    expect(resultOf(events)).toEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1'] });
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> 獲勝');
    expect(text).toContain('1. <@p1> 48 分 (寶石 38、神器 2 個 10 分)');
    expect(text).toContain('2. <@p2> 40 分');
    expect(text).toContain('3. <@p3> 31 分');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('同分比神器多的獲勝', () => {
    const { events } = endAll(lastTemple({ p1: { tent: 30, relics: [5, 5] }, p2: { tent: 40 } }));
    expect(resultOf(events)).toMatchObject({ winners: ['p1'] });
  });

  it('同分同神器並列獲勝，包括全員 0 分', () => {
    const tie = endAll(lastTemple({ p1: { tent: 35, relics: [5] }, p2: { tent: 35, relics: [5] }, p3: { tent: 30 } }));
    expect(resultOf(tie.events)).toMatchObject({ winners: ['p1', 'p2'] });
    expect(resultOf(endAll(lastTemple({})).events)).toMatchObject({ winners: ['p1', 'p2', 'p3'] });
  });

  it('再來一局只有上一局玩家可以按，按的人成為新房主；結束後舊按鈕被忽略', () => {
    const ended = endAll(lastTemple({})).state;
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')?.text).toContain('只有上一局的玩家');
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended).state).toMatchObject({ phase: 'lobby', host: 'p2' });
    const old = run([pick('p1', ended.seq, 'go'), { type: 'timeout', id: ended.timerSeq }], ended);
    expect(old.state).toBe(ended);
    expect(old.events).toEqual([]);
  });

  it('房主取消：公告已取消，沒有 result、沒有再來一局；非房主取消被拒', () => {
    const s = started(3).state;
    expect(ephemeralTo(run([{ type: 'cancel', user: 'p2' }], s).events, 'p2')?.text).toContain('只有房主可以取消');
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
    expect(resultOf(events)).toBeUndefined();
    expect(prompts(events)).toEqual([]);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).events).toEqual([]);
  });
});

// 牌庫：n 張，其中 hazards 依序放進去，剩下補寶藏
const deckOf = (n: number, hazards: string[]) => [...hazards, ...Array.from({ length: n - hazards.length }, () => 'gem:1')] as IState['deck'];
const botState = (fields: Partial<IState>, carry = 0, cave = 3) => {
  const s = patch(started(3).state, { revealed: [], seen: [], pathRelics: 0, ...fields }, { p1: { carry } });
  s.players.forEach((p, i) => (p.inCave = i < cave));
  return s;
};

describe('incan/bots: bot 的選擇策略', () => {
  it('危險率：牌庫中這座神殿出現過的危險剩下張數 ÷ 牌庫張數', () => {
    expect(hazardRisk(botState({ seen: [], deck: deckOf(20, ['spider']) }))).toBe(0);
    expect(hazardRisk(botState({ seen: ['spider', 'snake'], deck: deckOf(20, ['spider', 'spider', 'snake', 'snake', 'fire']) }))).toBe(0.2);
  });

  it('還沒出現危險就繼續 (即使拿了 12 顆)', () => {
    const s = botState({ deck: deckOf(25, ['spider', 'spider']) }, 12);
    expect(botChoice(s, s.players[0])).toBe('go');
  });

  it('危險率 ≥ 0.2 就回營', () => {
    const s = botState({ seen: ['spider', 'snake'], deck: deckOf(20, ['spider', 'spider', 'snake', 'snake']) });
    expect(botChoice(s, s.players[0])).toBe('camp');
  });

  it('拿到 10 顆以上而且危險率 > 0 就回營；寶石不多就冒險', () => {
    const rich = botState({ seen: ['spider'], deck: deckOf(25, ['spider', 'spider']) }, 10);
    expect(botChoice(rich, rich.players[0])).toBe('camp');
    const poor = botState({ seen: ['spider'], deck: deckOf(25, ['spider', 'spider']) }, 4);
    expect(botChoice(poor, poor.players[0])).toBe('go');
  });

  it('洞裡只剩自己而且路上有神器就回營', () => {
    const s = botState({ pathRelics: 1, deck: deckOf(25, []) }, 0, 1);
    expect(botChoice(s, s.players[0])).toBe('camp');
    const two = botState({ pathRelics: 1, deck: deckOf(25, []) }, 0, 2);
    expect(botChoice(two, two.players[0])).toBe('go');
  });

  it('bot 立刻選好、算在已選裡，但不公開選擇；真人選完就揭曉', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state);
    const b = boards(events).at(-1)!;
    expect(b.text).toContain('已選 2/3');
    expect(b.text).not.toContain('繼續探險');
    expect(state.players.filter((p) => isBot(p.id)).every((p) => p.choice)).toBe(true);
    expect(chooseAll(state).state.seq).toBe(state.seq + 1);
  });
});

// 簡單的線性同餘亂數，讓整局洗牌有變化又可重現
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

describe('incan/bots: 一個人也能玩完整局', () => {
  it('1 位真人 + 2 個 bot，真人不操作、每次都逾時，遊戲會結束並送出 result；bot 不會收到帳篷', () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
      const r = seeded(seed);
      let { state, events } = run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state, r);
      const seen: GameEvent[] = [...events];
      for (let i = 0; i < 20 && state.phase !== 'ended'; i++) {
        ({ state, events } = run([{ type: 'timeout', id: state.timers.phase! }], state, r));
        seen.push(...events);
      }
      expect(state.phase).toBe('ended');
      expect(state.temple).toBe(5);
      expect(resultOf(seen)).toMatchObject({ players: state.players.map((p) => p.id) });
      expect(seen.filter((e) => e.type === 'ephemeral' && isBot(e.to))).toEqual([]);
      expect(boards(seen).some((b) => b.text.includes('<@p1> ⛺ 回營地 (逾時，自動回營)'))).toBe(true);
    }
  });
});

describe('incan/setup: 指令解析與按鈕 (GameDef)', () => {
  it('大廳資訊：💎 印加寶藏、3～8 人、心理戰', () => {
    expect(incan).toMatchObject({ kind: 'incan', emoji: '💎', name: '印加寶藏', players: '3～8 人', category: 'bluff' });
    expect(incan.apply).toBe(applyIncan);
  });

  it('指令解析：new、start、cancel、addbot、removebot', () => {
    expect(incan.parse('new', 'u', 'C1')).toEqual({ type: 'new', user: 'u', channel: 'C1' });
    expect(incan.parse('start', 'u', 'C1')).toEqual({ type: 'start', user: 'u' });
    expect(incan.parse('cancel', 'u', 'C1')).toEqual({ type: 'cancel', user: 'u' });
    expect(incan.parse('addbot', 'u', 'C1')).toEqual({ type: 'addBot', user: 'u', count: 1 });
    expect(incan.parse('addbot 3', 'u', 'C1')).toEqual({ type: 'addBot', user: 'u', count: 3 });
    expect(incan.parse('removebot 2', 'u', 'C1')).toEqual({ type: 'removeBot', user: 'u', count: 2 });
  });

  it('help 和不認識的子指令回傳 null (顯示說明)，說明列出所有指令和兩顆按鈕', () => {
    expect(incan.parse('help', 'u', 'C1')).toBeNull();
    expect(incan.parse('dig', 'u', 'C1')).toBeNull();
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(incan.help).toContain(`/game incan ${cmd}`);
    expect(incan.help).toContain('🔦 繼續探險');
    expect(incan.help).toContain('⛺ 回營地');
  });

  it('按鈕路由：join、leave、start、rematch、go:<seq>、camp:<seq>', () => {
    expect(incan.button('join', 'join', 'u', 'C1')).toEqual({ type: 'join', user: 'u' });
    expect(incan.button('leave', 'leave', 'u', 'C1')).toEqual({ type: 'leave', user: 'u' });
    expect(incan.button('start', 'start', 'u', 'C1')).toEqual({ type: 'start', user: 'u' });
    expect(incan.button('rematch', 'rematch', 'u', 'C1')).toEqual({ type: 'rematch', user: 'u', channel: 'C1' });
    expect(incan.button('incan', 'go:7', 'u', 'C1')).toEqual({ type: 'choose', user: 'u', seq: 7, choice: 'go' });
    expect(incan.button('incan', 'camp:7', 'u', 'C1')).toEqual({ type: 'choose', user: 'u', seq: 7, choice: 'camp' });
    expect(incan.button('incan', 'dig:7', 'u', 'C1')).toBeNull();
    expect(incan.button('sushigo', 'go:7', 'u', 'C1')).toBeNull();
  });
});
