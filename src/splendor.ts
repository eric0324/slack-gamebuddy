// 璀璨寶石（Splendor）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applySplendor(state, action, rng) → { state, events }。
import { isBot, mention, quiet, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import {
  CARDS,
  cardOf,
  cardText,
  COLORS,
  emptyGems,
  GEM_WORD,
  GEMS,
  gemsText,
  NOBLES,
  nobleOf,
  nobleText,
  payment,
  total,
  type Color,
  type Gems,
} from './splendorCards.js';

export const MIN_SPLENDOR_PLAYERS = 2;
export const MAX_SPLENDOR_PLAYERS = 4;
const TITLE = '璀璨寶石';
export const TURN_MS = 90_000;
export const RETURN_MS = 30_000;
export const MAX_ROUNDS = 50;
const WIN_POINTS = 15;
const LEVEL_WORD = ['一級', '二級', '三級'];

export interface SPlayer {
  id: string;
  tokens: Gems;
  cards: number[]; // 已買的卡 id
  reserved: number[]; // 保留的卡 id（最多 3）
  nobles: number[]; // 來訪的貴族 id
}

export interface SState {
  game: 'splendor';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'ended';
  players: SPlayer[];
  bank: Gems;
  decks: [number[], number[], number[]]; // 各級牌堆，[0] 是頂
  table: [(number | null)[], (number | null)[], (number | null)[]]; // 各級 4 個位置
  nobles: (number | null)[]; // 場上的貴族 id，顯示編號是 index + 1（固定不變），來訪後改成 null
  first: number; // 第一位玩家 index
  turn: number; // 輪到的玩家 index
  round: number; // 第幾輪（1 起）
  step: 'act' | 'return';
  seq: number; // 每次輪到新玩家 +1：回合面板的 ref，也用來擋掉舊按鈕
  passStreak: number; // 連續跳過的次數，有人做動作歸零
  lastRound?: boolean; // 有人達到 15 分
  last?: string; // 上一步做了什麼（面板用）
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type SAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'status'; user: string }
  | { type: 'turnMenu'; user: string; seq: number; sub?: Sub }
  | { type: 'pick3'; user: string; seq: number; colors: Color[] }
  | { type: 'take3'; user: string; seq: number; colors: Color[] }
  | { type: 'take2'; user: string; seq: number; color: Color }
  | { type: 'reserve'; user: string; seq: number; slot: string }
  | { type: 'buy'; user: string; seq: number; slot: string }
  | { type: 'retPick'; user: string; seq: number; counts: number[] } // 白藍綠紅黑金各退幾個
  | { type: 'return'; user: string; seq: number; counts: number[] }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<SAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: SState; events: GameEvent[] };
type Ctx = { s: SState; events: GameEvent[]; rng: Rng };

export type Sub = 'take3' | 'take2' | 'reserve' | 'buy';
export const SUBS: Sub[] = ['take3', 'take2', 'reserve', 'buy'];
const SUB_LABEL: Record<Sub, string> = { take3: '拿 3 種不同顏色', take2: '拿 2 個同色', reserve: '保留一張卡', buy: '買卡' };

const NOT_PLAYER = '你不在這局遊戲中';
const NOT_YET = '還沒輪到你。';
const STALE = '這個選單已經過期，請重新按「💍 行動」';

const find = (s: SState, id: string) => s.players.find((p) => p.id === id);
const current = (s: SState) => s.players[s.turn];
// 在私下選單上按的：回應取代那則選單；bot 不需要
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text, replace: true });
};
const deny = (c: Ctx, to: string, text: string) => (tell(c, to, text), false);
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'splendor', audience: 'ephemeral', user, text, options, perRow: 4, replace: true });
  return false;
};
// 籌碼從 from 移到 to
function move(from: Gems, to: Gems, g: Partial<Gems>) {
  for (const x of GEMS) {
    from[x] -= g[x] ?? 0;
    to[x] += g[x] ?? 0;
  }
}
const colorKey = (list: Color[]) => COLORS.filter((x) => list.includes(x)).join('');

// 折扣：已買卡的顏色張數
export function discountOf(p: SPlayer): Record<Color, number> {
  const d = { w: 0, b: 0, g: 0, r: 0, k: 0 };
  for (const id of p.cards) d[cardOf(id).color]++;
  return d;
}
export const scoreOf = (p: SPlayer) => p.cards.reduce((sum, id) => sum + cardOf(id).points, 0) + p.nobles.length * 3;
const tokensText = (g: Gems) => `${gemsText(g)}（${total(g)}）`;
const payOf = (p: SPlayer, id: number) => payment(cardOf(id).cost, discountOf(p), p.tokens);

const playerLine = (p: SPlayer) =>
  `${quiet(p.id)} ${scoreOf(p)} 分｜籌碼 ${tokensText(p.tokens)}｜折扣 ${gemsText(discountOf(p))}（${p.cards.length} 張）｜保留 ${p.reserved.length}｜貴族 ${p.nobles.length}`;

// 回合面板：回合內用同一個 ref 更新；ended 時收成一行、拿掉按鈕
function board(s: SState, ended = false): GameEvent {
  const me = current(s);
  const base = { type: 'prompt' as const, kind: 'splendor', audience: 'channel' as const, ref: `splendor:${s.seq}` };
  if (ended) return { ...base, text: `✅ ${quiet(me.id)} 的回合結束：${s.last}`, options: [] };
  const bank = [...COLORS, 'o' as const].map((x) => `${GEM_WORD[x]} ${s.bank[x]}`).join(' ');
  const nobles = s.nobles.flatMap((id, i) => (id === null ? [] : [`貴族 ${i + 1}：${nobleText(nobleOf(id))}`]));
  const rows = [2, 1, 0].flatMap((lv) => [
    `${LEVEL_WORD[lv]}（牌堆 ${s.decks[lv].length}）`,
    ...s.table[lv].map((id, i) => (id === null ? `${lv + 1}-${i + 1} （空）` : cardText(cardOf(id), `${lv + 1}-${i + 1}`))),
  ]);
  const lines = [
    `*💍 璀璨寶石｜第 ${s.round} 輪${s.lastRound ? '｜最後一輪' : ''}｜👉 輪到 ${mention(me.id)}（${TURN_MS / 1000} 秒）*`,
    ...(s.last ? [`上一步：${s.last}`] : []),
    ...(s.step === 'return' ? [`⏳ 等 ${quiet(me.id)} 退回 ${total(me.tokens) - 10} 個籌碼（${RETURN_MS / 1000} 秒）`] : []),
    `庫存：${bank}`,
    ...(nobles.length ? nobles : ['貴族：（沒有了）']),
    ...rows,
    ...s.players.map((p) => (p === me ? `👉 ${playerLine(p)}` : playerLine(p))),
  ];
  return { ...base, text: lines.join('\n'), options: [{ value: `turnMenu:${s.seq}`, label: '💍 行動' }, { value: 'status', label: '📜 我的狀態' }] };
}

function status(c: Ctx, user: string): boolean {
  const me = find(c.s, user);
  if (!me) return reply(c, user, NOT_PLAYER);
  const reserved = me.reserved.map((id, i) => {
    const pay = payOf(me, id);
    return `${cardText(cardOf(id), `保留 ${i + 1}`)}（${pay ? `買得起，付 ${gemsText(pay)}` : '買不起'}）`;
  });
  const lines = [
    `📜 你的狀態｜${scoreOf(me)} 分`,
    `籌碼 ${tokensText(me.tokens)}｜折扣 ${gemsText(discountOf(me))}`,
    `已買的卡（${me.cards.length} 張）：${me.cards.map((id) => cardText(cardOf(id))).join('、') || '無'}`,
    `保留的卡（${me.reserved.length} 張）：`,
    ...(reserved.length ? reserved : ['無']),
    `貴族：${me.nobles.map((id) => nobleText(nobleOf(id))).join('、') || '無'}`,
  ];
  return reply(c, user, lines.join('\n'));
}

// ---------- 回合選單與四種動作 ----------

type Slot = { slot: string; id: number; label: string };
// 場上翻開的卡：三級到一級，同級依位置 1～4
const tableSlots = (s: SState): Slot[] =>
  [2, 1, 0].flatMap((lv) => s.table[lv].flatMap((id, i) => (id === null ? [] : [{ slot: `${lv + 1}-${i + 1}`, id, label: `${lv + 1}-${i + 1}` }])));
const reservedSlots = (p: SPlayer): Slot[] => p.reserved.map((id, i) => ({ slot: `r${i + 1}`, id, label: `保留 ${i + 1}` }));
const stocked = (s: SState) => COLORS.filter((x) => s.bank[x] > 0);
const pairColors = (s: SState) => COLORS.filter((x) => s.bank[x] >= 4);
const deckSlots = (s: SState) => [2, 1, 0].filter((lv) => s.decks[lv].length).map((lv) => ({ slot: `deck${lv + 1}`, label: `${LEVEL_WORD[lv]}牌堆頂` }));
const buyable = (s: SState, p: SPlayer) => [...tableSlots(s), ...reservedSlots(p)].filter((x) => payOf(p, x.id));

// 每種動作做不到的原因；null 表示做得到
function blocked(s: SState, me: SPlayer): Record<Sub, string | null> {
  return {
    take3: stocked(s).length ? null : '庫存沒有寶石',
    take2: pairColors(s).length ? null : '沒有庫存 4 個以上的顏色',
    reserve: me.reserved.length >= 3 ? '已經保留 3 張' : tableSlots(s).length || deckSlots(s).length ? null : '沒有卡可以保留',
    buy: buyable(s, me).length ? null : '沒有買得起的卡',
  };
}
const canAct = (s: SState, me: SPlayer) => Object.values(blocked(s, me)).some((x) => x === null);

// 輪到的人操作前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: SState, user: string, seq: number): string | null {
  if (!find(s, user)) return NOT_PLAYER;
  if (s.phase !== 'play' || current(s).id !== user) return NOT_YET;
  if (seq !== s.seq) return STALE;
  return null;
}
// 動作按鈕：只在 act 階段有效
function actCheck(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq) ?? (c.s.step === 'act' ? null : STALE);
  return err ? deny(c, user, err) : true;
}

const BACK = (seq: number) => ({ value: `turnMenu:${seq}`, label: '↩️ 換一個動作' });

function turnMenu(c: Ctx, user: string, seq: number, sub?: Sub): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return deny(c, user, err);
  if (s.step === 'return') return sub ? deny(c, user, STALE) : returnMenu(c, user, [0, 0, 0, 0, 0, 0]);
  const me = current(s);
  const why = blocked(s, me);
  if (!sub) {
    const options = SUBS.filter((x) => why[x] === null).map((x) => ({ value: `turnMenu:${seq}:${x}`, label: SUB_LABEL[x] }));
    const notes = SUBS.flatMap((x) => (why[x] ? [`（${why[x]}）`] : []));
    return menu(c, user, [`💍 你的回合｜籌碼 ${tokensText(me.tokens)}｜折扣 ${gemsText(discountOf(me))}`, ...notes].join('\n'), options);
  }
  if (why[sub]) return deny(c, user, STALE);
  switch (sub) {
    case 'take3':
      return pick3Menu(c, user, []);
    case 'take2':
      return menu(c, user, '要拿 2 個哪一種顏色？（拿之前庫存要有 4 個以上）', [
        ...pairColors(s).map((x) => ({ value: `take2:${seq}:${x}`, label: GEM_WORD[x] })),
        BACK(seq),
      ]);
    case 'reserve':
      return menu(c, user, `要保留哪一張？${s.bank.o ? '（拿 1 個黃金）' : '（黃金沒了，不拿黃金）'}`, [
        ...tableSlots(s).map((x) => ({ value: `reserve:${seq}:${x.slot}`, label: cardText(cardOf(x.id), x.label) })),
        ...deckSlots(s).map((x) => ({ value: `reserve:${seq}:${x.slot}`, label: x.label })),
        BACK(seq),
      ]);
    case 'buy':
      return menu(c, user, '要買哪一張？（自動付款：先付同色，不夠的用黃金）', [
        ...buyable(s, me).map((x) => ({ value: `buy:${seq}:${x.slot}`, label: `${cardText(cardOf(x.id), x.label)}（付 ${gemsText(payOf(me, x.id)!)}）` })),
        BACK(seq),
      ]);
  }
}

// 拿 3 色要選幾種：3 和庫存有籌碼的顏色種數取小的；選法不合法回傳 false
const pickOk = (s: SState, colors: Color[], exact: boolean) =>
  new Set(colors).size === colors.length &&
  colors.every((x) => s.bank[x] > 0) &&
  (exact ? colors.length === Math.min(3, stocked(s).length) : colors.length <= Math.min(3, stocked(s).length));

// 拿 3 色：按顏色切換選取，選好再按確認；選擇記在按鈕上，不改 state
function pick3Menu(c: Ctx, user: string, colors: Color[]): boolean {
  const s = c.s;
  if (!pickOk(s, colors, false)) return deny(c, user, STALE);
  const seq = s.seq;
  const options = stocked(s).flatMap((x) => {
    if (colors.includes(x)) return [{ value: `pick3:${seq}:${colorKey(colors.filter((y) => y !== x))}`, label: `✅ ${GEM_WORD[x]}` }];
    return colors.length < 3 ? [{ value: `pick3:${seq}:${colorKey([...colors, x])}`, label: GEM_WORD[x] }] : [];
  });
  const key = colorKey(colors);
  if (pickOk(s, colors, true)) options.push({ value: `take3:${seq}:${key}`, label: `確認拿 ${[...key].map((x) => GEM_WORD[x as Color]).join(' ')}` });
  return menu(c, user, '選 3 種不同顏色各拿 1 個（再按一次取消）：', [...options, BACK(seq)]);
}

function take(c: Ctx, user: string, got: Partial<Gems>) {
  const me = current(c.s);
  move(c.s.bank, me.tokens, got);
  tell(c, user, `✅ 你拿了 ${gemsText(got)}`);
  finishTurn(c, `${quiet(me.id)} 拿了 ${gemsText(got)}`, true);
}

function take3(c: Ctx, user: string, seq: number, colors: Color[]): boolean {
  if (!actCheck(c, user, seq)) return false;
  if (!pickOk(c.s, colors, true)) return deny(c, user, STALE);
  take(c, user, Object.fromEntries(colors.map((x) => [x, 1])));
  return true;
}

function take2(c: Ctx, user: string, seq: number, color: Color): boolean {
  if (!actCheck(c, user, seq)) return false;
  if (!pairColors(c.s).includes(color)) return deny(c, user, STALE);
  take(c, user, { [color]: 2 });
  return true;
}

// 翻開的卡被拿走：從同級牌堆補一張，牌堆空了就空著
function pullTable(s: SState, slot: string): number | undefined {
  const m = /^([123])-([1-4])$/.exec(slot);
  if (!m) return undefined;
  const [lv, i] = [Number(m[1]) - 1, Number(m[2]) - 1];
  const id = s.table[lv][i];
  if (id === null || id === undefined) return undefined;
  s.table[lv][i] = s.decks[lv].shift() ?? null;
  return id;
}

function reserve(c: Ctx, user: string, seq: number, slot: string): boolean {
  if (!actCheck(c, user, seq)) return false;
  const s = c.s;
  const me = current(s);
  const deck = /^deck([123])$/.exec(slot);
  const lv = deck ? Number(deck[1]) - 1 : -1;
  const id = me.reserved.length >= 3 ? undefined : deck ? s.decks[lv].shift() : pullTable(s, slot);
  if (id === undefined) return deny(c, user, STALE);
  me.reserved.push(id);
  const gold = s.bank.o > 0;
  if (gold) move(s.bank, me.tokens, { o: 1 });
  const tail = gold ? ' 並拿 1 金' : '（黃金沒了，沒拿黃金）';
  const card = cardOf(id);
  tell(c, user, `✅ 你保留了 ${cardText(card)}${deck ? '（只有你看得到）' : ''}${tail}`);
  const what = deck ? `從${LEVEL_WORD[lv]}牌堆保留一張` : `保留了 ${slot} ${GEM_WORD[card.color]} ${card.points}分`;
  finishTurn(c, `${quiet(me.id)} ${what}${tail}`, true);
  return true;
}

function buy(c: Ctx, user: string, seq: number, slot: string): boolean {
  if (!actCheck(c, user, seq)) return false;
  const s = c.s;
  const me = current(s);
  const own = /^r([123])$/.exec(slot);
  const id = own ? me.reserved[Number(own[1]) - 1] : tableSlots(s).find((x) => x.slot === slot)?.id;
  const pay = id === undefined ? null : payOf(me, id);
  if (id === undefined || !pay) return deny(c, user, STALE);
  if (own) me.reserved.splice(Number(own[1]) - 1, 1);
  else pullTable(s, slot);
  move(me.tokens, s.bank, pay);
  me.cards.push(id);
  const card = cardOf(id);
  const what = `買了${own ? '保留的' : ` ${slot}`} ${GEM_WORD[card.color]} ${card.points}分（付 ${gemsText(pay)}）`;
  tell(c, user, `✅ 你${what}`);
  finishTurn(c, `${quiet(me.id)} ${what}`, true);
  return true;
}

// ---------- 退回籌碼、回合結束 ----------

const excessOf = (p: SPlayer) => total(p.tokens) - 10;
const countsGems = (counts: number[]) => Object.fromEntries(GEMS.map((x, i) => [x, counts[i]])) as Gems;
const digits = (counts: number[]) => counts.join('');
// 選的數量合法：每種不超過持有數、總數不超過要退的數量
const countsOk = (p: SPlayer, counts: number[]) =>
  counts.length === GEMS.length && counts.every((n, i) => n >= 0 && n <= p.tokens[GEMS[i]]) && counts.reduce((a, b) => a + b, 0) <= excessOf(p);

// 退回選單：按一下多退 1 個，總數剛好時出現確認；選擇記在按鈕上，不改 state
function returnMenu(c: Ctx, user: string, counts: number[]): boolean {
  const s = c.s;
  const me = current(s);
  if (!countsOk(me, counts)) return deny(c, user, STALE);
  const excess = excessOf(me);
  const sum = counts.reduce((a, b) => a + b, 0);
  const options = GEMS.flatMap((x, i) => {
    if (!me.tokens[x]) return [];
    const more = counts[i] < me.tokens[x] && sum < excess ? counts.map((n, j) => (j === i ? n + 1 : n)) : counts;
    return [{ value: `retPick:${s.seq}:${digits(more)}`, label: `退 ${GEM_WORD[x]}${counts[i] ? `（已選 ${counts[i]}）` : ''}` }];
  });
  options.push({ value: `retPick:${s.seq}:000000`, label: '重選' });
  if (sum === excess) options.push({ value: `return:${s.seq}:${digits(counts)}`, label: `確認退回 ${gemsText(countsGems(counts))}` });
  const lines = [
    `你有 ${total(me.tokens)} 個籌碼，要退回 ${excess} 個（${RETURN_MS / 1000} 秒內沒確認會自動退回）`,
    `手上：${gemsText(me.tokens)}｜已選：${gemsText(countsGems(counts))}`,
  ];
  return menu(c, user, lines.join('\n'), options);
}

function returnCheck(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq) ?? (c.s.step === 'return' ? null : STALE);
  return err ? deny(c, user, err) : true;
}

function giveBack(c: Ctx, user: string, seq: number, counts: number[]): boolean {
  if (!returnCheck(c, user, seq)) return false;
  const me = current(c.s);
  if (!countsOk(me, counts) || counts.reduce((a, b) => a + b, 0) !== excessOf(me)) return deny(c, user, STALE);
  const back = countsGems(counts);
  move(me.tokens, c.s.bank, back);
  tell(c, user, `✅ 你退回了 ${gemsText(back)}`);
  c.s.last += `，${quiet(me.id)} 退回 ${gemsText(back)}`;
  endTurn(c);
  return true;
}

// 逾時自動退：每次從持有最多的顏色退 1 個（同樣多依白藍綠紅黑），黃金最後
export function autoReturn(p: SPlayer): Gems {
  const left = { ...p.tokens };
  const back = emptyGems();
  for (let k = excessOf(p); k > 0; k--) {
    const x = COLORS.reduce((best, y) => (left[y] > left[best] ? y : best), COLORS[0]);
    const gem = left[x] > 0 ? x : 'o';
    left[gem]--;
    back[gem]++;
  }
  return back;
}

// 做完動作（或跳過）：更新連續跳過的次數；籌碼超過 10 個先退回，否則結束回合
function finishTurn(c: Ctx, last: string, acted: boolean) {
  const s = c.s;
  const me = current(s);
  s.passStreak = acted ? 0 : s.passStreak + 1;
  s.last = last;
  if (excessOf(me) > 0) {
    s.step = 'return';
    c.events.push(board(s));
    startTimer(c, RETURN_MS);
    returnMenu(c, me.id, [0, 0, 0, 0, 0, 0]);
    return;
  }
  endTurn(c);
}

// 回合結束：貴族來訪（一回合最多 1 位，編號最小的），收起這次的面板，輪到下一位
function endTurn(c: Ctx) {
  const s = c.s;
  const me = current(s);
  const disc = discountOf(me);
  const at = s.nobles.findIndex((id) => id !== null && nobleOf(id).need.every(([x, n]) => disc[x] >= n));
  if (at >= 0) {
    me.nobles.push(s.nobles[at]!);
    s.nobles[at] = null;
    s.last += `，貴族 ${at + 1} 來訪 ${quiet(me.id)}（+3 分）`;
  }
  c.events.push(board(s, true));
  advance(c);
}

// 輪到下一位
function advance(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  if ((s.turn + 1) % n === s.first) s.round++;
  s.turn = (s.turn + 1) % n;
  beginTurn(c);
}

// 輪到新玩家：沒有任何能做的動作就自動跳過（併進下一個面板的上一步）
function beginTurn(c: Ctx) {
  const s = c.s;
  const me = current(s);
  s.seq++;
  s.step = 'act';
  if (!canAct(s, me)) {
    s.passStreak++;
    s.last = [s.last, `${quiet(me.id)} 沒有能做的動作，跳過`].filter(Boolean).join('；');
    return advance(c);
  }
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

function timeout(c: Ctx) {
  const s = c.s;
  const me = current(s);
  if (s.step === 'act') return finishTurn(c, `${quiet(me.id)} 逾時，跳過`, false);
  const back = autoReturn(me);
  move(me.tokens, s.bank, back);
  s.last = [s.last, `${quiet(me.id)} 逾時自動退回 ${gemsText(back)}`].filter(Boolean).join('，');
  endTurn(c);
}

const RULES = [
  '輪到時做一件事：拿 3 個不同顏色的寶石各 1 個／拿 2 個同色寶石（該色庫存至少 4 個）／保留 1 張卡並拿 1 個黃金（最多保留 3 張）／買 1 張翻開的或保留的卡。',
  '買卡時成本先扣掉已買卡的折扣（每張卡給該色 1 個永久折扣），不夠的自動用黃金補。',
  '回合結束時手上籌碼超過 10 個要退回到 10 個；折扣達到貴族條件時貴族自動來訪（+3 分，一回合最多 1 位）。',
  '有人達到 15 分時這一輪打完就結束，分數最高者勝，同分比買的發展卡張數少的勝。',
].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_SPLENDOR_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_SPLENDOR_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  const each = n === 2 ? 4 : n === 3 ? 5 : 7;
  const decks = [1, 2, 3].map((lv) => shuffle(CARDS.filter((x) => x.level === lv).map((x) => x.id), c.rng)) as SState['decks'];
  const first = Math.floor(c.rng() * n);
  Object.assign(s, {
    phase: 'play',
    players: s.players.map((p) => newPlayer(p.id)),
    bank: { w: each, b: each, g: each, r: each, k: each, o: 5 },
    decks,
    table: decks.map((d) => d.splice(0, 4)),
    nobles: shuffle(NOBLES.map((x) => x.id), c.rng).slice(0, n + 1),
    first,
    turn: first,
    round: 1,
    passStreak: 0,
    lastRound: false,
    last: undefined,
  });
  const order = Array.from({ length: n }, (_, k) => mention(s.players[(first + k) % n].id)).join(' → ');
  c.events.push({ type: 'announce', text: `💍 璀璨寶石開始！玩家順序：${order}\n${RULES}` });
  beginTurn(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SPLENDOR_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_SPLENDOR_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'status':
      return status(c, action.user);
    case 'turnMenu':
      return turnMenu(c, action.user, action.seq, action.sub);
    case 'pick3': {
      const err = turnCheck(c.s, action.user, action.seq) ?? (c.s.step === 'act' ? null : STALE);
      return err ? deny(c, action.user, err) : pick3Menu(c, action.user, action.colors);
    }
    case 'take3':
      return take3(c, action.user, action.seq, action.colors);
    case 'take2':
      return take2(c, action.user, action.seq, action.color);
    case 'reserve':
      return reserve(c, action.user, action.seq, action.slot);
    case 'buy':
      return buy(c, action.user, action.seq, action.slot);
    case 'retPick':
      return returnCheck(c, action.user, action.seq) && returnMenu(c, action.user, action.counts);
    case 'return':
      return giveBack(c, action.user, action.seq, action.counts);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): SPlayer => ({ id, tokens: emptyGems(), cards: [], reserved: [], nobles: [] });

export function applySplendor(state: SState | undefined, action: SAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: SState | undefined, host: string, channel: string): Result {
  const created: SState = {
    game: 'splendor',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    bank: emptyGems(),
    decks: [[], [], []],
    table: [[], [], []],
    nobles: [],
    first: 0,
    turn: 0,
    round: 0,
    step: 'act',
    seq: prev?.seq ?? 0,
    passStreak: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
