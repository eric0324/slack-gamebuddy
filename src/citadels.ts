// 富饒之城（Citadels 經典版）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCitadels(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { CHARS, COLORS, DECK, DISTRICTS, districtInfo, districtLabel, RANKS, type Rank } from './citadelsCards.js';

export const MIN_CITADELS_PLAYERS = 4;
export const MAX_CITADELS_PLAYERS = 7;
const TITLE = '富饒之城';
export const DRAFT_MS = 45_000;
export const TURN_MS = 90_000;
export const GRAVE_MS = 20_000;
export const MAX_ROUNDS = 20; // 安全上限：第 20 輪結束還沒人建滿就直接計分
const FACE_UP: Record<number, number> = { 4: 2, 5: 1 };

export interface CPlayer {
  id: string;
  gold: number;
  hand: string[];
  city: { card: string; round: number }[];
  char?: Rank;
}

export interface CState {
  game: 'citadels';
  channel: string;
  host: string;
  phase: 'lobby' | 'draft' | 'turn' | 'graveyard' | 'ended';
  players: CPlayer[];
  deck: string[]; // deck[0] 是最上面，放回去放到最後
  crown: number; // 王冠持有者 index
  round: number;
  draft?: { pool: Rank[]; faceUp: Rank[]; faceDown: Rank; order: number[]; at: number };
  calling: number; // 目前叫到幾號（0 表示還沒開始叫號）
  turn?: Turn;
  notes: string[]; // 沒人拿的角色，附註在下一則牌桌訊息
  revealed: Rank[]; // 這輪已經翻開的角色
  killed?: Rank; // 這輪被刺殺的角色
  robbed?: Rank; // 這輪盜賊要偷的角色
  robber?: string;
  firstComplete?: string; // 第一個建滿 8 棟的人
  lastRound?: number; // 觸發結束的那一輪
  graveyard?: { owner: string; card: string }; // phase 'graveyard'：等墓地主人決定要不要收回
  seq: number;
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

// 一個角色回合的進度；drawn 是抽牌後還沒選完的牌，keep 是還要留幾張
export interface Turn {
  player: number;
  gathered: boolean;
  drawn?: string[];
  keep?: number;
  ability: boolean;
  taxed: boolean;
  builds: number;
  lab: boolean;
  smithy: boolean;
}

export type Sub = 'build' | 'kill' | 'rob' | 'swap' | 'redraw' | 'destroy' | 'lab';

export type CAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'status'; user: string }
  | { type: 'pickMenu'; user: string }
  | { type: 'pick'; user: string; rank: Rank }
  | { type: 'turnMenu'; user: string; seq: number; sub?: Sub }
  | { type: 'gather'; user: string; seq: number; kind: 'gold' | 'draw' }
  | { type: 'keep'; user: string; seq: number; card: string }
  | { type: 'build'; user: string; seq: number; card: string }
  | { type: 'tax'; user: string; seq: number }
  | { type: 'end'; user: string; seq: number }
  | { type: 'kill'; user: string; seq: number; rank: Rank }
  | { type: 'rob'; user: string; seq: number; rank: Rank }
  | { type: 'swap'; user: string; seq: number; target: string }
  | { type: 'redrawToggle'; user: string; seq: number; picked: number[] }
  | { type: 'redraw'; user: string; seq: number; picked: number[] }
  | { type: 'destroy'; user: string; seq: number; target: string; card: string }
  | { type: 'lab'; user: string; seq: number; card: string }
  | { type: 'smithy'; user: string; seq: number }
  | { type: 'grave'; user: string; yes: boolean }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<CAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: CState; events: GameEvent[] };
type Ctx = { s: CState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = '你不在這局遊戲裡。';
const NOT_YET = '還沒輪到你。';
const STALE = '這個選單已經過期，請重新按「🏰 我的回合」。';

const find = (s: CState, id: string) => s.players.find((p) => p.id === id);
// 只對真人送私下訊息（bot 不需要）
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text });
};
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'citadels', audience: 'ephemeral', user, text, options, perRow: 4 });
};
const current = (s: CState) => s.players[s.turn!.player];
const holder = (s: CState, r: Rank) => s.players.findIndex((p) => p.char === r);
const has = (p: CPlayer, card: string) => p.city.some((x) => x.card === card);
const maxBuilds = (p: CPlayer) => (p.char === 7 ? 3 : 1);
// 手上付得起、城市裡沒有同名的建築（同名的只列一次）
const buildable = (p: CPlayer) => p.hand.filter((card, i) => p.hand.indexOf(card) === i && !has(p, card) && DISTRICTS[card].cost <= p.gold);
// 魔法學校收稅時算成該角色的顏色
const taxAmount = (p: CPlayer) => p.city.filter((x) => DISTRICTS[x.card].color === CHARS[p.char!].tax || x.card === 'schoolOfMagic').length;
const handText = (hand: string[]) => (hand.length ? hand.map(districtInfo).join('\n') : '（沒有手牌）');
const cityText = (p: CPlayer) => (p.city.length ? p.city.map((x) => districtLabel(x.card)).join('、') : '（還沒有建築）');

const RULES = [
  '🏰 富饒之城規則：每輪先祕密選一個角色，再依角色編號 1→8 叫號行動。輪到你時先「💰 拿 2 金」或「🃏 抽 2 張留 1 張」，再可以用角色能力、建 1 棟建築（付等於費用的金幣；不能蓋同名建築）。',
  '有人建滿 8 棟後，這一輪打完遊戲結束：建築費用總和 + 五色齊全 3 分 + 第一個建滿 4 分（其他建滿 2 分），分數最高者獲勝。',
  RANKS.map((r) => `${r} ${CHARS[r].name}：${CHARS[r].desc}`).join('\n'),
].join('\n');

function status(c: Ctx, user: string): boolean {
  const me = find(c.s, user);
  if (!me) return reply(c, user, NOT_PLAYER);
  const lines = [
    `📜 你的狀態｜💰 ${me.gold} 金${me.char ? `｜角色：${CHARS[me.char].name}` : ''}`,
    `🏘️ 城市（${me.city.length} 棟）：${cityText(me)}`,
    `🃏 手牌（${me.hand.length} 張）：`,
    handText(me.hand),
  ];
  return reply(c, user, lines.join('\n'));
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_CITADELS_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_CITADELS_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'draft' }));
  s.deck = shuffle(DECK, c.rng);
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: s.deck.splice(0, 4) });
  s.crown = Math.floor(c.rng() * n);
  s.round = 0;
  c.events.push({
    type: 'announce',
    text: [
      `🏰 富饒之城開始！座位：${s.players.map((p) => mention(p.id)).join(' → ')}`,
      `👑 王冠：${mention(s.players[s.crown].id)}｜每人 2 金、4 張建築牌`,
      '有人建滿 8 棟後，這一輪打完遊戲結束，分數最高者獲勝！',
      RANKS.map((r) => `${r} ${CHARS[r].name}：${CHARS[r].desc}`).join('\n'),
    ].join('\n'),
    gif: 'start',
  });
  for (const p of s.players) if (!isBot(p.id)) c.events.push({ type: 'dm', to: p.id, text: `${RULES}\n\n🃏 你的手牌：\n${handText(p.hand)}` });
  startRound(c);
  return true;
}

// 每輪開始：洗角色、面朝下棄 1 張、依人數面朝上棄牌（國王不能面朝上），從王冠持有者開始選角
function startRound(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  s.round++;
  s.phase = 'draft';
  for (const p of s.players) p.char = undefined;
  const pool = shuffle(RANKS, c.rng);
  const faceDown = pool.shift()!;
  const faceUp: Rank[] = pool.filter((r) => r !== 4).slice(0, FACE_UP[n] ?? 0);
  s.draft = { pool: pool.filter((r) => !faceUp.includes(r)), faceUp, faceDown, order: s.players.map((_, i) => (s.crown + i) % n), at: 0 };
  c.events.push({
    type: 'announce',
    text: [
      `🎭 第 ${s.round} 輪開始！`,
      faceUp.length ? `面朝上棄掉：${faceUp.map((r) => CHARS[r].name).join('、')}` : '沒有面朝上的棄牌',
      `選角順序：${s.draft.order.map((i) => mention(s.players[i].id)).join(' → ')}`,
    ].join('\n'),
  });
  nextPicker(c);
}

const drafter = (s: CState) => s.players[s.draft!.order[s.draft!.at]];
// 7 人局的最後一位可以改拿面朝下的那張
const isLastOf7 = (s: CState) => s.players.length === 7 && s.draft!.at === 6;
const pickChoices = (s: CState): Rank[] => [...s.draft!.pool, ...(isLastOf7(s) ? [s.draft!.faceDown] : [])];

function draftMsg(s: CState, done = false): GameEvent {
  const d = s.draft!;
  const text = done
    ? `🎭 第 ${s.round} 輪選角完成，開始叫號！`
    : `🎭 第 ${s.round} 輪選角：輪到 ${mention(drafter(s).id)}（${DRAFT_MS / 1000} 秒）｜已選 ${d.at}/${s.players.length}`;
  return { type: 'prompt', kind: 'citadels', audience: 'channel', ref: `citadels:draft:${s.round}`, text, options: done ? [] : [{ value: 'pickMenu', label: '🎭 選角色' }] };
}

function nextPicker(c: Ctx) {
  c.events.push(draftMsg(c.s));
  startTimer(c, DRAFT_MS);
}

function pickMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, NOT_PLAYER);
  if (s.phase !== 'draft' || drafter(s).id !== user) return reply(c, user, NOT_YET);
  const d = s.draft!;
  const options = pickChoices(s).map((r) => ({ value: `pick:${r}`, label: CHARS[r].name + (isLastOf7(s) && r === d.faceDown ? '（面朝下的棄牌）' : '') }));
  const text = [
    '🎭 選一個角色（只有你知道）：',
    ...pickChoices(s).map((r) => `${r} ${CHARS[r].name}：${CHARS[r].desc}`),
    ...(d.faceUp.length ? [`面朝上棄掉：${d.faceUp.map((r) => CHARS[r].name).join('、')}`] : []),
  ].join('\n');
  menu(c, user, text, options);
  return false;
}

function pick(c: Ctx, user: string, rank: Rank): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, NOT_PLAYER);
  if (s.phase !== 'draft' || drafter(s).id !== user) return reply(c, user, NOT_YET);
  if (!pickChoices(s).includes(rank)) return reply(c, user, '不能選這個角色。');
  const d = s.draft!;
  if (rank === d.faceDown) d.faceDown = d.pool.shift()!;
  else d.pool = d.pool.filter((r) => r !== rank);
  drafter(s).char = rank;
  tell(c, user, `你選了 ${CHARS[rank].name}。`);
  d.at++;
  if (d.at < s.players.length) {
    nextPicker(c);
    return true;
  }
  c.events.push(draftMsg(s, true));
  startCalling(c);
  return true;
}

function startCalling(c: Ctx) {
  const s = c.s;
  s.phase = 'turn';
  s.calling = 0;
  s.revealed = [];
  s.notes = [];
  nextCall(c);
}

// 叫下一號：沒人拿的跳過並記下附註；8 號叫完這一輪結束
function nextCall(c: Ctx) {
  const s = c.s;
  s.turn = undefined;
  s.notes = [];
  while (++s.calling <= 8) {
    const r = s.calling as Rank;
    const i = holder(s, r);
    if (s.killed === r) {
      c.events.push({ type: 'announce', text: `🗡️ ${r} 號 ${CHARS[r].name} 被刺殺了，跳過` });
      continue;
    }
    if (i < 0) {
      s.notes.push(`沒有人是 ${r} 號 ${CHARS[r].name}`);
      continue;
    }
    return reveal(c, i, r);
  }
  endRound(c);
}

function reveal(c: Ctx, i: number, r: Rank) {
  const s = c.s;
  const me = s.players[i];
  s.revealed.push(r);
  c.events.push({ type: 'announce', text: `🎭 ${r} 號 ${CHARS[r].name} 是 ${mention(me.id)}` });
  if (r === 4) {
    s.crown = i;
    c.events.push({ type: 'announce', text: `👑 ${mention(me.id)} 拿到王冠，下一輪由他先選角` });
  }
  if (s.robbed === r && s.robber) {
    const amount = me.gold;
    me.gold = 0;
    find(s, s.robber)!.gold += amount;
    c.events.push({ type: 'announce', text: `🦹 盜賊 ${mention(s.robber)} 偷走了 ${mention(me.id)} 的 ${amount} 金` });
  }
  s.seq++;
  s.turn = { player: i, gathered: false, ability: false, taxed: false, builds: 0, lab: false, smithy: false };
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

function endRound(c: Ctx) {
  const s = c.s;
  if (s.notes.length) c.events.push({ type: 'announce', text: s.notes.map((n) => `（${n}）`).join('\n') });
  const king = holder(s, 4);
  if (s.killed === 4 && king >= 0) {
    s.crown = king;
    c.events.push({ type: 'announce', text: `👑 ${mention(s.players[king].id)} 是國王的繼承人，拿到王冠` });
  }
  s.killed = s.robbed = s.robber = undefined;
  if (s.lastRound) return endGame(c);
  if (s.round >= MAX_ROUNDS) {
    c.events.push({ type: 'announce', text: `⌛ 已達 ${MAX_ROUNDS} 輪上限，直接計分。` });
    return endGame(c);
  }
  startRound(c);
}

const playerLine = (p: CPlayer) => `• ${mention(p.id)}：💰 ${p.gold} 金｜🃏 ${p.hand.length} 張｜🏘️ ${p.city.length} 棟${p.city.length ? `：${cityText(p)}` : ''}`;

function board(s: CState, ended = false): GameEvent {
  const me = current(s);
  const head = `🏰 第 ${s.round} 輪｜${me.char} 號 ${CHARS[me.char!].name} ${mention(me.id)}`;
  const lines = ended
    ? [`${head} 的回合結束`]
    : [
        `${head}（${TURN_MS / 1000} 秒）`,
        ...s.notes.map((n) => `（${n}）`),
        `👑 王冠：${mention(s.players[s.crown].id)}｜已翻開：${s.revealed.map((r) => `${CHARS[r].name} ${mention(s.players[holder(s, r)].id)}`).join('、')}`,
        ...s.players.map(playerLine),
      ];
  return {
    type: 'prompt',
    kind: 'citadels',
    audience: 'channel',
    ref: `citadels:${s.seq}`,
    text: lines.join('\n'),
    options: ended ? [] : [{ value: `turnMenu:${s.seq}`, label: '🏰 我的回合' }, { value: 'status', label: '📜 我的狀態' }],
  };
}

// 輪到的人操作前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: CState, user: string, seq: number): string | null {
  if (!find(s, user)) return NOT_PLAYER;
  if ((s.phase !== 'turn' && s.phase !== 'graveyard') || current(s).id !== user) return NOT_YET;
  if (seq !== s.seq) return STALE;
  if (s.phase === 'graveyard') return '正在等墓地主人決定，請稍候。';
  return null;
}

function turnMenu(c: Ctx, user: string, seq: number, sub?: Sub): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  const me = current(s);
  const o = (act: string, label: string) => ({ value: `${act}:${seq}`, label });
  if (t.drawn) {
    keepMenu(c);
    return false;
  }
  if (!t.gathered) {
    menu(c, user, '🏰 先收集資源：', [o('gather', '💰 拿 2 金'), o('gather', '🃏 抽牌')].map((x, i) => ({ ...x, value: `${x.value}:${i ? 'draw' : 'gold'}` })));
    return false;
  }
  if (sub === 'lab') {
    if (!canLab(s)) return reply(c, user, STALE);
    menu(c, user, '🧪 要棄哪一張手牌換 1 金？', me.hand.map((card) => ({ value: `lab:${seq}:${card}`, label: districtLabel(card) })));
    return false;
  }
  if (sub && sub !== 'build') return abilityMenu(c, sub), false;
  if (sub === 'build') {
    const cards = t.builds < maxBuilds(me) ? buildable(me) : [];
    if (!cards.length) return reply(c, user, '現在沒有可以建造的建築。');
    menu(c, user, ['🔨 要建哪一棟？', ...cards.map(districtInfo)].join('\n'), cards.map((card) => ({ value: `build:${seq}:${card}`, label: districtLabel(card) })));
    return false;
  }
  const options = [
    ...(t.ability ? [] : abilityButtons(s).map((b) => ({ value: `turnMenu:${seq}:${b.sub}`, label: b.label }))),
    ...(t.builds < maxBuilds(me) && buildable(me).length ? [{ value: `turnMenu:${seq}:build`, label: '🔨 建造' }] : []),
    ...(CHARS[me.char!].tax && !t.taxed ? [o('tax', '💰 收稅')] : []),
    ...(canLab(s) ? [{ value: `turnMenu:${seq}:lab`, label: '🧪 實驗室' }] : []),
    ...(canSmithy(s) ? [o('smithy', '⚒️ 鐵匠鋪')] : []),
    o('end', '✅ 結束回合'),
  ];
  menu(c, user, `🏰 你的回合（${CHARS[me.char!].name}）｜💰 ${me.gold} 金｜🃏 ${me.hand.length} 張`, options);
  return false;
}

function keepMenu(c: Ctx) {
  const s = c.s;
  const t = s.turn!;
  menu(c, current(s).id, `🃏 你抽到這些牌，選 ${t.keep} 張留下（其他放到牌堆底）：`, t.drawn!.map((card) => ({ value: `keep:${s.seq}:${card}`, label: districtLabel(card) })));
}

function gather(c: Ctx, user: string, seq: number, kind: 'gold' | 'draw'): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  const me = current(s);
  if (t.gathered || t.drawn) return reply(c, user, STALE);
  if (kind === 'gold') {
    me.gold += 2;
    c.events.push({ type: 'announce', text: `💰 ${mention(me.id)} 拿了 2 金` });
    afterGather(c);
  } else {
    // 天文台抽 3 張；圖書館留 2 張
    const drawn = s.deck.splice(0, has(me, 'observatory') ? 3 : 2);
    const keep = has(me, 'library') ? 2 : 1;
    c.events.push({ type: 'announce', text: `🃏 ${mention(me.id)} 抽了牌` });
    if (drawn.length <= keep) {
      me.hand.push(...drawn);
      tell(c, me.id, drawn.length ? `🃏 你拿到 ${drawn.map(districtLabel).join('、')}。` : '🃏 牌堆沒有牌了。');
      afterGather(c);
    } else {
      t.drawn = drawn;
      t.keep = keep;
      keepMenu(c);
    }
  }
  c.events.push(board(s));
  return true;
}

function keep(c: Ctx, user: string, seq: number, card: string): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  if (!t.drawn?.includes(card)) return reply(c, user, STALE);
  t.drawn.splice(t.drawn.indexOf(card), 1);
  current(s).hand.push(card);
  t.keep!--;
  if (t.keep! > 0 && t.drawn.length) keepMenu(c);
  else {
    s.deck.push(...t.drawn);
    t.drawn = undefined;
    t.keep = undefined;
    afterGather(c);
  }
  c.events.push(board(s));
  return true;
}

// 收集資源完成
function afterGather(c: Ctx) {
  const s = c.s;
  const me = current(s);
  s.turn!.gathered = true;
  if (me.char === 6) {
    me.gold++;
    c.events.push({ type: 'announce', text: `💰 商人 ${mention(me.id)} 多拿 1 金` });
  }
  if (me.char === 7) {
    const extra = s.deck.splice(0, 2);
    me.hand.push(...extra);
    c.events.push({ type: 'announce', text: `📐 建築師 ${mention(me.id)} 多抽了 ${extra.length} 張` });
    tell(c, me.id, `📐 你多抽到 ${extra.map(districtLabel).join('、') || '（牌堆沒有牌了）'}。`);
  }
}

function build(c: Ctx, user: string, seq: number, card: string): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  const me = current(s);
  if (!t.gathered || t.builds >= maxBuilds(me)) return reply(c, user, STALE);
  if (!buildable(me).includes(card)) return reply(c, user, '不能建這棟建築。');
  me.gold -= DISTRICTS[card].cost;
  me.hand.splice(me.hand.indexOf(card), 1);
  me.city.push({ card, round: s.round });
  t.builds++;
  c.events.push({ type: 'announce', text: `🔨 ${mention(me.id)} 建了 ${districtLabel(card)}` });
  if (me.city.length === 8) {
    s.firstComplete ??= me.id;
    s.lastRound ??= s.round;
    c.events.push({ type: 'announce', text: `🏁 ${mention(me.id)} 建滿 8 棟！這一輪結束後遊戲結束` });
  }
  c.events.push(board(s));
  return true;
}

// ===== 角色能力 =====
const killTargets = (s: CState) => RANKS.filter((r) => r >= 2 && !s.draft!.faceUp.includes(r));
const robTargets = (s: CState) => RANKS.filter((r) => r >= 3 && !s.draft!.faceUp.includes(r) && r !== s.killed);
// 城牆讓其他建築的破壞費用 +1
const destroyCost = (owner: CPlayer, card: string) => Math.max(0, DISTRICTS[card].cost - 1) + (card !== 'greatWall' && has(owner, 'greatWall') ? 1 : 0);
// 軍閥可以破壞的建築：建滿 8 棟的城市、沒被刺殺的主教、付不起的都不列
function destroyTargets(s: CState): { owner: CPlayer; card: string; cost: number }[] {
  const me = current(s);
  return s.players.flatMap((owner) => {
    if (owner.city.length >= 8 || (owner.char === 5 && s.killed !== 5)) return [];
    return owner.city
      .filter((x) => x.card !== 'keep')
      .map((x) => ({ owner, card: x.card, cost: destroyCost(owner, x.card) }))
      .filter((x) => x.cost <= me.gold);
  });
}

// 回合選單上的角色能力按鈕（還沒用過、有可用目標時）
function abilityButtons(s: CState): { sub: Sub; label: string }[] {
  const me = current(s);
  switch (me.char) {
    case 1:
      return [{ sub: 'kill', label: '🗡️ 刺殺' }];
    case 2:
      return robTargets(s).length ? [{ sub: 'rob', label: '🦹 偷竊' }] : [];
    case 3:
      return [{ sub: 'swap', label: '🔄 換手牌' }, ...(me.hand.length ? [{ sub: 'redraw' as Sub, label: '♻️ 棄牌重抽' }] : [])];
    case 8:
      return destroyTargets(s).length ? [{ sub: 'destroy', label: '💥 破壞' }] : [];
    default:
      return [];
  }
}

function abilityMenu(c: Ctx, sub: Sub) {
  const s = c.s;
  const me = current(s);
  if (s.turn!.ability || !abilityButtons(s).some((b) => b.sub === sub)) return reply(c, me.id, STALE);
  const seq = s.seq;
  switch (sub) {
    case 'kill':
      return menu(c, me.id, '🗡️ 要刺殺哪個角色？', killTargets(s).map((r) => ({ value: `kill:${seq}:${r}`, label: `${r} ${CHARS[r].name}` })));
    case 'rob':
      return menu(c, me.id, '🦹 要偷哪個角色？', robTargets(s).map((r) => ({ value: `rob:${seq}:${r}`, label: `${r} ${CHARS[r].name}` })));
    case 'swap':
      return menu(c, me.id, '🔄 要和誰交換全部手牌？', s.players.filter((p) => p !== me).map((p) => ({ value: `swap:${seq}:${p.id}`, label: `${p.id} ：${p.hand.length} 張` })));
    case 'redraw':
      return redrawMenu(c, []);
    case 'destroy':
      return menu(c, me.id, `💥 要破壞哪一棟？（你有 ${me.gold} 金）`, destroyTargets(s).map((x) => ({ value: `destroy:${seq}:${x.card}:${x.owner.id}`, label: `${x.owner.id} 的 ${districtLabel(x.card)}：${x.cost} 金` })));
  }
}

// 棄牌重抽：按手牌切換要不要棄，選好再按確認；選擇記在按鈕上，不改 state
function redrawMenu(c: Ctx, picked: number[]) {
  const s = c.s;
  const me = current(s);
  if (me.char !== 3 || !s.turn!.gathered || s.turn!.ability) return reply(c, me.id, STALE);
  const seq = s.seq;
  const toggle = (i: number) => (picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i].sort((a, b) => a - b));
  const options = [
    ...me.hand.map((card, i) => ({ value: `redrawToggle:${seq}:${toggle(i).join(',')}`, label: `${picked.includes(i) ? '✅ ' : ''}${districtLabel(card)}` })),
    ...(picked.length ? [{ value: `redraw:${seq}:${picked.join(',')}`, label: `♻️ 確認重抽 ${picked.length} 張` }] : []),
  ];
  menu(c, me.id, '♻️ 選要棄掉的手牌（放到牌堆底，再抽同樣張數）：', options);
}

// 能力動作的共同檢查
function abilityCheck(c: Ctx, user: string, seq: number, rank: Rank): boolean {
  const err = turnCheck(c.s, user, seq);
  const t = c.s.turn;
  const msg = err ?? (current(c.s).char !== rank || !t!.gathered || t!.ability ? STALE : null);
  if (msg) reply(c, user, msg);
  return !msg;
}

function kill(c: Ctx, user: string, seq: number, rank: Rank): boolean {
  const s = c.s;
  if (!abilityCheck(c, user, seq, 1)) return false;
  if (!killTargets(s).includes(rank)) return reply(c, user, '不能刺殺這個角色。');
  s.killed = rank;
  s.turn!.ability = true;
  c.events.push({ type: 'announce', text: `🗡️ 刺客刺殺了 ${rank} 號 ${CHARS[rank].name}！` });
  c.events.push(board(s));
  return true;
}

function rob(c: Ctx, user: string, seq: number, rank: Rank): boolean {
  const s = c.s;
  if (!abilityCheck(c, user, seq, 2)) return false;
  if (!robTargets(s).includes(rank)) return reply(c, user, '不能偷這個角色。');
  s.robbed = rank;
  s.robber = user;
  s.turn!.ability = true;
  c.events.push({ type: 'announce', text: `🦹 盜賊 ${mention(user)} 要偷 ${rank} 號 ${CHARS[rank].name}` });
  c.events.push(board(s));
  return true;
}

function swap(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  if (!abilityCheck(c, user, seq, 3)) return false;
  const me = current(s);
  const other = find(s, target);
  if (!other || other === me) return reply(c, user, '不能和這位玩家交換。');
  [me.hand, other.hand] = [other.hand, me.hand];
  s.turn!.ability = true;
  c.events.push({ type: 'announce', text: `🔄 ${mention(me.id)} 和 ${mention(other.id)} 交換手牌（${mention(me.id)} 拿到 ${me.hand.length} 張、${mention(other.id)} 拿到 ${other.hand.length} 張）` });
  for (const p of [me, other]) tell(c, p.id, `🔄 交換後你的手牌：\n${handText(p.hand)}`);
  c.events.push(board(s));
  return true;
}

function redraw(c: Ctx, user: string, seq: number, picked: number[]): boolean {
  const s = c.s;
  if (!abilityCheck(c, user, seq, 3)) return false;
  const me = current(s);
  const ok = picked.length > 0 && new Set(picked).size === picked.length && picked.every((i) => Number.isInteger(i) && i >= 0 && i < me.hand.length);
  if (!ok) return reply(c, user, STALE);
  const out = picked.map((i) => me.hand[i]);
  me.hand = me.hand.filter((_, i) => !picked.includes(i));
  s.deck.push(...out);
  const drawn = s.deck.splice(0, out.length);
  me.hand.push(...drawn);
  s.turn!.ability = true;
  c.events.push({ type: 'announce', text: `♻️ ${mention(me.id)} 棄了 ${out.length} 張手牌重抽` });
  tell(c, me.id, `♻️ 你抽到 ${drawn.map(districtLabel).join('、')}。`);
  c.events.push(board(s));
  return true;
}

function destroy(c: Ctx, user: string, seq: number, target: string, card: string): boolean {
  const s = c.s;
  if (!abilityCheck(c, user, seq, 8)) return false;
  const x = destroyTargets(s).find((d) => d.owner.id === target && d.card === card);
  if (!x) return reply(c, user, '不能破壞這棟建築。');
  const me = current(s);
  me.gold -= x.cost;
  x.owner.city.splice(x.owner.city.findIndex((d) => d.card === card), 1);
  s.turn!.ability = true;
  c.events.push({ type: 'announce', text: `💥 軍閥 ${mention(me.id)} 花 ${x.cost} 金破壞了 ${mention(target)} 的 ${districtLabel(card)}` });
  // 墓地主人（不是軍閥、至少 1 金）可以付 1 金收回；墓地本身被破壞時已經不在城市裡
  const owner = s.players.find((p) => p !== me && has(p, 'graveyard') && p.gold >= 1);
  if (!owner) {
    s.deck.push(card);
    c.events.push(board(s));
    return true;
  }
  s.phase = 'graveyard';
  s.graveyard = { owner: owner.id, card };
  c.events.push({ type: 'announce', text: `⚰️ 等 ${mention(owner.id)} 決定要不要用墓地收回 ${districtLabel(card)}（${GRAVE_MS / 1000} 秒）` });
  if (!isBot(owner.id)) {
    c.events.push({
      type: 'prompt',
      kind: 'citadels',
      audience: 'user',
      user: owner.id,
      text: `⚰️ 軍閥破壞了 ${mention(target)} 的 ${districtLabel(card)}，要不要付 1 金把 ${districtLabel(card)} 收回手上？`,
      options: [{ value: 'grave:yes', label: '付 1 金收回' }, { value: 'grave:no', label: '不用' }],
    });
  }
  c.events.push(board(s));
  startTimer(c, GRAVE_MS);
  return true;
}

function grave(c: Ctx, user: string, yes: boolean): boolean {
  if (c.s.phase !== 'graveyard' || c.s.graveyard!.owner !== user) return reply(c, user, '現在不用決定。');
  resolveGrave(c, yes);
  return true;
}

function resolveGrave(c: Ctx, yes: boolean) {
  const s = c.s;
  const { owner, card } = s.graveyard!;
  const p = find(s, owner)!;
  if (yes) {
    p.gold--;
    p.hand.push(card);
    c.events.push({ type: 'announce', text: `⚰️ ${mention(owner)} 付 1 金用墓地收回了 ${districtLabel(card)}` });
  } else {
    s.deck.push(card);
    c.events.push({ type: 'announce', text: `⚰️ ${mention(owner)} 沒有用墓地收回 ${districtLabel(card)}` });
  }
  s.phase = 'turn';
  s.graveyard = undefined;
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

// ===== 紫色建築：實驗室、鐵匠鋪 =====
const canLab = (s: CState) => s.turn!.gathered && !s.turn!.lab && has(current(s), 'laboratory') && current(s).hand.length > 0;
const canSmithy = (s: CState) => s.turn!.gathered && !s.turn!.smithy && has(current(s), 'smithy') && current(s).gold >= 2;

function lab(c: Ctx, user: string, seq: number, card: string): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const me = current(s);
  if (!canLab(s) || !me.hand.includes(card)) return reply(c, user, STALE);
  me.hand.splice(me.hand.indexOf(card), 1);
  s.deck.push(card);
  me.gold++;
  s.turn!.lab = true;
  c.events.push({ type: 'announce', text: `🧪 ${mention(me.id)} 用實驗室棄了 1 張手牌，拿 1 金` });
  c.events.push(board(s));
  return true;
}

function smithy(c: Ctx, user: string, seq: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const me = current(s);
  if (!canSmithy(s)) return reply(c, user, STALE);
  me.gold -= 2;
  const drawn = s.deck.splice(0, 3);
  me.hand.push(...drawn);
  s.turn!.smithy = true;
  c.events.push({ type: 'announce', text: `⚒️ ${mention(me.id)} 用鐵匠鋪付 2 金抽了 ${drawn.length} 張` });
  tell(c, me.id, `⚒️ 你抽到 ${drawn.map(districtLabel).join('、') || '（牌堆沒有牌了）'}。`);
  c.events.push(board(s));
  return true;
}

function collectTax(c: Ctx) {
  const me = current(c.s);
  const amount = taxAmount(me);
  me.gold += amount;
  c.s.turn!.taxed = true;
  c.events.push({ type: 'announce', text: `💰 ${mention(me.id)} 收稅 ${amount} 金` });
}

function tax(c: Ctx, user: string, seq: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  if (!s.turn!.gathered || !CHARS[current(s).char!].tax || s.turn!.taxed) return reply(c, user, STALE);
  collectTax(c);
  c.events.push(board(s));
  return true;
}

function end(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return reply(c, user, err);
  if (!c.s.turn!.gathered) return reply(c, user, '請先收集資源。');
  finishTurn(c);
  return true;
}

// 結束回合：還沒收稅就自動收
function finishTurn(c: Ctx) {
  const s = c.s;
  if (CHARS[current(s).char!].tax && !s.turn!.taxed) collectTax(c);
  c.events.push(board(s, true));
  nextCall(c);
}

// 回合逾時：還沒收集就拿 2 金、選牌中就留第一張，然後結束
function turnTimeout(c: Ctx) {
  const s = c.s;
  const me = current(s);
  const t = s.turn!;
  c.events.push({ type: 'announce', text: `⏰ ${mention(me.id)} 時間到，自動完成回合。` });
  while (t.drawn) keep(c, me.id, s.seq, t.drawn[0]);
  if (!t.gathered) gather(c, me.id, s.seq, 'gold');
  finishTurn(c);
}

function timeout(c: Ctx) {
  const s = c.s;
  if (s.phase === 'draft') {
    const choices = pickChoices(s);
    const rank = choices[Math.floor(c.rng() * choices.length)];
    tell(c, drafter(s).id, `⏰ 時間到，系統替你選了 ${CHARS[rank].name}。`);
    pick(c, drafter(s).id, rank);
  } else if (s.phase === 'turn') turnTimeout(c);
  else if (s.phase === 'graveyard') resolveGrave(c, false);
}

// ===== 計分 =====
const costOf = (p: CPlayer) => p.city.reduce((sum, x) => sum + DISTRICTS[x.card].cost, 0);

export function scoreOf(s: CState, p: CPlayer) {
  const cost = costOf(p);
  const bonus = 2 * p.city.filter((x) => x.card === 'university' || x.card === 'dragonGate').length;
  // 鬼城（不是最後一輪建的）可以補任何一種顏色；魔法學校只算紫色
  const ghost = p.city.find((x) => x.card === 'hauntedCity');
  const wild = !!ghost && ghost.round !== s.lastRound;
  const colors = new Set(p.city.filter((x) => !(wild && x === ghost)).map((x) => DISTRICTS[x.card].color));
  const five = colors.size === COLORS.length || (wild && colors.size === COLORS.length - 1) ? 3 : 0;
  const complete = p.city.length >= 8 ? (s.firstComplete === p.id ? 4 : 2) : 0;
  return { cost, bonus, five, complete, total: cost + bonus + five + complete };
}

// 依總分、建築費用（大學、龍門算 8）、金幣排序
function ranking(s: CState) {
  const key = (p: CPlayer) => {
    const sc = scoreOf(s, p);
    return [sc.total, sc.cost + sc.bonus, p.gold];
  };
  const cmp = (a: CPlayer, b: CPlayer) => {
    const [x, y] = [key(a), key(b)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  };
  return { sorted: [...s.players].sort(cmp), cmp };
}

export function winnersOf(s: CState): string[] {
  const { sorted, cmp } = ranking(s);
  return sorted.filter((p) => cmp(p, sorted[0]) === 0).map((p) => p.id);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winners = winnersOf(s);
  const { sorted, cmp } = ranking(s);
  const lines = sorted.map((p) => {
    const sc = scoreOf(s, p);
    const place = sorted.findIndex((q) => cmp(p, q) === 0) + 1;
    const purple = p.city.filter((x) => DISTRICTS[x.card].desc).map((x) => districtInfo(x.card));
    return [
      `${place}. ${mention(p.id)}${s.winners!.includes(p.id) ? ' 🏆' : ''}：建築 ${sc.cost}${sc.bonus ? `｜紫卡 +${sc.bonus}` : ''}${sc.five ? `｜五色 +${sc.five}` : ''}${sc.complete ? `｜建滿 +${sc.complete}` : ''}｜總分 ${sc.total}（${p.city.length} 棟、${p.gold} 金）`,
      ...purple.map((x) => `　　${x}`),
    ].join('\n');
  });
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    { type: 'announce', text: [`🏆 遊戲結束！獲勝：${s.winners.map(mention).join('、')}`, ...lines].join('\n'), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// ===== bot =====
const BOT_ORDER: Rank[] = [6, 7, 4, 2, 8, 5, 3, 1];
const TAX_RANKS: Rank[] = [4, 5, 6, 8];
const cost = (card: string) => DISTRICTS[card].cost;
// 費用最高的（一樣高取前面的）
const priciest = (cards: string[]) => cards.reduce((best, x) => (cost(x) > cost(best) ? x : best));
const randomOf = <T>(c: Ctx, items: T[]) => items[Math.floor(c.rng() * items.length)];

// 選角：同色 2 棟以上就選對應的收稅角色（棟數最多、同樣多編號小的優先），否則照預設順序
function botPick(s: CState, p: CPlayer): Rank {
  const choices = pickChoices(s);
  let best: Rank | undefined;
  let most = 1;
  for (const r of TAX_RANKS) {
    const n = p.city.filter((x) => DISTRICTS[x.card].color === CHARS[r].tax).length;
    if (n > most && choices.includes(r)) [best, most] = [r, n];
  }
  return best ?? BOT_ORDER.find((r) => choices.includes(r)) ?? choices[0];
}

// 抽牌時留下費用最高、城市裡沒有的
const botKeep = (p: CPlayer, drawn: string[]) => {
  const fresh = drawn.filter((card) => !has(p, card));
  return priciest(fresh.length ? fresh : drawn);
};

// 魔術師：和手牌比自己多 2 張以上、手牌最多的人交換
function swapTarget(s: CState): CPlayer | undefined {
  const me = current(s);
  const rich = s.players.filter((p) => p !== me && p.hand.length >= me.hand.length + 2);
  return rich.reduce<CPlayer | undefined>((best, p) => (!best || p.hand.length > best.hand.length ? p : best), undefined);
}

// 軍閥：城市棟數最多的其他玩家，破壞費用最低、付得起的那棟
function destroyChoice(s: CState) {
  const me = current(s);
  const others = s.players.filter((p) => p !== me);
  const target = others.reduce((best, p) => (p.city.length > best.city.length ? p : best));
  const options = destroyTargets(s).filter((x) => x.owner === target);
  return options.reduce<(typeof options)[number] | undefined>((best, x) => (!best || x.cost < best.cost ? x : best), undefined);
}

function botStep(c: Ctx): boolean {
  const s = c.s;
  if (s.phase === 'draft') {
    const p = drafter(s);
    return isBot(p.id) && pick(c, p.id, botPick(s, p));
  }
  if (s.phase === 'graveyard') {
    const owner = find(s, s.graveyard!.owner)!;
    return isBot(owner.id) && grave(c, owner.id, owner.gold >= 1);
  }
  if (s.phase !== 'turn') return false;
  const me = current(s);
  if (!isBot(me.id)) return false;
  const t = s.turn!;
  const seq = s.seq;
  if (t.drawn) return keep(c, me.id, seq, botKeep(me, t.drawn));
  if (!t.gathered) return gather(c, me.id, seq, me.hand.some((card) => !has(me, card)) ? 'gold' : 'draw');
  if (CHARS[me.char!].tax && !t.taxed) return tax(c, me.id, seq);
  if (!t.ability && me.char === 1) return kill(c, me.id, seq, randomOf(c, killTargets(s)));
  if (!t.ability && me.char === 2 && robTargets(s).length) return rob(c, me.id, seq, randomOf(c, robTargets(s)));
  const other = !t.ability && me.char === 3 && !t.builds ? swapTarget(s) : undefined; // 只在建造前判斷一次
  if (other) return swap(c, me.id, seq, other.id);
  const cards = t.builds < maxBuilds(me) ? buildable(me) : [];
  if (cards.length) return build(c, me.id, seq, priciest(cards));
  const x = !t.ability && me.char === 8 ? destroyChoice(s) : undefined;
  if (x) return destroy(c, me.id, seq, x.owner.id, x.card);
  return end(c, me.id, seq);
}

function runBots(c: Ctx) {
  for (let i = 0; i < 500 && c.s.phase !== 'ended' && botStep(c); i++);
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CITADELS_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_CITADELS_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user, c.s.phase === 'lobby' ? '' : `目前建築費用：${c.s.players.map((p) => `${mention(p.id)} ${costOf(p)}`).join('、')}`);
    case 'status':
      return status(c, action.user);
    case 'pickMenu':
      return pickMenu(c, action.user);
    case 'pick':
      return pick(c, action.user, action.rank);
    case 'turnMenu':
      return turnMenu(c, action.user, action.seq, action.sub);
    case 'gather':
      return gather(c, action.user, action.seq, action.kind);
    case 'keep':
      return keep(c, action.user, action.seq, action.card);
    case 'build':
      return build(c, action.user, action.seq, action.card);
    case 'tax':
      return tax(c, action.user, action.seq);
    case 'end':
      return end(c, action.user, action.seq);
    case 'kill':
      return kill(c, action.user, action.seq, action.rank);
    case 'rob':
      return rob(c, action.user, action.seq, action.rank);
    case 'swap':
      return swap(c, action.user, action.seq, action.target);
    case 'redrawToggle': {
      const err = turnCheck(c.s, action.user, action.seq);
      if (err) return reply(c, action.user, err);
      redrawMenu(c, action.picked);
      return false;
    }
    case 'redraw':
      return redraw(c, action.user, action.seq, action.picked);
    case 'destroy':
      return destroy(c, action.user, action.seq, action.target, action.card);
    case 'lab':
      return lab(c, action.user, action.seq, action.card);
    case 'smithy':
      return smithy(c, action.user, action.seq);
    case 'grave':
      return grave(c, action.user, action.yes);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): CPlayer => ({ id, gold: 2, hand: [], city: [] });

export function applyCitadels(state: CState | undefined, action: CAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: CState | undefined, host: string, channel: string): Result {
  const created: CState = {
    game: 'citadels',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    crown: 0,
    round: 0,
    calling: 0,
    notes: [],
    revealed: [],
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
