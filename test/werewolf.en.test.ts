// 狼人殺的英文版：英文頻道開的局，公告、prompt、按鈕、私訊、bot 台詞、說明和戰績都是英文
import { describe, expect, it } from 'vitest';
import { botLine, counterClaim, followClaim, knightReveal, seerClaim, witchReveal } from '../src/botLines.js';
import { parseChat } from '../src/chatParser.js';
import { applyAction, type Action, type GameEvent, type GameState } from '../src/engine.js';
import { LangStore } from '../src/langStore.js';
import { GameHost, type SlackClient } from '../src/slack.js';
import { formatStats } from '../src/stats.js';

const CJK = /[㐀-鿿＀-￯　-〿]/;
const rng = () => 0.99999; // 不洗牌：角色照配置表順序發 (6 人：狼、狼、預言家、女巫、村民、村民)

function run(actions: Action[], start?: GameState) {
  let state = start;
  const all: GameEvent[] = [];
  let events: GameEvent[] = [];
  for (const action of actions) {
    ({ state, events } = applyAction(state, action, rng) as { state: GameState; events: GameEvent[] });
    all.push(...events);
  }
  return { state: state!, events, all };
}

// 事件裡玩家看得到的文字 (含按鈕)
const texts = (events: GameEvent[]) =>
  events.flatMap((e) => [...('text' in e && typeof e.text === 'string' ? [e.text] : []), ...(e.type === 'prompt' ? e.options.map((o) => o.label) : [])]);

const sixPlayers = (lang?: 'en') =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', ...(lang ? { lang } : {}) } as Action,
    ...['p2', 'p3', 'p4', 'p5', 'p6'].map((user) => ({ type: 'join', user }) as Action),
    { type: 'start', user: 'p1' },
  ]);

describe('狼人殺的英文版：engine', () => {
  it('英文局記住語系；中文局預設 zh-TW', () => {
    expect(run([{ type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as Action]).state.lang).toBe('en');
    expect(run([{ type: 'new', user: 'p1', channel: 'C1' }]).state.lang).toBe('zh-TW');
  });

  it('開局公告、身分私訊、狼人頻道、夜晚 prompt 和按鈕都是英文', () => {
    const { events } = sixPlayers('en');
    const announce = events.find((e) => e.type === 'announce')!;
    expect(announce).toMatchObject({ text: expect.stringContaining('🎲 Game on!') });
    expect((announce as { text: string }).text).toContain('Werewolf-Rules');
    expect(events).toContainEqual(expect.objectContaining({ type: 'dm', to: 'p3', text: expect.stringContaining('Seer') }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'announce', text: '🌙 Night 1. Everyone, close your eyes.' }));
    const wolf = events.find((e) => e.type === 'prompt' && e.kind === 'wolfKill') as Extract<GameEvent, { type: 'prompt' }>;
    expect(wolf.text).toBe('Choose a player to kill tonight.');
    expect(wolf.options.at(-1)!.label).toBe('No kill');
    for (const text of texts(events)) expect(text).not.toMatch(CJK);
  });

  it('英文局的房間回覆是英文', () => {
    const { state } = run([{ type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as Action]);
    const { events } = run([{ type: 'join', user: 'p1' }, { type: 'start', user: 'p2' }], state);
    expect(run([{ type: 'join', user: 'p1' }], state).events).toContainEqual({ type: 'ephemeral', to: 'p1', text: "You're already in the room." });
    expect(events).toContainEqual({ type: 'ephemeral', to: 'p2', text: 'Only the host can start the game.' });
    expect(run([{ type: 'start', user: 'p1' }], state).events[0]).toMatchObject({ text: 'Need at least 6 players to start (currently 1).' });
  });

  it('和 bot 玩完一整局英文局，所有訊息都沒有中文', () => {
    let { state, all } = run([
      { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as Action,
      { type: 'addBot', user: 'p1', count: 7 },
      { type: 'start', user: 'p1' },
    ]);
    // 真人只靠計時器結束 (發言、投票、夜晚都逾時)，bot 自己行動，直到遊戲結束
    for (let i = 0; i < 200 && state.phase !== 'ended'; i++) {
      const id = Math.max(...Object.values(state.timers).map(Number));
      const r = run([{ type: 'timeout', id }], state);
      state = r.state;
      all = all.concat(r.all);
    }
    expect(state.phase).toBe('ended');
    expect(all).toContainEqual(expect.objectContaining({ type: 'prompt', kind: 'rematch', text: 'Play again?' }));
    for (const text of texts(all)) expect(text).not.toMatch(CJK);
  });
});

describe('狼人殺的英文版：bot 台詞和頻道訊息解析', () => {
  it('bot 台詞有英文版，中文預設不變', () => {
    for (const kind of ['speech', 'lastWords', 'pk'] as const) {
      for (const r of [0, 0.3, 0.6, 0.99]) {
        const line = botLine(kind, '🤖Sam', () => r, 'en');
        expect(line).toContain('🤖Sam');
        expect(line).not.toMatch(CJK);
      }
    }
    expect(botLine('lastWords', 'X', () => 0)).toMatch(CJK);
    expect(seerClaim([{ night: 1, target: 'X', wolf: true }], 'en')).toBe("I'm the Seer. Night 1: X is a werewolf.");
    expect(witchReveal([], 'en')).not.toMatch(CJK);
    expect(knightReveal(true, 'en')).not.toMatch(CJK);
    expect(followClaim('X', () => 0, 'en')).not.toMatch(CJK);
    expect(counterClaim('X', () => 0, 'en')).not.toMatch(CJK);
  });

  it('英文局的頻道訊息也能讓 bot 參考', () => {
    const players = ['U1', 'U2', 'bot:1:Sam'];
    const info = parseChat("I'm the seer. Sam is a werewolf, <@U2> is good", players, 'en');
    expect(info).toMatchObject({ seerClaim: true, wolf: ['bot:1:Sam'], good: ['U2'] });
    expect(parseChat("I'm the witch. <@U2> is suspicious", players, 'en')).toMatchObject({ godClaim: 'witch', suspect: ['U2'] });
  });
});

describe('狼人殺的英文版：戰績', () => {
  it('formatStats 英文', () => {
    expect(formatStats('<@Z>', null, 'en')).toBe('No stats for <@Z> in this channel yet.');
    const text = formatStats('<@A>', { total: { games: 2, wins: 1 }, factions: { good: { games: 2, wins: 1 } }, roles: { seer: { games: 2, wins: 1 } } }, 'en');
    expect(text).toBe("📊 <@A>'s stats in this channel\nTotal: 2 games, 1 wins (50%)\nVillage: 2 games, 1 wins (50%)\nRoles: Seer 2 games, 1 wins (50%)");
  });
});

// ---- Slack ----
type Call = { method: string; args: Record<string, any> };
function setup() {
  const calls: Call[] = [];
  let ts = 0;
  const record = (method: string) => async (args: any) => (calls.push({ method, args }), { ok: true, ts: String(++ts), channel: { id: 'D' } });
  const client: SlackClient = {
    chat: { postMessage: record('chat.postMessage'), update: record('chat.update'), postEphemeral: record('chat.postEphemeral') },
    conversations: { open: record('conversations.open') },
    views: { open: record('views.open') },
  };
  const langs = new LangStore(':memory:');
  langs.set('C1', 'en');
  const host = new GameHost(client, { rng, setTimer: () => undefined, langs });
  return { host, calls, langs };
}
const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

describe('狼人殺的英文版：Slack', () => {
  it('英文頻道的 /werewolf help 和 /game werewolf help 是英文說明', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'help');
    const help = lastEph(calls).text as string;
    expect(help).toContain('*Werewolf commands*');
    expect(help).toContain('Werewolf-Rules');
    expect(help).not.toMatch(CJK);
    await host.game('C1', 'U1', 'alice', 'werewolf help');
    expect(lastEph(calls).text).toBe(help);
  });

  it('英文頻道開房：房間公告顯示 Werewolf 和英文規則連結；之後改語系不影響這局', async () => {
    const { host, calls, langs } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    const lobby = calls.find((c) => c.method === 'chat.postMessage')!.args.text as string;
    expect(lobby).toContain('Werewolf');
    expect(lobby).toContain('Werewolf-Rules');
    expect(lobby).not.toMatch(CJK);
    expect(host.games.get('C1')!.lang).toBe('en');
    langs.set('C1', 'zh-TW');
    await host.command('C1', 'U2', 'bob', 'start');
    expect(lastEph(calls).text).toBe('Only the host can start the game.');
  });

  it('英文頻道的大廳列出 Werewolf，不加 (中文) 標示', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    const text = lastEph(calls).text as string;
    expect(text).toContain('Werewolf');
    expect(text).not.toContain('狼人殺');
  });

  it('英文頻道的 /werewolf stats 是英文', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'stats');
    expect(lastEph(calls).text).toBe('No stats for <@U1> in this channel yet.');
    await host.command('C1', 'U1', 'alice', 'stats nobody');
    expect(lastEph(calls).text).not.toMatch(CJK);
  });
});
