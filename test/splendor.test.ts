import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { splendor } from '../src/games/splendor.js';
import { applySplendor, botMove, botReturn, scoreOf, targetOf, type SAction, type SState } from '../src/splendor.js';
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

const STALE = '這個選單已經過期，請重新按「💍 行動」';
const lastBoard = (events: GameEvent[]) => boards(events).at(-1)!;
const values = (events: GameEvent[], user = 'p1') => menuOf(events, user)!.options.map((o) => o.value);
const labels = (events: GameEvent[], user = 'p1') => menuOf(events, user)!.options.map((o) => o.label);

describe('splendor/turns: 回合選單', () => {
  it('開局只列拿 3 色、拿 2 個同色、保留，寫著沒有買得起的卡；不改 state、不重設計時器', () => {
    const s = setup();
    const { state, events } = act(s, { type: 'turnMenu' });
    expect(state).toBe(s);
    expect(events.some((e) => e.type === 'startTimer')).toBe(false);
    const menu = menuOf(events, 'p1')!;
    expect(menu.replace).toBe(true);
    expect(menu.options).toEqual([
      { value: `turnMenu:${s.seq}:take3`, label: '拿 3 種不同顏色' },
      { value: `turnMenu:${s.seq}:take2`, label: '拿 2 個同色' },
      { value: `turnMenu:${s.seq}:reserve`, label: '保留一張卡' },
    ]);
    expect(menu.text).toContain('沒有買得起的卡');
  });

  it('買得起時有買卡；保留滿 3 張、庫存不到 4 個時說明原因', () => {
    const s = setup((s) => {
      s.players[0].tokens = gems({ r: 2, k: 1 });
      s.players[0].reserved = [88, 89, 90];
      s.bank = gems({ w: 3, b: 3, g: 3, r: 2, k: 3, o: 5 });
    });
    const { events } = act(s, { type: 'turnMenu' });
    expect(labels(events)).toEqual(['拿 3 種不同顏色', '買卡']);
    expect(menuOf(events, 'p1')!.text).toContain('已經保留 3 張');
    expect(menuOf(events, 'p1')!.text).toContain('沒有庫存 4 個以上的顏色');
  });

  it('不是輪到的人、局外人、過期選單被拒，state 不變', () => {
    const s = setup();
    expect(ephemeralTo(act(s, { type: 'turnMenu' }, 'p2').events, 'p2')).toEqual(['還沒輪到你。']);
    expect(ephemeralTo(act(s, { type: 'turnMenu' }, 'x').events, 'x')).toEqual(['你不在這局遊戲中']);
    const stale = act(s, { type: 'buy', seq: s.seq - 1, slot: '1-1' });
    expect(stale.state).toBe(s);
    expect(ephemeralTo(stale.events, 'p1')).toEqual([STALE]);
  });

  it('子選單附「↩️ 換一個動作」；做不到的子選單回過期', () => {
    const s = setup();
    for (const sub of ['take3', 'take2', 'reserve'] as const) {
      expect(menuOf(act(s, { type: 'turnMenu', sub }).events, 'p1')!.options.at(-1)).toEqual({ value: `turnMenu:${s.seq}`, label: '↩️ 換一個動作' });
    }
    expect(ephemeralTo(act(s, { type: 'turnMenu', sub: 'buy' }).events, 'p1')).toEqual([STALE]);
  });
});

describe('splendor/turns: 拿 3 種不同顏色', () => {
  it('點選和取消只改按鈕不改 state；選滿 3 種後其他顏色不出現、出現確認', () => {
    const s = setup();
    const q = s.seq;
    expect(values(act(s, { type: 'turnMenu', sub: 'take3' }).events)).toEqual([`pick3:${q}:w`, `pick3:${q}:b`, `pick3:${q}:g`, `pick3:${q}:r`, `pick3:${q}:k`, `turnMenu:${q}`]);
    const two = act(s, { type: 'pick3', colors: ['w', 'b'] });
    expect(two.state).toBe(s);
    expect(menuOf(two.events, 'p1')!.options.slice(0, 3)).toEqual([
      { value: `pick3:${q}:b`, label: '✅ 白' },
      { value: `pick3:${q}:w`, label: '✅ 藍' },
      { value: `pick3:${q}:wbg`, label: '綠' },
    ]);
    expect(values(two.events).some((v) => v.startsWith('take3'))).toBe(false);
    const three = act(s, { type: 'pick3', colors: ['w', 'b', 'g'] });
    expect(labels(three.events)).toEqual(['✅ 白', '✅ 藍', '✅ 綠', '確認拿 白 藍 綠', '↩️ 換一個動作']);
    expect(values(three.events)[3]).toBe(`take3:${q}:wbg`);
  });

  it('確認後籌碼移動、輪到下一位、上一步寫拿了什麼', () => {
    const s = setup();
    const { state, events } = act(s, { type: 'take3', colors: ['w', 'b', 'g'] });
    expect(state.players[0].tokens).toEqual(gems({ w: 1, b: 1, g: 1 }));
    expect(state.bank).toEqual(gems({ w: 3, b: 3, g: 3, r: 4, k: 4, o: 5 }));
    expect(state.turn).toBe(1);
    expect(lastBoard(events).text).toContain('上一步：{{name:p1}} 拿了 白1 藍1 綠1');
  });

  it('庫存只剩 2 種顏色時拿 2 個', () => {
    const s = setup((s) => (s.bank = gems({ r: 2, k: 1, o: 5 })));
    const { events } = act(s, { type: 'pick3', colors: ['r', 'k'] });
    expect(labels(events)).toContain('確認拿 紅 黑');
    const done = act(s, { type: 'take3', colors: ['r', 'k'] });
    expect(done.state.players[0].tokens).toEqual(gems({ r: 1, k: 1 }));
  });

  it('確認時重新檢查：庫存沒有的顏色、還有 3 種卻只拿 2 種，回過期且 state 不變', () => {
    const s = setup((s) => (s.bank.w = 0));
    for (const colors of [['w', 'b', 'g'], ['b', 'g']] as Color[][]) {
      const r = act(s, { type: 'take3', colors });
      expect(r.state).toBe(s);
      expect(ephemeralTo(r.events, 'p1')).toEqual([STALE]);
    }
  });
});

describe('splendor/turns: 拿 2 個同色', () => {
  it('只列庫存 4 個以上的顏色；拿完庫存少 2', () => {
    const s = setup((s) => (s.bank.r = 3));
    expect(values(act(s, { type: 'turnMenu', sub: 'take2' }).events)).toEqual([`take2:${s.seq}:w`, `take2:${s.seq}:b`, `take2:${s.seq}:g`, `take2:${s.seq}:k`, `turnMenu:${s.seq}`]);
    expect(act(s, { type: 'take2', color: 'r' }).state).toBe(s);
    const { state, events } = act(s, { type: 'take2', color: 'w' });
    expect(state.players[0].tokens).toEqual(gems({ w: 2 }));
    expect(state.bank.w).toBe(2);
    expect(lastBoard(events).text).toContain('{{name:p1}} 拿了 白2');
  });
});

describe('splendor/turns: 保留一張卡', () => {
  it('選單列出翻開的卡和還有牌的牌堆頂', () => {
    const s = setup((s) => (s.decks[0] = []));
    const v = values(act(s, { type: 'turnMenu', sub: 'reserve' }).events);
    expect(v).toContain(`reserve:${s.seq}:3-1`);
    expect(v).toContain(`reserve:${s.seq}:1-4`);
    expect(v).toContain(`reserve:${s.seq}:deck3`);
    expect(v).not.toContain(`reserve:${s.seq}:deck1`);
    expect(labels(act(s, { type: 'turnMenu', sub: 'reserve' }).events)).toContain('二級牌堆頂');
  });

  it('保留翻開的卡：進保留區、拿 1 金、從同級牌堆補牌、公告保留了哪張', () => {
    const s = setup();
    const { state, events } = act(s, { type: 'reserve', slot: '2-3' });
    expect(state.players[0].reserved).toEqual([43]);
    expect(state.players[0].tokens.o).toBe(1);
    expect(state.bank.o).toBe(4);
    expect(state.table[1][2]).toBe(45);
    expect(state.decks[1]).toHaveLength(25);
    expect(lastBoard(events).text).toContain('{{name:p1}} 保留了 2-3 白 2分 並拿 1 金');
  });

  it('牌堆空了位置空著；黃金用完照樣保留', () => {
    const s = setup((s) => {
      s.decks[1] = [];
      s.bank.o = 0;
    });
    const { state, events } = act(s, { type: 'reserve', slot: '2-3' });
    expect(state.table[1][2]).toBeNull();
    expect(state.players[0].tokens.o).toBe(0);
    expect(lastBoard(events).text).not.toContain('並拿 1 金');
  });

  it('盲抽：只有本人看到是哪張，頻道只說哪一級', () => {
    const s = setup();
    const { state, events } = act(s, { type: 'reserve', slot: 'deck3' });
    expect(state.players[0].reserved).toEqual([75]);
    expect(state.decks[2]).toHaveLength(15);
    expect(ephemeralTo(events, 'p1').join()).toContain('藍 3分｜白3 綠3 紅3 黑5');
    const pub = boards(events).map((b) => b.text).join('\n');
    expect(pub).toContain('{{name:p1}} 從三級牌堆保留一張');
    expect(pub).not.toContain('白3 綠3 紅3 黑5');
  });

  it('保留滿 3 張不能保留', () => {
    const s = setup((s) => (s.players[0].reserved = [88, 89, 90]));
    expect(act(s, { type: 'reserve', slot: '1-1' }).state).toBe(s);
  });
});

describe('splendor/turns: 買卡', () => {
  it('只列買得起的翻開卡和保留卡，按鈕寫要付的籌碼', () => {
    const s = setup((s) => {
      s.players[0].tokens = gems({ r: 2, k: 1, o: 1 });
      s.players[0].reserved = [90, 17];
      s.bank = gems({ w: 4, b: 4, g: 4, r: 2, k: 3, o: 4 });
    });
    expect(menuOf(act(s, { type: 'turnMenu', sub: 'buy' }).events, 'p1')!.options).toEqual([
      { value: `buy:${s.seq}:1-1`, label: '1-1 白 0分｜紅2 黑1（付 紅2 黑1）' },
      { value: `buy:${s.seq}:r2`, label: '保留 2 綠 0分｜紅3（付 紅2 金1）' },
      { value: `turnMenu:${s.seq}`, label: '↩️ 換一個動作' },
    ]);
  });

  it('用折扣和黃金買卡：先付同色再用黃金，籌碼回庫存，補牌，公告付了什麼', () => {
    const s = setup((s) => {
      s.players[0].cards = [9]; // 藍色折扣 1
      s.players[0].tokens = gems({ b: 1, o: 1 });
      s.bank = gems({ w: 4, b: 3, g: 4, r: 4, k: 4, o: 4 });
      s.table[0][0] = 6; // 白 0分｜藍3
    });
    const { state, events } = act(s, { type: 'buy', slot: '1-1' });
    expect(state.players[0].tokens).toEqual(gems());
    expect(state.players[0].cards).toEqual([9, 6]);
    expect(state.bank).toEqual(gems({ w: 4, b: 4, g: 4, r: 4, k: 4, o: 5 }));
    expect(state.table[0][0]).toBe(5);
    expect(lastBoard(events).text).toContain('{{name:p1}} 買了 1-1 白 0分（付 藍1 金1）');
  });

  it('折扣足夠免費；買保留的卡時場上公開卡不變', () => {
    const s = setup((s) => {
      s.players[0].cards = [1, 2, 3, 4]; // 白色折扣 4
      s.players[0].reserved = [32]; // 紅 1分｜白4
    });
    const { state, events } = act(s, { type: 'buy', slot: 'r1' });
    expect(state.players[0].reserved).toEqual([]);
    expect(state.players[0].cards).toEqual([1, 2, 3, 4, 32]);
    expect(state.table).toEqual(s.table);
    expect(lastBoard(events).text).toContain('{{name:p1}} 買了保留的 紅 1分（付 無）');
  });

  it('買不起不能買，state 不變', () => {
    const s = setup();
    expect(act(s, { type: 'buy', slot: '1-1' }).state).toBe(s);
  });

  it('籌碼總數守恆', () => {
    let s = setup();
    s = act(s, { type: 'take3', colors: ['r', 'k', 'w'] }).state;
    s = act(s, { type: 'take2', color: 'g' }, 'p2').state;
    s = act(s, { type: 'reserve', slot: '1-1' }).state;
    s = act(s, { type: 'take3', colors: ['w', 'b', 'k'] }, 'p2').state;
    s = act(s, { type: 'buy', slot: 'r1' }).state;
    expect(s.players[0].cards).toEqual([1]);
    for (const x of ['w', 'b', 'g', 'r', 'k', 'o'] as const) {
      expect(s.bank[x] + s.players.reduce((sum, p) => sum + p.tokens[x], 0)).toBe(x === 'o' ? 5 : 4);
    }
  });
});

describe('splendor/turns: 退回多餘籌碼', () => {
  // p1 有 9 個，拿 3 色後 12 個，要退 2 個
  const over = () => act(setup((s) => (s.players[0].tokens = gems({ w: 3, b: 3, g: 3 }))), { type: 'take3', colors: ['g', 'r', 'k'] });

  it('超過 10 個進入退回階段：面板原地標示等待退回、只有本人看到退回選單、30 秒計時', () => {
    const { state, events } = over();
    expect(state).toMatchObject({ step: 'return', turn: 0 });
    const [board] = boards(events);
    expect(board.ref).toBe(`splendor:${state.seq}`);
    expect(board.text).toContain('等 {{name:p1}} 退回 2 個籌碼');
    const menu = menuOf(events, 'p1')!;
    expect(menu.text).toContain('要退回 2 個');
    const q = state.seq;
    expect(menu.options).toEqual([
      { value: `retPick:${q}:100000`, label: '退 白' },
      { value: `retPick:${q}:010000`, label: '退 藍' },
      { value: `retPick:${q}:001000`, label: '退 綠' },
      { value: `retPick:${q}:000100`, label: '退 紅' },
      { value: `retPick:${q}:000010`, label: '退 黑' },
      { value: `retPick:${q}:000000`, label: '重選' },
    ]);
    expect(events).toContainEqual({ type: 'startTimer', id: state.timers.phase, ms: 30_000 });
  });

  it('retPick 累加、顯示已選幾個、不超過持有數，總數剛好才有確認；不改 state', () => {
    const s = over().state;
    const q = s.seq;
    const r = act(s, { type: 'retPick', counts: [1, 0, 0, 1, 0, 0] });
    expect(r.state).toBe(s);
    expect(menuOf(r.events, 'p1')!.options).toEqual([
      { value: `retPick:${q}:100100`, label: '退 白（已選 1）' },
      { value: `retPick:${q}:100100`, label: '退 藍' },
      { value: `retPick:${q}:100100`, label: '退 綠' },
      { value: `retPick:${q}:100100`, label: '退 紅（已選 1）' },
      { value: `retPick:${q}:100100`, label: '退 黑' },
      { value: `retPick:${q}:000000`, label: '重選' },
      { value: `return:${q}:100100`, label: '確認退回 白1 紅1' },
    ]);
    expect(values(act(s, { type: 'retPick', counts: [0, 0, 0, 0, 0, 0] }).events)).not.toContain(`return:${q}:000000`);
    expect(ephemeralTo(act(s, { type: 'retPick', counts: [0, 0, 0, 2, 0, 0] }).events, 'p1')).toEqual([STALE]); // 紅只有 1 個
    expect(ephemeralTo(act(s, { type: 'retPick', counts: [3, 0, 0, 0, 0, 0] }).events, 'p1')).toEqual([STALE]); // 超過要退的數量
  });

  it('確認後籌碼回庫存並公告，回合繼續；可以退剛拿的', () => {
    const s = over().state;
    const { state, events } = act(s, { type: 'return', counts: [0, 0, 0, 1, 1, 0] });
    expect(state.players[0].tokens).toEqual(gems({ w: 3, b: 3, g: 4 }));
    expect(state.bank.r + state.bank.k).toBe(8);
    expect(state.turn).toBe(1);
    expect(lastBoard(events).text).toContain('{{name:p1}} 拿了 綠1 紅1 黑1，{{name:p1}} 退回 紅1 黑1');
    expect(act(s, { type: 'return', counts: [1, 0, 0, 0, 0, 0] }).state).toBe(s); // 總數不對
  });

  it('退回階段動作按鈕無效；按「💍 行動」開退回選單', () => {
    const s = over().state;
    expect(ephemeralTo(act(s, { type: 'take2', color: 'w' }).events, 'p1')).toEqual([STALE]);
    expect(ephemeralTo(act(s, { type: 'turnMenu', sub: 'take3' }).events, 'p1')).toEqual([STALE]);
    expect(menuOf(act(s, { type: 'turnMenu' }).events, 'p1')!.text).toContain('要退回 2 個');
  });

  it('30 秒逾時自動退：多的顏色先退、同樣多依白藍綠紅黑，黃金最後', () => {
    const s = setup((s) => {
      s.step = 'return';
      s.players[0].tokens = gems({ w: 2, b: 2, g: 2, r: 2, k: 1, o: 3 });
    });
    const { state, events } = timeout(s);
    expect(state.players[0].tokens).toEqual(gems({ w: 1, b: 1, g: 2, r: 2, k: 1, o: 3 }));
    expect(lastBoard(events).text).toContain('{{name:p1}} 逾時自動退回 白1 藍1');
    const most = timeout(setup((s) => {
      s.step = 'return';
      s.players[0].tokens = gems({ w: 1, b: 5, o: 5 });
    }));
    expect(most.state.players[0].tokens).toEqual(gems({ w: 1, b: 4, o: 5 }));
  });
});

describe('splendor/turns: 貴族來訪', () => {
  // 場上貴族 1：紅4 綠4、貴族 2：綠4 藍4、貴族 3：藍4 白4
  const RED4 = [25, 26, 27, 28];
  const GREEN3 = [17, 18, 19];

  it('買到第 4 張綠卡時貴族 1 來訪：+3 分、場上移除、編號不重排', () => {
    const s = setup((s) => {
      s.players[0].cards = [...RED4, ...GREEN3];
      s.players[0].tokens = gems({ w: 2, b: 1 });
      s.table[0][0] = 23; // 綠 0分｜白2 藍1
    });
    const { state, events } = act(s, { type: 'buy', slot: '1-1' });
    expect(state.players[0].nobles).toEqual([1]);
    expect(state.nobles).toEqual([null, 2, 3]);
    const text = lastBoard(events).text;
    expect(text).toContain('貴族 1 來訪 {{name:p1}}（+3 分）');
    expect(text).not.toContain('貴族 1：');
    expect(text).toContain('貴族 2：綠4 藍4');
    expect(text).toContain('{{name:p1}} 3 分');
  });

  it('籌碼不算進貴族條件', () => {
    const s = setup((s) => {
      s.players[0].cards = [...RED4, ...GREEN3];
      s.players[0].tokens = gems({ g: 4 });
    });
    expect(timeout(s).state.players[0].nobles).toEqual([]);
  });

  it('一回合只來一位，同時符合時來編號最小的；下次回合結束仍符合就來', () => {
    const s = setup((s) => (s.players[0].cards = [...RED4, 17, 18, 19, 20, 9, 10, 11, 12]));
    let state = timeout(s).state;
    expect(state.players[0].nobles).toEqual([1]);
    expect(state.nobles).toEqual([null, 2, 3]);
    state = timeout(act(state, { type: 'take2', color: 'w' }, 'p2').state).state;
    expect(state.players[0].nobles).toEqual([1, 2]);
  });

  it('退回籌碼之後才檢查', () => {
    const s = setup((s) => {
      s.players[0].cards = [...RED4, ...GREEN3, 20];
      s.players[0].tokens = gems({ w: 3, b: 3, g: 3 });
    });
    const mid = act(s, { type: 'take3', colors: ['g', 'r', 'k'] }).state;
    expect(mid.players[0].nobles).toEqual([]);
    expect(act(mid, { type: 'return', counts: [2, 0, 0, 0, 0, 0] }).state.players[0].nobles).toEqual([1]);
  });
});

describe('splendor/turns: 自動跳過與計時', () => {
  it('沒有能做的動作：自動跳過並公告，直接輪到下一位', () => {
    const s = setup((s) => {
      s.bank = gems({ o: 2 });
      s.players[1].reserved = [88, 89, 90];
    }, 3);
    const { state, events } = timeout(s);
    expect(state.turn).toBe(2);
    expect(boards(events).map((b) => b.text).join('\n')).toContain('{{name:p2}} 沒有能做的動作，跳過');
    expect(boards(events)).toHaveLength(2); // p1 收起的面板、p3 的新面板
  });

  it('90 秒逾時跳過：資源不變、輪到下一位', () => {
    const s = setup((s) => (s.players[0].tokens = gems({ w: 1 })));
    const { state } = timeout(s);
    expect(state.players[0]).toEqual(s.players[0]);
    expect(state.bank).toEqual(s.bank);
    expect(state.turn).toBe(1);
  });

  it('舊計時器被忽略', () => {
    const s = setup();
    const old = s.timers.phase!;
    const next = act(s, { type: 'take2', color: 'w' }).state;
    const r = run([{ type: 'timeout', id: old }], next);
    expect(r.state).toBe(next);
    expect(r.events).toEqual([]);
  });
});

const FIFTEEN = [74, 78, 82]; // 三張 5 分

describe('splendor/scoring: 分數與最後一輪', () => {
  it('分數是卡片分數加貴族 3 分，保留卡和籌碼不算', () => {
    const p = { id: 'a', tokens: gems({ w: 5, o: 3 }), cards: [43, 8, 1], reserved: [90], nobles: [4] };
    expect(scoreOf(p)).toBe(6);
  });

  it('中間的人達到 15 分：公告、面板標示最後一輪，打到座位最後一位才計分', () => {
    const s = setup((s) => (s.players[1].cards = [...FIFTEEN]), 3);
    const a = act(s, { type: 'take2', color: 'w' });
    const b = act(a.state, { type: 'take2', color: 'b' }, 'p2');
    expect(announces(b.events).join()).toContain('<@p2> 達到 15 分！這一輪打完後遊戲結束');
    expect(lastBoard(b.events).text).toContain('第 1 輪｜最後一輪');
    expect(b.state.phase).toBe('play');
    const c = act(b.state, { type: 'take2', color: 'g' }, 'p3');
    expect(c.state.phase).toBe('ended');
    expect(c.state.round).toBe(1);
    expect(c.events.some((e) => e.type === 'result')).toBe(true);
  });

  it('座位最後一位達到 15 分時立刻計分；同一輪第二個人到 15 分不重複公告', () => {
    const last = act(setup((s) => ((s.turn = 2), (s.players[2].cards = [...FIFTEEN])), 3), { type: 'take2', color: 'w' }, 'p3');
    expect(last.state.phase).toBe('ended');
    expect(announces(last.events).join()).toContain('達到 15 分');
    const second = act(setup((s) => ((s.turn = 1), (s.lastRound = true), (s.players[1].cards = [...FIFTEEN])), 3), { type: 'take2', color: 'w' }, 'p2');
    expect(announces(second.events).join()).not.toContain('達到 15 分');
  });
});

describe('splendor/scoring: 防卡死的提前計分', () => {
  it('一整輪都跳過：公告並直接計分', () => {
    let { state } = { state: setup(undefined, 3) };
    let events: GameEvent[] = [];
    for (let k = 0; k < 3; k++) ({ state, events } = timeout(state));
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('一整輪沒有人能行動，直接計分');
    expect(events.some((e) => e.type === 'result')).toBe(true);
  });

  it('有人做動作時連續跳過歸零', () => {
    let state = timeout(setup(undefined, 3)).state;
    state = act(state, { type: 'take2', color: 'w' }, 'p2').state;
    state = timeout(timeout(state).state).state;
    expect(state.phase).toBe('play');
    expect(state.passStreak).toBe(2);
  });

  it('第 50 輪結束還沒有人到 15 分：公告並直接計分；第 49 輪結束照常進入第 50 輪', () => {
    const r = act(setup((s) => ((s.round = 50), (s.turn = 1))), { type: 'take2', color: 'w' }, 'p2');
    expect(r.state.phase).toBe('ended');
    expect(announces(r.events).join()).toContain('已達 50 輪上限，直接計分');
    const r49 = act(setup((s) => ((s.round = 49), (s.turn = 1))), { type: 'take2', color: 'w' }, 'p2');
    expect(r49.state).toMatchObject({ phase: 'play', round: 50, turn: 0 });
  });
});

describe('splendor/scoring: 勝負與結束', () => {
  // 最後一輪、輪到座位最後一位（p3），他一逾時就計分
  const endWith = (cards: number[][]) =>
    timeout(setup((s) => {
      s.lastRound = true;
      s.turn = 2;
      s.players.forEach((p, i) => (p.cards = cards[i]));
    }, 3));
  const zeros = (n: number) => [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13].slice(0, n);

  it('分數最高的人贏：公告分數、張數、貴族、名次，送出 result，附再來一局', () => {
    const { state, events } = endWith([[...FIFTEEN, 8], [86, 90, 70, 16, 24], [71, 75, 79]]);
    expect(state.phase).toBe('ended');
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1'] });
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> 獲勝');
    expect(text).toContain('1. <@p1> 16 分｜4 張卡｜貴族 0 🏆');
    expect(text).toContain('2. <@p2> 15 分｜5 張卡｜貴族 0');
    expect(text).toContain('3. <@p3> 9 分｜3 張卡｜貴族 0');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('同分比卡少；再同分並列（包括全員 0 分）', () => {
    expect(endWith([[...FIFTEEN, 8, ...zeros(8)], [86, 90, 70, 16, 24, 32, ...zeros(4)], []]).state.winners).toEqual(['p2']);
    expect(endWith([[...FIFTEEN, ...zeros(8)], [86, 90, 82, ...zeros(8)], [8]]).state.winners).toEqual(['p1', 'p2']);
    expect(endWith([[], [], []]).state.winners).toEqual(['p1', 'p2', 'p3']);
  });

  it('再來一局只有上一局玩家可以開', () => {
    const { state } = endWith([[], [], []]);
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], state).events, 'x').join()).toContain('只有上一局的玩家');
    const again = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state);
    expect(again.state).toMatchObject({ phase: 'lobby', host: 'p2', game: 'splendor' });
  });

  it('房主取消：沒有 result、沒有再來一局；非房主被拒；結束後舊按鈕被忽略', () => {
    const s = setup();
    expect(ephemeralTo(run([{ type: 'cancel', user: 'p2' }], s).events, 'p2').join()).toContain('只有房主可以取消遊戲');
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(act(state, { type: 'turnMenu' }).events).toEqual([]);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).events).toEqual([]);
  });
});

describe('splendor/bots: 缺口和目標卡', () => {
  const target = (s: SState) => targetOf(s, s.players[0])?.slot;

  it('缺口最小的候選卡', () => {
    expect(target(setup())).toBe('1-1'); // 白 0分｜紅2 黑1，缺口 3
  });

  it('缺口計算含黃金', () => {
    // 沒有黃金時 1-1（白 0分｜紅2 黑1）缺口 3 最小；有 4 個黃金時一級四張缺口都是 0，改取分數高的 1-2（白 1分｜綠4）
    const s = setup((s) => (s.table[0] = [1, 8, 16, 24]));
    expect(target(s)).toBe('1-1');
    s.players[0].tokens = gems({ o: 4 });
    expect(target(s)).toBe('1-2');
  });

  it('同缺口取分數高的；再相同依固定順序（保留卡在前，再來三級→一級、位置）', () => {
    expect(target(setup((s) => (s.table[0] = [4, 8, 2, 13])))).toBe('1-2');
    expect(target(setup((s) => (s.table[0] = [4, 2, 13, 10])))).toBe('1-1');
    expect(target(setup((s) => ((s.table[0] = [4, 2, 13, 10]), (s.players[0].reserved = [19]))))).toBe('r1'); // 綠 0分｜藍2 紅2：缺口同樣 4
  });
});

describe('splendor/bots: bot 的行動', () => {
  const move = (s: SState) => botMove(s, s.players[0]);

  it('買得起就買分數最高的', () => {
    const s = setup((s) => {
      s.table[0] = [1, 8, 16, 24];
      s.players[0].tokens = gems({ r: 2, k: 1, g: 4 });
    });
    expect(move(s)).toMatchObject({ type: 'buy', slot: '1-2' });
  });

  it('同分時付最少的', () => {
    const s = setup((s) => {
      s.table[0] = [28, 23, 8, 16]; // 紅 0分｜白2 紅2（付 4）、綠 0分｜白2 藍1（付 3）
      s.players[0].tokens = gems({ w: 2, b: 1, r: 2, k: 2 });
    });
    expect(move(s)).toMatchObject({ type: 'buy', slot: '1-2' });
  });

  it('朝目標卡拿 3 色，不足用庫存最多的顏色補', () => {
    const s = setup((s) => (s.table[0] = [25, 8, 16, 24])); // 目標 紅 0分｜藍2 綠1
    expect(move(s)).toEqual({ type: 'take3', user: 'p1', seq: s.seq, colors: ['w', 'b', 'g'] });
    const t = setup((s) => {
      s.table[0] = [25, 8, 16, 24];
      s.bank = gems({ w: 1, b: 4, g: 4, r: 3, k: 2, o: 5 });
    });
    expect(move(t)).toMatchObject({ type: 'take3', colors: ['b', 'g', 'r'] });
  });

  it('只缺一種顏色、缺 2 個以上、庫存 4 個以上時拿 2 個', () => {
    const s = setup((s) => {
      s.table[0] = [17, 8, 24, 40]; // 目標 綠 0分｜紅3
      s.players[0].tokens = gems({ r: 1 });
    }, 3);
    expect(move(s)).toEqual({ type: 'take2', user: 'p1', seq: s.seq, color: 'r' });
  });

  it('庫存空了就保留目標卡；目標是保留卡時保留場上分數最高的', () => {
    const empty = gems({ o: 5 });
    expect(move(setup((s) => (s.bank = { ...empty })))).toMatchObject({ type: 'reserve', slot: '1-1' });
    const s = setup((s) => {
      s.bank = { ...empty };
      s.players[0].reserved = [17];
      s.players[0].tokens = gems({ r: 1 });
    });
    expect(move(s)).toMatchObject({ type: 'reserve', slot: '3-4' }); // 白 5分
    s.table = [[null, null, null, null], [null, null, null, null], [null, null, null, null]];
    expect(move(s)).toMatchObject({ type: 'reserve', slot: 'deck3' });
  });

  it('退回：先退目標卡用不到的', () => {
    const s = setup((s) => {
      s.table[1][0] = 56; // 綠 2分｜藍5 綠3
      s.players[0].cards = [9, 10, 17]; // 折扣 藍2 綠1 → 應付 藍3 綠2
      s.players[0].tokens = gems({ w: 4, b: 3, g: 2, r: 2 });
    });
    expect(botReturn(s, s.players[0])).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('退回：用不到的退完再退持有最多的，黃金最後', () => {
    const s = setup((s) => {
      s.players[0].reserved = [82]; // 綠 5分｜藍7 綠3
      s.players[0].tokens = gems({ b: 4, g: 4, o: 5 });
    });
    expect(botReturn(s, s.players[0])).toEqual([0, 2, 1, 0, 0, 0]);
  });

  it('bot 輪到就立刻行動，需要退回時立刻退完', () => {
    const lobby = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(1).state).state;
    const { state } = run([{ type: 'start', user: 'p1' }], lobby); // 第一位是座位最後一位（bot）
    expect(state.turn).toBe(0);
    expect(total(state.players[1].tokens)).toBe(3);
    const s = setup((s) => {
      s.players[1].id = 'bot:1:阿土';
      s.players[1].tokens = gems({ w: 3, b: 3, g: 3 });
    });
    const r = act(s, { type: 'take2', color: 'k' });
    expect(r.state.turn).toBe(0);
    expect(total(r.state.players[1].tokens)).toBe(10);
  });
});

describe('splendor/bots: 一個人也能玩完整局', () => {
  it('1 位真人 + 3 個 bot，真人都不操作，靠計時和 bot 推進到結束並送出 result', () => {
    const lobby = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    let { state, events } = run([{ type: 'start', user: 'p1' }], lobby);
    let all = [...events];
    for (let k = 0; k < 500 && state.phase !== 'ended'; k++) {
      ({ state, events } = timeout(state));
      all = all.concat(events);
    }
    expect(state.phase).toBe('ended');
    expect(all.some((e) => e.type === 'result')).toBe(true);
  });

  it('2 位真人都不操作：各逾時跳過一次後直接計分', () => {
    let state = started(2).state;
    state = timeout(state).state;
    const { state: end, events } = timeout(state);
    expect(end.phase).toBe('ended');
    expect(announces(events).join()).toContain('一整輪沒有人能行動');
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2'], winners: ['p1', 'p2'] });
  });
});

describe('splendor/setup: 指令解析與按鈕（GameDef）', () => {
  it('大廳資訊：💍 璀璨寶石、2～4 人、心理戰', () => {
    expect(splendor).toMatchObject({ kind: 'splendor', emoji: '💍', name: '璀璨寶石', players: '2～4 人', category: 'bluff' });
    expect(splendor.apply).toBe(applySplendor);
  });

  it('指令解析：new、start、cancel、addbot、removebot', () => {
    expect(splendor.parse('new', 'u', 'C1')).toEqual({ type: 'new', user: 'u', channel: 'C1' });
    expect(splendor.parse('start', 'u', 'C1')).toEqual({ type: 'start', user: 'u' });
    expect(splendor.parse('cancel', 'u', 'C1')).toEqual({ type: 'cancel', user: 'u' });
    expect(splendor.parse('addbot 3', 'u', 'C1')).toEqual({ type: 'addBot', user: 'u', count: 3 });
    expect(splendor.parse('removebot', 'u', 'C1')).toEqual({ type: 'removeBot', user: 'u', count: 1 });
  });

  it('help 和不認識的子指令回傳 null（顯示說明），說明列出所有指令和按鈕', () => {
    expect(splendor.parse('help', 'u', 'C1')).toBeNull();
    expect(splendor.parse('buy', 'u', 'C1')).toBeNull();
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(splendor.help).toContain(`/game splendor ${cmd}`);
    expect(splendor.help).toContain('💍 行動');
    expect(splendor.help).toContain('📜 我的狀態');
  });

  it('按鈕路由：房間按鈕和遊戲中的每種按鈕', () => {
    const b = (value: string, kind = 'splendor', user = 'u') => splendor.button(kind, value, user, 'C1');
    expect(b('join', 'join')).toEqual({ type: 'join', user: 'u' });
    expect(b('leave', 'leave')).toEqual({ type: 'leave', user: 'u' });
    expect(b('start', 'start')).toEqual({ type: 'start', user: 'u' });
    expect(b('rematch', 'rematch')).toEqual({ type: 'rematch', user: 'u', channel: 'C1' });
    expect(b('status')).toEqual({ type: 'status', user: 'u' });
    expect(b('turnMenu:7')).toEqual({ type: 'turnMenu', user: 'u', seq: 7 });
    expect(b('turnMenu:7:reserve')).toEqual({ type: 'turnMenu', user: 'u', seq: 7, sub: 'reserve' });
    expect(b('pick3:7:')).toEqual({ type: 'pick3', user: 'u', seq: 7, colors: [] });
    expect(b('pick3:7:wb')).toEqual({ type: 'pick3', user: 'u', seq: 7, colors: ['w', 'b'] });
    expect(b('take3:7:wbg')).toEqual({ type: 'take3', user: 'u', seq: 7, colors: ['w', 'b', 'g'] });
    expect(b('take2:7:r')).toEqual({ type: 'take2', user: 'u', seq: 7, color: 'r' });
    expect(b('reserve:7:2-3')).toEqual({ type: 'reserve', user: 'u', seq: 7, slot: '2-3' });
    expect(b('reserve:7:deck1')).toEqual({ type: 'reserve', user: 'u', seq: 7, slot: 'deck1' });
    expect(b('buy:7:1-2')).toEqual({ type: 'buy', user: 'u', seq: 7, slot: '1-2' });
    expect(b('buy:7:r3')).toEqual({ type: 'buy', user: 'u', seq: 7, slot: 'r3' });
    expect(b('retPick:7:200001')).toEqual({ type: 'retPick', user: 'u', seq: 7, counts: [2, 0, 0, 0, 0, 1] });
    expect(b('return:7:000110')).toEqual({ type: 'return', user: 'u', seq: 7, counts: [0, 0, 0, 1, 1, 0] });
    expect(b('take2:7:r', 'splendor', 'bot:1:阿土')).toEqual({ type: 'take2', user: 'bot:1:阿土', seq: 7, color: 'r' });
  });

  it('格式錯的 value 回 null', () => {
    const b = (value: string) => splendor.button('splendor', value, 'u', 'C1');
    for (const v of ['turnMenu:7:bad', 'turnMenu:x', 'pick3:7:wx', 'pick3:7:ww', 'take3:7:wbgrk', 'take2:7:o', 'reserve:7:r1', 'reserve:7:4-1', 'buy:7:deck1', 'buy:7:1-5', 'retPick:7:12', 'return:7:abcdef', 'dig:7']) {
      expect(b(v)).toBeNull();
    }
    expect(splendor.button('other', 'status', 'u', 'C1')).toBeNull();
  });
});
