// 星際探險隊 (The Crew) 遊戲引擎：合作吃墩，純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCrew(state, action, rng, now) → { state, events }。
// now 是現在的時間 (毫秒)，只用來顯示通訊時間還剩幾秒；計時本身靠 startTimer。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { CREW_MISSIONS, MISSIONS_EN, type Rule, type Token } from './crewMissions.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/crew.js';

export const MIN_CREW_PLAYERS = 3;
export const MAX_CREW_PLAYERS = 5;
export const LAST_MISSION = CREW_MISSIONS.length;
const TITLE = '星際探險隊';

export type Color = 'blue' | 'green' | 'yellow' | 'purple' | 'rocket';
export type Card = `${Color}:${number}`;
const COLORS: Color[] = ['blue', 'green', 'yellow', 'purple', 'rocket'];
const EMOJI: Record<Color, string> = { blue: '🟦', green: '🟩', yellow: '🟨', purple: '🟪', rocket: '🚀' };

export type CPhase = 'lobby' | 'assign' | 'trick' | 'ended';
export type Step = 'sick' | 'pick' | 'commander' | 'solo';
export type CommPos = 'top' | 'only' | 'bottom';

export interface CTask {
  card: Card;
  token?: Token;
  owner?: string;
  done: boolean;
}

export interface CPlayer {
  id: string;
  hand: Card[];
  comm?: { card: Card; pos: CommPos }; // 公開的通訊牌，打出後拿掉
  commUsed: boolean;
}

export interface CState {
  game: 'crew';
  channel: string;
  host: string;
  phase: CPhase;
  players: CPlayer[];
  mission: number; // 1～40
  unlocked: number; // 頻道已解鎖的最高關，1～41
  commander: number;
  sick?: string;
  step?: Step; // 任務分配的哪一步
  tasks: CTask[];
  picker: number; // 一般挑任務：輪到第幾位玩家；指揮官指派：第幾張任務
  answers: Record<string, boolean>; // 指揮官指派、單人任務的「要／不要」
  tricks: number; // 總墩數
  trickNo: number;
  leader: number;
  turn: number;
  trick: { id: string; card: Card }[];
  ready: boolean; // 這墩的通訊時間結束，可以出牌了
  commEnds?: number; // 通訊時間結束的時間 (有 now 時才有)
  transferUsed: boolean;
  outcome?: 'success' | 'fail';
  reason?: string;
  ref: string; // 目前的牌桌 (或分配) 訊息
  seq: number; // 擋掉舊按鈕
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進去的)
}

export type CAction =
  | { type: 'new'; user: string; channel: string; unlocked?: number; lang?: Lang } // unlocked、lang 由 adapter 帶入
  | { type: 'rematch'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'level'; user: string; n?: number; unlocked?: number } // 不帶 n 是查看已解鎖的關卡
  | { type: 'reset'; user: string }
  | { type: 'resetConfirm'; user: string }
  | { type: 'hand'; user: string }
  | { type: 'play'; user: string; seq: number; card: Card }
  | { type: 'comm'; user: string }
  | { type: 'commCard'; user: string; seq: number; card: Card }
  | { type: 'pick'; user: string; seq: number; task: number }
  | { type: 'assign'; user: string; seq: number; target: string }
  | { type: 'answer'; user: string; seq: number; yes: boolean }
  | { type: 'solo'; user: string; seq: number; target: string }
  | { type: 'sick'; user: string; seq: number; target: string }
  | { type: 'transfer'; user: string }
  | { type: 'transferTo'; user: string; seq: number; task: number; target: string }
  | { type: 'timeout'; id: number };

type GameAction = Exclude<CAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: CState;
  events: GameEvent[];
}

interface Ctx {
  s: CState;
  events: GameEvent[];
  rng: Rng;
  now?: number;
}

const colorOf = (card: Card) => card.split(':')[0] as Color;
const numOf = (card: Card) => Number(card.split(':')[1]);
export const cardText = (card: Card) => `${EMOJI[colorOf(card)]}${numOf(card)}`;
const cardKey = (card: Card) => COLORS.indexOf(colorOf(card)) * 10 + numOf(card);
export const sortHand = (hand: Card[]) => [...hand].sort((a, b) => cardKey(a) - cardKey(b));
const handText = (s: CState, hand: Card[]) => (hand.length ? hand.map(cardText).join(' ') : tx(s.lang, 'none'));

const missionOf = (s: CState) => CREW_MISSIONS[s.mission - 1];
const hasRule = (s: CState, rule: Rule) => missionOf(s).rules.includes(rule);
const isPlayer = (s: CState, user: string) => s.players.some((p) => p.id === user);
const playerOf = (s: CState, user: string) => s.players.find((p) => p.id === user);
const next = (s: CState, i: number) => (i + 1) % s.players.length;

// 一關的簡介：編號、名稱、任務數、標記、特殊規則
function missionLine(lang: Lang | undefined, n: number): string {
  const m = CREW_MISSIONS[n - 1];
  const extras = [m.tokens.length ? tx(lang, 'tokens', { tokens: m.tokens.join(' ') }) : '', ...m.rules.map((r) => ruleLabel(lang, r))].filter(Boolean);
  const list = extras.join(tx(lang, 'sep'));
  return tx(lang, 'missionLine', { n, name: missionText(lang, n).name, tasks: m.tasks, extras: extras.length ? tx(lang, 'extras', { list }) : '' });
}

// 關卡的名稱和劇情依語系
const missionText = (lang: Lang | undefined, n: number) => (lang === 'en' ? MISSIONS_EN[n - 1] : CREW_MISSIONS[n - 1]);
const ruleLabel = (lang: Lang | undefined, r: Rule) =>
  r.startsWith('delay:') ? tx(lang, 'rule.delay', { n: r.slice(6) }) : tx(lang, `rule.${r as Exclude<Rule, `delay:${number}`>}`);
const sep = (s: CState) => tx(s.lang, 'sep');

// 房間公告下面的關卡資訊 (改關時用同一個 ref 更新)
function lobbyInfo(s: CState): GameEvent {
  const done = s.unlocked > LAST_MISSION ? tx(s.lang, 'lobbyAllClear') : '';
  return {
    type: 'prompt',
    kind: 'crew',
    audience: 'channel',
    ref: s.ref,
    text: tx(s.lang, 'lobbyInfo', { mission: missionLine(s.lang, s.mission), story: missionText(s.lang, s.mission).story, max: Math.min(s.unlocked, LAST_MISSION), done }),
    options: [],
  };
}

// 洗牌後從隨機一位開始依加入順序發完；3 人時第一位多 1 張
function deal(c: Ctx) {
  const s = c.s;
  const deck = shuffle(
    COLORS.flatMap((color) => Array.from({ length: color === 'rocket' ? 4 : 9 }, (_, i) => `${color}:${i + 1}` as Card)),
    c.rng,
  );
  const n = s.players.length;
  const first = Math.floor(c.rng() * n);
  s.players.forEach((p) => (p.hand = []));
  deck.forEach((card, i) => s.players[(first + i) % n].hand.push(card));
  s.players.forEach((p) => (p.hand = sortHand(p.hand)));
  s.tricks = Math.floor(deck.length / n);
  s.commander = s.players.findIndex((p) => p.hand.includes('rocket:4'));
}

function startGame(c: Ctx) {
  const s = c.s;
  deal(c);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'assign' }));
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'startTitle', { mission: missionLine(s.lang, s.mission) }),
      tx(s.lang, 'story', { story: missionText(s.lang, s.mission).story }),
      tx(s.lang, 'startCommander', { who: mention(s.players[s.commander].id), tricks: s.tricks }),
      tx(s.lang, 'startRules'),
      tx(s.lang, 'startQuiet'),
    ].join('\n'),
  });
  for (const p of s.players) c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, 'dmHand', { n: s.mission, hand: handText(s, p.hand) }) });
  beginAssign(c);
}

// 抽任務牌並依抽出順序配標記；🤒 隊員失能要先指定失能的人
function beginAssign(c: Ctx) {
  const s = c.s;
  const m = missionOf(s);
  s.phase = 'assign';
  const colored = shuffle(
    COLORS.slice(0, 4).flatMap((color) => Array.from({ length: 9 }, (_, i) => `${color}:${i + 1}` as Card)),
    c.rng,
  );
  s.tasks = colored.slice(0, m.tasks).map((card, i) => ({ card, ...(m.tokens[i] ? { token: m.tokens[i] } : {}), done: false }));
  s.ref = `crew:${s.seq}:assign`;
  if (hasRule(s, 'sick')) return askStep(c, 'sick');
  beginTasks(c);
}

function beginTasks(c: Ctx) {
  const s = c.s;
  if (hasRule(s, 'solo')) return askStep(c, 'solo');
  if (hasRule(s, 'commanderPick')) {
    s.picker = 0;
    return askStep(c, 'commander');
  }
  s.picker = s.commander;
  askStep(c, 'pick');
}

const PICK_MS = 60_000;
const ASSIGN_MS = 90_000;
const lowest = (s: CState) => Math.min(...s.players.filter((p) => p.id !== s.sick).map((p) => taskCount(s, p.id)));
const taskCount = (s: CState, id: string) => s.tasks.filter((t) => t.owner === id).length;
// 從指揮官開始依加入順序的玩家
const fromCommander = (s: CState) => s.players.map((_, i) => s.players[(s.commander + i) % s.players.length]);

function askStep(c: Ctx, step: Step) {
  c.s.step = step;
  c.s.answers = {};
  c.s.seq++;
  c.events.push(assignPrompt(c.s));
  startTimer(c, step === 'pick' ? PICK_MS : ASSIGN_MS);
}

function assignPrompt(s: CState): GameEvent {
  const cmd = s.players[s.commander].id;
  const hand = { value: 'hand', label: tx(s.lang, 'handButton') };
  const others = s.players.filter((p) => p.id !== cmd);
  const answers = (yes: string, no: string) =>
    Object.keys(s.answers).length ? `\n${Object.entries(s.answers).map(([id, a]) => `${mention(id)} ${a ? yes : no}`).join(sep(s))}` : '';
  const sec = ASSIGN_MS / 1000;
  let text: string;
  let options: { value: string; label: string }[];
  if (s.step === 'sick') {
    text = tx(s.lang, 'askSick', { cmd: mention(cmd), sec });
    options = [...others.map((p) => ({ value: `sick:${s.seq}:${p.id}`, label: p.id })), hand];
  } else if (s.step === 'solo') {
    const tokens = missionOf(s).tokens;
    const [yes, no] = [tx(s.lang, 'canYes'), tx(s.lang, 'canNo')];
    const tokenText = tokens.length ? tx(s.lang, 'soloTokens', { tokens: tokens.join(' ') }) : '';
    text = tx(s.lang, 'askSolo', { n: s.tasks.length, tokens: tokenText, cmd: mention(cmd), sec, answers: answers(yes, no) });
    options = [
      { value: `answer:${s.seq}:yes`, label: yes },
      { value: `answer:${s.seq}:no`, label: no },
      ...others.map((p) => ({ value: `solo:${s.seq}:${p.id}`, label: p.id })),
      hand,
    ];
  } else if (s.step === 'commander') {
    const t = s.tasks[s.picker];
    const [yes, no] = [tx(s.lang, 'wantYes'), tx(s.lang, 'wantNo')];
    const task = `${cardText(t.card)}${t.token ? ` (${t.token})` : ''}`;
    text = tx(s.lang, 'askCommander', { i: s.picker + 1, n: s.tasks.length, task, cmd: mention(cmd), sec, answers: answers(yes, no) });
    options = [
      { value: `answer:${s.seq}:yes`, label: yes },
      { value: `answer:${s.seq}:no`, label: no },
      ...s.players.filter((p) => p.id !== s.sick).map((p) => ({ value: `assign:${s.seq}:${p.id}`, label: p.id })),
      hand,
    ];
  } else {
    text = tx(s.lang, 'askPick', { who: mention(s.players[s.picker].id), sec: PICK_MS / 1000, tasks: tasksSummary(s) });
    options = [...s.tasks.flatMap((t, i) => (t.owner ? [] : [{ value: `pick:${s.seq}:${i}`, label: cardText(t.card) + (t.token ? ` (${t.token})` : '') }])), hand];
  }
  return { type: 'prompt', kind: 'crew', audience: 'channel', ref: s.ref, text, options, perRow: 5 };
}

// 每張任務和它的主人
const tasksSummary = (s: CState) =>
  s.tasks.map((t) => `${t.token ? `${cardText(t.card)} (${t.token})` : cardText(t.card)}${t.owner ? ` → ${mention(t.owner)}` : ''}`).join(sep(s));

function assignError(s: CState, user: string, seq: number, step: Step): string | undefined {
  if (!isPlayer(s, user)) return tx(s.lang, 'notInGame');
  if (s.phase !== 'assign' || s.step !== step || seq !== s.seq) return tx(s.lang, 'expired');
  return undefined;
}

function pickTask(c: Ctx, user: string, seq: number, task: number): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'pick');
  if (err) return reply(c, user, err);
  if (s.players[s.picker].id !== user) return reply(c, user, tx(s.lang, 'notYourPick', { who: mention(s.players[s.picker].id) }));
  const t = s.tasks[task];
  if (!t || t.owner) return reply(c, user, tx(s.lang, 'taskTaken'));
  t.owner = user;
  afterPick(c);
  return true;
}

function afterPick(c: Ctx) {
  const s = c.s;
  if (s.tasks.every((t) => t.owner)) return finishAssign(c);
  do s.picker = next(s, s.picker);
  while (s.players[s.picker].id === s.sick);
  askStep(c, 'pick');
}

function answer(c: Ctx, user: string, seq: number, yes: boolean): boolean {
  const s = c.s;
  if (!isPlayer(s, user)) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'assign' || (s.step !== 'commander' && s.step !== 'solo') || seq !== s.seq) return reply(c, user, tx(s.lang, 'expired'));
  if (s.step === 'solo' && user === s.players[s.commander].id) return reply(c, user, tx(s.lang, 'commanderNoAnswer'));
  s.answers[user] = yes;
  c.events.push(assignPrompt(s));
  return true;
}

function assignTask(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'commander');
  if (err) return reply(c, user, err);
  if (user !== s.players[s.commander].id) return reply(c, user, tx(s.lang, 'onlyCmdAssign'));
  if (!isPlayer(s, target) || target === s.sick) return reply(c, user, tx(s.lang, 'cannotAssign'));
  if (taskCount(s, target) + 1 - lowestAfter(s, target) >= 2) return reply(c, user, tx(s.lang, 'unbalanced'));
  giveTask(c, target);
  return true;
}

// 把這張任務給 target 之後，任務最少的人有幾張
function lowestAfter(s: CState, target: string) {
  return Math.min(...s.players.filter((p) => p.id !== s.sick).map((p) => taskCount(s, p.id) + (p.id === target ? 1 : 0)));
}

function giveTask(c: Ctx, target: string) {
  const s = c.s;
  s.tasks[s.picker].owner = target;
  c.events.push({ type: 'announce', text: tx(s.lang, 'assigned', { card: cardText(s.tasks[s.picker].card), who: mention(target) }) });
  if (s.tasks.every((t) => t.owner)) return finishAssign(c);
  s.picker++;
  askStep(c, 'commander');
}

function chooseSolo(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'solo');
  if (err) return reply(c, user, err);
  if (user !== s.players[s.commander].id) return reply(c, user, tx(s.lang, 'onlyCmdChoose'));
  if (target === user) return reply(c, user, tx(s.lang, 'notSelf'));
  if (!isPlayer(s, target)) return false;
  giveAll(c, target);
  return true;
}

function giveAll(c: Ctx, target: string) {
  for (const t of c.s.tasks) t.owner = target;
  c.events.push({ type: 'announce', text: tx(c.s.lang, 'soloAll', { who: mention(target), tasks: tasksSummary(c.s) }) });
  finishAssign(c);
}

function chooseSick(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'sick');
  if (err) return reply(c, user, err);
  if (user !== s.players[s.commander].id) return reply(c, user, tx(s.lang, 'onlyCmdSick'));
  if (target === user) return reply(c, user, tx(s.lang, 'notSelf'));
  if (!isPlayer(s, target)) return false;
  setSick(c, target);
  return true;
}

function setSick(c: Ctx, target: string) {
  c.s.sick = target;
  c.events.push({ type: 'announce', text: tx(c.s.lang, 'sickAnnounce', { who: mention(target) }) });
  beginTasks(c);
}

function assignTimeout(c: Ctx) {
  const s = c.s;
  const cmdNext = s.players[next(s, s.commander)].id;
  if (s.step === 'sick') return setSick(c, cmdNext);
  if (s.step === 'solo') {
    const yes = fromCommander(s).find((p) => s.answers[p.id] === true);
    return giveAll(c, yes?.id ?? cmdNext);
  }
  if (s.step === 'commander') {
    const min = lowest(s);
    return giveTask(c, fromCommander(s).find((p) => p.id !== s.sick && taskCount(s, p.id) === min)!.id);
  }
  s.tasks.find((t) => !t.owner)!.owner = s.players[s.picker].id;
  afterPick(c);
}

function finishAssign(c: Ctx) {
  const s = c.s;
  s.step = undefined;
  c.events.push({ type: 'prompt', kind: 'crew', audience: 'channel', ref: s.ref, text: tx(s.lang, 'assignDone', { tasks: tasksSummary(s) }), options: [] });
  const lines = s.players
    .filter((p) => taskCount(s, p.id))
    .map((p) => tx(s.lang, 'ownerLine', { who: mention(p.id), items: s.tasks.filter((t) => t.owner === p.id).map(taskText).join(' ') }));
  c.events.push({ type: 'announce', text: tx(s.lang, 'everyoneTasks', { lines: lines.join('\n') }) });
  s.phase = 'trick';
  s.leader = s.commander;
  startTrick(c);
}

const COMM_MS = 10_000; // 每墩開始的通訊時間
const PLAY_MS = 120_000;

// 新的一墩：先有 10 秒通訊時間，之後才能出牌
function startTrick(c: Ctx) {
  const s = c.s;
  s.trickNo++;
  s.turn = s.leader;
  s.trick = [];
  s.ready = false;
  s.commEnds = c.now === undefined ? undefined : c.now + COMM_MS;
  s.seq++;
  s.ref = `crew:${s.seq}:${s.trickNo}`;
  c.events.push(tablePrompt(s));
  startTimer(c, COMM_MS);
}

const posText = (s: CState, pos: CommPos) => tx(s.lang, `pos.${pos}`);

function tablePrompt(s: CState, done = false): GameEvent {
  const who = mention(s.players[s.turn].id);
  const status = done
    ? tx(s.lang, 'trickDone')
    : s.ready
      ? tx(s.lang, 'turnPlay', { who, min: PLAY_MS / 60_000 })
      : tx(s.lang, 'commTime', { sec: COMM_MS / 1000, who });
  const played = s.trick.length ? s.trick.map((t) => `${mention(t.id)} ${cardText(t.card)}`).join(sep(s)) : tx(s.lang, 'nobodyPlayed');
  const rows = s.players.map((p) => {
    const mine = s.tasks.filter((t) => t.owner === p.id);
    const comm = p.comm ? tx(s.lang, 'rowComm', { card: cardText(p.comm.card), pos: hasRule(s, 'deadZone') ? '' : ` (${posText(s, p.comm.pos)})` }) : '';
    const sick = p.id === s.sick ? tx(s.lang, 'rowSick') : '';
    const tasks = mine.length ? tx(s.lang, 'rowTasks', { tasks: mine.map(taskText).join(' ') }) : '';
    return tx(s.lang, 'row', { who: mention(p.id), sick, n: p.hand.length, tasks, comm });
  });
  const hand = { value: 'hand', label: tx(s.lang, 'handButton') };
  const options = done ? [] : [hand, ...(hasRule(s, 'silence') ? [] : [{ value: 'comm', label: tx(s.lang, 'commButton') }]), ...transferOption(s)];
  return {
    type: 'prompt',
    kind: 'crew',
    audience: 'channel',
    ref: s.ref,
    text: tx(s.lang, 'table', { mission: s.mission, name: missionText(s.lang, s.mission).name, no: s.trickNo, total: s.tricks, status, played, rows: rows.join('\n') }),
    options,
  };
}

// 5 人局轉交任務：第 15 關以後、沒有單人任務和指揮官指派
const TRANSFER_FROM = 15;
const canTransfer = (s: CState) => s.players.length === 5 && s.mission >= TRANSFER_FROM && !hasRule(s, 'solo') && !hasRule(s, 'commanderPick');
const transferOpen = (s: CState) => canTransfer(s) && !s.transferUsed && s.trickNo === 1 && !s.trick.length;
const transferOption = (s: CState) => (transferOpen(s) ? [{ value: 'transfer', label: tx(s.lang, 'transferButton') }] : []);

function transferError(s: CState, user: string): string | undefined {
  if (!isPlayer(s, user)) return tx(s.lang, 'notInGame');
  if (!canTransfer(s) || s.phase !== 'trick') return tx(s.lang, 'noTransfer');
  if (s.transferUsed) return tx(s.lang, 'transferUsed');
  if (!transferOpen(s)) return tx(s.lang, 'transferFirst');
  if (!s.tasks.some((t) => t.owner === user && !t.done)) return tx(s.lang, 'noTaskToTransfer');
  return undefined;
}

function transferMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const err = transferError(s, user);
  if (err) return reply(c, user, err);
  const targets = s.players.filter((p) => p.id !== user && p.id !== s.sick);
  c.events.push({
    type: 'prompt',
    kind: 'crew',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'transferMenu'),
    options: s.tasks.flatMap((t, i) => (t.owner === user ? targets.map((p) => ({ value: `transferTo:${s.seq}:${i}:${p.id}`, label: `${cardText(t.card)} → ${p.id}` })) : [])),
    perRow: 4,
  });
  return false;
}

function transferTask(c: Ctx, user: string, seq: number, task: number, target: string): boolean {
  const s = c.s;
  const err = transferError(s, user);
  if (err) return reply(c, user, err);
  if (seq !== s.seq) return reply(c, user, tx(s.lang, 'expired'));
  const t = s.tasks[task];
  if (!t || t.owner !== user) return reply(c, user, tx(s.lang, 'notYourTask'));
  if (target === user || target === s.sick || !isPlayer(s, target)) return reply(c, user, tx(s.lang, 'cannotGive'));
  t.owner = target;
  s.transferUsed = true;
  c.events.push({ type: 'announce', text: tx(s.lang, 'transferred', { who: mention(user), card: cardText(t.card), target: mention(target) }) }, tablePrompt(s));
  return true;
}

// 可以通訊的牌：每種顏色 (火箭除外) 最小、最大或唯一的那張
function commChoices(hand: Card[]): { card: Card; pos: CommPos }[] {
  return COLORS.slice(0, 4).flatMap((color): { card: Card; pos: CommPos }[] => {
    const cards = sortHand(hand.filter((card) => colorOf(card) === color));
    if (!cards.length) return [];
    if (cards.length === 1) return [{ card: cards[0], pos: 'only' as const }];
    return [
      { card: cards[0], pos: 'bottom' as const },
      { card: cards[cards.length - 1], pos: 'top' as const },
    ];
  });
}

function commError(s: CState, user: string): string | undefined {
  const me = playerOf(s, user);
  if (!me) return tx(s.lang, 'notInGame');
  if (s.phase !== 'trick') return tx(s.lang, 'commAfterAssign');
  if (hasRule(s, 'silence')) return tx(s.lang, 'silence');
  if (me.commUsed) return tx(s.lang, 'commUsed');
  const delay = missionOf(s).rules.find((r) => r.startsWith('delay:'));
  if (delay && s.trickNo < Number(delay.slice(6))) return tx(s.lang, 'commDelay', { n: delay.slice(6) });
  if (s.trick.length) return tx(s.lang, 'commTrickStarted');
  return undefined;
}

function commMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const err = commError(s, user);
  if (err) return reply(c, user, err);
  const choices = commChoices(playerOf(s, user)!.hand);
  if (!choices.length) return reply(c, user, tx(s.lang, 'noCommCard'));
  c.events.push({
    type: 'prompt',
    kind: 'crew',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'commMenu'),
    options: choices.map((x) => ({ value: `commCard:${s.seq}:${x.card}`, label: `${cardText(x.card)} (${posText(s, x.pos)})` })),
    perRow: 4,
  });
  return false;
}

function communicate(c: Ctx, user: string, seq: number, card: Card): boolean {
  const s = c.s;
  const err = commError(s, user);
  if (err) return reply(c, user, err);
  if (seq !== s.seq) return reply(c, user, tx(s.lang, 'commExpired'));
  const me = playerOf(s, user)!;
  const choice = commChoices(me.hand).find((x) => x.card === card);
  if (!choice) return reply(c, user, tx(s.lang, 'commInvalid', { card: cardText(card) }));
  me.comm = choice;
  me.commUsed = true;
  const what = hasRule(s, 'deadZone')
    ? tx(s.lang, 'commHidden', { card: cardText(card) })
    : tx(s.lang, 'commWhat', { card: cardText(card), color: tx(s.lang, `color.${colorOf(card)}`), pos: posText(s, choice.pos) });
  c.events.push({ type: 'announce', text: tx(s.lang, 'commAnnounce', { who: mention(user), what }) }, tablePrompt(s));
  return true;
}

// 這墩誰贏：有火箭時最大的火箭，否則領出顏色最大的
export function trickWinner(trick: { id: string; card: Card }[]): string {
  const rockets = trick.filter((t) => colorOf(t.card) === 'rocket');
  const lead = colorOf(trick[0].card);
  const pool = rockets.length ? rockets : trick.filter((t) => colorOf(t.card) === lead);
  return pool.reduce((best, t) => (numOf(t.card) > numOf(best.card) ? t : best)).id;
}

// 合法的牌：領出的人任意；其他人有領出的顏色就只能出那個顏色
function legalCards(s: CState, p: CPlayer): Card[] {
  if (!s.trick.length) return p.hand;
  const lead = colorOf(s.trick[0].card);
  const follow = p.hand.filter((card) => colorOf(card) === lead);
  return follow.length ? follow : p.hand;
}

// 逾時代出：彩色牌中數字最小的 (同數依顏色順序)，只剩火箭時出最小的火箭
function autoCard(cards: Card[]): Card {
  const colored = cards.filter((card) => colorOf(card) !== 'rocket');
  const pool = colored.length ? colored : cards;
  return [...pool].sort((a, b) => numOf(a) - numOf(b) || COLORS.indexOf(colorOf(a)) - COLORS.indexOf(colorOf(b)))[0];
}

function playCard(c: Ctx, user: string, seq: number, card: Card): boolean {
  const s = c.s;
  const me = playerOf(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'trick') return reply(c, user, tx(s.lang, 'cannotPlayYet'));
  if (seq !== s.seq) return reply(c, user, tx(s.lang, 'playExpired'));
  if (s.players[s.turn].id !== user) return reply(c, user, tx(s.lang, 'notYourTurn', { who: mention(s.players[s.turn].id) }));
  if (!s.ready) {
    const left = s.commEnds !== undefined && c.now !== undefined ? Math.max(1, Math.ceil((s.commEnds - c.now) / 1000)) : COMM_MS / 1000;
    return reply(c, user, tx(s.lang, 'commWait', { sec: left }));
  }
  if (!me.hand.includes(card)) return reply(c, user, tx(s.lang, 'noSuchCard', { card: cardText(card) }));
  if (!legalCards(s, me).includes(card)) return reply(c, user, tx(s.lang, 'mustFollow', { color: tx(s.lang, `color.${colorOf(s.trick[0].card)}`) }));
  putCard(c, me, card);
  return true;
}

function putCard(c: Ctx, me: CPlayer, card: Card) {
  const s = c.s;
  me.hand = me.hand.filter((x) => x !== card);
  if (me.comm?.card === card) me.comm = undefined;
  s.trick.push({ id: me.id, card });
  s.seq++;
  if (s.trick.length < s.players.length) {
    s.turn = next(s, s.turn);
    c.events.push(tablePrompt(s));
    startTimer(c, PLAY_MS);
    return;
  }
  endTrick(c);
}

function endTrick(c: Ctx) {
  const s = c.s;
  const winner = trickWinner(s.trick);
  c.events.push(tablePrompt(s, true));
  const cards = new Set(s.trick.map((t) => t.card));
  const won = s.tasks.filter((t) => !t.done && cards.has(t.card));
  const fail = judge(s, winner, won);
  const doneText = !fail && won.length ? tx(s.lang, 'tasksDone', { who: mention(winner), tasks: won.map((t) => taskText({ ...t, done: true })).join(' ') }) : '';
  const cardsText = s.trick.map((t) => `${mention(t.id)} ${cardText(t.card)}`).join(sep(s));
  c.events.push({ type: 'announce', text: tx(s.lang, 'trickResult', { no: s.trickNo, cards: cardsText, who: mention(winner), done: doneText }) });
  if (fail) return endGame(c, 'fail', fail);
  for (const t of won) t.done = true;
  if (s.tasks.every((t) => t.done)) return endGame(c, 'success');
  if (s.trickNo >= s.tricks) return endGame(c, 'fail', tx(s.lang, 'outOfCards'));
  s.leader = s.players.findIndex((p) => p.id === winner);
  startTrick(c);
}

const ARROWS = ['>', '>>', '>>>', '>>>>'];

// 這墩打完時要不要失敗：任務被別人吃走、失能的人贏墩、違反順序標記；回傳失敗原因
function judge(s: CState, winner: string, won: CTask[]): string | undefined {
  const stolen = won.find((t) => t.owner !== winner);
  if (stolen) return tx(s.lang, 'stolen', { card: cardText(stolen.card), owner: mention(stolen.owner!), who: mention(winner) });
  if (winner === s.sick) return tx(s.lang, 'sickWon', { who: mention(winner) });
  const before = s.tasks.filter((t) => t.done).length;
  const after = before + won.length;
  const label = (t: CTask) => `${cardText(t.card)} (${t.token})`;
  for (const t of s.tasks.filter((x) => !x.done && x.token && /^\d$/.test(x.token))) {
    const n = Number(t.token);
    const now = won.includes(t);
    if ((now && !(before < n && n <= after)) || (!now && n <= after)) return tx(s.lang, 'wrongOrder', { task: label(t), n });
  }
  const omega = won.find((t) => t.token === 'Ω');
  if (omega && after < s.tasks.length) return tx(s.lang, 'omegaEarly', { task: label(omega) });
  for (const t of won.filter((x) => x.token?.startsWith('>'))) {
    const level = ARROWS.indexOf(t.token!);
    const early = s.tasks.find((x) => !x.done && !won.includes(x) && x.token?.startsWith('>') && ARROWS.indexOf(x.token) < level);
    if (early) return tx(s.lang, 'arrowOrder', { task: label(t), early: label(early) });
  }
  return undefined;
}

function endGame(c: Ctx, outcome: 'success' | 'fail', reason?: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.outcome = outcome;
  s.reason = reason;
  const win = outcome === 'success';
  if (win) {
    s.unlocked = Math.min(Math.max(s.unlocked, s.mission + 1), LAST_MISSION + 1);
    c.events.push({ type: 'crewProgress', unlocked: s.unlocked });
  }
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [], score: win ? s.mission : 0 }); // 合作遊戲：只記分數
  const allClear = win && s.mission === LAST_MISSION;
  const hands = s.players.map((p) => tx(s.lang, 'ownerLine', { who: mention(p.id), items: handText(s, p.hand) })).join('\n');
  const now = s.unlocked > LAST_MISSION ? tx(s.lang, 'progressAll') : tx(s.lang, 'progress', { n: s.unlocked });
  const name = missionText(s.lang, s.mission).name;
  c.events.push({
    type: 'announce',
    text: [
      win ? tx(s.lang, 'success', { n: s.mission, name }) : tx(s.lang, 'fail', { n: s.mission, name, reason: String(reason) }),
      ...(allClear ? [tx(s.lang, 'allClear')] : []),
      tx(s.lang, 'leftHands', { hands }),
      tx(s.lang, 'progressLine', { now }),
    ].join('\n'),
    gif: win ? 'goodWin' : undefined,
  });
  const label = !win ? tx(s.lang, 'retry', { n: s.mission }) : allClear ? tx(s.lang, 'replayLast', { n: LAST_MISSION }) : tx(s.lang, 'nextMission', { n: s.mission + 1 });
  c.events.push({ type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'continue'), options: [{ value: 'rematch', label }] });
}

// `/game crew level`：不帶數字列出已解鎖的關卡；帶數字是房主選關
const levelList = (lang: Lang | undefined, unlocked: number) =>
  tx(lang, 'levelList', { list: Array.from({ length: Math.min(unlocked, LAST_MISSION) }, (_, i) => `• ${missionLine(lang, i + 1)}`).join('\n') });

function roomError(s: CState, user: string, who: 'onlyHostLevel' | 'onlyHostReset'): string | undefined {
  if (user !== s.host) return tx(s.lang, who);
  if (s.phase !== 'lobby') return tx(s.lang, 'started');
  return undefined;
}

function chooseLevel(c: Ctx, user: string, n: number): boolean {
  const s = c.s;
  const err = roomError(s, user, 'onlyHostLevel');
  if (err) return reply(c, user, err);
  const max = Math.min(s.unlocked, LAST_MISSION);
  if (!Number.isInteger(n) || n < 1 || n > max) return reply(c, user, tx(s.lang, 'levelRange', { max }));
  s.mission = n;
  c.events.push(lobbyInfo(s));
  return true;
}

function askReset(c: Ctx, user: string): boolean {
  const err = roomError(c.s, user, 'onlyHostReset');
  if (err) return reply(c, user, err);
  c.events.push({
    type: 'prompt',
    kind: 'crew',
    audience: 'ephemeral',
    user,
    text: tx(c.s.lang, 'resetAsk', { n: Math.min(c.s.unlocked, LAST_MISSION) }),
    options: [{ value: 'resetConfirm', label: tx(c.s.lang, 'resetButton') }],
  });
  return false;
}

function resetProgress(c: Ctx, user: string): boolean {
  const s = c.s;
  const err = roomError(s, user, 'onlyHostReset');
  if (err) return reply(c, user, err);
  s.unlocked = 1;
  s.mission = 1;
  c.events.push({ type: 'crewProgress', unlocked: 1 }, { type: 'announce', text: tx(s.lang, 'resetDone') }, lobbyInfo(s));
  return true;
}

function trickTimeout(c: Ctx) {
  const s = c.s;
  if (!s.ready) {
    s.ready = true;
    c.events.push(tablePrompt(s));
    startTimer(c, PLAY_MS);
    return;
  }
  const me = s.players[s.turn];
  const card = autoCard(legalCards(s, me));
  c.events.push({ type: 'announce', text: tx(s.lang, 'autoPlay', { who: mention(me.id), card: cardText(card) }) });
  putCard(c, me, card);
}

function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = playerOf(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase === 'lobby') return reply(c, user, tx(s.lang, 'notStarted'));
  const mine = s.tasks.filter((t) => t.owner === user);
  const myTurn = s.phase === 'trick' && s.players[s.turn].id === user;
  c.events.push({
    type: 'prompt',
    kind: 'crew',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'handMenu', { hand: handText(s, me.hand), tasks: mine.length ? mine.map(taskText).join(' ') : tx(s.lang, 'none'), turn: myTurn ? tx(s.lang, 'yourTurn') : '' }),
    options: myTurn ? sortHand(legalCards(s, me)).map((card) => ({ value: `play:${s.seq}:${card}`, label: cardText(card) })) : [],
    perRow: 5,
  });
  return false;
}

const taskText = (t: CTask) => `${t.done ? '✅' : '⬜'}${cardText(t.card)}${t.token ? ` (${t.token})` : ''}`;

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CREW_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_CREW_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_CREW_PLAYERS }));
      startGame(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      return handMenu(c, action.user);
    case 'pick':
      return pickTask(c, action.user, action.seq, action.task);
    case 'answer':
      return answer(c, action.user, action.seq, action.yes);
    case 'assign':
      return assignTask(c, action.user, action.seq, action.target);
    case 'solo':
      return chooseSolo(c, action.user, action.seq, action.target);
    case 'sick':
      return chooseSick(c, action.user, action.seq, action.target);
    case 'timeout':
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'assign') assignTimeout(c);
      else trickTimeout(c);
      return true;
    case 'play':
      return playCard(c, action.user, action.seq, action.card);
    case 'comm':
      return commMenu(c, action.user);
    case 'commCard':
      return communicate(c, action.user, action.seq, action.card);
    case 'level':
      return action.n === undefined ? reply(c, action.user, levelList(s.lang, action.unlocked ?? s.unlocked)) : chooseLevel(c, action.user, action.n);
    case 'reset':
      return askReset(c, action.user);
    case 'resetConfirm':
      return resetProgress(c, action.user);
    case 'transfer':
      return transferMenu(c, action.user);
    case 'transferTo':
      return transferTask(c, action.user, action.seq, action.task, action.target);
    default:
      return false;
  }
}

const newPlayer = (id: string): CPlayer => ({ id, hand: [], commUsed: false });

export function applyCrew(state: CState | undefined, action: CAction, rng: Rng, now?: number): Result {
  const idle = !state || state.phase === 'ended';
  const lang = state?.lang; // 沒有進行中的房間：用上一局的語系 (沒有上一局就是中文)
  if (idle && action.type === 'level' && action.n === undefined) return { state: state!, events: [{ type: 'ephemeral', to: action.user, text: levelList(lang, action.unlocked ?? 1) }] };
  if (idle && (action.type === 'level' || action.type === 'reset')) return { state: state!, events: [{ type: 'ephemeral', to: action.user, text: tx(lang, 'newFirst') }] };
  return runGame(state, action, rng, {
    finished: (s) => !!s.outcome,
    isPlayer,
    createLobby: (prev, host, channel) =>
      createLobby(prev, host, channel, action.type === 'new' ? action.unlocked : undefined, action.type === 'new' || action.type === 'rematch' ? action.lang : undefined),
    handle,
    extra: { now },
  });
}

// lang：開房的語系，關卡資訊要用它 (runGame 之後才會把 lang 存進 state)
function createLobby(prev: CState | undefined, host: string, channel: string, unlockedNow?: number, lang?: Lang): Result {
  const unlocked = unlockedNow ?? prev?.unlocked ?? 1;
  const seq = (prev?.seq ?? 0) + 1;
  // 再來一局：成功打下一關 (最多第 40 關)、失敗重打同一關；開新房：已解鎖的最高關
  const rematch = unlockedNow === undefined && prev?.outcome;
  const mission = rematch ? Math.min(prev.mission + (prev.outcome === 'success' ? 1 : 0), LAST_MISSION) : Math.min(unlocked, LAST_MISSION);
  const created: CState = {
    game: 'crew',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    mission,
    unlocked,
    commander: 0,
    tasks: [],
    picker: 0,
    answers: {},
    tricks: 0,
    trickNo: 0,
    leader: 0,
    turn: 0,
    trick: [],
    ready: false,
    transferUsed: false,
    ref: `crew:${seq}:lobby`,
    seq,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created), lobbyInfo({ ...created, lang })] };
}
