// Slack adapter：把 slash command 和按鈕轉成 engine action，再把 engine event 轉成 Slack API 呼叫。
import { applyAction, isBot, MAX_PLAYERS, mention, RULES_URL, type Action, type GameEvent, type GameState, type GifKey, type Rng } from './engine.js';
import { GIFS } from './gifs.js';
import { checkImage, LIBRARY_COMMANDS, memeLibraryCommand } from './memeLibrary.js';
import type { MemeStore } from './memeStore.js';
import type { CrewStore } from './crewStore.js';
import { formatLeaderboard, formatStats, formatSummary, type StatsStore } from './stats.js';
import { GAMES, type GameKind, type StateOf } from './games/index.js';
import { WIKI, type GameDef } from './games/types.js';

type Kind = 'werewolf' | GameKind;
type OtherKind = GameKind;

// 狼人殺以外的遊戲：代號 → 設定（engine、指令解析、按鈕對應、說明、大廳資訊）
const DEFS = Object.fromEntries(GAMES.map((g) => [g.kind, g])) as unknown as Record<GameKind, GameDef<any, any>>;

// 只列出用到的 WebClient 方法，測試時可以換成假的 client
export interface SlackClient {
  chat: {
    postMessage(args: any): Promise<any>;
    update(args: any): Promise<any>;
    postEphemeral(args: any): Promise<any>;
  };
  conversations: {
    open(args: any): Promise<any>;
  };
  views: {
    open(args: any): Promise<any>;
  };
}

export interface HostOptions {
  rng?: Rng;
  gifs?: Partial<Record<GifKey, string[]>>;
  stats?: StatsStore;
  setTimer?: (fn: () => void, ms: number) => void;
  respond?: (url: string, payload: object) => Promise<void>; // 用按鈕的 response_url 換掉 ephemeral 訊息
  memes?: MemeStore; // 梗圖大亂鬥的頻道梗圖庫
  crew?: CrewStore; // 星際探險隊的頻道戰役進度
  checkImage?: (url: string) => Promise<boolean>; // 投稿梗圖時確認網址是圖片
}

const postJson = async (url: string, payload: object) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`response_url ${res.status}`);
};

const HELP = [
  '*狼人殺指令*',
  '• `/werewolf new`：開房（任何人）',
  '• `/werewolf addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/werewolf removebot [數量]`：移除 bot（房主，開始前）',
  '• `/werewolf start`：開始遊戲，需要 6～12 人（房主）',
  '• `/werewolf next`：跳過目前的發言者或遺言（房主）',
  '• `/werewolf vote`：結束輪流發言，直接投票（房主）',
  '• `/werewolf cancel`：取消遊戲（房主）',
  '• `/werewolf stats [@某人]`：查詢自己或別人在這個頻道的戰績（任何人）',
  `📖 完整說明：<${encodeURI('https://github.com/eric0324/slack-gamebuddy/wiki/狼人殺-指令')}|指令>、<${RULES_URL}|遊戲規則>`,
].join('\n');

const GAME_LIST = [
  '*可以玩的遊戲*',
  '• 🐺 *狼人殺*（`werewolf`）：6～12 人，開房 `/game werewolf new`（或 `/werewolf new`）',
  ...GAMES.map((g) => `• ${g.emoji} *${g.name}*（\`${g.kind}\`）：${g.players}${'noBots' in g ? '（不支援 bot）' : ''}，開房 \`/game ${g.kind} new\``),
  '各遊戲的指令：`/game <遊戲代號> help`，例如 `/game liarsdice help`',
  '📊 戰績：`/game stats [@某人]`；排行榜：`/game rank [遊戲代號]`',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 遊戲代號 → 顯示名稱（戰績和排行榜用）
const gameLabel = (kind: string) => (kind === 'werewolf' ? '🐺 狼人殺' : kind in DEFS ? `${DEFS[kind as GameKind].emoji} ${DEFS[kind as GameKind].name}` : kind);

// Slack 的 *粗體* 和 `程式碼` 標記外側不能緊貼文字；中文沒有空格，緊貼中文或全形標點時補一個空格
const SAFE_EDGE = /[\s!-/:-@[-`{-~]/;
export function slackText(text: string): string {
  return text.replace(/`[^`\n]+`|\*[^*\n]+\*/g, (m: string, offset: number, all: string) => {
    const before = all[offset - 1];
    const after = all[offset + m.length];
    return `${before && !SAFE_EDGE.test(before) ? ' ' : ''}${m}${after && !SAFE_EDGE.test(after) ? ' ' : ''}`;
  });
}

// 遊戲大廳：每款遊戲一列，附「開房」按鈕
const CATALOG: { kind: Kind; category: string; emoji: string; name: string; players: string; desc: string }[] = [
  { kind: 'werewolf', category: 'deduction', emoji: '🐺', name: '狼人殺', players: '6～12 人', desc: '陣營推理，夜晚私訊行動、白天輪流發言投票' },
  ...GAMES.map(({ kind, category, emoji, name, players, desc }) => ({ kind, category, emoji, name, players, desc })),
];

// 大廳的分類：一次只顯示一類，按上面的分類按鈕切換
const CATEGORIES = [
  { key: 'deduction', label: '🔍 推理' },
  { key: 'team', label: '⚔️ 團隊對抗' },
  { key: 'coop', label: '🤝 合作' },
  { key: 'bluff', label: '🎲 心理戰' },
];

function lobbyBlocks(channel: string, category = CATEGORIES[0].key) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: slackText('*🎮 遊戲大廳*：選分類，點「開房」就能開一局，你會是房主') } },
    {
      type: 'actions',
      elements: CATEGORIES.map((c, i) => ({ ...button('lobbyTab', i, c.label, channel, c.key), ...(c.key === category ? { style: 'primary' } : {}) })),
    },
    ...CATALOG.map((g, i) => ({ g, i })).filter(({ g }) => g.category === category).map(({ g, i }) => ({
      type: 'section',
      text: { type: 'mrkdwn', text: slackText(`${g.emoji} *${g.name}*（\`${g.kind}\`）${g.players}\n${g.desc}`) },
      accessory: button('lobbyOpen', i, '開房', channel, g.kind),
    })),
    { type: 'context', elements: [{ type: 'mrkdwn', text: slackText(`看指令：\`/game <代號> help\`｜📖 <${WIKI}|wiki>`) }] },
  ];
}

// 只有開房和再來一局會改變頻道目前的遊戲；舊遊戲留下的計時器之後才觸發時不能把按鈕搶回去
const isCreation = (action: { type: string }) => action.type === 'new' || action.type === 'rematch';

const NOT_APPLICABLE = '這個指令不適用於目前的遊戲。';
const BUSY = '這個頻道已經有遊戲了。';

export function parseCommand(text: string, user: string, channel: string): Action | null {
  const [sub, arg, ...rest] = text.trim().split(/\s+/);
  if (sub === 'addbot' || sub === 'removebot') {
    const count = arg === undefined ? 1 : Number(arg);
    if (rest.length || !Number.isInteger(count) || count < 1) return null;
    return { type: sub === 'addbot' ? 'addBot' : 'removeBot', user, count };
  }
  switch (text.trim()) {
    case 'new':
      return { type: 'new', user, channel };
    case 'start':
      return { type: 'start', user };
    case 'cancel':
      return { type: 'cancel', user };
    case 'vote':
      return { type: 'endDiscussion', user };
    case 'next':
      return { type: 'skipSpeaker', user };
    default:
      return null;
  }
}

export function buttonAction(kind: string, value: string, user: string, channel = ''): Action | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
      return { type: kind, user };
    case 'wolfKill':
      return { type: 'wolfVote', user, target: value };
    case 'seerCheck':
      return { type: 'seerCheck', user, target: value };
    case 'witch':
      return { type: 'witchAct', user, choice: value };
    case 'dayVote':
    case 'pkVote':
      return { type: 'dayVote', user, target: value };
    case 'shoot':
      return { type: 'shoot', user, target: value };
    case 'endSpeech':
      return { type: 'endSpeech', user };
    case 'rematch':
      return { type: 'rematch', user, channel };
    case 'duel':
      return { type: 'duel', user, target: value };
    default:
      return null;
  }
}

// 每個按鈕的 action_id 是 `ww:<kind>:<index>`（同一則訊息裡不能重複），value 是 `<遊戲頻道>|<選項值>`
const button = (kind: string, i: number, label: string, channel: string, value: string) => ({
  type: 'button',
  action_id: `ww:${kind}:${i}`,
  text: { type: 'plain_text', text: label },
  value: `${channel}|${value}`,
});

export class GameHost {
  games = new Map<string, GameState>();
  private states = new Map<GameKind, Map<string, { phase: string }>>(GAMES.map((g) => [g.kind, new Map()]));
  private lastKind = new Map<string, Kind>(); // 每個頻道最近一局是哪款遊戲
  private lobbyTs = new Map<string, string>();
  private boardTs = new Map<string, string>(); // 機密代號的牌桌訊息
  private promptTs = new Map<string, { ref: string; ts: string }>(); // 帶 ref 的頻道 prompt：同一個 ref 就更新同一則
  private names = new Map<string, string>();
  private dms = new Map<string, string>(); // user → 私訊頻道
  private wolfChats = new Map<string, { users: string; id: string }>(); // 遊戲頻道 → 狼人多人私訊
  private queue: Promise<void> = Promise.resolve();
  private rng: Rng;
  private gifs: Partial<Record<GifKey, string[]>>;
  private stats?: StatsStore;
  private memes?: MemeStore;
  private crew?: CrewStore;
  private checkImage: (url: string) => Promise<boolean>;
  private setTimer: (fn: () => void, ms: number) => void;
  private respond: (url: string, payload: object) => Promise<void>;

  constructor(
    private client: SlackClient,
    opts: HostOptions = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.gifs = opts.gifs ?? GIFS;
    this.stats = opts.stats;
    this.memes = opts.memes;
    this.crew = opts.crew;
    this.checkImage = opts.checkImage ?? checkImage;
    this.setTimer = opts.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
    this.respond = opts.respond ?? postJson;
  }

  private isOther(kind: string | undefined): kind is OtherKind {
    return kind !== undefined && kind in DEFS;
  }

  // 某款遊戲在這個頻道的狀態（沒有就是 undefined）
  state<K extends GameKind>(kind: K, channel: string): StateOf<K> | undefined {
    return this.states.get(kind)!.get(channel) as StateOf<K> | undefined;
  }

  // 直接設定遊戲狀態（測試用）
  setState<K extends GameKind>(kind: K, channel: string, state: StateOf<K>): void {
    this.states.get(kind)!.set(channel, state);
  }

  // 等目前排隊中的訊息都送完（測試用）
  idle(): Promise<void> {
    return this.queue;
  }

  // 頻道裡正在進行（還沒結束）的是哪款遊戲
  private active(channel: string): Kind | null {
    const w = this.games.get(channel);
    if (w && w.phase !== 'ended') return 'werewolf';
    for (const [kind, states] of this.states) {
      const st = states.get(channel);
      if (st && st.phase !== 'ended') return kind;
    }
    return null;
  }

  // 頻道裡有別款遊戲正在進行
  private blocked(channel: string, kind: Kind): boolean {
    const a = this.active(channel);
    return a !== null && a !== kind;
  }

  private reply(channel: string, user: string, text: string): Promise<void> {
    return this.deliver(channel, [{ type: 'ephemeral', to: user, text }]);
  }

  // `/game <遊戲> <子指令>`
  game(channel: string, user: string, userName: string, text: string): Promise<void> {
    this.names.set(user, userName);
    const [g, ...rest] = text.trim().split(/\s+/);
    const restText = rest.join(' ');
    if (g === 'werewolf') return this.command(channel, user, userName, restText);
    if (g === 'meme' && LIBRARY_COMMANDS.includes(rest[0])) return this.memeLibrary(channel, user, restText);
    if (this.isOther(g)) return this.play(g, channel, user, restText);
    if (g === 'stats') return this.showSummary(channel, user, restText);
    if (g === 'rank') return this.showRank(channel, user, restText);
    return this.showLobby(channel, user);
  }

  // `/werewolf <子指令>`（也是 `/game werewolf <子指令>`）
  command(channel: string, user: string, userName: string, text: string): Promise<void> {
    this.names.set(user, userName);
    const [sub, ...args] = text.trim().split(/\s+/);
    if (sub === 'stats') return this.showStats(channel, user, args.join(' '));
    const action = parseCommand(text, user, channel);
    if (!action) return this.reply(channel, user, HELP);
    if (this.blocked(channel, 'werewolf')) return this.reply(channel, user, action.type === 'new' ? BUSY : NOT_APPLICABLE);
    return this.dispatch(channel, action);
  }





  // `/game`：只讓輸入的人看到遊戲大廳
  private showLobby(channel: string, user: string, category?: string): Promise<void> {
    this.queue = this.queue
      .then(() => this.client.chat.postEphemeral({ channel, user, text: slackText(GAME_LIST), blocks: lobbyBlocks(channel, category) }))
      .catch((err) => console.error('[werewolf] Slack API error', err));
    return this.queue;
  }

  // `/game <遊戲> <子指令>`（狼人殺以外的遊戲）
  private play(kind: OtherKind, channel: string, user: string, text: string): Promise<void> {
    const def = DEFS[kind];
    const action = def.parse(text, user, channel);
    if (!action) return this.reply(channel, user, def.help);
    if (this.blocked(channel, kind)) return this.reply(channel, user, action.type === 'new' ? BUSY : NOT_APPLICABLE);
    return this.dispatchGame(kind, channel, action);
  }

  // `/game meme add|list|remove`：頻道梗圖庫，和遊戲進行中與否無關
  private async memeLibrary(channel: string, user: string, text: string): Promise<void> {
    if (!this.memes) return this.reply(channel, user, '這個 bot 沒有設定梗圖庫。');
    const events = await memeLibraryCommand(this.memes, this.checkImage, channel, user, text);
    return this.deliver(channel, events);
  }

  dispatchGame(kind: OtherKind, channel: string, action: { type: string }, triggerId?: string): Promise<void> {
    const def = DEFS[kind];
    if (['meme', 'dixit'].includes(kind) && action.type === 'start') action = { ...action, custom: this.memes?.list(channel) ?? [] } as typeof action; // 開局時帶入頻道的投稿梗圖
    if (kind === 'crew' && (action.type === 'new' || action.type === 'level')) action = { ...action, unlocked: this.crew?.get(channel) ?? 1 } as typeof action; // 帶入頻道已解鎖的關卡
    const states = this.states.get(kind)!;
    const prev = states.get(channel);
    const { state, events } = def.apply(prev, action, this.rng);
    if (state) {
      states.set(channel, state);
      if (state !== prev && isCreation(action)) this.lastKind.set(channel, kind);
    }
    return this.deliver(channel, events, kind, triggerId);
  }

  // 切換大廳分類：用 response_url 換掉原本那則大廳；失敗或沒有時改發一則新的
  private switchLobby(channel: string, user: string, category: string, responseUrl?: string): Promise<void> {
    if (!CATEGORIES.some((c) => c.key === category)) return Promise.resolve();
    const payload = { replace_original: true, text: slackText(GAME_LIST), blocks: lobbyBlocks(channel, category) };
    const replaced = responseUrl ? this.respond(responseUrl, payload).then(() => true) : Promise.resolve(false);
    return replaced
      .catch((err) => (console.error('[werewolf] response_url failed', err), false))
      .then((ok) => (ok ? undefined : this.showLobby(channel, user, category)));
  }

  // triggerId：這次按鈕點擊的 trigger_id，engine 要開視窗時用（3 秒內有效）；responseUrl：換掉 ephemeral 訊息用
  button(actionId: string, value: string, user: string, userName: string, triggerId?: string, responseUrl?: string): Promise<void> {
    this.names.set(user, userName);
    const kind = actionId.split(':')[1];
    const sep = value.indexOf('|');
    const channel = value.slice(0, sep);
    if (kind === 'lobbyTab') return this.switchLobby(channel, user, value.slice(sep + 1), responseUrl);
    if (kind === 'lobbyOpen') {
      const game = value.slice(sep + 1);
      if (game === 'werewolf') return this.command(channel, user, userName, 'new');
      return this.isOther(game) ? this.play(game, channel, user, 'new') : Promise.resolve();
    }
    const last = this.lastKind.get(channel);
    if (kind === 'addbot' || kind === 'removebot') return this.isOther(last) ? this.play(last, channel, user, kind) : this.command(channel, user, userName, kind); // 房間公告的 bot 按鈕等同輸入指令
    if (this.isOther(last)) {
      const action = DEFS[last].button(kind, value.slice(sep + 1), user, channel);
      return action ? this.dispatchGame(last, channel, action, triggerId) : Promise.resolve();
    }
    const action = buttonAction(kind, value.slice(sep + 1), user, channel);
    return action ? this.dispatch(channel, action) : Promise.resolve();
  }

  // Slack 視窗送出：callback_id 是 `ww:<視窗種類>`，private_metadata 是遊戲頻道，texts 是各欄位依序的內容
  modal(callbackId: string, channel: string, user: string, userName: string, texts: string[]): Promise<void> {
    this.names.set(user, userName);
    const name = callbackId.replace(/^ww:/, '');
    const game = GAMES.find((g) => 'modals' in g && name in g.modals);
    if (!game) return Promise.resolve();
    return this.dispatchGame(game.kind, channel, DEFS[game.kind].modals![name].action(user, texts));
  }

  // `/game stats [@某人]`：這個頻道所有遊戲的戰績
  private showSummary(channel: string, user: string, arg: string): Promise<void> {
    const target = arg ? /^<@([A-Z0-9]+)(\|[^>]*)?>$/.exec(arg)?.[1] : user;
    const text = target
      ? formatSummary(mention(target), this.stats?.summary(channel, target) ?? [], gameLabel)
      : '請用 @ 選擇要查詢的玩家，例如 `/game stats @某人`。';
    return this.reply(channel, user, text);
  }

  // `/game rank [遊戲代號]`：這個頻道的排行榜
  private showRank(channel: string, user: string, arg: string): Promise<void> {
    const kind = arg.trim() || undefined;
    if (kind && kind !== 'werewolf' && !(kind in DEFS)) {
      return this.reply(channel, user, '用法：`/game rank` 看這個頻道的排行榜，`/game rank <遊戲代號>` 看單一遊戲，例如 `/game rank skull`。');
    }
    const board = this.stats?.leaderboard(channel, kind) ?? { by: 'wins' as const, rows: [] };
    return this.reply(channel, user, formatLeaderboard(board, kind ? `${gameLabel(kind)}排行榜` : '這個頻道的排行榜'));
  }

  // `/werewolf stats [@某人]`：開啟 should_escape 後，mention 會是 <@U123> 或 <@U123|名字>
  private showStats(channel: string, user: string, arg: string): Promise<void> {
    const target = arg ? /^<@([A-Z0-9]+)(\|[^>]*)?>$/.exec(arg)?.[1] : user;
    const text = target
      ? formatStats(mention(target), this.stats?.stats(channel, target) ?? null)
      : '請用 @ 選擇要查詢的玩家，例如 `/werewolf stats @某人`。';
    return this.deliver(channel, [{ type: 'ephemeral', to: user, text }]);
  }

  // 頻道裡的一般訊息：狼人殺只讀不回應；圈內人當成問主持人的問題；其他遊戲忽略
  chat(channel: string, user: string, text: string): Promise<void> {
    const active = this.active(channel);
    const chat = active && active !== 'werewolf' ? DEFS[active].chat : undefined;
    if (active && active !== 'werewolf' && chat) return this.dispatchGame(active, channel, chat(user, text));
    if (active !== 'werewolf') return Promise.resolve();
    return this.dispatch(channel, { type: 'chat', user, text });
  }

  dispatch(channel: string, action: Action): Promise<void> {
    const prev = this.games.get(channel);
    const { state, events } = applyAction(prev, action, this.rng);
    if (state) {
      this.games.set(channel, state);
      if (state !== prev && isCreation(action)) this.lastKind.set(channel, 'werewolf');
    }
    return this.deliver(channel, events);
  }





  // 依序送出，避免同一局的訊息順序錯亂
  private deliver(channel: string, events: GameEvent[], kind: Kind = 'werewolf', triggerId?: string): Promise<void> {
    this.queue = this.queue
      .then(async () => {
        for (const e of events) await this.send(channel, e, kind, triggerId);
      })
      .catch((err) => console.error('[werewolf] Slack API error', err));
    return this.queue;
  }

  private async dm(user: string): Promise<string> {
    let id = this.dms.get(user);
    if (!id) {
      id = (await this.client.conversations.open({ users: user })).channel.id as string;
      this.dms.set(user, id);
    }
    return id;
  }

  // 只拉真人狼人；狼人全是 bot 時回傳 null
  private async wolfChat(channel: string, wolves: string[]): Promise<string | null> {
    const users = wolves.filter((w) => !isBot(w)).join(',');
    if (!users) {
      this.wolfChats.delete(channel);
      return null;
    }
    const cached = this.wolfChats.get(channel);
    if (cached?.users === users) return cached.id;
    const id = (await this.client.conversations.open({ users })).channel.id as string;
    this.wolfChats.set(channel, { users, id });
    return id;
  }

  // 把選項文字裡的玩家 id 換成名字（按鈕只能放純文字，不能用 <@id>）
  private label(text: string) {
    return text
      .split(' ')
      .map((t) => this.names.get(t) ?? (isBot(t) ? mention(t) : t))
      .join(' ');
  }

  private async send(channel: string, event: GameEvent, kind: Kind, triggerId?: string) {
    const e = 'text' in event && typeof event.text === 'string' ? ({ ...event, text: slackText(event.text) } as GameEvent) : event;
    const chat = this.client.chat;
    switch (e.type) {
      case 'gameRecord':
        this.stats?.record(channel, e.winner, e.players);
        return;
      case 'crewProgress':
        this.crew?.set(channel, e.unlocked);
        return;
      case 'result':
        // 有 bot 參加的局不記錄
        if (kind !== 'werewolf' && !e.players.some(isBot)) this.stats?.recordMatch(channel, kind, e.players, e.winners, e.score);
        return;
      case 'startTimer':
        this.setTimer(() => {
          const timeout = { type: 'timeout' as const, id: e.id };
          if (this.isOther(kind)) void this.dispatchGame(kind, channel, timeout);
          else void this.dispatch(channel, timeout);
        }, e.ms);
        return;
      case 'dm':
        if (isBot(e.to)) return;
        await chat.postMessage({ channel: await this.dm(e.to), text: e.text });
        return;
      case 'wolfChat': {
        const id = await this.wolfChat(channel, e.wolves);
        if (id) await chat.postMessage({ channel: id, text: e.text });
        return;
      }
      case 'prompt': {
        if ((e.audience === 'user' || e.audience === 'ephemeral') && isBot(e.user!)) return;
        const elements = e.options.map((o, i) => button(e.kind, i, this.label(o.label), channel, o.value));
        const size = e.perRow ?? elements.length;
        const rows = Array.from({ length: Math.ceil(elements.length / size) }, (_, r) => elements.slice(r * size, r * size + size));
        const actions = rows.map((row) => ({ type: 'actions', elements: row }));
        const images = (e.images ?? []).map((img) => ({ type: 'image', image_url: img.url, alt_text: img.title, title: { type: 'plain_text', text: img.title } }));
        const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: e.text } }, ...images, ...actions];
        // 圖片壞掉時 Slack 會拒絕整則訊息：改發文字版，依編號附上圖片網址，按鈕照常
        const withImages = async (send: (text: string, blocks: unknown[]) => Promise<any>) => {
          if (!images.length) return send(e.text, blocks);
          try {
            return await send(e.text, blocks);
          } catch (err) {
            console.error('[werewolf] image prompt failed', err);
            const text = [e.text, ...e.images!.map((img) => `${img.title}. ${img.url}`)].join('\n');
            return send(text, [{ type: 'section', text: { type: 'mrkdwn', text } }, ...actions]);
          }
        };
        // 只讓某人看到的按鈕選單（例如花火的給提示）
        if (e.audience === 'ephemeral') {
          await withImages((text, blocks) => chat.postEphemeral({ channel, user: e.user!, text, blocks }));
          return;
        }
        const target =
          e.audience === 'channel' ? channel : e.audience === 'wolves' ? this.wolfChats.get(channel)?.id : await this.dm(e.user!);
        if (!target) return;
        const saved = e.audience === 'channel' && e.ref ? this.promptTs.get(channel) : undefined;
        if (saved && saved.ref === e.ref) {
          await withImages((text, blocks) => chat.update({ channel, ts: saved.ts, text, blocks }));
          return;
        }
        const res = await withImages((text, blocks) => chat.postMessage({ channel: target, text, blocks }));
        if (e.audience === 'channel' && e.ref) this.promptTs.set(channel, { ref: e.ref, ts: res.ts });
        return;
      }
      case 'announce': {
        const urls = (e.gif && this.gifs[e.gif]) || [];
        const images = [
          ...(e.image ? [{ type: 'image', image_url: e.image.url, alt_text: e.image.alt }] : []),
          ...(urls.length ? [{ type: 'image', image_url: urls[Math.floor(this.rng() * urls.length)], alt_text: e.gif }] : []),
        ];
        if (!images.length) {
          await chat.postMessage({ channel, text: e.text });
          return;
        }
        const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: e.text } }, ...images];
        try {
          await chat.postMessage({ channel, text: e.text, blocks });
        } catch (err) {
          // 圖片壞掉時 Slack 會拒絕整則訊息：改發文字，附上圖片網址
          console.error('[werewolf] image announce failed', err);
          await chat.postMessage({ channel, text: e.image ? `${e.text}\n${e.image.url}` : e.text });
        }
        return;
      }
      case 'modal':
        try {
          if (!triggerId) throw new Error('missing trigger_id');
          await this.client.views.open({
            trigger_id: triggerId,
            view: {
              type: 'modal',
              callback_id: `ww:${e.kind}`,
              private_metadata: channel,
              title: { type: 'plain_text', text: e.title },
              submit: { type: 'plain_text', text: '送出' },
              close: { type: 'plain_text', text: '取消' },
              blocks: (e.fields ?? [e.label]).map((label, i) => ({
                type: 'input',
                block_id: e.fields ? `f${i}` : 'text',
                label: { type: 'plain_text', text: label },
                element: { type: 'plain_text_input', action_id: 'text' },
              })),
            },
          });
        } catch (err) {
          console.error('[werewolf] views.open failed', err);
          const fallback = Object.values(DEFS).find((d) => d.modals?.[e.kind])?.modals![e.kind].fallback ?? '視窗打不開，請改用指令送出。';
          await chat.postEphemeral({ channel, user: e.to, text: slackText(fallback) });
        }
        return;
      case 'ephemeral':
        if (isBot(e.to)) return;
        await chat.postEphemeral({ channel, user: e.to, text: e.text });
        return;
      case 'lobby': {
        const title = e.title ?? '狼人殺';
        const rules = `${WIKI}/${encodeURI(`${title.replaceAll(' ', '-')}-遊戲規則`)}`;
        const def = kind === 'werewolf' ? undefined : DEFS[kind];
        const max = def ? Number(def.players.match(/(\d+) 人/)![1]) : MAX_PLAYERS; // 遊戲清單人數範圍的最大值
        const text = `${title}房間（房主 ${mention(e.host)}）\n玩家（${e.players.length}/${max}）：${e.players.map(mention).join(' ')}\n📖 第一次玩？先看 <${rules}|${title}遊戲規則>`;
        const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text } }];
        if (e.open) {
          const elements = [
            button('join', 0, '加入', channel, 'join'),
            button('leave', 1, '離開', channel, 'leave'),
            { ...button('start', 2, '開始遊戲', channel, 'start'), style: 'primary' },
            ...(def?.noBots ? [] : [button('addbot', 3, '🤖 +', channel, 'addbot'), button('removebot', 4, '🤖 -', channel, 'removebot')]),
          ];
          blocks.push({ type: 'actions', elements });
        }
        const ts = this.lobbyTs.get(channel);
        if (ts) {
          await chat.update({ channel, ts, text, blocks });
        } else {
          const res = await chat.postMessage({ channel, text, blocks });
          this.lobbyTs.set(channel, res.ts);
        }
        if (!e.open) {
          this.lobbyTs.delete(channel);
          this.boardTs.delete(channel); // 新的一局開始，牌桌要重新貼
        }
        return;
      }
      case 'board': {
        const blocks = [
          { type: 'section', text: { type: 'mrkdwn', text: e.text } },
          ...e.rows.map((row) => ({
            type: 'actions',
            elements: row.map((b) => ({ ...button('guess', Number(b.value), b.label, channel, b.value), ...(b.style ? { style: b.style } : {}) })),
          })),
        ];
        const ts = this.boardTs.get(channel);
        if (ts) {
          await chat.update({ channel, ts, text: e.text, blocks });
        } else {
          const res = await chat.postMessage({ channel, text: e.text, blocks });
          this.boardTs.set(channel, res.ts);
        }
        return;
      }
    }
  }
}
