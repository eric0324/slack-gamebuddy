// 骰子街 (Machi Koro 基本版＋港口擴充) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyMachikoro(state, action, rng) → { state, events }。
import { isBot, mention, quiet, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import {
  buildDeck,
  cardLabel,
  cardName,
  cardText,
  CARDS,
  fillMarket,
  income,
  LANDMARK,
  landmarkName,
  landmarkText,
  LANDMARKS,
  marketOrder,
  settleBlueGreen,
  settlePurple,
  settleRed,
  type Line,
} from './machikoroCards.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/machikoro.js';

export const MIN_MACHIKORO_PLAYERS = 2;
export const MAX_MACHIKORO_PLAYERS = 5;
export const MAX_ROUNDS = 30;
export const TURN_MS = 60_000;
const TITLE = '骰子街';

export type Step = 'roll' | 'reroll' | 'harbor' | 'tv' | 'bizGive' | 'bizPlayer' | 'bizTake' | 'buy';

export interface MPlayer {
  id: string;
  coins: number;
  cards: Record<string, number>; // 一般建築代號 → 張數
  landmarks: string[]; // 已蓋好的地標 (含開局的市政廳)
}

export interface MState {
  game: 'machikoro';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'ended';
  players: MPlayer[];
  deck: string[]; // 市場還沒翻的牌，deck[0] 是最上面
  market: Record<string, number>; // 代號 → 剩幾張，最多 10 種
  first: number; // 第 1 輪從誰開始：輪回他時輪數 +1
  current: number;
  round: number;
  seq: number; // 每個新回合 (含遊樂園的額外回合)+1：回合面板的 ref，也用來擋掉舊按鈕
  turn?: {
    step: Step;
    dice: number[];
    rerolled: boolean;
    total: number;
    harbor: boolean;
    log: string[]; // 面板上這回合的點數和結算明細
    give?: string; // 商業中心要給出的建築
    target?: string; // 商業中心的對象
    bought: boolean;
  };
  winners?: string[];
  reason?: 'landmarks' | 'limit';
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進來)
}

export type MAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'turnMenu'; user: string; seq: number }
  | { type: 'town'; user: string }
  | { type: 'roll'; user: string; seq: number; n: 1 | 2 }
  | { type: 'keep'; user: string; seq: number }
  | { type: 'reroll'; user: string; seq: number; n: 1 | 2 }
  | { type: 'harbor'; user: string; seq: number; yes: boolean }
  | { type: 'tv'; user: string; seq: number; target: string }
  | { type: 'bizGive'; user: string; seq: number; card: string }
  | { type: 'bizPlayer'; user: string; seq: number; give: string; target: string }
  | { type: 'bizTake'; user: string; seq: number; give: string; take: string; target: string }
  | { type: 'bizSkip'; user: string; seq: number }
  | { type: 'buy'; user: string; seq: number; code: string }
  | { type: 'pass'; user: string; seq: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<MAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: MState; events: GameEvent[] };
type Ctx = { s: MState; events: GameEvent[]; rng: Rng };

// 這局語系的文字、建築名稱和地標名稱
const say = (s: MState, key: Parameters<typeof tx>[1], params?: Record<string, string | number>) => tx(s.lang, key, params);
const cn = (s: MState, code: string) => cardName(code, s.lang);
const ln = (s: MState, l: keyof typeof LANDMARK) => landmarkName(l, s.lang);

const find = (s: MState, id: string) => s.players.find((p) => p.id === id);
const current = (s: MState) => s.players[s.current];
const has = (p: MPlayer, landmark: string) => p.landmarks.includes(landmark);
// 在私下選單上按的：回應取代那則選單；bot 不需要
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text, replace: true });
};
const deny = (c: Ctx, to: string, text: string) => (tell(c, to, text), false);
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'machikoro', audience: 'ephemeral', user, text, options, perRow: 4, replace: true });
};
const built = (p: MPlayer) => LANDMARKS.filter((l) => p.landmarks.includes(l));
const cardCount = (p: MPlayer) => Object.values(p.cards).reduce((a, b) => a + b, 0);
const marketLines = (s: MState) => marketOrder(s.market).map((code) => say(s, 'marketLine', { card: cardLabel(code, s.lang), n: s.market[code] }));
const playerLine = (s: MState, p: MPlayer) =>
  say(s, 'playerLine', {
    who: quiet(p.id),
    coins: p.coins,
    landmarks: built(p).map((l) => ln(s, l)).join(say(s, 'listSep')) || say(s, 'noneParen'),
    cards: cardCount(p),
  });
const roundText = (s: MState) => (s.round >= 25 ? say(s, 'roundOf', { round: s.round, max: MAX_ROUNDS }) : say(s, 'round', { round: s.round }));

// 回合面板：只 @ 輪到的人；ended 時拿掉按鈕
function board(s: MState, ended = false): GameEvent {
  const me = current(s);
  const lines = [
    ended ? say(s, 'turnEnded', { round: roundText(s), who: quiet(me.id) }) : say(s, 'turnHeader', { round: roundText(s), who: mention(me.id), sec: TURN_MS / 1000 }),
    ...(s.turn?.log ?? []),
    say(s, 'market'),
    ...marketLines(s),
    ...s.players.map((p) => (p === me ? `👉 ${playerLine(s, p)}` : playerLine(s, p))),
  ];
  return {
    type: 'prompt',
    kind: 'machikoro',
    audience: 'channel',
    ref: `machikoro:turn:${s.seq}`,
    text: lines.join('\n'),
    options: ended
      ? []
      : [
          { value: `turnMenu:${s.seq}`, label: say(s, 'btnAction') },
          { value: 'town', label: say(s, 'btnTown') },
        ],
  };
}

// 城鎮一覽：每位玩家的現金、依顏色分組的建築、已蓋和還沒蓋的地標
function townText(s: MState): string {
  const lines = [say(s, 'townTitle')];
  const sep = say(s, 'listSep');
  for (const p of s.players) {
    lines.push(say(s, 'townCoins', { who: quiet(p.id), coins: p.coins }));
    for (const color of ['blue', 'green', 'red', 'purple'] as const) {
      const cards = Object.keys(CARDS).filter((code) => p.cards[code] && CARDS[code].color === color);
      if (cards.length) lines.push(say(s, 'townColor', { color: say(s, color), cards: cards.map((code) => `${cn(s, code)} ×${p.cards[code]}`).join(sep) }));
    }
    const missing = LANDMARKS.filter((l) => !has(p, l));
    lines.push(say(s, 'townBuilt', { list: ['cityhall' as const, ...built(p)].map((l) => ln(s, l)).join(sep) }));
    lines.push(say(s, 'townMissing', { list: missing.map((l) => ln(s, l)).join(sep) || say(s, 'allBuilt') }));
  }
  return lines.join('\n');
}

// 輪到的人操作前的共同檢查；step 是這個 action 對應的步驟；回傳錯誤訊息或 null
function turnCheck(s: MState, user: string, seq: number, step?: Step): string | null {
  if (!find(s, user)) return say(s, 'notPlayer');
  if (s.phase !== 'play' || current(s).id !== user) return say(s, 'notYet');
  if (seq !== s.seq || (step && s.turn!.step !== step)) return say(s, 'stale');
  return null;
}

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0);
const diceText = (dice: number[]) => (dice.length === 2 ? `${dice[0]} + ${dice[1]} = ${sum(dice)}` : `${dice[0]}`);
const rollDice = (c: Ctx, n: number) => Array.from({ length: n }, () => 1 + Math.floor(c.rng() * 6));

// 買建築這一步能買的：市場上買得起的 (自己有的紫色除外)，和買得起、還沒蓋的地標
function buyOptions(s: MState): string[] {
  const me = current(s);
  const cards = marketOrder(s.market).filter((code) => CARDS[code].cost <= me.coins && !(CARDS[code].color === 'purple' && me.cards[code]));
  return [...cards, ...LANDMARKS.filter((l) => !has(me, l) && LANDMARK[l].cost <= me.coins)];
}

// 私人選單：目前這一步的按鈕；value 都是 `<動作>:<seq>[:<其他>]`
function stepMenu(c: Ctx) {
  const s = c.s;
  const t = s.turn!;
  const me = current(s);
  const o = (act: string, rest: string, label: string) => ({ value: rest ? `${act}:${s.seq}:${rest}` : `${act}:${s.seq}`, label });
  const head = say(s, 'yourTurn', { coins: me.coins });
  const ask = (key: Parameters<typeof tx>[1], params?: Record<string, string | number>) => `${head}\n${say(s, key, params)}`;
  const skip = o('bizSkip', '', say(s, 'bizSkip'));
  const station = has(me, 'station');
  switch (t.step) {
    case 'roll':
      return menu(c, me.id, ask('askRoll'), [o('roll', '1', say(s, 'roll1')), ...(station ? [o('roll', '2', say(s, 'roll2'))] : [])]);
    case 'reroll':
      return menu(c, me.id, ask('askReroll', { dice: diceText(t.dice) }), [
        o('keep', '', say(s, 'keep')),
        ...(station ? [o('reroll', '1', say(s, 'reroll1')), o('reroll', '2', say(s, 'reroll2'))] : [o('reroll', '1', say(s, 'reroll'))]),
      ]);
    case 'harbor':
      return menu(c, me.id, ask('askHarbor', { total: t.total }), [o('harbor', 'yes', say(s, 'harborYes', { n: t.total + 2 })), o('harbor', 'no', say(s, 'harborNo'))]);
    case 'tv':
      return menu(c, me.id, ask('askTv'), others(s).map((p) => o('tv', p.id, say(s, 'tvOption', { who: p.id, coins: p.coins }))));
    case 'bizGive':
      return menu(c, me.id, ask('askBizGive'), [...tradable(me).map((code) => o('bizGive', code, cn(s, code))), skip]);
    case 'bizPlayer':
      return menu(c, me.id, ask('askBizPlayer', { card: cn(s, t.give!) }), [
        ...others(s).filter((p) => tradable(p).length).map((p) => o('bizPlayer', `${t.give}:${p.id}`, p.id)),
        skip,
      ]);
    case 'bizTake': {
      const target = find(s, t.target!)!;
      return menu(c, me.id, ask('askBizTake', { who: quiet(target.id) }), [
        ...tradable(target).map((code) => o('bizTake', `${t.give}:${code}:${target.id}`, cn(s, code))),
        skip,
      ]);
    }
    case 'buy': {
      const info = [
        ...marketOrder(s.market).map((code) => say(s, 'buyInfo', { card: cardLabel(code, s.lang), text: cardText(code, s.lang) })),
        ...LANDMARKS.filter((l) => !has(me, l)).map((l) => say(s, 'buyLandmarkInfo', { name: ln(s, l), cost: LANDMARK[l].cost, text: landmarkText(l, s.lang) })),
      ];
      const options = buyOptions(s).map((code) => {
        const name = CARDS[code] ? cn(s, code) : ln(s, code as keyof typeof LANDMARK);
        const cost = (CARDS[code] ?? LANDMARK[code as keyof typeof LANDMARK]).cost;
        return o('buy', code, say(s, 'buyOption', { name, cost }));
      });
      return menu(c, me.id, [head, say(s, 'askBuy'), ...info].join('\n'), [...options, o('pass', '', say(s, 'pass'))]);
    }
  }
}

function turnMenu(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return deny(c, user, err);
  stepMenu(c);
  return false;
}

// 一步做完之後：還在同一個回合就更新面板、換成下一步的選單
function afterStep(c: Ctx, seq: number) {
  if (c.s.phase !== 'play' || c.s.seq !== seq) return;
  c.events.push(board(c.s));
  stepMenu(c);
}

function roll(c: Ctx, a: Extract<MAction, { type: 'roll' }>): boolean {
  const err = turnCheck(c.s, a.user, a.seq, 'roll');
  if (err) return deny(c, a.user, err);
  if (a.n === 2 && !has(current(c.s), 'station')) return deny(c, a.user, say(c.s, 'stale'));
  const t = c.s.turn!;
  t.dice = rollDice(c, a.n);
  t.log = [say(c.s, 'logRoll', { dice: diceText(t.dice) })];
  if (has(current(c.s), 'radio')) t.step = 'reroll';
  else toHarbor(c);
  afterStep(c, a.seq);
  return true;
}

function reroll(c: Ctx, a: Extract<MAction, { type: 'reroll' } | { type: 'keep' }>): boolean {
  const err = turnCheck(c.s, a.user, a.seq, 'reroll');
  if (err) return deny(c, a.user, err);
  const t = c.s.turn!;
  if (a.type === 'reroll') {
    if (a.n === 2 && !has(current(c.s), 'station')) return deny(c, a.user, say(c.s, 'stale'));
    t.dice = rollDice(c, a.n);
    t.rerolled = true;
    t.log[0] += say(c.s, 'logReroll', { dice: diceText(t.dice) });
  }
  toHarbor(c);
  afterStep(c, a.seq);
  return true;
}

// 港口：最後的點數 10 以上才問要不要 +2
function toHarbor(c: Ctx) {
  const t = c.s.turn!;
  t.total = sum(t.dice);
  if (has(current(c.s), 'harbor') && t.total >= 10) t.step = 'harbor';
  else settle(c);
}

function harbor(c: Ctx, a: Extract<MAction, { type: 'harbor' }>): boolean {
  const err = turnCheck(c.s, a.user, a.seq, 'harbor');
  if (err) return deny(c, a.user, err);
  const t = c.s.turn!;
  if (a.yes) {
    t.total += 2;
    t.harbor = true;
    t.log[0] += say(c.s, 'logHarbor', { total: t.total });
  }
  settle(c);
  afterStep(c, a.seq);
  return true;
}

const lineText = (s: MState, l: Line) =>
  l.from
    ? say(s, 'lineTake', { to: quiet(l.to), card: cn(s, l.card), from: quiet(l.from), n: l.amount })
    : say(s, 'lineGain', { to: quiet(l.to), card: cn(s, l.card), n: l.amount });

// 結算：紅 → 藍綠 → 紫 (不用選擇的)，明細寫進面板
function settle(c: Ctx) {
  const s = c.s;
  const t = s.turn!;
  const lines = settleRed(s.players, s.current, t.total);
  const blueGreen = settleBlueGreen(s.players, s.current, t.total, () => rollDice(c, 2));
  if (blueGreen.tuna) t.log.push(say(s, 'logTuna', { dice: diceText(blueGreen.tuna) }));
  lines.push(...blueGreen.lines, ...settlePurple(s.players, s.current, t.total));
  t.log.push(...(lines.length ? lines.map((l) => lineText(s, l)) : [say(s, 'noIncome')]));
  if (t.total === 6 && current(s).cards.tv) t.step = 'tv';
  else toBusiness(c);
}

// 可以用商業中心交換的建築：非紫色的一般建築
const tradable = (p: MPlayer) => Object.keys(CARDS).filter((code) => p.cards[code] && CARDS[code].color !== 'purple');
const others = (s: MState) => s.players.filter((p) => p !== current(s));

// 商業中心：自己和至少一位對手有可以換的建築才問
function toBusiness(c: Ctx) {
  const s = c.s;
  const me = current(s);
  if (s.turn!.total === 6 && me.cards.business && tradable(me).length && others(s).some((p) => tradable(p).length)) s.turn!.step = 'bizGive';
  else toBuy(c);
}

function tv(c: Ctx, a: Extract<MAction, { type: 'tv' }>): boolean {
  const s = c.s;
  const err = turnCheck(s, a.user, a.seq, 'tv');
  if (err) return deny(c, a.user, err);
  const target = others(s).find((p) => p.id === a.target);
  if (!target) return deny(c, a.user, say(s, 'stale'));
  const me = current(s);
  const paid = Math.min(5, target.coins);
  target.coins -= paid;
  me.coins += paid;
  s.turn!.log.push(lineText(s, { from: target.id, to: me.id, amount: paid, card: 'tv' }));
  toBusiness(c);
  afterStep(c, a.seq);
  return true;
}

type BizAction = Extract<MAction, { type: 'bizGive' } | { type: 'bizPlayer' } | { type: 'bizTake' } | { type: 'bizSkip' }>;

// 商業中心三步：給出的建築 → 對象 → 對方的建築；每一步都可以不換
function business(c: Ctx, a: BizAction): boolean {
  const s = c.s;
  const t = s.turn!;
  const err = turnCheck(s, a.user, a.seq, a.type === 'bizSkip' ? undefined : a.type);
  if (err) return deny(c, a.user, err);
  const me = current(s);
  const target = 'target' in a ? others(s).find((p) => p.id === a.target) : undefined;
  switch (a.type) {
    case 'bizSkip':
      if (!t.step.startsWith('biz')) return deny(c, a.user, say(s, 'stale'));
      toBuy(c);
      break;
    case 'bizGive':
      if (!tradable(me).includes(a.card)) return deny(c, a.user, say(s, 'stale'));
      t.give = a.card;
      t.step = 'bizPlayer';
      break;
    case 'bizPlayer':
      if (a.give !== t.give || !target || !tradable(target).length) return deny(c, a.user, say(s, 'stale'));
      t.target = target.id;
      t.step = 'bizTake';
      break;
    case 'bizTake':
      if (a.give !== t.give || !target || target.id !== t.target || !tradable(target).includes(a.take)) return deny(c, a.user, say(s, 'stale'));
      for (const [from, to, code] of [[me, target, a.give], [target, me, a.take]] as const) {
        if (!--from.cards[code]) delete from.cards[code];
        to.cards[code] = (to.cards[code] ?? 0) + 1;
      }
      t.log.push(say(s, 'logTrade', { me: quiet(me.id), give: cn(s, a.give), target: quiet(target.id), take: cn(s, a.take) }));
      toBuy(c);
      break;
  }
  afterStep(c, a.seq);
  return true;
}

// 進入買建築；市政廳：0 元拿 1 元
function toBuy(c: Ctx) {
  const t = c.s.turn!;
  const me = current(c.s);
  t.step = 'buy';
  if (me.coins === 0) {
    me.coins = 1;
    t.log.push(say(c.s, 'logCityHall', { who: quiet(me.id) }));
  }
}

function buy(c: Ctx, a: Extract<MAction, { type: 'buy' }>): boolean {
  const s = c.s;
  const err = turnCheck(s, a.user, a.seq, 'buy');
  if (err) return deny(c, a.user, err);
  if (!buyOptions(s).includes(a.code)) return deny(c, a.user, say(s, 'stale'));
  const me = current(s);
  const t = s.turn!;
  t.bought = true;
  if (CARDS[a.code]) {
    me.coins -= CARDS[a.code].cost;
    me.cards[a.code] = (me.cards[a.code] ?? 0) + 1;
    if (!--s.market[a.code]) {
      delete s.market[a.code];
      fillMarket(s.market, s.deck);
    }
    t.log.push(say(s, 'logBought', { who: quiet(me.id), card: cn(s, a.code) }));
    tell(c, a.user, say(s, 'youBought', { card: cn(s, a.code) }));
  } else {
    const l = LANDMARK[a.code as keyof typeof LANDMARK];
    const name = ln(s, a.code as keyof typeof LANDMARK);
    me.coins -= l.cost;
    me.landmarks.push(a.code);
    t.log.push(say(s, 'logBuilt', { who: quiet(me.id), name }));
    tell(c, a.user, say(s, 'youBuilt', { name }));
    if (built(me).length === LANDMARKS.length) {
      c.events.push(board(s, true));
      endGame(c, 'landmarks');
      return true;
    }
  }
  endTurn(c);
  return true;
}

function pass(c: Ctx, a: Extract<MAction, { type: 'pass' }>): boolean {
  const err = turnCheck(c.s, a.user, a.seq, 'buy');
  if (err) return deny(c, a.user, err);
  tell(c, a.user, say(c.s, 'youPassed'));
  endTurn(c);
  return true;
}

// 回合結束：機場、收掉面板；遊樂園擲出相同點數再一回合，否則輪到下一位
function endTurn(c: Ctx) {
  const s = c.s;
  const t = s.turn!;
  const me = current(s);
  if (!t.bought && has(me, 'airport')) {
    me.coins += 10;
    t.log.push(say(s, 'logAirport', { who: quiet(me.id) }));
  }
  c.events.push(board(s, true));
  if (has(me, 'park') && t.dice.length === 2 && t.dice[0] === t.dice[1]) {
    c.events.push({ type: 'announce', text: say(s, 'doubles', { who: quiet(me.id) }) });
    return beginTurn(c);
  }
  s.current = (s.current + 1) % s.players.length;
  if (s.current === s.first) s.round++;
  if (s.round > MAX_ROUNDS) {
    c.events.push({ type: 'announce', text: say(s, 'limitReached', { max: MAX_ROUNDS }) });
    return endGame(c, 'limit');
  }
  beginTurn(c);
}

// 蓋完地標的人獲勝；到上限時地標數最多、再比現金，都一樣就並列
function endGame(c: Ctx, reason: 'landmarks' | 'limit') {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.reason = reason;
  const most = Math.max(...s.players.map((p) => built(p).length));
  const leaders = s.players.filter((p) => built(p).length === most);
  const rich = Math.max(...leaders.map((p) => p.coins));
  s.winners = reason === 'landmarks' ? [current(s).id] : leaders.filter((p) => p.coins === rich).map((p) => p.id);
  const why = reason === 'landmarks' ? say(s, 'whyLandmarks') : say(s, 'whyLimit', { max: MAX_ROUNDS });
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        say(s, 'gameOver', { winners: s.winners.map(mention).join(say(s, 'listSep')), why }),
        ...s.players.map((p) => say(s, 'resultLine', { who: mention(p.id), landmarks: built(p).length, coins: p.coins, cards: cardCount(p) })),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 逾時：從目前這一步開始，照逾時策略做完這回合
function timeout(c: Ctx) {
  const s = c.s;
  const seq = s.seq;
  c.events.push({ type: 'announce', text: say(s, 'timedOut', { who: quiet(current(s).id) }) });
  for (let guard = 0; guard < 20 && s.phase === 'play' && s.seq === seq; guard++) handle(c, autoMove(s, false));
}

function beginTurn(c: Ctx) {
  const s = c.s;
  s.seq++;
  s.turn = { step: 'roll', dice: [], rerolled: false, total: 0, harbor: false, log: [], bought: false };
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}


function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, say(s, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_MACHIKORO_PLAYERS) return reply(c, user, say(s, 'needMore', { n, min: MIN_MACHIKORO_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  for (const p of s.players) Object.assign(p, newPlayer(p.id));
  s.deck = shuffle(buildDeck(n), c.rng);
  s.market = {};
  fillMarket(s.market, s.deck);
  const first = Math.floor(c.rng() * n);
  Object.assign(s, { phase: 'play', first, current: first, round: 1, turn: undefined });
  c.events.push({
    type: 'announce',
    text: [
      say(s, 'started', { players: s.players.map((p) => mention(p.id)).join(say(s, 'listSep')) }),
      say(s, 'startKit'),
      say(s, 'rules'),
      say(s, 'market'),

      ...marketLines(s),
    ].join('\n'),
  });
  beginTurn(c);
  return true;
}

// ---------- bot ----------

// 骰點全部在 7 以上
const bigRoll = (code: string) => CARDS[code].rolls.every((r) => r >= 7);

// 有火車站，而且有骰點全部在 7 以上的藍色或綠色建築 → 擲 2 顆
export function botDice(me: MPlayer): 1 | 2 {
  const big = Object.keys(me.cards).some((code) => (CARDS[code].color === 'blue' || CARDS[code].color === 'green') && bigRoll(code));
  return has(me, 'station') && big ? 2 : 1;
}

// 現金最多的對手；同樣多時從自己下一位開始依座位選第一位
export function richest(s: MState): string {
  const n = s.players.length;
  let best = s.players[(s.current + 1) % n];
  for (let k = 2; k < n; k++) {
    const p = s.players[(s.current + k) % n];
    if (p.coins > best.coins) best = p;
  }
  return best.id;
}

// 這一步自動做什麼 (bot，或逾時時代為完成)；回傳和真人按按鈕一樣的 action
export function autoMove(s: MState, bot: boolean): GameAction {
  const t = s.turn!;
  const me = current(s);
  const base = { user: me.id, seq: s.seq };
  switch (t.step) {
    case 'roll':
      return { type: 'roll', ...base, n: botDice(me) };
    case 'reroll':
      return bot && income(s.players, s.current, sum(t.dice)) === 0 ? { type: 'reroll', ...base, n: botDice(me) } : { type: 'keep', ...base };
    case 'harbor':
      return { type: 'harbor', ...base, yes: income(s.players, s.current, t.total + 2) > income(s.players, s.current, t.total) };
    case 'tv':
      return { type: 'tv', ...base, target: richest(s) };
    case 'bizGive':
    case 'bizPlayer':
    case 'bizTake':
      return { type: 'bizSkip', ...base };
    case 'buy': {
      const code = bot ? botBuy(s) : undefined;
      return code ? { type: 'buy', ...base, code } : { type: 'pass', ...base };
    }
  }
}

// 用得到：紫色自己還沒有；船和壽司店要有港口；沒有火車站時骰點全部 7 以上的不算
function useful(me: MPlayer, code: string): boolean {
  if (CARDS[code].color === 'purple') return !me.cards[code];
  if (['mackerel', 'tuna', 'sushi'].includes(code) && !has(me, 'harbor')) return false;
  return has(me, 'station') || !bigRoll(code);
}

// bot 買什麼：先蓋最便宜的地標；建築少於 10 張時買用得到、買得起裡最貴的；其他不買
function botBuy(s: MState): string | undefined {
  const me = current(s);
  const options = buyOptions(s);
  const landmark = LANDMARKS.find((l) => options.includes(l));
  if (landmark) return landmark;
  if (cardCount(me) >= 10) return undefined;
  const cards = options.filter((code) => CARDS[code] && useful(me, code));
  return cards.reduce<string | undefined>((best, code) => (!best || CARDS[code].cost > CARDS[best].cost ? code : best), undefined);
}

// state 有變之後：輪到 bot 就讓它行動，直到輪到真人或遊戲結束
function botsAct(c: Ctx) {
  for (let guard = 0; guard < 2000 && c.s.phase === 'play' && isBot(current(c.s).id); guard++) {
    // 防禦：策略算出的動作萬一被拒，改用逾時策略，不會卡住
    if (!handle(c, autoMove(c.s, true))) handle(c, autoMove(c.s, false));
  }
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_MACHIKORO_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_MACHIKORO_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'town':
      return reply(c, action.user, townText(c.s));
    case 'turnMenu':
      return turnMenu(c, action.user, action.seq);
    case 'roll':
      return roll(c, action);
    case 'keep':
    case 'reroll':
      return reroll(c, action);
    case 'harbor':
      return harbor(c, action);
    case 'tv':
      return tv(c, action);
    case 'bizGive':
    case 'bizPlayer':
    case 'bizTake':
    case 'bizSkip':
      return business(c, action);
    case 'buy':
      return buy(c, action);
    case 'pass':
      return pass(c, action);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): MPlayer => ({ id, coins: 3, cards: { wheat: 1, bakery: 1 }, landmarks: ['cityhall'] });

export function applyMachikoro(state: MState | undefined, action: MAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: botsAct,
  });
}

function createLobby(prev: MState | undefined, host: string, channel: string): Result {
  const created: MState = {
    game: 'machikoro',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    market: {},
    first: 0,
    current: 0,
    round: 0,
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
