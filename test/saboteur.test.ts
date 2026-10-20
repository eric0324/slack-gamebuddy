import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { saboteur } from '../src/games/saboteur.js';
import { applySaboteur, botMove, ROLE_TABLE, targetGoal, type SAction, type SState } from '../src/saboteur.js';
import {
  actionCards,
  cellAt,
  newGrid,
  pathCards,
  place,
  placements,
  render,
  rotate,
  E,
  N,
  S,
  W,
  type Card,
  type PathCard,
  type Grid,
} from '../src/saboteurCards.js';

// 測試用：把通道牌直接放到地圖上 (不檢查規則)
const put = (grid: Grid, cell: string, edges: number, dead = false) => {
  const { r, c } = cellAt(cell)!;
  grid[r][c] = { kind: 'path', edges, dead };
};
const cells = (list: { cell: string; rot: number }[]) => list.map((p) => (p.rot ? `${p.cell}↻` : p.cell));

describe('saboteur/map: 通道牌', () => {
  it('40 張：31 張通道、9 張死路，各形狀張數照表', () => {
    const cards = pathCards();
    expect(cards).toHaveLength(40);
    expect(cards.filter((c) => !c.dead)).toHaveLength(31);
    expect(cards.filter((c) => c.dead)).toHaveLength(9);
    const count = (edges: number, dead: boolean) => cards.filter((c) => c.edges === edges && c.dead === dead).length;
    expect([N | E | S | W, N | E | S, E | S | W, N | S, E | W, E | S, S | W].map((e) => count(e, false))).toEqual([5, 5, 5, 4, 3, 4, 5]);
    expect([N | E | S | W, N | E | S, E | S | W, N | S, E | W, E | S, S | W, N, E].map((e) => count(e, true))).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('轉 180°：彎「右下」變成「上左」', () => {
    expect(rotate(E | S)).toBe(N | W);
    expect(rotate(N | E | S)).toBe(N | S | W);
    expect(rotate(N | S)).toBe(N | S);
  });
});

describe('saboteur/setup: 行動牌', () => {
  it('27 張：破壞各 3、修理各 2、雙用各 1、藏寶圖 6、落石 3', () => {
    const cards = actionCards();
    expect(cards).toHaveLength(27);
    const n = (pred: (c: (typeof cards)[number]) => boolean) => cards.filter(pred).length;
    for (const tool of ['pick', 'lamp', 'cart'] as const) {
      expect(n((c) => c.kind === 'break' && c.tool === tool)).toBe(3);
      expect(n((c) => c.kind === 'fix' && c.tools.length === 1 && c.tools[0] === tool)).toBe(2);
    }
    expect(n((c) => c.kind === 'fix' && c.tools.length === 2)).toBe(3);
    expect(n((c) => c.kind === 'map')).toBe(6);
    expect(n((c) => c.kind === 'rock')).toBe(3);
  });
});

describe('saboteur/map: 地圖範圍、起點與終點', () => {
  it('起點在 C5，終點在 K3、K5、K7，恰好一張金礦', () => {
    const grid = newGrid(1);
    expect(grid).toHaveLength(9);
    expect(grid[0]).toHaveLength(13);
    expect(grid[4][2]).toEqual({ kind: 'start' });
    const goals = [grid[2][10], grid[4][10], grid[6][10]];
    expect(goals.every((g) => g?.kind === 'goal' && !g.open)).toBe(true);
    expect(goals.map((g) => g?.kind === 'goal' && g.gold)).toEqual([false, true, false]);
    expect(grid.flat().filter(Boolean)).toHaveLength(4);
  });

  it('cellAt 解析座標，超出範圍回傳 null', () => {
    expect(cellAt('D5')).toEqual({ r: 4, c: 3 });
    expect(cellAt('M9')).toEqual({ r: 8, c: 12 });
    expect(cellAt('N1')).toBeNull();
    expect(cellAt('A10')).toBeNull();
  });
});

describe('saboteur/map: 放通道牌的規則', () => {
  it('只有起點時「橫」可以放 B5 和 D5，沒有轉向版本', () => {
    expect(cells(placements(newGrid(0), E | W))).toEqual(['B5', 'D5']);
  });

  it('不能轉 90°：「直」只能放在起點上下', () => {
    expect(cells(placements(newGrid(0), N | S))).toEqual(['C4', 'C6']);
  });

  it('轉 180° 的形狀不同時兩種方向都列出', () => {
    // 彎「右下」：原方向接得上起點的上方和左邊；轉成「上左」接得上起點的右邊和下方
    expect(cells(placements(newGrid(0), E | S))).toEqual(['C4', 'B5', 'D5↻', 'C6↻']);
  });

  it('開口對不上的位置被排除', () => {
    const grid = newGrid(0);
    put(grid, 'D5', E | W);
    expect(cells(placements(grid, N | S))).not.toContain('D4');
    expect(cells(placements(grid, N | S))).not.toContain('D6');
  });

  it('沒連回起點的位置被排除', () => {
    expect(cells(placements(newGrid(0), N | E | S | W))).not.toContain('F5');
  });

  it('接在死路後面不算連回起點', () => {
    const grid = newGrid(0);
    put(grid, 'D5', E | W, true);
    expect(cells(placements(grid, E | W))).not.toContain('E5');
  });

  it('蓋著的終點和地圖外不檢查；起點和終點的格子不能放', () => {
    const grid = newGrid(0);
    for (const cell of ['D5', 'E5', 'F5', 'G5', 'H5', 'I5']) put(grid, cell, E | W);
    // J5 旁邊是蓋著的 K5：T「上右下」轉成「上下左」，右邊沒開口也可以放
    expect(cells(placements(grid, N | E | S))).toContain('J5↻');
    put(grid, 'J5', E | W);
    expect(cells(placements(grid, E | W))).not.toContain('K5');
    const edge = newGrid(0);
    put(edge, 'B5', E | W);
    expect(cells(placements(edge, E | W))).toContain('A5');
  });
});

describe('saboteur/map: 翻開終點', () => {
  const lineTo = (gold: 0 | 1 | 2, row: number) => {
    const grid = newGrid(gold);
    for (const col of 'DEFGHI') put(grid, `${col}5`, E | W);
    if (row !== 5) {
      put(grid, 'J5', N | S | W);
      put(grid, `J${row === 3 ? 4 : 6}`, N | S);
    }
    return grid;
  };

  it('連到石頭會翻開，朝連過來的一側有開口，之後可以接出去', () => {
    const grid = lineTo(1, 3);
    const found = place(grid, cellAt('J3')!, S | E, false);
    expect(found).toEqual([{ cell: 'K3', gold: false }]);
    const k3 = grid[2][10];
    expect(k3?.kind === 'goal' && k3.open && (k3.edges & W)).toBeTruthy();
    // 石頭「左上」翻開後可以從上方接出去
    expect(cells(placements(grid, N | S))).toContain('K2');
  });

  it('連到金礦回報挖到', () => {
    const grid = lineTo(1, 5);
    expect(place(grid, cellAt('J5')!, E | W, false)).toEqual([{ cell: 'K5', gold: true }]);
  });

  it('死路不會翻開終點', () => {
    const grid = lineTo(1, 5);
    expect(place(grid, cellAt('J5')!, E | W, true)).toEqual([]);
    const k5 = grid[4][10];
    expect(k5?.kind === 'goal' && k5.open).toBe(false);
  });

  it('石頭「左下」從上方連過來時轉 180° 變成「右上」', () => {
    const grid = newGrid(0); // 金礦在 K3，K5 是「左上」、K7 是「左下」
    for (const col of 'DEFGHI') put(grid, `${col}5`, E | W);
    put(grid, 'J5', S | W);
    put(grid, 'J6', N | E);
    expect(place(grid, cellAt('K6')!, S | W, false)).toEqual([{ cell: 'K7', gold: false }]);
    const k7 = grid[6][10];
    expect(k7?.kind === 'goal' && k7.edges).toBe(N | E);
  });

  it('一次連到多張終點時全部翻開', () => {
    const grid = newGrid(1);
    for (const col of 'DEFGHI') put(grid, `${col}5`, E | W);
    put(grid, 'J5', N | W);
    put(grid, 'J4', S | E);
    const found = place(grid, cellAt('K4')!, N | E | S | W, false);
    expect(found).toEqual([
      { cell: 'K3', gold: false },
      { cell: 'K5', gold: true },
    ]);
  });
});

describe('saboteur/map: 地圖顯示', () => {
  it('剛開始：9 列 13 欄，C5 是 S，三張終點是 ?', () => {
    const lines = render(newGrid(0)).split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe('  A B C D E F G H I J K L M');
    expect(lines[5]).toBe('5 . . S━. . . . . . . ? . .');
    expect(lines[3]).toBe('3 . . . . . . . . . . ? . .');
    expect(lines[1]).toBe('1 . . . . . . . . . . . . .');
  });

  it('通道右邊有開口時第二個字元畫橫線；死路照形狀畫、第二個字元一律是 x', () => {
    const grid = newGrid(0);
    put(grid, 'D5', E | W);
    put(grid, 'D6', N | S, true);
    put(grid, 'E6', N | E | S | W, true);
    put(grid, 'B5', E | S | W, true);
    put(grid, 'F6', N, true);
    const lines = render(grid).split('\n');
    expect(lines[5].slice(2, 10)).toBe('. ┳xS━━━');
    expect(lines[6].slice(8, 14)).toBe('┃x╋x╹x');
  });

  it('翻開的金礦顯示 $', () => {
    const grid = newGrid(1);
    const k5 = grid[4][10];
    if (k5?.kind === 'goal') k5.open = true;
    expect(render(grid).split('\n')[5].slice(22, 24)).toBe('$━');
  });
});

// ---------- engine ----------

const rng = () => 0.99999; // 洗牌不動；金礦在 K7；第 1 回合從最後一位開始

function run(actions: SAction[], start?: SState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applySaboteur(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as SAction),
  ]);
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'saboteur' && p.audience === 'channel');
const dmTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text);
const menuOf = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);

describe('saboteur/setup: 矮人礦坑的房間', () => {
  it('開房：公告標示矮人礦坑', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'saboteur', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '矮人礦坑', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 3 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1').join()).toContain('至少需要 3 人');
  });

  it('房間已滿 (10 人) 時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(10).state);
    expect(state.players).toHaveLength(10);
    expect(ephemeralTo(events, 'x').join()).toContain('房間已滿');
  });

  it('加入、離開、房主離開取消、頻道已經有遊戲', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p2' }], lobby).state.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    const hostLeft = run([{ type: 'leave', user: 'p1' }], lobby);
    expect(hostLeft.state.phase).toBe('ended');
    expect(announces(hostLeft.events).join()).toContain('取消');
    const busy = run([{ type: 'new', user: 'x', channel: 'C1' }], lobby);
    expect(ephemeralTo(busy.events, 'x')).toEqual(['這個頻道已經有遊戲了。']);
  });
});

describe('saboteur/setup: 加入與移除 bot', () => {
  it('一個人加 3 個 bot 就能開始；removebot 從最後加入的移除', () => {
    const added = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    expect(added.players).toHaveLength(4);
    expect(added.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    const removed = run([{ type: 'removeBot', user: 'p1', count: 1 }], added).state;
    expect(removed.players.map((p) => p.id)).toEqual(added.players.slice(0, 3).map((p) => p.id));
    expect(run([{ type: 'start', user: 'p1' }], added).state.phase).not.toBe('lobby');
  });

  it('超過 10 人只加到滿；非房主被拒', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(9).state);
    expect(state.players).toHaveLength(10);
    expect(ephemeralTo(events, 'p1').join()).toContain('房間已滿');
    const other = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(3).state);
    expect(ephemeralTo(other.events, 'p2').join()).toContain('只有房主可以加入 bot');
  });
});

describe('saboteur/setup: 身分分配', () => {
  it('身分表：3～10 人的破壞者和金礦工', () => {
    expect([3, 4, 5, 6, 7, 8, 9, 10].map((n) => ROLE_TABLE[n])).toEqual([
      [1, 3], [1, 4], [2, 4], [2, 5], [3, 5], [3, 6], [3, 7], [4, 7],
    ]);
  });

  it('每人一張身分、多一張不用；真人在 DM 收到，頻道不公開', () => {
    const { state, events } = started(4);
    expect(state.players.map((p) => p.role)).toEqual(['saboteur', 'digger', 'digger', 'digger']);
    expect(dmTo(events, 'p1')).toEqual(['⛏️ 矮人礦坑第 1/3 回合：你是 💣 破壞者']);
    expect(dmTo(events, 'p2')).toEqual(['⛏️ 矮人礦坑第 1/3 回合：你是 ⛏️ 金礦工']);
    expect(ephemeralTo(events, 'p1').join()).not.toContain('破壞者');
    expect(announces(events).join('\n')).toContain('身分已私訊給每個人');
    const pub = [...announces(events), ...boards(events).map((b) => b.text)].join('\n');
    expect(pub).not.toContain('破壞者是');
    expect(pub).not.toMatch(/p1.{0,5}破壞者/);
  });

  it('洗牌後剩下的那張可能是破壞者 (場上沒有破壞者)', () => {
    // rng 一直回傳 0：洗牌時破壞者被換到最後一張，剛好是不用的那張
    const { state } = run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, () => 0);
    expect(state.players.every((p) => p.role === 'digger')).toBe(true);
  });
});

describe('saboteur/setup: 牌庫與發牌', () => {
  it('5 人每人 6 張、牌庫剩 37 張', () => {
    const { state } = started(5);
    expect(state.players.every((p) => p.hand.length === 6)).toBe(true);
    expect(state.deck).toHaveLength(37);
  });

  it('6 人每人 5 張；8 人每人 4 張、牌庫剩 35 張', () => {
    expect(started(6).state.players.every((p) => p.hand.length === 5)).toBe(true);
    const eight = started(8).state;
    expect(eight.players.every((p) => p.hand.length === 4)).toBe(true);
    expect(eight.deck).toHaveLength(35);
  });

  it('金塊 28 張、總值 44', () => {
    const { state } = started(4);
    expect(state.goldDeck).toHaveLength(28);
    expect(state.goldDeck.reduce((a, b) => a + b, 0)).toBe(44);
  });
});

describe('saboteur/setup: 開局公告', () => {
  it('公告玩家、3 回合和規則摘要，開始第 1/3 回合並發出回合面板', () => {
    const { state, events } = started(4);
    const text = announces(events).join('\n');
    expect(text).toContain('矮人礦坑開始');
    expect(text).toContain('3 回合');
    expect(text).toContain('第 1/3 回合');
    expect(state).toMatchObject({ phase: 'play', round: 1 });
    expect(state.players.every((p) => p.gold === 0)).toBe(true);
    const [board] = boards(events);
    expect(board.text).toContain('```');
    expect(board.text).toContain('5 . . S━');
    expect(board.text).toContain('👉 輪到 <@p4>');
  });
});

// 4 人局 (p1 破壞者、其他金礦工)，改成輪到 p1、指定手牌
const P = (edges: number, dead = false): PathCard => ({ kind: 'path', edges, dead });
function setup(mut: (s: SState) => void = () => {}, n = 4) {
  const s = structuredClone(started(n).state);
  s.turn = 0;
  mut(s);
  return s;
}
const act = (s: SState, a: Partial<SAction> & { type: SAction['type'] }, user = 'p1') =>
  run([{ user, seq: s.seq, ...a } as SAction], s);

describe('saboteur/turns: 回合面板', () => {
  it('列出輪到誰、牌庫、地圖、每人手牌數和壞掉的工具、兩顆按鈕', () => {
    const s = setup((s) => (s.players[1].broken = ['pick', 'cart']));
    const { events } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    const [old, next] = boards(events);
    expect(old.ref).toBe(`saboteur:turn:${s.seq}`);
    expect(old.options).toEqual([]);
    expect(old.text).toContain('<@p1>');
    expect(next.ref).toBe(`saboteur:turn:${s.seq + 1}`);
    expect(next.text).toContain('👉 輪到 <@p2>');
    expect(next.text).toContain('牌庫剩');
    expect(next.text).toContain('👉 <@p2>：🃏 6 張｜壞了：鎬子、礦車');
    expect(next.text).toContain('上一步：{{name:p1}} 逾時，自動蓋掉一張牌');
    expect(next.options.map((o) => o.label)).toEqual(['⛏️ 行動', '🎒 我的手牌']);
    expect(next.text).not.toMatch(/破壞者|金礦工/);
  });
});

describe('saboteur/turns: 我的手牌', () => {
  it('只讓本人看到身分、手牌、壞掉的工具、偷看結果和金塊，state 不變', () => {
    const s = setup((s) => {
      s.players[0].hand = [P(E | W), P(N | S, true), { kind: 'map' }];
      s.players[0].broken = ['lamp'];
      s.players[0].peeked = { K3: false };
      s.players[0].gold = 5;
    });
    const { state, events } = run([{ type: 'hand', user: 'p1' }], s);
    expect(state).toBe(s);
    const text = ephemeralTo(events, 'p1').join();
    for (const part of ['💣 破壞者', '━ 通道', '┃ 死路', '藏寶圖', '壞掉的工具：礦燈', '`K3`：🪨 石頭', '5 金']) expect(text).toContain(part);
  });

  it('不在遊戲中的人被拒', () => {
    const { events } = run([{ type: 'hand', user: 'x' }], setup());
    expect(ephemeralTo(events, 'x')).toEqual(['你不在這局遊戲中']);
  });
});

describe('saboteur/turns: 回合選單', () => {
  it('只列打得出去的牌，加上蓋牌；打開選單不改 state、不重設計時器', () => {
    const s = setup((s) => (s.players[0].hand = [P(E | W), { kind: 'rock' }, { kind: 'map' }, { kind: 'break', tool: 'pick' }]));
    const { state, events } = act(s, { type: 'turnMenu' });
    expect(state).toBe(s);
    expect(events.some((e) => e.type === 'startTimer')).toBe(false);
    const menu = menuOf(events, 'p1')!;
    expect(menu.options).toEqual([
      { value: `card:${s.seq}:0`, label: '━ 通道' },
      { value: `card:${s.seq}:2`, label: '藏寶圖' },
      { value: `card:${s.seq}:3`, label: '破壞 鎬子' },
      { value: `discardMenu:${s.seq}`, label: '🗑️ 蓋掉一張牌' },
    ]);
    expect(menu.text).toContain('「落石」現在沒有目標');
  });

  it('手牌名稱只用文字，不加 emoji', () => {
    const s = setup((s) => {
      s.grid[4][3] = P(E | W);
      s.players[1].broken = ['pick'];
      s.players[0].hand = [P(E | W), { kind: 'break', tool: 'lamp' }, { kind: 'fix', tools: ['pick', 'lamp'] }, { kind: 'map' }, { kind: 'rock' }];
    });
    const labels = menuOf(act(s, { type: 'turnMenu' }).events, 'p1')!.options.map((o) => o.label);
    expect(labels).toEqual(['━ 通道', '破壞 礦燈', '修理 鎬子／礦燈', '藏寶圖', '落石', '🗑️ 蓋掉一張牌']);
    const hand = ephemeralTo(run([{ type: 'hand', user: 'p1' }], s).events, 'p1').join();
    expect(hand).toContain('手牌：━ 通道、破壞 礦燈、修理 鎬子／礦燈、藏寶圖、落石');
  });

  it('工具壞了：通道牌沒有按鈕，並說明原因', () => {
    const s = setup((s) => {
      s.players[0].hand = [P(E | W), P(N | S), P(15), { kind: 'map' }];
      s.players[0].broken = ['pick'];
    });
    const menu = menuOf(act(s, { type: 'turnMenu' }).events, 'p1')!;
    expect(menu.options.map((o) => o.label)).toEqual(['藏寶圖', '🗑️ 蓋掉一張牌']);
    expect(menu.text).toContain('工具壞了，不能放通道牌');
  });

  it('不是輪到的人被拒；過期的選單被拒且 state 不變', () => {
    const s = setup();
    expect(ephemeralTo(act(s, { type: 'turnMenu' }, 'p2').events, 'p2').join()).toContain('還沒輪到你');
    const stale = run([{ type: 'card', user: 'p1', seq: s.seq - 1, i: 0 }], s);
    expect(stale.state).toBe(s);
    expect(ephemeralTo(stale.events, 'p1').join()).toContain('這個選單已經過期，請重新按「⛏️ 行動」');
  });

  it('選了一張牌後附「↩️ 換一張」回到手牌選單', () => {
    const s = setup((s) => (s.players[0].hand = [P(E | W)]));
    const menu = menuOf(act(s, { type: 'card', i: 0 }).events, 'p1')!;
    expect(menu.options.at(-1)).toEqual({ value: `turnMenu:${s.seq}`, label: '↩️ 換一張' });
  });
});

describe('saboteur/turns: 放通道牌', () => {
  it('列出合法位置和方向', () => {
    const s = setup((s) => (s.players[0].hand = [P(E | W), P(E | S)]));
    const labels = (i: number) => menuOf(act(s, { type: 'card', i }).events, 'p1')!.options.map((o) => o.label);
    expect(labels(0)).toEqual(['B5', 'D5', '↩️ 換一張']);
    expect(labels(1)).toEqual(['C4', 'B5', 'D5 ↻', 'C6 ↻', '↩️ 換一張']);
    expect(menuOf(act(s, { type: 'card', i: 1 }).events, 'p1')!.options[2].value).toBe(`place:${s.seq}:1:D5:1`);
  });

  it('放下後：地圖有牌、手牌換一張、抽牌、公告、輪到下一位', () => {
    const s = setup((s) => (s.players[0].hand = [P(E | W), { kind: 'map' }]));
    const { state, events } = act(s, { type: 'place', i: 0, cell: 'D5', rot: 0 });
    expect(state.grid[4][3]).toEqual({ kind: 'path', edges: E | W, dead: false });
    expect(state.players[0].hand).toHaveLength(2);
    expect(state.players[0].hand[0]).toEqual({ kind: 'map' });
    expect(state.deck).toHaveLength(s.deck.length - 1);
    expect(state.turn).toBe(1);
    expect(boards(events)[1].text).toContain('上一步：{{name:p1}} 在 `D5` 放了 ━ 通道');
  });

  it('轉 180° 放下', () => {
    const s = setup((s) => (s.players[0].hand = [P(E | S)]));
    expect(act(s, { type: 'place', i: 0, cell: 'D5', rot: 1 }).state.grid[4][3]).toEqual({ kind: 'path', edges: N | W, dead: false });
  });

  it('不合法的位置被拒，state 不變', () => {
    const s = setup((s) => (s.players[0].hand = [P(E | W)]));
    const { state } = act(s, { type: 'place', i: 0, cell: 'F5', rot: 0 });
    expect(state).toBe(s);
  });

  it('翻開石頭時公告', () => {
    const s = setup((s) => {
      for (const col of 'DEFGHI') s.grid[4][col.charCodeAt(0) - 65] = P(E | W);
      s.grid[4][9] = P(N | S | W);
      s.grid[3][9] = P(N | S);
      s.players[0].hand = [P(S | E)];
    }); // 金礦在 K7
    const { events } = act(s, { type: 'place', i: 0, cell: 'J3', rot: 0 });
    expect(announces(events).join()).toContain('`K3` 是 🪨 石頭');
  });
});

describe('saboteur/turns: 破壞工具', () => {
  it('只列其他工具還好的玩家；打出後那項壞掉、公告', () => {
    const s = setup((s) => {
      s.players[0].hand = [{ kind: 'break', tool: 'pick' }];
      s.players[2].broken = ['pick'];
    });
    const menu = menuOf(act(s, { type: 'card', i: 0 }).events, 'p1')!;
    expect(menu.options.map((o) => o.value)).toEqual([`tool:${s.seq}:0:pick:p2`, `tool:${s.seq}:0:pick:p4`, `turnMenu:${s.seq}`]);
    const { state, events } = act(s, { type: 'tool', i: 0, tool: 'pick', target: 'p2' });
    expect(state.players[1].broken).toEqual(['pick']);
    expect(boards(events)[1].text).toContain('{{name:p1}} 弄壞了 {{name:p2}} 的鎬子');
  });

  it('私下確認和公告都只寫工具名稱，沒有工具 emoji', () => {
    const s = setup((s) => (s.players[0].hand = [{ kind: 'break', tool: 'lamp' }]));
    const { events } = act(s, { type: 'tool', i: 0, tool: 'lamp', target: 'p3' });
    expect(ephemeralTo(events, 'p1').join()).toContain('你弄壞了 <@p3> 的礦燈');
    const lines = [...ephemeralTo(events, 'p1'), ...boards(events).map((b) => b.text)].join('\n').split('\n');
    expect(lines.filter((l) => /壞/.test(l)).join('\n')).not.toMatch(/⛏️|🔦|🛒/);
  });

  it('三項工具可以同時壞；壞了的人不能放通道牌', () => {
    const s = setup((s) => {
      s.players[0].hand = [{ kind: 'break', tool: 'cart' }];
      s.players[1].broken = ['pick', 'lamp'];
    });
    expect(act(s, { type: 'tool', i: 0, tool: 'cart', target: 'p2' }).state.players[1].broken).toEqual(['pick', 'lamp', 'cart']);
  });

  it('不能打在自己身上', () => {
    const s = setup((s) => (s.players[0].hand = [{ kind: 'break', tool: 'pick' }]));
    expect(act(s, { type: 'tool', i: 0, tool: 'pick', target: 'p1' }).state).toBe(s);
  });
});

describe('saboteur/turns: 修理工具', () => {
  it('可以修自己', () => {
    const s = setup((s) => {
      s.players[0].hand = [{ kind: 'fix', tools: ['pick'] }];
      s.players[0].broken = ['pick'];
    });
    const { state, events } = act(s, { type: 'tool', i: 0, tool: 'pick', target: 'p1' });
    expect(state.players[0].broken).toEqual([]);
    expect(boards(events)[1].text).toContain('{{name:p1}} 修好了 {{name:p1}} 的鎬子');
  });

  it('雙用修理：每位玩家每項可修的工具各一顆按鈕，只修一項', () => {
    const s = setup((s) => {
      s.players[0].hand = [{ kind: 'fix', tools: ['pick', 'lamp'] }];
      s.players[1].broken = ['pick', 'lamp'];
    });
    const menu = menuOf(act(s, { type: 'card', i: 0 }).events, 'p1')!;
    expect(menu.options.map((o) => o.label)).toEqual(['p2 鎬子', 'p2 礦燈', '↩️ 換一張']);
    expect(act(s, { type: 'tool', i: 0, tool: 'lamp', target: 'p2' }).state.players[1].broken).toEqual(['pick']);
  });

  it('沒有人壞了能修的工具時打不出去', () => {
    const s = setup((s) => {
      s.players[0].hand = [{ kind: 'fix', tools: ['cart'] }];
      s.players[1].broken = ['pick'];
    });
    expect(menuOf(act(s, { type: 'turnMenu' }).events, 'p1')!.options.map((o) => o.label)).toEqual(['🗑️ 蓋掉一張牌']);
  });
});

describe('saboteur/turns: 藏寶圖', () => {
  it('只有本人看到結果，頻道只公告偷看哪一張，記在我的手牌', () => {
    const s = setup((s) => (s.players[0].hand = [{ kind: 'map' }])); // 金礦在 K7
    const menu = menuOf(act(s, { type: 'card', i: 0 }).events, 'p1')!;
    expect(menu.options.map((o) => o.label)).toEqual(['K3', 'K5', 'K7', '↩️ 換一張']);
    const { state, events } = act(s, { type: 'map', i: 0, cell: 'K7' });
    expect(ephemeralTo(events, 'p1').join()).toContain('`K7` 是 💰 金礦');
    expect(state.players[0].peeked).toEqual({ K7: true });
    const pub = [...announces(events), ...boards(events).map((b) => b.text)].join('\n');
    expect(pub).toContain('{{name:p1}} 偷看了 `K7`');
    expect(pub).not.toContain('金礦');
  });

  it('終點全部翻開時打不出去', () => {
    const s = setup((s) => {
      s.players[0].hand = [{ kind: 'map' }];
      for (const row of [2, 4, 6]) Object.assign(s.grid[row][10]!, { open: true });
    });
    expect(menuOf(act(s, { type: 'turnMenu' }).events, 'p1')!.options.map((o) => o.label)).toEqual(['🗑️ 蓋掉一張牌']);
  });
});

describe('saboteur/turns: 落石', () => {
  it('只列通道牌 (不含起點終點)，拿掉後變空格', () => {
    const s = setup((s) => {
      s.grid[4][3] = P(E | W);
      s.grid[4][4] = P(E | W, true);
      s.players[0].hand = [{ kind: 'rock' }];
    });
    const menu = menuOf(act(s, { type: 'card', i: 0 }).events, 'p1')!;
    expect(menu.options.map((o) => o.label)).toEqual(['D5 ━', 'E5 ━x', '↩️ 換一張']);
    const { state, events } = act(s, { type: 'rock', i: 0, cell: 'E5' });
    expect(state.grid[4][4]).toBeNull();
    expect(boards(events)[1].text).toContain('{{name:p1}} 用落石拿掉 `E5`');
    expect(act(s, { type: 'rock', i: 0, cell: 'C5' }).state).toBe(s);
  });
});

describe('saboteur/turns: 蓋掉一張牌', () => {
  it('選一張蓋掉，不公開內容', () => {
    const s = setup((s) => (s.players[0].hand = [P(15, true), { kind: 'map' }]));
    const menu = menuOf(act(s, { type: 'discardMenu' }).events, 'p1')!;
    expect(menu.options.map((o) => o.value)).toEqual([`discard:${s.seq}:0`, `discard:${s.seq}:1`, `turnMenu:${s.seq}`]);
    const { state, events } = act(s, { type: 'discard', i: 0 });
    expect(state.players[0].hand[0]).toEqual({ kind: 'map' });
    const text = boards(events)[1].text;
    expect(text).toContain('上一步：{{name:p1}} 蓋掉一張牌');
    expect(text).not.toContain('死路');
  });
});

describe('saboteur/turns: 抽牌、回合順序、計時', () => {
  it('牌庫空了就不抽', () => {
    const s = setup((s) => (s.deck = []));
    expect(act(s, { type: 'discard', i: 0 }).state.players[0].hand).toHaveLength(5);
  });

  it('依座位輪流，跳過沒有手牌的人', () => {
    const s = setup((s) => {
      s.deck = [];
      s.players[1].hand = [];
    });
    expect(act(s, { type: 'discard', i: 0 }).state.turn).toBe(2);
    const last = setup((s) => (s.turn = 3));
    expect(act(last, { type: 'discard', i: 0 }, 'p4').state.turn).toBe(0);
  });

  it('第 1 回合從隨機一位開始', () => {
    expect(started(4).state.turn).toBe(3);
    expect(run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, () => 0).state.turn).toBe(0);
  });

  it('60 秒逾時：蓋掉第一張、公告、抽牌、輪到下一位；舊計時器被忽略', () => {
    const s = setup((s) => (s.players[0].hand = [{ kind: 'rock' }, { kind: 'map' }]));
    const old = s.timers.phase!;
    const { state, events } = run([{ type: 'timeout', id: old }], s);
    expect(state.players[0].hand[0]).toEqual({ kind: 'map' });
    expect(state.players[0].hand).toHaveLength(2);
    expect(state.turn).toBe(1);
    expect(boards(events)[1].text).toContain('逾時，自動蓋掉一張牌');
    expect(run([{ type: 'timeout', id: old }], state).state).toBe(state);
  });
});

// 金礦在 K5，D5～I5 已經挖好，輪到 who (index) 手上拿著能接到金礦的「橫」
function nearGold(who = 1, mut: (s: SState) => void = () => {}, n = 4) {
  return setup((s) => {
    s.grid = newGrid(1);
    for (const col of 'DEFGHI') s.grid[4][col.charCodeAt(0) - 65] = P(E | W);
    s.turn = who;
    s.players[who].hand[0] = P(E | W);
    s.goldDeck = [3, 2, 1, 1, ...s.goldDeck.slice(4)];
    mut(s);
  }, n);
}
const digGold = (s: SState) => act(s, { type: 'place', i: 0, cell: 'J5', rot: 0 }, current(s));
const current = (s: SState) => s.players[s.turn].id;
// 所有人手牌出完：牌庫空、只剩 who 有一張
const lastCard = (mut: (s: SState) => void = () => {}, n = 4) =>
  setup((s) => {
    s.deck = [];
    s.players.forEach((p, i) => (p.hand = i === 0 ? [{ kind: 'map' }] : []));
    mut(s);
  }, n);
const pick = (s: SState, user: string, value: number) => run([{ type: 'pickGold', user, seq: s.seq, value }], s);

describe('saboteur/scoring: 回合結束', () => {
  it('挖到金礦：公開身分和三張終點，金礦工獲勝', () => {
    const { state, events } = digGold(nearGold());
    const text = announces(events).join('\n');
    expect(text).toContain('金礦工獲勝');
    expect(text).toContain('{{name:p1}} 💣 破壞者');
    expect(text).toContain('{{name:p2}} ⛏️ 金礦工');
    expect([2, 4, 6].every((r) => (state.grid[r][10] as { open: boolean }).open)).toBe(true);
    expect(state.phase).toBe('pick');
  });

  it('牌庫空、手牌都出完：破壞者獲勝', () => {
    const { events } = act(lastCard(), { type: 'discard', i: 0 });
    expect(announces(events).join('\n')).toContain('破壞者獲勝');
  });
});

describe('saboteur/scoring: 金礦工分金塊', () => {
  it('抽人數張，從挖到的人開始依座位輪流挑，破壞者沒有', () => {
    let { state, events } = digGold(nearGold(1));
    const [prompt] = prompts(events).filter((p) => p.ref === 'saboteur:gold:1');
    expect(prompt.text).toContain('3、2、1、1');
    expect(prompt.text).toContain('👉 輪到 <@p2>');
    expect(prompt.options.map((o) => o.label)).toEqual(['3 金', '2 金', '1 金']);
    for (const [user, value] of [['p2', 3], ['p3', 2], ['p4', 1], ['p2', 1]] as const) ({ state, events } = pick(state, user, value));
    expect(state.players.map((p) => p.gold)).toEqual([0, 4, 2, 1]);
    expect(state.round).toBe(2);
    expect(state.goldDeck).toHaveLength(24);
  });

  it('破壞者挖到金礦時，從他之後的第一位金礦工開始', () => {
    const { events } = digGold(nearGold(0));
    expect(prompts(events).find((p) => p.ref === 'saboteur:gold:1')!.text).toContain('👉 輪到 <@p2>');
  });

  it('工具壞掉的金礦工也分得到；只有輪到的人能按', () => {
    let { state } = digGold(nearGold(1, (s) => (s.players[2].broken = ['pick'])));
    const wrong = pick(state, 'p3', 3);
    expect(wrong.state).toBe(state);
    expect(ephemeralTo(wrong.events, 'p3').join()).toContain('還沒輪到你');
    ({ state } = pick(state, 'p2', 3));
    ({ state } = pick(state, 'p3', 2));
    expect(state.players[2].gold).toBe(2);
  });

  it('30 秒逾時自動拿最大的', () => {
    const { state } = digGold(nearGold(1));
    expect(run([{ type: 'timeout', id: state.timers.phase! }], state).state.players[1].gold).toBe(3);
  });

  it('金塊牌不夠就全抽', () => {
    let { state } = digGold(nearGold(1, (s) => (s.goldDeck = [2])));
    ({ state } = pick(state, 'p2', 2));
    expect(state.players[1].gold).toBe(2);
    expect(state.round).toBe(2);
  });
});

describe('saboteur/scoring: 破壞者獲勝時拿金塊', () => {
  it('1 位破壞者拿 4 金', () => {
    expect(act(lastCard(), { type: 'discard', i: 0 }).state.players.map((p) => p.gold)).toEqual([4, 0, 0, 0]);
  });

  it('2 位破壞者各拿 3 金', () => {
    const gold = act(lastCard(() => {}, 6), { type: 'discard', i: 0 }).state.players.map((p) => p.gold);
    expect(gold).toEqual([3, 3, 0, 0, 0, 0]);
  });

  it('4 位破壞者各拿 2 金', () => {
    const gold = act(lastCard(() => {}, 10), { type: 'discard', i: 0 }).state.players.map((p) => p.gold);
    expect(gold).toEqual([2, 2, 2, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('沒有破壞者時沒有人拿到', () => {
    const s = lastCard((s) => s.players.forEach((p) => (p.role = 'digger')));
    expect(act(s, { type: 'discard', i: 0 }).state.players.every((p) => p.gold === 0)).toBe(true);
  });
});

describe('saboteur/scoring: 三個回合', () => {
  it('公告累計，下一回合重發身分和手牌、地圖清空、工具修好，從最後行動者的下一位開始', () => {
    const s = lastCard((s) => {
      s.players[2].broken = ['lamp'];
      s.grid[4][3] = P(E | W);
    });
    const { state, events } = act(s, { type: 'discard', i: 0 });
    expect(announces(events).join('\n')).toContain('累計');
    expect(state.round).toBe(2);
    expect(state.turn).toBe(1);
    expect(state.players.every((p) => p.hand.length === 6 && p.broken.length === 0 && p.role)).toBe(true);
    expect(state.grid.flat().filter(Boolean)).toHaveLength(4);
    expect(dmTo(events, 'p2')).toEqual(['⛏️ 矮人礦坑第 2/3 回合：你是 ⛏️ 金礦工']);
    expect(ephemeralTo(events, 'p2').join()).not.toContain('金礦工');
    expect(announces(events).join('\n')).toContain('⛏️ 第 2/3 回合開始！每人 6 張手牌，身分已私訊給每個人。');
  });
});

describe('saboteur/scoring: 勝負與結束', () => {
  const finalRound = (golds: number[]) =>
    act(
      lastCard((s) => {
        s.round = 3;
        s.players.forEach((p, i) => (p.gold = golds[i]));
      }),
      { type: 'discard', i: 0 },
    );

  it('金塊最多的人贏，公告排名、送出 result、附再來一局', () => {
    const { state, events } = finalRound([5, 7, 7, 1]); // p1 是破壞者再拿 4 → 9
    expect(state.phase).toBe('ended');
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: ['p1'] });
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> 獲勝');
    expect(text).toMatch(/1\. .*p1.* 9 金/);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('同分並列 (包括全員 0 金)', () => {
    expect(finalRound([4, 8, 1, 1]).state.winners).toEqual(['p1', 'p2']);
    const zero = lastCard((s) => {
      s.round = 3;
      s.players.forEach((p) => (p.role = 'digger'));
    });
    expect(act(zero, { type: 'discard', i: 0 }).state.winners).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('再來一局只有上一局玩家可以開', () => {
    const { state } = finalRound([0, 0, 0, 0]);
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], state).events, 'x').join()).toContain('只有上一局的玩家');
    const again = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state).state;
    expect(again).toMatchObject({ phase: 'lobby', host: 'p2' });
    expect(again.players.map((p) => p.id)).toEqual(['p2']);
  });

  it('房主取消：沒有 result、沒有再來一局；非房主被拒；結束後舊按鈕被忽略', () => {
    const s = setup();
    expect(ephemeralTo(run([{ type: 'cancel', user: 'p2' }], s).events, 'p2').join()).toContain('只有房主');
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(act(state, { type: 'turnMenu' }).events).toEqual([]);
  });
});

describe('saboteur/bots: 目標終點', () => {
  it('沒偷看是 K3；看到 K3 是石頭改 K5；知道金礦就是金礦', () => {
    const s = setup();
    const me = s.players[0];
    expect(targetGoal(s, me)).toBe('K3');
    me.peeked = { K3: false };
    expect(targetGoal(s, me)).toBe('K5');
    me.peeked = { K7: true };
    expect(targetGoal(s, me)).toBe('K7');
    me.peeked = {};
    (s.grid[6][10] as { open: boolean }).open = true;
    expect(targetGoal(s, me)).toBe('K7');
  });
});

describe('saboteur/bots: 金礦工 bot 的出牌策略', () => {
  const digger = (mut: (s: SState) => void) => setup((s) => ((s.turn = 1), mut(s)));
  const move = (s: SState) => botMove(s, s.players[s.turn]);

  it('往終點挖：放在讓距離變小的位置', () => {
    const s = digger((s) => (s.players[1].hand = [{ kind: 'map' }, P(E | W)]));
    s.players[1].peeked = { K7: true }; // 已經知道金礦，不會先用藏寶圖
    expect(move(s)).toMatchObject({ type: 'place', i: 1, cell: 'D5', rot: 0 });
  });

  it('距離沒有變小就不放', () => {
    const s = digger((s) => {
      s.players[1].hand = [P(N | S), P(15, true)];
      s.players[1].peeked = { K5: true };
    });
    // 只有起點時「直」只能放 C4、C6，離 K5 最近的前緣還是 D5 (距離 7)
    expect(move(s)).toMatchObject({ type: 'discard', i: 1 });
  });

  it('先修自己 (雙用牌修第一項壞掉的)', () => {
    const s = digger((s) => {
      s.players[1].hand = [P(E | W), { kind: 'fix', tools: ['pick', 'cart'] }];
      s.players[1].broken = ['cart', 'pick'];
    });
    expect(move(s)).toMatchObject({ type: 'tool', i: 1, tool: 'pick', target: 'p2' });
  });

  it('不知道金礦在哪就用藏寶圖偷看目標終點', () => {
    const s = digger((s) => (s.players[1].hand = [{ kind: 'break', tool: 'pick' }, { kind: 'map' }]));
    expect(move(s)).toMatchObject({ type: 'map', i: 1, cell: 'K3' });
  });

  it('沒有好牌：蓋第一張死路，沒有死路就蓋第一張', () => {
    const s = digger((s) => {
      s.players[1].hand = [{ kind: 'break', tool: 'pick' }, P(E | W, true), P(N, true)];
      s.players[1].peeked = { K7: true };
    });
    expect(move(s)).toMatchObject({ type: 'discard', i: 1 });
    s.players[1].hand = [{ kind: 'break', tool: 'pick' }, { kind: 'rock' }];
    expect(move(s)).toMatchObject({ type: 'discard', i: 0 });
  });
});

describe('saboteur/bots: 破壞者 bot 的出牌策略', () => {
  const move = (s: SState) => botMove(s, s.players[0]);

  it('死路放在離目標終點最近的位置', () => {
    const s = setup((s) => {
      for (const col of 'DEFGH') s.grid[4][col.charCodeAt(0) - 65] = P(E | W);
      s.players[0].hand = [P(E | W, true)];
      s.players[0].peeked = { K5: false, K3: false };
    }); // 目標 K7
    const m = move(s) as { type: string; cell: string };
    expect(m.type).toBe('place');
    expect(m.cell).toBe('I5');
  });

  it('從下一位開始弄壞第一位符合的玩家', () => {
    const s = setup((s) => {
      s.players[0].hand = [{ kind: 'map' }, { kind: 'break', tool: 'pick' }];
      s.players[1].broken = ['pick'];
    });
    expect(move(s)).toMatchObject({ type: 'tool', i: 1, tool: 'pick', target: 'p3' });
  });

  it('落石拿掉距離 3 以內最近的通道；太遠就不拿', () => {
    const s = setup((s) => {
      for (const col of 'DEFGHI') s.grid[4][col.charCodeAt(0) - 65] = P(E | W);
      s.players[0].hand = [{ kind: 'rock' }];
      s.players[0].peeked = { K7: true };
    });
    // I5 到 K7：2 + 2 = 4，太遠
    expect(move(s)).toMatchObject({ type: 'discard', i: 0 });
    s.grid[5][8] = P(N | S);
    expect(move(s)).toMatchObject({ type: 'rock', i: 0, cell: 'I6' });
  });

  it('其他：蓋第一張', () => {
    const s = setup((s) => (s.players[0].hand = [{ kind: 'map' }, { kind: 'fix', tools: ['pick'] }]));
    expect(move(s)).toMatchObject({ type: 'discard', i: 0 });
  });
});

describe('saboteur/bots: bot 的其他行為', () => {
  it('bot 一輪到就立刻行動；挑金塊拿最大', () => {
    const lobby = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobby);
    // 第 1 回合從最後一位 (bot) 開始，bot 們行動完輪到真人 p1
    expect(state.turn).toBe(0);
    expect(boards(events).length).toBeGreaterThan(1);
    const s = digGold(nearGold(1, (s) => (s.players[1].id = 'bot:9:阿土')));
    expect(s.state.players[1].gold).toBe(3);
  });
});

describe('saboteur/bots: 一個人也能玩完整局', () => {
  it('1 位真人 + 3 個 bot，真人都不操作，3 回合跑完並送出 result', () => {
    const lobby = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    let { state, events } = run([{ type: 'start', user: 'p1' }], lobby);
    let all = [...events];
    for (let k = 0; k < 2000 && state.phase !== 'ended'; k++) {
      ({ state, events } = run([{ type: 'timeout', id: state.timers.phase! }], state));
      all = all.concat(events);
    }
    expect(state.phase).toBe('ended');
    expect(state.round).toBe(3);
    expect(all.some((e) => e.type === 'result')).toBe(true);
  });
});

describe('saboteur/setup: 指令解析與按鈕 (GameDef)', () => {
  it('大廳資訊：⛏️ 矮人礦坑、3～10 人、推理', () => {
    expect(saboteur).toMatchObject({ kind: 'saboteur', emoji: '⛏️', name: '矮人礦坑', players: '3～10 人', category: 'deduction' });
    expect(saboteur.apply).toBe(applySaboteur);
  });

  it('指令解析：new、start、cancel、addbot、removebot', () => {
    expect(saboteur.parse('new', 'u', 'C1')).toEqual({ type: 'new', user: 'u', channel: 'C1' });
    expect(saboteur.parse('start', 'u', 'C1')).toEqual({ type: 'start', user: 'u' });
    expect(saboteur.parse('cancel', 'u', 'C1')).toEqual({ type: 'cancel', user: 'u' });
    expect(saboteur.parse('addbot 3', 'u', 'C1')).toEqual({ type: 'addBot', user: 'u', count: 3 });
    expect(saboteur.parse('removebot', 'u', 'C1')).toEqual({ type: 'removeBot', user: 'u', count: 1 });
  });

  it('help 和不認識的子指令回傳 null (顯示說明)，說明列出所有指令和按鈕', () => {
    expect(saboteur.parse('help', 'u', 'C1')).toBeNull();
    expect(saboteur.parse('dig', 'u', 'C1')).toBeNull();
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(saboteur.help).toContain(`/game saboteur ${cmd}`);
    expect(saboteur.help).toContain('⛏️ 行動');
    expect(saboteur.help).toContain('🎒 我的手牌');
  });

  it('按鈕路由：房間按鈕和遊戲中的每種按鈕', () => {
    const b = (value: string, kind = 'saboteur') => saboteur.button(kind, value, 'u', 'C1');
    expect(b('join', 'join')).toEqual({ type: 'join', user: 'u' });
    expect(b('leave', 'leave')).toEqual({ type: 'leave', user: 'u' });
    expect(b('start', 'start')).toEqual({ type: 'start', user: 'u' });
    expect(b('rematch', 'rematch')).toEqual({ type: 'rematch', user: 'u', channel: 'C1' });
    expect(b('hand')).toEqual({ type: 'hand', user: 'u' });
    expect(b('turnMenu:7')).toEqual({ type: 'turnMenu', user: 'u', seq: 7 });
    expect(b('discardMenu:7')).toEqual({ type: 'discardMenu', user: 'u', seq: 7 });
    expect(b('card:7:2')).toEqual({ type: 'card', user: 'u', seq: 7, i: 2 });
    expect(b('place:7:2:D5:1')).toEqual({ type: 'place', user: 'u', seq: 7, i: 2, cell: 'D5', rot: 1 });
    expect(b('tool:7:0:pick:bot:2:阿土')).toEqual({ type: 'tool', user: 'u', seq: 7, i: 0, tool: 'pick', target: 'bot:2:阿土' });
    expect(b('map:7:1:K3')).toEqual({ type: 'map', user: 'u', seq: 7, i: 1, cell: 'K3' });
    expect(b('rock:7:1:E5')).toEqual({ type: 'rock', user: 'u', seq: 7, i: 1, cell: 'E5' });
    expect(b('discard:7:3')).toEqual({ type: 'discard', user: 'u', seq: 7, i: 3 });
    expect(b('gold:9:3')).toEqual({ type: 'pickGold', user: 'u', seq: 9, value: 3 });
    expect(b('tool:7:0:hammer:u2')).toBeNull();
    expect(b('dig:7')).toBeNull();
  });
});
