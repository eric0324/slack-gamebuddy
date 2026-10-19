// 星際探險隊（The Crew）遊戲引擎：合作吃墩，純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCrew(state, action, rng, now) → { state, events }。
// now 是現在的時間（毫秒），只用來顯示通訊時間還剩幾秒；計時本身靠 startTimer。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { CREW_MISSIONS, ruleLabel, type Rule, type Token } from './crewMissions.js';

export const MIN_CREW_PLAYERS = 3;
export const MAX_CREW_PLAYERS = 5;
export const LAST_MISSION = CREW_MISSIONS.length;
const TITLE = '星際探險隊';

export type Color = 'blue' | 'green' | 'yellow' | 'purple' | 'rocket';
export type Card = `${Color}:${number}`;
const COLORS: Color[] = ['blue', 'green', 'yellow', 'purple', 'rocket'];
const EMOJI: Record<Color, string> = { blue: '🟦', green: '🟩', yellow: '🟨', purple: '🟪', rocket: '🚀' };
const COLOR_NAME: Record<Color, string> = { blue: '藍色', green: '綠色', yellow: '黃色', purple: '紫色', rocket: '火箭' };

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
  commEnds?: number; // 通訊時間結束的時間（有 now 時才有）
  transferUsed: boolean;
  outcome?: 'success' | 'fail';
  reason?: string;
  ref: string; // 目前的牌桌（或分配）訊息
  seq: number; // 擋掉舊按鈕
  timerSeq: number;
  timers: { phase?: number };
}

export type CAction =
  | { type: 'new'; user: string; channel: string; unlocked?: number } // unlocked 由 adapter 帶入
  | { type: 'rematch'; user: string; channel: string }
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
const handText = (hand: Card[]) => (hand.length ? hand.map(cardText).join(' ') : '（沒有）');

const missionOf = (s: CState) => CREW_MISSIONS[s.mission - 1];
const hasRule = (s: CState, rule: Rule) => missionOf(s).rules.includes(rule);
const isPlayer = (s: CState, user: string) => s.players.some((p) => p.id === user);
const playerOf = (s: CState, user: string) => s.players.find((p) => p.id === user);
const next = (s: CState, i: number) => (i + 1) % s.players.length;

// 一關的簡介：編號、名稱、任務數、標記、特殊規則
function missionLine(n: number): string {
  const m = CREW_MISSIONS[n - 1];
  const extras = [m.tokens.length ? `順序標記 ${m.tokens.join(' ')}` : '', ...m.rules.map(ruleLabel)].filter(Boolean);
  return `第 ${n} 關「${m.name}」${m.tasks} 個任務${extras.length ? `，${extras.join('、')}` : ''}`;
}

// 房間公告下面的關卡資訊（改關時用同一個 ref 更新）
function lobbyInfo(s: CState): GameEvent {
  const m = missionOf(s);
  const done = s.unlocked > LAST_MISSION ? '\n🏆 這個頻道已經全破，可以選任何一關重玩' : '';
  return {
    type: 'prompt',
    kind: 'crew',
    audience: 'channel',
    ref: s.ref,
    text: `🚀 這局要打 ${missionLine(s.mission)}\n📖 ${m.story}\n房主可以用 \`/game crew level <n>\` 選第 1～${Math.min(s.unlocked, LAST_MISSION)} 關${done}`,
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
  const m = missionOf(s);
  deal(c);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'assign' }));
  c.events.push({
    type: 'announce',
    text: [
      `🚀 星際探險隊 ${missionLine(s.mission)}`,
      `📖 ${m.story}`,
      `👨‍🚀 ${mention(s.players[s.commander].id)} 是指揮官（持有 🚀4），先挑任務、領第一墩。總共 ${s.tricks} 墩。`,
      '規則：要跟出領出的顏色，沒有才能墊別的顏色或出火箭；有火箭時最大的火箭贏，否則領出顏色最大的贏。擁有任務的人要親自吃下那張牌。每人每關可以通訊一次。',
      '🤫 請不要在頻道討論手牌，只靠出牌和通訊溝通。',
    ].join('\n'),
  });
  for (const p of s.players) c.events.push({ type: 'dm', to: p.id, text: `🚀 星際探險隊第 ${s.mission} 關，你的手牌：${handText(p.hand)}` });
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
  const hand = { value: 'hand', label: '🃏 手牌' };
  const others = s.players.filter((p) => p.id !== cmd);
  const answers = (yes: string, no: string) =>
    Object.keys(s.answers).length ? `\n${Object.entries(s.answers).map(([id, a]) => `${mention(id)} ${a ? yes : no}`).join('、')}` : '';
  let text: string;
  let options: { value: string; label: string }[];
  if (s.step === 'sick') {
    text = `🤒 隊員失能：請指揮官 ${mention(cmd)} 指定一位隊員整關失能（不挑任務、整關不能贏任何一墩）（${ASSIGN_MS / 1000} 秒）`;
    options = [...others.map((p) => ({ value: `sick:${s.seq}:${p.id}`, label: p.id })), hand];
  } else if (s.step === 'solo') {
    const tokens = missionOf(s).tokens;
    text = `🎯 單人任務：這關有 ${s.tasks.length} 張任務${tokens.length ? `（順序標記 ${tokens.join(' ')}）` : ''}，要由一個人包辦。看完手牌後回答能不能包辦，指揮官 ${mention(cmd)} 選一個人（不能選自己）（${ASSIGN_MS / 1000} 秒）${answers('🙋 可以', '🙅 不行')}`;
    options = [
      { value: `answer:${s.seq}:yes`, label: '🙋 可以' },
      { value: `answer:${s.seq}:no`, label: '🙅 不行' },
      ...others.map((p) => ({ value: `solo:${s.seq}:${p.id}`, label: p.id })),
      hand,
    ];
  } else if (s.step === 'commander') {
    const t = s.tasks[s.picker];
    text = `🎖️ 指揮官指派：第 ${s.picker + 1}/${s.tasks.length} 張任務：${cardText(t.card)}${t.token ? `（${t.token}）` : ''}\n大家按「🙋 要」或「🙅 不要」表態，指揮官 ${mention(cmd)} 指定給誰（任務要平均分配）（${ASSIGN_MS / 1000} 秒）${answers('🙋 要', '🙅 不要')}`;
    options = [
      { value: `answer:${s.seq}:yes`, label: '🙋 要' },
      { value: `answer:${s.seq}:no`, label: '🙅 不要' },
      ...s.players.filter((p) => p.id !== s.sick).map((p) => ({ value: `assign:${s.seq}:${p.id}`, label: p.id })),
      hand,
    ];
  } else {
    text = `🎯 挑任務：輪到 ${mention(s.players[s.picker].id)} 挑任務（${PICK_MS / 1000} 秒）\n${tasksSummary(s)}`;
    options = [...s.tasks.flatMap((t, i) => (t.owner ? [] : [{ value: `pick:${s.seq}:${i}`, label: cardText(t.card) + (t.token ? `（${t.token}）` : '') }])), hand];
  }
  return { type: 'prompt', kind: 'crew', audience: 'channel', ref: s.ref, text, options, perRow: 5 };
}

// 每張任務和它的主人
const tasksSummary = (s: CState) =>
  s.tasks.map((t) => `${t.token ? `${cardText(t.card)}（${t.token}）` : cardText(t.card)}${t.owner ? ` → ${mention(t.owner)}` : ''}`).join('、');

function assignError(s: CState, user: string, seq: number, step: Step): string | undefined {
  if (!isPlayer(s, user)) return '你不在遊戲中。';
  if (s.phase !== 'assign' || s.step !== step || seq !== s.seq) return '這個按鈕已經過期了。';
  return undefined;
}

function pickTask(c: Ctx, user: string, seq: number, task: number): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'pick');
  if (err) return reply(c, user, err);
  if (s.players[s.picker].id !== user) return reply(c, user, `還沒輪到你，現在是 ${mention(s.players[s.picker].id)} 在挑任務。`);
  const t = s.tasks[task];
  if (!t || t.owner) return reply(c, user, '這張任務已經被挑走了。');
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
  if (!isPlayer(s, user)) return reply(c, user, '你不在遊戲中。');
  if (s.phase !== 'assign' || (s.step !== 'commander' && s.step !== 'solo') || seq !== s.seq) return reply(c, user, '這個按鈕已經過期了。');
  if (s.step === 'solo' && user === s.players[s.commander].id) return reply(c, user, '指揮官不用回答，請選一位隊員。');
  s.answers[user] = yes;
  c.events.push(assignPrompt(s));
  return true;
}

function assignTask(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'commander');
  if (err) return reply(c, user, err);
  if (user !== s.players[s.commander].id) return reply(c, user, '只有指揮官可以指派任務。');
  if (!isPlayer(s, target) || target === s.sick) return reply(c, user, '不能指派給這位玩家。');
  if (taskCount(s, target) + 1 - lowestAfter(s, target) >= 2) return reply(c, user, '任務要平均分配：任何人不能比任務最少的人多 2 張以上。');
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
  c.events.push({ type: 'announce', text: `🎖️ ${cardText(s.tasks[s.picker].card)} 指派給 ${mention(target)}` });
  if (s.tasks.every((t) => t.owner)) return finishAssign(c);
  s.picker++;
  askStep(c, 'commander');
}

function chooseSolo(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'solo');
  if (err) return reply(c, user, err);
  if (user !== s.players[s.commander].id) return reply(c, user, '只有指揮官可以選人。');
  if (target === user) return reply(c, user, '不能選自己。');
  if (!isPlayer(s, target)) return false;
  giveAll(c, target);
  return true;
}

function giveAll(c: Ctx, target: string) {
  for (const t of c.s.tasks) t.owner = target;
  c.events.push({ type: 'announce', text: `🎯 由 ${mention(target)} 包辦全部任務：${tasksSummary(c.s)}` });
  finishAssign(c);
}

function chooseSick(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = assignError(s, user, seq, 'sick');
  if (err) return reply(c, user, err);
  if (user !== s.players[s.commander].id) return reply(c, user, '只有指揮官可以指定失能的隊員。');
  if (target === user) return reply(c, user, '不能選自己。');
  if (!isPlayer(s, target)) return false;
  setSick(c, target);
  return true;
}

function setSick(c: Ctx, target: string) {
  c.s.sick = target;
  c.events.push({ type: 'announce', text: `🤒 ${mention(target)} 失能：這關不挑任務，也不能贏任何一墩。` });
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
  c.events.push({ type: 'prompt', kind: 'crew', audience: 'channel', ref: s.ref, text: `🎯 任務分配完成：${tasksSummary(s)}`, options: [] });
  const lines = s.players.filter((p) => taskCount(s, p.id)).map((p) => `${mention(p.id)}：${s.tasks.filter((t) => t.owner === p.id).map(taskText).join(' ')}`);
  c.events.push({ type: 'announce', text: `🎯 每個人的任務：\n${lines.join('\n')}` });
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

const posText = (pos: CommPos) => ({ top: '最大', only: '唯一', bottom: '最小' })[pos];

function tablePrompt(s: CState, done = false): GameEvent {
  const m = missionOf(s);
  const status = done
    ? '這墩結束'
    : s.ready
      ? `輪到 ${mention(s.players[s.turn].id)} 出牌（${PLAY_MS / 60_000} 分鐘）`
      : `📡 通訊時間：${COMM_MS / 1000} 秒後才能出牌，${mention(s.players[s.turn].id)} 領出`;
  const played = s.trick.length ? s.trick.map((t) => `${mention(t.id)} ${cardText(t.card)}`).join('、') : '還沒有人出牌';
  const rows = s.players.map((p) => {
    const mine = s.tasks.filter((t) => t.owner === p.id);
    const comm = p.comm ? `　📡 ${cardText(p.comm.card)}${hasRule(s, 'deadZone') ? '' : `（${posText(p.comm.pos)}）`}` : '';
    const sick = p.id === s.sick ? ' 🤒 失能' : '';
    return `• ${mention(p.id)}${sick}（手牌 ${p.hand.length} 張）${mine.length ? `　任務 ${mine.map(taskText).join(' ')}` : ''}${comm}`;
  });
  const options = done ? [] : [{ value: 'hand', label: '🃏 手牌' }, ...(hasRule(s, 'silence') ? [] : [{ value: 'comm', label: '📡 通訊' }]), ...transferOption(s)];
  return {
    type: 'prompt',
    kind: 'crew',
    audience: 'channel',
    ref: s.ref,
    text: `🚀 第 ${s.mission} 關「${m.name}」第 ${s.trickNo}/${s.tricks} 墩：${status}\n這墩：${played}\n${rows.join('\n')}`,
    options,
  };
}

// 5 人局轉交任務：第 15 關以後、沒有單人任務和指揮官指派
const TRANSFER_FROM = 15;
const canTransfer = (s: CState) => s.players.length === 5 && s.mission >= TRANSFER_FROM && !hasRule(s, 'solo') && !hasRule(s, 'commanderPick');
const transferOpen = (s: CState) => canTransfer(s) && !s.transferUsed && s.trickNo === 1 && !s.trick.length;
const transferOption = (s: CState) => (transferOpen(s) ? [{ value: 'transfer', label: '🔁 轉交任務' }] : []);

function transferError(s: CState, user: string): string | undefined {
  if (!isPlayer(s, user)) return '你不在遊戲中。';
  if (!canTransfer(s) || s.phase !== 'trick') return '這關不能轉交任務。';
  if (s.transferUsed) return '這關已經轉交過任務了。';
  if (!transferOpen(s)) return '只能在第一墩出牌前轉交任務。';
  if (!s.tasks.some((t) => t.owner === user && !t.done)) return '你沒有任務可以轉交。';
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
    text: '🔁 選一張你的任務和要交給誰（每關限一次）：',
    options: s.tasks.flatMap((t, i) => (t.owner === user ? targets.map((p) => ({ value: `transferTo:${s.seq}:${i}:${p.id}`, label: `${cardText(t.card)} → ${p.id}` })) : [])),
    perRow: 4,
  });
  return false;
}

function transferTask(c: Ctx, user: string, seq: number, task: number, target: string): boolean {
  const s = c.s;
  const err = transferError(s, user);
  if (err) return reply(c, user, err);
  if (seq !== s.seq) return reply(c, user, '這個按鈕已經過期了。');
  const t = s.tasks[task];
  if (!t || t.owner !== user) return reply(c, user, '這不是你的任務。');
  if (target === user || target === s.sick || !isPlayer(s, target)) return reply(c, user, '不能交給這位玩家。');
  t.owner = target;
  s.transferUsed = true;
  c.events.push({ type: 'announce', text: `🔁 ${mention(user)} 把任務 ${cardText(t.card)} 轉交給 ${mention(target)}` }, tablePrompt(s));
  return true;
}

// 可以通訊的牌：每種顏色（火箭除外）最小、最大或唯一的那張
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
  if (!me) return '你不在遊戲中。';
  if (s.phase !== 'trick') return '任務分配完成後才能通訊。';
  if (hasRule(s, 'silence')) return '📴 這關無線電靜默，不能通訊。';
  if (me.commUsed) return '這關已經通訊過了。';
  const delay = missionOf(s).rules.find((r) => r.startsWith('delay:'));
  if (delay && s.trickNo < Number(delay.slice(6))) return `⏳ 這關通訊延遲，從第 ${delay.slice(6)} 墩起才能通訊。`;
  if (s.trick.length) return '這墩已經有人出牌了，要等這墩結束才能通訊。';
  return undefined;
}

function commMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const err = commError(s, user);
  if (err) return reply(c, user, err);
  const choices = commChoices(playerOf(s, user)!.hand);
  if (!choices.length) return reply(c, user, '你手上沒有可以通訊的牌。');
  c.events.push({
    type: 'prompt',
    kind: 'crew',
    audience: 'ephemeral',
    user,
    text: '📡 選一張牌通訊（每關一次，火箭不能通訊）：',
    options: choices.map((x) => ({ value: `commCard:${s.seq}:${x.card}`, label: `${cardText(x.card)}（${posText(x.pos)}）` })),
    perRow: 4,
  });
  return false;
}

function communicate(c: Ctx, user: string, seq: number, card: Card): boolean {
  const s = c.s;
  const err = commError(s, user);
  if (err) return reply(c, user, err);
  if (seq !== s.seq) return reply(c, user, '這個通訊選單已經過期了，請重新按「📡 通訊」。');
  const me = playerOf(s, user)!;
  const choice = commChoices(me.hand).find((x) => x.card === card);
  if (!choice) return reply(c, user, `${cardText(card)} 不能通訊：只能通訊某個顏色最大、最小或唯一的牌。`);
  me.comm = choice;
  me.commUsed = true;
  const what = hasRule(s, 'deadZone') ? `${cardText(card)}（位置不公開）` : `${cardText(card)} 是我${COLOR_NAME[colorOf(card)]}${posText(choice.pos)}的`;
  c.events.push({ type: 'announce', text: `📡 ${mention(user)} 通訊：${what}` }, tablePrompt(s));
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

// 逾時代出：彩色牌中數字最小的（同數依顏色順序），只剩火箭時出最小的火箭
function autoCard(cards: Card[]): Card {
  const colored = cards.filter((card) => colorOf(card) !== 'rocket');
  const pool = colored.length ? colored : cards;
  return [...pool].sort((a, b) => numOf(a) - numOf(b) || COLORS.indexOf(colorOf(a)) - COLORS.indexOf(colorOf(b)))[0];
}

function playCard(c: Ctx, user: string, seq: number, card: Card): boolean {
  const s = c.s;
  const me = playerOf(s, user);
  if (!me) return reply(c, user, '你不在遊戲中。');
  if (s.phase !== 'trick') return reply(c, user, '現在還不能出牌。');
  if (seq !== s.seq) return reply(c, user, '這個出牌按鈕已經過期了，請重新按「🃏 手牌」。');
  if (s.players[s.turn].id !== user) return reply(c, user, `還沒輪到你，現在輪到 ${mention(s.players[s.turn].id)}。`);
  if (!s.ready) {
    const left = s.commEnds !== undefined && c.now !== undefined ? Math.max(1, Math.ceil((s.commEnds - c.now) / 1000)) : COMM_MS / 1000;
    return reply(c, user, `通訊時間，${left} 秒後才能出牌。`);
  }
  if (!me.hand.includes(card)) return reply(c, user, `你手上沒有 ${cardText(card)}。`);
  if (!legalCards(s, me).includes(card)) return reply(c, user, `要跟出領出的顏色（${COLOR_NAME[colorOf(s.trick[0].card)]}）。`);
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
  const doneText = !fail && won.length ? `\n🎯 ${mention(winner)} 完成任務 ${won.map((t) => taskText({ ...t, done: true })).join(' ')}` : '';
  c.events.push({ type: 'announce', text: `🃏 第 ${s.trickNo} 墩：${s.trick.map((t) => `${mention(t.id)} ${cardText(t.card)}`).join('、')}\n🏅 ${mention(winner)} 贏了第 ${s.trickNo} 墩${doneText}` });
  if (fail) return endGame(c, 'fail', fail);
  for (const t of won) t.done = true;
  if (s.tasks.every((t) => t.done)) return endGame(c, 'success');
  if (s.trickNo >= s.tricks) return endGame(c, 'fail', '牌都打完了，還有任務沒有完成。');
  s.leader = s.players.findIndex((p) => p.id === winner);
  startTrick(c);
}

const ARROWS = ['>', '>>', '>>>', '>>>>'];

// 這墩打完時要不要失敗：任務被別人吃走、失能的人贏墩、違反順序標記；回傳失敗原因
function judge(s: CState, winner: string, won: CTask[]): string | undefined {
  const stolen = won.find((t) => t.owner !== winner);
  if (stolen) return `${cardText(stolen.card)} 是 ${mention(stolen.owner!)} 的任務，被 ${mention(winner)} 吃走了。`;
  if (winner === s.sick) return `${mention(winner)} 失能時不能贏墩。`;
  const before = s.tasks.filter((t) => t.done).length;
  const after = before + won.length;
  const label = (t: CTask) => `${cardText(t.card)}（${t.token}）`;
  for (const t of s.tasks.filter((x) => !x.done && x.token && /^\d$/.test(x.token))) {
    const n = Number(t.token);
    const now = won.includes(t);
    if (now && !(before < n && n <= after)) return `${label(t)} 要第 ${n} 個完成，順序錯了。`;
    if (!now && n <= after) return `${label(t)} 要第 ${n} 個完成，順序錯了。`;
  }
  const omega = won.find((t) => t.token === 'Ω');
  if (omega && after < s.tasks.length) return `${label(omega)} 要最後完成，還有其他任務沒完成。`;
  for (const t of won.filter((x) => x.token?.startsWith('>'))) {
    const level = ARROWS.indexOf(t.token!);
    const early = s.tasks.find((x) => !x.done && !won.includes(x) && x.token?.startsWith('>') && ARROWS.indexOf(x.token) < level);
    if (early) return `${label(t)} 要在 ${label(early)} 之後完成，順序錯了。`;
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
  const hands = s.players.map((p) => `${mention(p.id)}：${handText(p.hand)}`).join('\n');
  const now = s.unlocked > LAST_MISSION ? '這個頻道已經全破 40 關' : `這個頻道目前解鎖到第 ${s.unlocked} 關`;
  c.events.push({
    type: 'announce',
    text: [
      win ? `🎉 第 ${s.mission} 關「${missionOf(s).name}」成功！` : `💥 第 ${s.mission} 關「${missionOf(s).name}」失敗：${reason}`,
      ...(allClear ? ['🏆 恭喜全破！抵達第九行星，40 關全部通過！'] : []),
      `🃏 剩下的手牌：\n${hands}`,
      `🗺️ ${now}`,
    ].join('\n'),
    gif: win ? 'goodWin' : undefined,
  });
  const label = !win ? `🔁 重打第 ${s.mission} 關` : allClear ? `🔁 再打第 ${LAST_MISSION} 關` : `🚀 下一關（第 ${s.mission + 1} 關）`;
  c.events.push({ type: 'prompt', kind: 'rematch', audience: 'channel', text: '要繼續嗎？', options: [{ value: 'rematch', label }] });
}

// `/game crew level`：不帶數字列出已解鎖的關卡；帶數字是房主選關
const levelList = (unlocked: number) =>
  `🗺️ 這個頻道已解鎖的關卡：\n${Array.from({ length: Math.min(unlocked, LAST_MISSION) }, (_, i) => `• ${missionLine(i + 1)}`).join('\n')}`;

function roomError(s: CState, user: string, who: string): string | undefined {
  if (user !== s.host) return `只有房主可以${who}。`;
  if (s.phase !== 'lobby') return '遊戲已經開始了。';
  return undefined;
}

function chooseLevel(c: Ctx, user: string, n: number): boolean {
  const s = c.s;
  const err = roomError(s, user, '選關');
  if (err) return reply(c, user, err);
  const max = Math.min(s.unlocked, LAST_MISSION);
  if (!Number.isInteger(n) || n < 1 || n > max) return reply(c, user, `可以選第 1～${max} 關。`);
  s.mission = n;
  c.events.push(lobbyInfo(s));
  return true;
}

function askReset(c: Ctx, user: string): boolean {
  const err = roomError(c.s, user, '重設進度');
  if (err) return reply(c, user, err);
  c.events.push({
    type: 'prompt',
    kind: 'crew',
    audience: 'ephemeral',
    user,
    text: `⚠️ 確定要重設這個頻道的星際探險隊進度嗎？目前解鎖到第 ${Math.min(c.s.unlocked, LAST_MISSION)} 關，重設後只剩第 1 關。`,
    options: [{ value: 'resetConfirm', label: '⚠️ 確定重設' }],
  });
  return false;
}

function resetProgress(c: Ctx, user: string): boolean {
  const s = c.s;
  const err = roomError(s, user, '重設進度');
  if (err) return reply(c, user, err);
  s.unlocked = 1;
  s.mission = 1;
  c.events.push({ type: 'crewProgress', unlocked: 1 }, { type: 'announce', text: '🗺️ 星際探險隊的進度已重設，從第 1 關重新開始。' }, lobbyInfo(s));
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
  c.events.push({ type: 'announce', text: `⏰ 逾時，系統替 ${mention(me.id)} 出了 ${cardText(card)}` });
  putCard(c, me, card);
}

function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = playerOf(s, user);
  if (!me) return reply(c, user, '你不在遊戲中。');
  if (s.phase === 'lobby') return reply(c, user, '遊戲還沒開始。');
  const mine = s.tasks.filter((t) => t.owner === user);
  const myTurn = s.phase === 'trick' && s.players[s.turn].id === user;
  c.events.push({
    type: 'prompt',
    kind: 'crew',
    audience: 'ephemeral',
    user,
    text: `🃏 你的手牌：${handText(me.hand)}\n🎯 你的任務：${mine.length ? mine.map(taskText).join(' ') : '（沒有）'}${myTurn ? '\n👉 輪到你出牌，選一張：' : ''}`,
    options: myTurn ? sortHand(legalCards(s, me)).map((card) => ({ value: `play:${s.seq}:${card}`, label: cardText(card) })) : [],
    perRow: 5,
  });
  return false;
}

const taskText = (t: CTask) => `${t.done ? '✅' : '⬜'}${cardText(t.card)}${t.token ? `（${t.token}）` : ''}`;

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CREW_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '星際探險隊不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_CREW_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_CREW_PLAYERS} 人才能開始。`);
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
      return action.n === undefined ? reply(c, action.user, levelList(action.unlocked ?? s.unlocked)) : chooseLevel(c, action.user, action.n);
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
  if (idle && action.type === 'level' && action.n === undefined) return { state: state!, events: [{ type: 'ephemeral', to: action.user, text: levelList(action.unlocked ?? 1) }] };
  if (idle && (action.type === 'level' || action.type === 'reset')) return { state: state!, events: [{ type: 'ephemeral', to: action.user, text: '請先用 `/game crew new` 開房。' }] };
  return runGame(state, action, rng, {
    finished: (s) => !!s.outcome,
    isPlayer,
    createLobby: (prev, host, channel) => createLobby(prev, host, channel, action.type === 'new' ? action.unlocked : undefined),
    handle,
    extra: { now },
  });
}

function createLobby(prev: CState | undefined, host: string, channel: string, unlockedNow?: number): Result {
  const unlocked = unlockedNow ?? prev?.unlocked ?? 1;
  const seq = (prev?.seq ?? 0) + 1;
  // 再來一局：成功打下一關（最多第 40 關）、失敗重打同一關；開新房：已解鎖的最高關
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
  return { state: created, events: [lobbyEvent(TITLE, created), lobbyInfo(created)] };
}
