import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applySplendor, type SAction, type SState } from '../src/splendor.js';
import { cardOf, CARDS, cardText, COLORS, gemsText, need, NOBLES, nobleText, payment, shortfall, total, type Color, type Gems } from '../src/splendorCards.js';

const gems = (g: Partial<Gems> = {}): Gems => ({ w: 0, b: 0, g: 0, r: 0, k: 0, o: 0, ...g });
const disc = (d: Partial<Record<Color, number>> = {}): Record<Color, number> => ({ w: 0, b: 0, g: 0, r: 0, k: 0, ...d });

describe('splendor/setup: 發展卡', () => {
  it('90 張：一級 40、二級 30、三級 20，id 依序 1～90', () => {
    expect(CARDS).toHaveLength(90);
    expect(CARDS.map((c) => c.id)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect([1, 2, 3].map((lv) => CARDS.filter((c) => c.level === lv).length)).toEqual([40, 30, 20]);
  });

  it('每級每色 8／6／4 張', () => {
    for (const [lv, n] of [[1, 8], [2, 6], [3, 4]] as const) {
      for (const color of COLORS) expect(CARDS.filter((c) => c.level === lv && c.color === color)).toHaveLength(n);
    }
  });

  it('分數範圍：一級 0～1、二級 1～3、三級 3～5', () => {
    const range = (lv: number) => {
      const pts = CARDS.filter((c) => c.level === lv).map((c) => c.points);
      return [Math.min(...pts), Math.max(...pts)];
    };
    expect([range(1), range(2), range(3)]).toEqual([[0, 1], [1, 3], [3, 5]]);
  });

  it('抽查牌表：#8 一級白 1 分成本綠4、#90 三級黑 5 分成本紅7 黑3、#71 三級白 3 分', () => {
    expect(CARDS[7]).toEqual({ id: 8, level: 1, color: 'w', points: 1, cost: disc({ g: 4 }) });
    expect(CARDS[89]).toEqual({ id: 90, level: 3, color: 'k', points: 5, cost: disc({ r: 7, k: 3 }) });
    expect(CARDS[70]).toEqual({ id: 71, level: 3, color: 'w', points: 3, cost: disc({ b: 3, g: 3, r: 5, k: 3 }) });
    expect(CARDS[44].cost).toEqual(disc({ g: 1, r: 4, k: 2 })); // #45
  });
});

describe('splendor/setup: 貴族', () => {
  it('10 張，每張 3 分：5 張兩色各 4、5 張三色各 3', () => {
    expect(NOBLES).toHaveLength(10);
    expect(NOBLES.every((n) => n.points === 3)).toBe(true);
    const shapes = NOBLES.map((n) => n.need.map(([, v]) => v).join(','));
    expect(shapes.filter((x) => x === '4,4')).toHaveLength(5);
    expect(shapes.filter((x) => x === '3,3,3')).toHaveLength(5);
  });

  it('條件文字照牌表的順序：#1 紅4 綠4、#8 藍3 白3 黑3', () => {
    expect(nobleText(NOBLES[0])).toBe('紅4 綠4');
    expect(nobleText(NOBLES[7])).toBe('藍3 白3 黑3');
  });
});

describe('splendor/turns: 應付、缺口、付款', () => {
  it('應付：成本減折扣，最少 0', () => {
    expect(need(disc({ b: 3, g: 1 }), disc({ b: 1, g: 2 }))).toEqual(disc({ b: 2 }));
  });

  it('缺口：每色應付減籌碼的總和再減黃金，最少 0', () => {
    expect(shortfall(disc({ b: 3, g: 1 }), disc({ b: 1 }), gems({ b: 1 }))).toBe(2);
    expect(shortfall(disc({ b: 3, g: 1 }), disc({ b: 1 }), gems({ b: 1, o: 1 }))).toBe(1);
    expect(shortfall(disc({ b: 3 }), disc(), gems({ o: 5 }))).toBe(0);
  });

  it('付款：先付同色再用黃金', () => {
    expect(payment(disc({ b: 3 }), disc({ b: 1 }), gems({ b: 1, o: 1 }))).toEqual(gems({ b: 1, o: 1 }));
    expect(payment(disc({ w: 3 }), disc(), gems({ w: 5, o: 2 }))).toEqual(gems({ w: 3 }));
  });

  it('黃金不夠就買不起（回傳 null）', () => {
    expect(payment(disc({ b: 3, g: 2 }), disc(), gems({ b: 2, o: 1 }))).toBeNull();
  });

  it('折扣足夠時免費', () => {
    expect(payment(disc({ w: 4 }), disc({ w: 4 }), gems())).toEqual(gems());
  });
});

describe('splendor/setup: 顯示文字', () => {
  it('顏色文字：只列不為 0 的，依白藍綠紅黑金排序，全 0 寫「無」', () => {
    expect(gemsText(gems({ b: 1, w: 2 }))).toBe('白2 藍1');
    expect(gemsText(gems({ o: 1, k: 2, g: 1 }))).toBe('綠1 黑2 金1');
    expect(gemsText(gems())).toBe('無');
    expect(gemsText(disc({ r: 4 }))).toBe('紅4');
  });

  it('卡片文字：「1-2 綠 1分｜白4」，沒有位置時只有卡片', () => {
    const card = { id: 0, level: 1 as const, color: 'g' as const, points: 1, cost: disc({ w: 4 }) };
    expect(cardText(card, '1-2')).toBe('1-2 綠 1分｜白4');
    expect(cardText(card)).toBe('綠 1分｜白4');
  });
});

// ---------- engine ----------

const rng = () => 0.99999; // 洗牌不動（牌堆照 id 順序）；第一位是座位最後一位

function run(actions: SAction[], start?: SState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applySplendor(state, action, r);
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
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'splendor' && p.audience === 'channel');
const menuOf = (events: GameEvent[], user: string) => prompts(events).filter((p) => p.audience === 'ephemeral' && p.user === user).at(-1);

// 開局後改成從 p1 開始（第一位 p1、輪到 p1），再套用 mut
function setup(mut: (s: SState) => void = () => {}, n = 2) {
  const s = structuredClone(started(n).state);
  s.turn = 0;
  s.first = 0;
  mut(s);
  return s;
}
const act = (s: SState, a: Partial<SAction> & { type: SAction['type'] }, user = 'p1') =>
  run([{ user, seq: s.seq, ...a } as SAction], s);
const timeout = (s: SState) => run([{ type: 'timeout', id: s.timers.phase! }], s);

describe('splendor/setup: 璀璨寶石的房間', () => {
  it('開房：公告標示璀璨寶石', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'splendor', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '璀璨寶石', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 2 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1').join()).toContain('至少需要 2 人');
  });

  it('房間已滿（4 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(4).state);
    expect(state.players).toHaveLength(4);
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

describe('splendor/setup: 加入與移除 bot', () => {
  it('一個人加 3 個 bot 就能開始；removebot 從最後加入的移除', () => {
    const added = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    expect(added.players).toHaveLength(4);
    expect(added.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    const removed = run([{ type: 'removeBot', user: 'p1', count: 1 }], added).state;
    expect(removed.players.map((p) => p.id)).toEqual(added.players.slice(0, 3).map((p) => p.id));
    expect(run([{ type: 'start', user: 'p1' }], added).state.phase).toBe('play');
  });

  it('超過 4 人只加到滿；非房主或開始後被拒', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(3).state);
    expect(state.players).toHaveLength(4);
    expect(ephemeralTo(events, 'p1').join()).toContain('房間已滿');
    const other = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state);
    expect(ephemeralTo(other.events, 'p2').join()).toContain('只有房主可以加入 bot');
    const late = run([{ type: 'addBot', user: 'p1', count: 1 }], started(2).state);
    expect(late.state.players).toHaveLength(2);
    expect(ephemeralTo(late.events, 'p1').join()).toContain('遊戲已經開始了');
  });
});

describe('splendor/setup: 開局', () => {
  it('籌碼依人數：2 人各 4、3 人各 5、4 人各 7，黃金一律 5；玩家從 0 開始', () => {
    expect(started(2).state.bank).toEqual(gems({ w: 4, b: 4, g: 4, r: 4, k: 4, o: 5 }));
    expect(started(3).state.bank).toEqual(gems({ w: 5, b: 5, g: 5, r: 5, k: 5, o: 5 }));
    expect(started(4).state.bank).toEqual(gems({ w: 7, b: 7, g: 7, r: 7, k: 7, o: 5 }));
    expect(started(4).state.players.every((p) => total(p.tokens) === 0)).toBe(true);
  });

  it('每級翻開 4 張，牌堆剩 36／26／16，等級正確', () => {
    const s = started(2).state;
    expect(s.table.map((row) => row.filter((x) => x !== null).length)).toEqual([4, 4, 4]);
    expect(s.decks.map((d) => d.length)).toEqual([36, 26, 16]);
    s.table.forEach((row, i) => expect(row.every((id) => cardOf(id!).level === i + 1)).toBe(true));
    expect(new Set([...s.table.flat(), ...s.decks.flat()]).size).toBe(90);
  });

  it('貴族翻開人數＋1 張', () => {
    expect(started(3).state.nobles).toHaveLength(4);
    expect(started(2).state.nobles).toHaveLength(3);
  });

  it('第一位隨機，之後依座位輪流', () => {
    expect(started(3).state).toMatchObject({ first: 2, turn: 2, round: 1, step: 'act' });
    expect(started(3, () => 0).state).toMatchObject({ first: 0, turn: 0 });
  });

  it('開局公告玩家順序和規則摘要，接著發出第一個回合面板', () => {
    const { events } = started(3);
    const text = announces(events).join('\n');
    expect(text).toContain('璀璨寶石開始');
    expect(text).toContain('<@p3> → <@p1> → <@p2>');
    for (const part of ['拿 3 個不同顏色', '拿 2 個同色', '保留', '折扣', '黃金', '10 個', '貴族', '15 分', '張數少']) expect(text).toContain(part);
    expect(events.findIndex((e) => e.type === 'announce')).toBeLessThan(events.findIndex((e) => e.type === 'prompt'));
    expect(boards(events)[0].text).toContain('👉 輪到 <@p3>');
  });
});

describe('splendor/setup: 回合面板', () => {
  it('列出輪到誰、第幾輪、庫存、貴族、三排卡（三級到一級）、每位玩家、兩顆按鈕', () => {
    const { state, events } = started(2);
    const [board] = boards(events);
    expect(board.ref).toBe(`splendor:${state.seq}`);
    expect(board.text).toContain('第 1 輪');
    expect(board.text).toContain('👉 輪到 <@p2>（90 秒）');
    expect(board.text).toContain('庫存：白 4 藍 4 綠 4 紅 4 黑 4 金 5');
    expect(board.text).toContain('貴族 1：紅4 綠4\n貴族 2：綠4 藍4\n貴族 3：藍4 白4');
    const i3 = board.text.indexOf('三級（牌堆 16）');
    const i2 = board.text.indexOf('二級（牌堆 26）');
    const i1 = board.text.indexOf('一級（牌堆 36）');
    expect(i3).toBeGreaterThan(-1);
    expect(i3 < i2 && i2 < i1).toBe(true);
    expect(board.text).toContain('1-1 白 0分｜紅2 黑1');
    expect(board.text).toContain('3-4 白 5分｜白3 黑7');
    expect(board.text).toContain('{{name:p1}} 0 分｜籌碼 無（0）｜折扣 無（0 張）｜保留 0｜貴族 0');
    expect(board.text).toContain('👉 {{name:p2}} 0 分');
    expect(board.options).toEqual([
      { value: `turnMenu:${state.seq}`, label: '💍 行動' },
      { value: 'status', label: '📜 我的狀態' },
    ]);
  });

  it('空位顯示「（空）」；不顯示保留卡內容；不用 emoji 代表寶石', () => {
    const s = setup((s) => {
      s.table[0][1] = null;
      s.players[1].reserved = [90];
      s.players[1].tokens = gems({ w: 1, b: 2 });
      s.players[1].cards = [17, 20];
    });
    const [, next] = boards(timeout(s).events);
    expect(next.text).toContain('1-2 （空）');
    expect(next.text).toContain('👉 {{name:p2}} 0 分｜籌碼 白1 藍2（3）｜折扣 綠2（2 張）｜保留 1｜貴族 0');
    expect(next.text).not.toContain('紅7 黑3');
    expect(next.text).not.toMatch(/💎|🔴|🟢|🔵|⚪|⚫|🟡|🟤|🪙|♦️/u);
  });

  it('輪到下一位時舊面板收成一行、拿掉按鈕，新面板 ref 不同，上一步併在新面板', () => {
    const s = setup();
    const [old, next] = boards(timeout(s).events);
    expect(old.ref).toBe(`splendor:${s.seq}`);
    expect(old.options).toEqual([]);
    expect(old.text).toBe('✅ {{name:p1}} 的回合結束：{{name:p1}} 逾時，跳過');
    expect(next.ref).toBe(`splendor:${s.seq + 1}`);
    expect(next.text).toContain('上一步：{{name:p1}} 逾時，跳過');
  });

  it('4 人局面板文字少於 3000 字元', () => {
    const s = setup((s) => {
      s.players.forEach((p) => {
        p.tokens = gems({ w: 2, b: 2, g: 2, r: 2, k: 1, o: 1 });
        p.cards = [1, 9, 17, 25, 33, 41];
        p.reserved = [88, 89, 90];
      });
    }, 4);
    const [, next] = boards(timeout(s).events);
    expect(next.text.length).toBeLessThan(3000);
  });
});

describe('splendor/setup: 我的狀態', () => {
  it('只讓本人看到分數、籌碼、折扣、已買、保留卡完整內容（含買不買得起）、貴族；state 不變', () => {
    const s = setup((s) => {
      s.players[0].reserved = [90, 1];
      s.players[0].tokens = gems({ r: 2, k: 1 });
      s.players[0].cards = [8];
    });
    const { state, events } = run([{ type: 'status', user: 'p1' }], s);
    expect(state).toBe(s);
    const text = ephemeralTo(events, 'p1').join();
    for (const part of ['1 分', '籌碼 紅2 黑1（3）', '折扣 白1', '白 1分｜綠4', '保留 1 黑 5分｜紅7 黑3（買不起', '保留 2 白 0分｜紅2 黑1（買得起，付 紅2 黑1）', '貴族']) {
      expect(text).toContain(part);
    }
    expect(prompts(events)).toEqual([]);
  });

  it('局外人被拒', () => {
    expect(ephemeralTo(run([{ type: 'status', user: 'x' }], setup()).events, 'x')).toEqual(['你不在這局遊戲中']);
  });
});
