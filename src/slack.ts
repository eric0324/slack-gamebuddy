// Slack adapter：把 slash command 和按鈕轉成 engine action，再把 engine event 轉成 Slack API 呼叫。
import { applyAction, isBot, MAX_PLAYERS, mention, type Action, type GameEvent, type GameState, type GifKey, type Rng } from './engine.js';
import { GIFS } from './gifs.js';
import { checkImage, LIBRARY_COMMANDS, memeLibraryCommand } from './memeLibrary.js';
import { tx as memeTx } from './i18n/games/memeLibrary.js';
import type { MemeStore } from './memeStore.js';
import type { CrewStore } from './crewStore.js';
import { LANGS, langName, parseLang, t, type Lang } from './i18n/index.js';
import { LangStore } from './langStore.js';
import { tx as wwText, wikiUrl as wwWiki } from './i18n/games/werewolf.js';
import { formatLeaderboard, formatStats, formatSummary, type StatsStore } from './stats.js';
import { GAMES, type GameKind, type StateOf } from './games/index.js';
import { DISCUSSIONS, WIKI, type GameDef } from './games/types.js';

type Kind = 'werewolf' | GameKind;
type Panel = { url?: string; user: string }; // 這次按鈕所在的私下訊息：response_url 和按的人
type OtherKind = GameKind;

// 狼人殺以外的遊戲：代號 → 設定 (engine、指令解析、按鈕對應、說明、大廳資訊)
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
  langs?: LangStore; // 頻道語系；沒給就用記憶體 (測試用)
  checkImage?: (url: string) => Promise<boolean>; // 投稿梗圖時確認網址是圖片
}

const postJson = async (url: string, payload: object) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`response_url ${res.status}`);
};

// 狼人殺的指令說明依語系 (字典在 src/i18n/games/werewolf.ts)
const HELP = (lang: Lang) => wwText(lang, 'help', { commands: wwWiki(lang, 'commands'), rules: wwWiki(lang, 'rules') });

// 遊戲代號 → 顯示名稱 (戰績和排行榜用)；已移除的遊戲顯示代號
const gameLabel = (lang: Lang) => (kind: string) => {
  const g = CATALOG.find((x) => x.kind === kind);
  if (!g) return kind;
  const { name, tag } = gameText(g, lang);
  return `${g.emoji} ${name}${tag}`;
};

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
type CatalogEntry = { kind: Kind; category: string; emoji: string; name: string; players: string; desc: string; noBots?: boolean; locales?: GameDef<any, any>['locales'] };
const CATALOG: CatalogEntry[] = [
  {
    kind: 'werewolf',
    category: 'deduction',
    emoji: '🐺',
    name: '狼人殺',
    players: '6～12 人',
    desc: '陣營推理，夜晚私訊行動、白天輪流發言投票',
    locales: { en: { name: 'Werewolf', players: '6-12 players', desc: 'Hidden roles: act secretly by DM at night, discuss and vote by day', help: HELP('en') } },
  },
  ...GAMES.map((g) => g as GameDef<any, any> & { kind: GameKind }),
];

// 大廳的分類：一次只顯示一類，按上面的分類按鈕切換；按鈕文字照語系 (cat.<key>)
const CATEGORIES = ['deduction', 'bluff', 'party', 'team', 'coop', 'strategy'] as const;

// 遊戲在某個語系的名稱、人數、介紹；還沒有這個語系的翻譯時用中文，tag 是「 (中文)」標示
function gameText(g: CatalogEntry, lang: Lang) {
  const tr = lang === 'zh-TW' ? g : g.locales?.[lang];
  return tr ? { ...tr, tag: '' } : { name: g.name, players: g.players, desc: g.desc, tag: t(lang, 'lobby.untranslated') };
}

// `/game help` 和大廳訊息的純文字版
function gameList(lang: Lang): string {
  const item = (g: CatalogEntry) => {
    const { name, players, tag } = gameText(g, lang);
    return t(lang, 'list.item', {
      emoji: g.emoji,
      name,
      tag,
      kind: g.kind,
      players,
      noBots: g.noBots ? t(lang, 'list.noBots') : '',
      alias: g.kind === 'werewolf' ? t(lang, 'list.werewolfAlias') : '',
    });
  };
  return [t(lang, 'list.title'), ...CATALOG.map(item), t(lang, 'list.helpHint'), t(lang, 'list.statsHint'), t(lang, 'list.wiki', { wiki: WIKI })].join('\n');
}

function lobbyBlocks(channel: string, lang: Lang, category: string = CATEGORIES[0]) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: slackText(t(lang, 'lobby.header')) } },
    {
      type: 'actions',
      elements: CATEGORIES.map((c, i) => ({ ...button('lobbyTab', i, t(lang, `cat.${c}`), channel, c), ...(c === category ? { style: 'primary' } : {}) })),
    },
    ...CATALOG.map((g, i) => ({ g, i })).filter(({ g }) => g.category === category).map(({ g, i }) => {
      const { name, players, desc, tag } = gameText(g, lang);
      return {
        type: 'section',
        text: { type: 'mrkdwn', text: slackText(`${g.emoji} *${name}*${tag} (\`${g.kind}\`) ${players}\n${desc}`) },
        accessory: button('lobbyOpen', i, t(lang, 'lobby.open'), channel, g.kind),
      };
    }),
    { type: 'context', elements: [{ type: 'mrkdwn', text: slackText(t(lang, 'lobby.footer', { wiki: WIKI, discussions: DISCUSSIONS })) }] },
  ];
}

// 各遊戲共用的「再來一局」prompt：engine 送中文，送出時照這局的語系翻譯
const REMATCH_ASK = '要再來一局嗎？';
const rematchPrompt = (e: Extract<GameEvent, { type: 'prompt' }>, lang: Lang) => ({
  ...e,
  text: t(lang, 'rematch.ask'),
  options: e.options.map((o) => (o.label === '再來一局' ? { ...o, label: t(lang, 'rematch.button') } : o)),
});

// 只有開房和再來一局會改變頻道目前的遊戲；舊遊戲留下的計時器之後才觸發時不能把按鈕搶回去
const isCreation = (action: { type: string }) => action.type === 'new' || action.type === 'rematch';


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

// 每個按鈕的 action_id 是 `ww:<kind>:<index>` (同一則訊息裡不能重複)，value 是 `<遊戲頻道>|<選項值>`
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
  private langs: LangStore;
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
    this.langs = opts.langs ?? new LangStore(':memory:');
    this.checkImage = opts.checkImage ?? checkImage;
    this.setTimer = opts.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
    this.respond = opts.respond ?? postJson;
  }

  private isOther(kind: string | undefined): kind is OtherKind {
    return kind !== undefined && kind in DEFS;
  }

  // 某款遊戲在這個頻道的狀態 (沒有就是 undefined)
  state<K extends GameKind>(kind: K, channel: string): StateOf<K> | undefined {
    return this.states.get(kind)!.get(channel) as StateOf<K> | undefined;
  }

  // 直接設定遊戲狀態 (測試用)
  setState<K extends GameKind>(kind: K, channel: string, state: StateOf<K>): void {
    this.states.get(kind)!.set(channel, state);
  }

  // 等目前排隊中的訊息都送完 (測試用)
  idle(): Promise<void> {
    return this.queue;
  }

  // 頻道裡正在進行 (還沒結束) 的是哪款遊戲
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
    if (g === 'lang') return this.setLang(channel, user, restText);
    return this.showLobby(channel, user);
  }

  // `/werewolf <子指令>` (也是 `/game werewolf <子指令>`)
  command(channel: string, user: string, userName: string, text: string): Promise<void> {
    this.names.set(user, userName);
    const [sub, ...args] = text.trim().split(/\s+/);
    if (sub === 'stats') return this.showStats(channel, user, args.join(' '));
    const action = parseCommand(text, user, channel);
    if (!action) return this.reply(channel, user, HELP(this.lang(channel)));
    if (this.blocked(channel, 'werewolf')) return this.reply(channel, user, t(this.lang(channel), action.type === 'new' ? 'room.busy' : 'room.notApplicable'));
    return this.dispatch(channel, action);
  }





  // 頻道目前的語系
  private lang(channel: string): Lang {
    return this.langs.get(channel);
  }

  // 這局的語系：開房時存進 state 的；還沒開房的用頻道目前的語系
  private gameLang(channel: string, kind: Kind): Lang {
    const st = kind === 'werewolf' ? this.games.get(channel) : (this.states.get(kind)!.get(channel) as { lang?: Lang } | undefined);
    return st?.lang ?? this.lang(channel);
  }

  // `/game lang [語系]`：查看或設定這個頻道的語系；進行中的遊戲不受影響，下一次開房才套用
  private setLang(channel: string, user: string, arg: string): Promise<void> {
    const list = LANGS.map((l) => `\`${l.code}\` ${l.name}`).join('、');
    const current = this.lang(channel);
    if (!arg) return this.reply(channel, user, t(current, 'lang.current', { name: langName(current), code: current, list }));
    const lang = parseLang(arg);
    if (!lang) return this.reply(channel, user, t(current, 'lang.unknown', { list }));
    this.langs.set(channel, lang);
    return this.deliver(channel, [{ type: 'announce', text: t(lang, 'lang.changed', { user: mention(user), name: langName(lang) }) }]);
  }

  // `/game`：只讓輸入的人看到遊戲大廳
  private showLobby(channel: string, user: string, category?: string): Promise<void> {
    this.queue = this.queue
      .then(() => {
        const lang = this.lang(channel);
        return this.client.chat.postEphemeral({ channel, user, text: slackText(gameList(lang)), blocks: lobbyBlocks(channel, lang, category) });
      })
      .catch((err) => console.error('[werewolf] Slack API error', err));
    return this.queue;
  }

  // `/game <遊戲> <子指令>` (狼人殺以外的遊戲)
  private play(kind: OtherKind, channel: string, user: string, text: string): Promise<void> {
    const def = DEFS[kind];
    const action = def.parse(text, user, channel);
    if (!action) return this.reply(channel, user, def.locales?.[this.lang(channel)]?.help ?? def.help);
    if (this.blocked(channel, kind)) return this.reply(channel, user, t(this.lang(channel), action.type === 'new' ? 'room.busy' : 'room.notApplicable'));
    return this.dispatchGame(kind, channel, action);
  }

  // `/game meme add|list|remove`：頻道梗圖庫，和遊戲進行中與否無關
  private async memeLibrary(channel: string, user: string, text: string): Promise<void> {
    const lang = this.lang(channel);
    if (!this.memes) return this.reply(channel, user, memeTx(lang, 'notConfigured'));
    const events = await memeLibraryCommand(this.memes, this.checkImage, channel, user, text, lang);
    return this.deliver(channel, events);
  }

  dispatchGame(kind: OtherKind, channel: string, action: { type: string }, triggerId?: string, panel?: Panel): Promise<void> {
    const def = DEFS[kind];
    if (['meme', 'dixit'].includes(kind) && action.type === 'start') action = { ...action, custom: this.memes?.list(channel) ?? [] } as typeof action; // 開局時帶入頻道的投稿梗圖
    if (kind === 'crew' && (action.type === 'new' || action.type === 'level')) action = { ...action, unlocked: this.crew?.get(channel) ?? 1 } as typeof action; // 帶入頻道已解鎖的關卡
    if (kind === 'crew' && (action.type === 'level' || action.type === 'reset')) action = { ...action, lang: this.lang(channel) } as typeof action; // 沒有房間時用頻道目前的語系回覆
    if (isCreation(action)) action = { ...action, lang: this.lang(channel) } as typeof action; // 開房和再來一局採用當下的頻道語系
    const states = this.states.get(kind)!;
    const prev = states.get(channel);
    const { state, events } = def.apply(prev, action, this.rng);
    if (state) {
      states.set(channel, state);
      if (state !== prev && isCreation(action)) this.lastKind.set(channel, kind);
    }
    return this.deliver(channel, events, kind, triggerId, panel);
  }

  // 切換大廳分類：用 response_url 換掉原本那則大廳；失敗或沒有時改發一則新的
  private switchLobby(channel: string, user: string, category: string, responseUrl?: string): Promise<void> {
    if (!CATEGORIES.some((c) => c === category)) return Promise.resolve();
    const lang = this.lang(channel);
    const payload = { replace_original: true, text: slackText(gameList(lang)), blocks: lobbyBlocks(channel, lang, category) };
    const replaced = responseUrl ? this.respond(responseUrl, payload).then(() => true) : Promise.resolve(false);
    return replaced
      .catch((err) => (console.error('[werewolf] response_url failed', err), false))
      .then((ok) => (ok ? undefined : this.showLobby(channel, user, category)));
  }

  // triggerId：這次按鈕點擊的 trigger_id，engine 要開視窗時用 (3 秒內有效)；responseUrl：換掉 ephemeral 訊息用
  // fromEphemeral：按鈕在私下訊息上，回應可以取代那則訊息 (牌桌上的按鈕不行，否則會把牌桌換掉)
  button(actionId: string, value: string, user: string, userName: string, triggerId?: string, responseUrl?: string, fromEphemeral = false): Promise<void> {
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
      const panel = fromEphemeral && responseUrl ? { url: responseUrl, user } : undefined;
      return action ? this.dispatchGame(last, channel, action, triggerId, panel) : Promise.resolve();
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
    const lang = this.lang(channel);
    const text = target ? formatSummary(mention(target), this.stats?.summary(channel, target) ?? [], gameLabel(lang), lang) : t(lang, 'stats.needMention');
    return this.reply(channel, user, text);
  }

  // `/game rank [遊戲代號]`：這個頻道的排行榜
  private showRank(channel: string, user: string, arg: string): Promise<void> {
    const kind = arg.trim() || undefined;
    const lang = this.lang(channel);
    if (kind && kind !== 'werewolf' && !(kind in DEFS)) return this.reply(channel, user, t(lang, 'rank.usage'));
    const board = this.stats?.leaderboard(channel, kind) ?? { by: 'wins' as const, rows: [] };
    const title = kind ? t(lang, 'rank.game', { game: gameLabel(lang)(kind) }) : t(lang, 'rank.channel');
    return this.reply(channel, user, formatLeaderboard(board, title, lang));
  }

  // `/werewolf stats [@某人]`：開啟 should_escape 後，mention 會是 <@U123> 或 <@U123|名字>
  private showStats(channel: string, user: string, arg: string): Promise<void> {
    const target = arg ? /^<@([A-Z0-9]+)(\|[^>]*)?>$/.exec(arg)?.[1] : user;
    const lang = this.lang(channel);
    const text = target ? formatStats(mention(target), this.stats?.stats(channel, target) ?? null, lang) : wwText(lang, 'statsMention');
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
    if (action.type === 'new' || action.type === 'rematch') action = { ...action, lang: this.lang(channel) }; // 開房和再來一局採用當下的頻道語系
    const prev = this.games.get(channel);
    const { state, events } = applyAction(prev, action, this.rng);
    if (state) {
      this.games.set(channel, state);
      if (state !== prev && isCreation(action)) this.lastKind.set(channel, 'werewolf');
    }
    return this.deliver(channel, events);
  }





  // 依序送出，避免同一局的訊息順序錯亂
  private deliver(channel: string, events: GameEvent[], kind: Kind = 'werewolf', triggerId?: string, panel?: Panel): Promise<void> {
    this.queue = this.queue
      .then(async () => {
        const left = panel && { ...panel }; // 只取代一次
        for (const e of events) await this.send(channel, this.localize(channel, e, kind), kind, triggerId, left);
      })
      .catch((err) => console.error('[werewolf] Slack API error', err));
    return this.queue;
  }

  // engine 送來的共用文字照這局的語系翻譯：目前只有各遊戲共用的「再來一局」
  private localize(channel: string, e: GameEvent, kind: Kind): GameEvent {
    return e.type === 'prompt' && e.kind === 'rematch' && e.text === REMATCH_ASK ? rematchPrompt(e, this.gameLang(channel, kind)) : e;
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

  // 把選項文字裡的玩家 id 換成名字 (按鈕只能放純文字，不能用 <@id>)
  private label(text: string) {
    return text
      .split(' ')
      .map((t) => this.names.get(t) ?? (isBot(t) ? mention(t) : t))
      .join(' ');
  }

  // 不通知的名字 {{name:id}} 換成顯示名稱；不知道名字就退回 @
  private quietNames(text: string) {
    return text.replace(/\{\{name:([^}]+)\}\}/g, (_, id: string) => this.names.get(id) ?? `<@${id}>`);
  }

  // 帶 replace 的私下回應：用按鈕的 response_url 取代原本那則私下訊息；用過或失敗就回傳 false 照常發
  private async replacePanel(panel: Panel | undefined, e: { replace?: boolean }, to: string, text: string, blocks?: unknown[]) {
    if (!panel?.url || !e.replace || panel.user !== to) return false;
    const url = panel.url;
    panel.url = undefined;
    return this.respond(url, { replace_original: true, text, blocks: blocks ?? [{ type: 'section', text: { type: 'mrkdwn', text } }] })
      .then(() => true)
      .catch((err) => (console.error('[werewolf] response_url failed', err), false));
  }

  private async send(channel: string, event: GameEvent, kind: Kind, triggerId?: string, panel?: Panel) {
    const e = 'text' in event && typeof event.text === 'string' ? ({ ...event, text: slackText(this.quietNames(event.text)) } as GameEvent) : event;
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
        // 只讓某人看到的按鈕選單 (例如花火的給提示)
        if (e.audience === 'ephemeral') {
          if (await this.replacePanel(panel, e, e.user!, e.text, blocks)) return;
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
              submit: { type: 'plain_text', text: t(this.gameLang(channel, kind), 'modal.submit') },
              close: { type: 'plain_text', text: t(this.gameLang(channel, kind), 'modal.cancel') },
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
          const lang = this.gameLang(channel, kind);
          const modal = Object.values(DEFS).find((d) => d.modals?.[e.kind])?.modals![e.kind];
          const fallback = (modal && (modal.fallbackLocales?.[lang] ?? modal.fallback)) ?? t(lang, 'modal.fallback');
          await chat.postEphemeral({ channel, user: e.to, text: slackText(fallback) });
        }
        return;
      case 'ephemeral':
        if (isBot(e.to)) return;
        if (await this.replacePanel(panel, e, e.to, e.text)) return;
        await chat.postEphemeral({ channel, user: e.to, text: e.text });
        return;
      case 'lobby': {
        const title = e.title ?? '狼人殺';
        const def = kind === 'werewolf' ? undefined : DEFS[kind];
        const max = def ? Number(def.players.match(/(\d+) 人/)![1]) : MAX_PLAYERS; // 遊戲清單人數範圍的最大值
        const lang = this.gameLang(channel, kind);
        const locales = kind === 'werewolf' ? CATALOG[0].locales : def?.locales; // 狼人殺的翻譯在大廳那一列
        const en = lang === 'en' ? locales?.en : undefined; // 英文 wiki 頁面是「<英文名稱>-Rules」
        const rules = `${WIKI}/${encodeURI(en ? `${en.name.replaceAll(' ', '-')}-Rules` : `${title.replaceAll(' ', '-')}-遊戲規則`)}`;
        const shown = lang === 'zh-TW' ? title : (locales?.[lang]?.name ?? `${title}${t(lang, 'lobby.untranslated')}`);
        const name = lang === 'zh-TW' && title.endsWith(')') ? `${title} ` : shown; // 名稱以括號結尾時補空白，例如「心電感應 (合作) 房間」
        const text = [
          t(lang, 'room.title', { name, host: mention(e.host) }),
          t(lang, 'room.players', { count: e.players.length, max, players: e.players.map(mention).join(' ') }),
          t(lang, 'room.rules', { url: rules, name }),
        ].join('\n');
        const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text } }];
        if (e.open) {
          const elements = [
            button('join', 0, t(lang, 'room.join'), channel, 'join'),
            button('leave', 1, t(lang, 'room.leave'), channel, 'leave'),
            { ...button('start', 2, t(lang, 'room.start'), channel, 'start'), style: 'primary' },
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
