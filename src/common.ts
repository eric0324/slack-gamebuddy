// 各遊戲 engine 共用的小工具：洗牌、只讓某人看到的回覆、階段計時、房間公告，以及房間邏輯（加入、離開、bot、取消、開房和再來一局）
import { randomBotName } from './botLines.js';
import { isBot, type GameEvent, type Rng } from './engine.js';

// Fisher–Yates 洗牌，回傳新陣列，不改原陣列
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 只讓某人看到的訊息；回傳 false 表示 state 沒變
export const reply = (c: { events: GameEvent[] }, to: string, text: string) => {
  c.events.push({ type: 'ephemeral', to, text });
  return false;
};

// 開一個新的階段計時器：舊的計時器 id 對不上，觸發時會被忽略
export function startTimer(c: { s: { timerSeq: number; timers: { phase?: number } }; events: GameEvent[] }, ms: number) {
  c.s.timers.phase = ++c.s.timerSeq;
  c.events.push({ type: 'startTimer', id: c.s.timerSeq, ms });
}

// 房間公告：玩家名單和是否還能加入
export const lobbyEvent = (title: string, s: { host: string; phase: string; players: { id: string }[] }): GameEvent => ({
  type: 'lobby',
  title,
  host: s.host,
  players: s.players.map((p) => p.id),
  open: s.phase === 'lobby',
});

// 房間：各遊戲的 state 至少有這些欄位
type Room<P> = { host: string; phase: string; players: P[] };
type RoomCtx<P> = { s: Room<P>; events: GameEvent[]; rng: Rng };

export function joinRoom<P extends { id: string }>(c: RoomCtx<P>, title: string, user: string, max: number, newPlayer: (id: string) => P): boolean {
  const s = c.s;
  if (s.phase !== 'lobby') return reply(c, user, '遊戲已經開始了。');
  if (s.players.some((p) => p.id === user)) return reply(c, user, '你已經在房間裡了。');
  if (s.players.length >= max) return reply(c, user, '房間已滿。');
  s.players.push(newPlayer(user));
  c.events.push(lobbyEvent(title, s));
  return true;
}

// 房主離開就取消房間
export function leaveRoom<P extends { id: string }>(c: RoomCtx<P>, title: string, user: string): boolean {
  const s = c.s;
  if (!s.players.some((p) => p.id === user)) return false;
  if (s.phase !== 'lobby') return reply(c, user, '遊戲已經開始了，不能離開。');
  if (user === s.host) {
    s.phase = 'ended';
    c.events.push(lobbyEvent(title, s), { type: 'announce', text: '🛑 房主離開，遊戲已取消。' });
    return true;
  }
  s.players = s.players.filter((p) => p.id !== user);
  c.events.push(lobbyEvent(title, s));
  return true;
}

// bot 的 id 是 `bot:<編號>:<名字>`，編號接續現有的 bot，名字不重複
export function addBots<P extends { id: string }>(c: RoomCtx<P>, title: string, user: string, count: number, max: number, newPlayer: (id: string) => P): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以加入 bot。');
  if (s.phase !== 'lobby') return reply(c, user, '遊戲已經開始了。');
  const room = max - s.players.length;
  const bots = s.players.filter((p) => isBot(p.id)).length;
  const taken = new Set(s.players.filter((p) => isBot(p.id)).map((p) => p.id.split(':')[2]));
  for (let i = 1; i <= Math.min(count, room); i++) {
    const name = randomBotName(c.rng, taken);
    taken.add(name);
    s.players.push(newPlayer(`bot:${bots + i}:${name}`));
  }
  if (room > 0) c.events.push(lobbyEvent(title, s));
  if (count > room) reply(c, user, '房間已滿。');
  return room > 0;
}

// 從最後加入的 bot 開始移除
export function removeBots<P extends { id: string }>(c: RoomCtx<P>, title: string, user: string, count: number): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以移除 bot。');
  if (s.phase !== 'lobby') return reply(c, user, '遊戲已經開始了。');
  const bots = s.players.filter((p) => isBot(p.id));
  if (!bots.length) return reply(c, user, '房間裡沒有 bot。');
  const removed = new Set(bots.slice(-count).map((p) => p.id));
  s.players = s.players.filter((p) => !removed.has(p.id));
  c.events.push(lobbyEvent(title, s));
  return true;
}

// 房主取消遊戲；extra 是附加在公告後面的文字（例如公布答案）
export function cancelGame(c: { s: { host: string; phase: string; timers: object }; events: GameEvent[] }, user: string, extra = ''): boolean {
  if (user !== c.s.host) return reply(c, user, '只有房主可以取消遊戲。');
  c.s.phase = 'ended';
  c.s.timers = {};
  c.events.push({ type: 'announce', text: `🛑 房主已取消遊戲。${extra}` });
  return true;
}

type Result<S> = { state: S; events: GameEvent[] };
type RoomAction = { type: 'new'; user: string; channel: string } | { type: 'rematch'; user: string; channel: string };

// 每款遊戲 applyX 的外殼：開房、再來一局、遊戲結束後忽略，其他 action 交給 handle（在複製的 state 上改）
export function runGame<S extends { phase: string }, A extends { type: string }, C extends { s: S; events: GameEvent[]; rng: Rng }>(
  state: S | undefined,
  action: A,
  rng: Rng,
  opts: {
    finished(s: S): boolean; // 正常結束（取消的不算），才能再來一局
    isPlayer(s: S, user: string): boolean;
    createLobby(prev: S | undefined, host: string, channel: string): Result<S>;
    handle(c: C, action: Exclude<A, RoomAction>): boolean;
    afterChange?(c: C): void; // state 有變時接著做的事（例如讓 bot 行動）
    extra?: Omit<C, 's' | 'events' | 'rng'>; // ctx 的額外欄位
  },
): Result<S> {
  const busy = (user: string): Result<S> => ({ state: state!, events: [{ type: 'ephemeral', to: user, text: '這個頻道已經有遊戲了。' }] });
  if (action.type === 'new' || action.type === 'rematch') {
    const { user, channel } = action as unknown as RoomAction;
    if (action.type === 'new') return state && state.phase !== 'ended' ? busy(user) : opts.createLobby(state, user, channel);
    if (!state) return { state: state!, events: [] };
    if (state.phase !== 'ended') return busy(user);
    if (!opts.finished(state)) return { state, events: [] };
    if (isBot(user) || !opts.isPlayer(state, user)) {
      return { state, events: [{ type: 'ephemeral', to: user, text: '只有上一局的玩家可以開新的一局。' }] };
    }
    return opts.createLobby(state, user, channel);
  }
  if (!state || state.phase === 'ended') return { state: state!, events: [] };
  const c = { ...opts.extra, s: structuredClone(state), events: [], rng } as unknown as C;
  const changed = opts.handle(c, action as Exclude<A, RoomAction>);
  if (changed) opts.afterChange?.(c);
  return { state: changed ? c.s : state, events: c.events };
}
