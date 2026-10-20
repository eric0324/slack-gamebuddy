import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LangStore } from '../src/langStore.js';
import { StatsStore } from '../src/stats.js';
import { GameHost, type SlackClient } from '../src/slack.js';
import { gameText, LANGS, lookup, parseLang, t } from '../src/i18n/index.js';

describe('i18n: 支援的語系', () => {
  it('支援 zh-TW 和 en', () => {
    expect(LANGS.map((l) => l.code)).toEqual(['zh-TW', 'en']);
  });

  it('語系代號不分大小寫，不支援的回傳 undefined', () => {
    expect(parseLang('EN')).toBe('en');
    expect(parseLang('zh-tw')).toBe('zh-TW');
    expect(parseLang('fr')).toBeUndefined();
  });

  it('t() 代入參數；沒指定語系用 zh-TW', () => {
    expect(t('zh-TW', 'room.full')).toBe('房間已滿。');
    expect(t('en', 'room.full')).toBe('The room is full.');
    expect(t(undefined, 'room.full')).toBe('房間已滿。');
    expect(t('en', 'lang.changed', { user: '<@A>', name: 'English' })).toBe("🌐 <@A> changed this channel's language to English");
  });

  it('英文缺翻譯時退回中文，不會出現 key', () => {
    const dicts = { 'zh-TW': { a: '甲 {n}', b: '乙' }, en: { a: 'A {n}' } };
    expect(lookup(dicts, 'en', 'a', { n: 1 })).toBe('A 1');
    expect(lookup(dicts, 'en', 'b')).toBe('乙');
  });
});

type Call = { method: string; args: any };

function setup(langs = new LangStore(':memory:'), stats?: StatsStore) {
  const calls: Call[] = [];
  const record = (method: string) => async (args: any) => (calls.push({ method, args }), { ok: true, ts: String(calls.length), channel: { id: 'D' } });
  const client: SlackClient = {
    chat: { postMessage: record('chat.postMessage'), update: record('chat.update'), postEphemeral: record('chat.postEphemeral') },
    conversations: { open: record('conversations.open') },
    views: { open: record('views.open') },
  };
  const responds: { url: string; payload: any }[] = [];
  const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, langs, stats, respond: async (url, payload) => void responds.push({ url, payload }) });
  return { host, calls, responds, langs };
}
const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
const posts = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postMessage').map((c) => c.args);

describe('i18n: 語系保存', () => {
  it('沒資料時是 zh-TW；設定後讀得到；重開同一個檔案仍在', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lang-')), 'stats.db');
    const store = new LangStore(file);
    expect(store.get('C1')).toBe('zh-TW');
    store.set('C1', 'en');
    expect(store.get('C1')).toBe('en');
    expect(store.get('C2')).toBe('zh-TW');
    expect(new LangStore(file).get('C1')).toBe('en');
  });
});

describe('i18n: 頻道語系指令', () => {
  it('/game lang：只讓自己看到目前語系和可選的語系', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'lang');
    const eph = lastEph(calls);
    expect(eph.user).toBe('U1');
    expect(eph.text).toContain('繁體中文');
    expect(eph.text).toContain('`zh-TW`');
    expect(eph.text).toContain('`en`');
    expect(posts(calls)).toHaveLength(0);
  });

  it('/game lang en：改成英文，頻道用英文公告', async () => {
    const { host, calls, langs } = setup();
    await host.game('C1', 'U1', 'alice', 'lang EN');
    expect(langs.get('C1')).toBe('en');
    expect(posts(calls).at(-1)!.text).toBe("🌐 <@U1> changed this channel's language to English");
    await host.game('C1', 'U1', 'alice', 'lang');
    expect(lastEph(calls).text).toContain('English');
  });

  it('不支援的語系被拒，語系不變', async () => {
    const { host, calls, langs } = setup();
    await host.game('C1', 'U1', 'alice', 'lang fr');
    expect(langs.get('C1')).toBe('zh-TW');
    expect(lastEph(calls).text).toContain('不支援這個語言');
    expect(posts(calls)).toHaveLength(0);
  });
});

// runGame 開房時存進 state 的語系 (遊戲 state 的型別裡沒有這個欄位)
const langOf = (host: GameHost) => (host.state('incan', 'C1') as { lang?: string } | undefined)?.lang;
const ephTo = (calls: Call[], user: string) => calls.filter((c) => c.method === 'chat.postEphemeral' && c.args.user === user).map((c) => c.args.text as string);

describe('i18n: 開房時決定這局的語系', () => {
  it('英文頻道開房，這局是英文', async () => {
    const { host, langs } = setup();
    langs.set('C1', 'en');
    await host.game('C1', 'U1', 'alice', 'incan new');
    expect(langOf(host)).toBe('en');
  });

  it('進行中改語系不影響這一局，下一次開房才套用', async () => {
    const { host } = setup();
    await host.game('C1', 'U1', 'alice', 'incan new');
    await host.game('C1', 'U1', 'alice', 'lang en');
    expect(langOf(host)).toBe('zh-TW');
    await host.game('C1', 'U1', 'alice', 'incan cancel');
    await host.game('C1', 'U1', 'alice', 'incan new');
    expect(langOf(host)).toBe('en');
  });

  it('再來一局用按下當下的頻道語系', async () => {
    const { host, langs } = setup();
    await host.game('C1', 'U1', 'alice', 'incan new');
    host.setState('incan', 'C1', { ...host.state('incan', 'C1')!, phase: 'ended', winners: ['U1'] });
    langs.set('C1', 'en');
    await host.button('ww:rematch:0', 'C1|rematch', 'U1', 'alice');
    expect(host.state('incan', 'C1')).toMatchObject({ phase: 'lobby', lang: 'en' });
  });
});

describe('i18n: 共用的房間回覆', () => {
  const english = async () => {
    const s = setup();
    s.langs.set('C1', 'en');
    await s.host.game('C1', 'U1', 'alice', 'incan new');
    return s;
  };

  it('英文頻道：已在房間、只有房主可以加／移除 bot、沒有 bot、只有房主可以取消', async () => {
    const { host, calls } = await english();
    await host.button('ww:join:0', 'C1|join', 'U1', 'alice');
    expect(ephTo(calls, 'U1').at(-1)).toBe("You're already in the room.");
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.game('C1', 'U2', 'bob', 'incan addbot');
    expect(ephTo(calls, 'U2').at(-1)).toBe('Only the host can add bots.');
    await host.game('C1', 'U2', 'bob', 'incan removebot');
    expect(ephTo(calls, 'U2').at(-1)).toBe('Only the host can remove bots.');
    await host.game('C1', 'U1', 'alice', 'incan removebot');
    expect(ephTo(calls, 'U1').at(-1)).toBe('There are no bots in the room.');
    await host.game('C1', 'U2', 'bob', 'incan cancel');
    expect(ephTo(calls, 'U2').at(-1)).toBe('Only the host can cancel the game.');
  });

  it('英文頻道：房間已滿、遊戲已經開始、頻道已有遊戲', async () => {
    const { host, calls } = await english();
    await host.game('C1', 'U1', 'alice', 'incan addbot 7');
    await host.button('ww:join:0', 'C1|join', 'U9', 'zoe');
    expect(ephTo(calls, 'U9').at(-1)).toBe('The room is full.');
    await host.game('C1', 'U1', 'alice', 'incan start');
    await host.button('ww:leave:1', 'C1|leave', 'U1', 'alice');
    expect(ephTo(calls, 'U1').at(-1)).toBe("The game has already started, so you can't leave.");
    await host.game('C1', 'U2', 'bob', 'skull new');
    expect(ephTo(calls, 'U2').at(-1)).toBe('There is already a game in this channel.');
  });

  it('英文頻道：房主離開取消、房主取消公告、只有上一局玩家可以開新的一局', async () => {
    const { host, calls } = await english();
    await host.button('ww:leave:1', 'C1|leave', 'U1', 'alice');
    expect(posts(calls).at(-1)!.text).toBe('🛑 The host left, so the game was cancelled.');
    await host.game('C1', 'U1', 'alice', 'incan new');
    await host.game('C1', 'U1', 'alice', 'incan cancel');
    expect(posts(calls).at(-1)!.text).toBe('🛑 The host cancelled the game.');
    await host.game('C1', 'U1', 'alice', 'incan new');
    host.setState('incan', 'C1', { ...host.state('incan', 'C1')!, phase: 'ended', winners: ['U1'] });
    await host.button('ww:rematch:0', 'C1|rematch', 'U5', 'eve');
    expect(ephTo(calls, 'U5').at(-1)).toBe('Only players from the last game can start a new one.');
  });

  it('中文頻道維持原本的中文', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'incan new');
    await host.button('ww:join:0', 'C1|join', 'U1', 'alice');
    expect(ephTo(calls, 'U1').at(-1)).toBe('你已經在房間裡了。');
  });
});

describe('i18n: 英文大廳與遊戲清單', () => {
  const englishLobby = async () => {
    const s = setup();
    s.langs.set('C1', 'en');
    await s.host.game('C1', 'U1', 'alice', '');
    return { ...s, eph: lastEph(s.calls) };
  };
  const sections = (blocks: any[]) => blocks.filter((b) => b.accessory).map((b) => b.text.text as string);

  it('標題、六個分類按鈕、Start a room、底部提示都是英文', async () => {
    const { eph } = await englishLobby();
    expect(eph.blocks[0].text.text).toContain('*🎮 Game lobby*');
    expect(eph.blocks[1].elements.map((b: any) => b.text.text)).toEqual(['🔍 Hidden Roles', '🎭 Bluffing', '😂 Party', '⚔️ Team vs Team', '🤝 Co-op', '🧩 Strategy']);
    expect(eph.blocks.filter((b: any) => b.accessory).every((b: any) => b.accessory.text.text === 'Start a room')).toBe(true);
    expect(eph.blocks.at(-1).elements[0].text).toContain('💬 Community');
  });

  it('還沒翻譯的遊戲：中文名稱加「(中文)」、中文人數和介紹', async () => {
    const { eph } = await englishLobby();
    const werewolf = sections(eph.blocks)[0];
    expect(werewolf).toContain('*狼人殺* (中文) (`werewolf`) 6～12 人');
    expect(werewolf).toContain('陣營推理');
  });

  it('有英文翻譯的遊戲顯示英文、沒有標示', async () => {
    const { undercover } = await import('../src/games/undercover.js');
    (undercover as { locales?: object }).locales = { en: { name: 'Undercover', players: '4-12 players', desc: 'Find the one with a different word' } };
    try {
      const { eph } = await englishLobby();
      expect(sections(eph.blocks)[1]).toBe('🕵️ *Undercover* (`undercover`) 4-12 players\nFind the one with a different word');
    } finally {
      delete (undercover as { locales?: object }).locales;
    }
  });

  it('/game help 的遊戲清單是英文', async () => {
    const { eph } = await englishLobby();
    expect(eph.text).toContain('*Games*');
    expect(eph.text).toContain('• 🐺 *狼人殺* (中文) (`werewolf`): 6～12 人 — start with `/game werewolf new` (or `/werewolf new`)');
    expect(eph.text).toContain('Commands for each game: `/game <code> help`');
  });

  it('中文頻道的大廳維持原樣', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    expect(lastEph(calls).blocks[0].text.text).toContain('*🎮 遊戲大廳*');
    expect(lastEph(calls).text).toContain('• 🐺 *狼人殺* (`werewolf`)：6～12 人，開房 `/game werewolf new` (或 `/werewolf new`)');
  });
});

describe('i18n: 英文房間公告與再來一局', () => {
  it('標題、房主、人數、規則連結文字和 Join／Leave／Start 按鈕是英文', async () => {
    const { host, calls, langs } = setup();
    langs.set('C1', 'en');
    await host.game('C1', 'U1', 'alice', 'incan new');
    const lobby = posts(calls).at(-1)!;
    expect(lobby.text).toContain('印加寶藏 (中文) room (host <@U1>)');
    expect(lobby.text).toContain('Players (1/8): <@U1>');
    expect(lobby.text).toContain('|the 印加寶藏 (中文) rules>');
    expect(lobby.blocks[1].elements.slice(0, 3).map((b: any) => b.text.text)).toEqual(['Join', 'Leave', 'Start']);
  });

  it('這局是英文時，再來一局的提示和按鈕是英文', async () => {
    const { host, calls, langs } = setup();
    langs.set('C1', 'en');
    await host.game('C1', 'U1', 'alice', 'incan new');
    const rematch = { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] };
    await (host as unknown as { deliver(c: string, e: object[], k: string): Promise<void> }).deliver('C1', [rematch], 'incan');
    const msg = posts(calls).at(-1)!;
    expect(msg.text).toBe('Play again?');
    expect(msg.blocks.at(-1).elements[0].text.text).toBe('Play again');
  });
});

describe('i18n: 戰績與排行榜', () => {
  const withStats = () => {
    const stats = new StatsStore(':memory:');
    stats.recordMatch('C1', 'skull', ['U1', 'U2'], ['U1']);
    stats.recordMatch('C1', 'hanabi', ['U1', 'U2'], [], 18);
    const s = setup(new LangStore(':memory:'), stats);
    s.langs.set('C1', 'en');
    return s;
  };

  it('英文頻道的 /game stats：英文標題和每款遊戲一行，未翻譯的遊戲標示中文', async () => {
    const { host, calls } = withStats();
    await host.game('C1', 'U1', 'alice', 'stats');
    const text = lastEph(calls).text;
    expect(text).toContain("📊 <@U1>'s stats in this channel");
    expect(text).toContain('Total: 2 played | Competitive: 1/1 wins (100%)');
    expect(text).toContain('💀 骷髏與玫瑰 (中文): 1/1 wins (100%)');
    expect(text).toContain('🎆 花火 (中文): 1 played, best 18');
  });

  it('英文頻道的 /game rank 和沒有戰績的訊息', async () => {
    const { host, calls } = withStats();
    await host.game('C1', 'U1', 'alice', 'rank');
    expect(lastEph(calls).text).toContain('🏆 Leaderboard for this channel');
    expect(lastEph(calls).text).toContain('🥇 <@U1> 1/1 wins (100%)');
    await host.game('C1', 'U1', 'alice', 'rank skull');
    expect(lastEph(calls).text).toContain('🏆 💀 骷髏與玫瑰 (中文) leaderboard');
    await host.game('C2', 'U1', 'alice', 'lang en');
    await host.game('C2', 'U1', 'alice', 'stats');
    expect(lastEph(calls).text).toBe('No stats for <@U1> in this channel yet.');
  });

  it('中文頻道維持原樣', async () => {
    const stats = new StatsStore(':memory:');
    stats.recordMatch('C1', 'skull', ['U1'], ['U1']);
    const { host, calls } = setup(new LangStore(':memory:'), stats);
    await host.game('C1', 'U1', 'alice', 'stats');
    expect(lastEph(calls).text).toContain('💀 骷髏與玫瑰 1 場 1 勝 (100%)');
  });
});

describe('i18n: 每款遊戲的字典', () => {
  it('gameText() 依語系查字、代入參數，沒指定語系用中文', () => {
    const tx = gameText({ 'zh-TW': { turn: '輪到 {who}' }, en: { turn: "{who}'s turn" } });
    expect(tx('en', 'turn', { who: 'A' })).toBe("A's turn");
    expect(tx('zh-TW', 'turn', { who: 'A' })).toBe('輪到 A');
    expect(tx(undefined, 'turn', { who: 'A' })).toBe('輪到 A');
  });

  it('英文少翻一個 key 時 typecheck 會擋', () => {
    // @ts-expect-error en 缺少 b
    const tx = gameText({ 'zh-TW': { a: '甲', b: '乙' }, en: { a: 'A' } });
    expect(tx('en', 'a')).toBe('A');
  });
});

describe('i18n: 指令說明和規則連結依語系', () => {
  const withEnglish = async <T>(fn: () => Promise<T>) => {
    const { liarsDice } = await import('../src/games/liarsdice.js');
    const def = liarsDice as { locales?: object };
    def.locales = { en: { name: "Liar's Dice", players: '2-8 players', desc: 'Bluff about dice', help: '*Liar\'s Dice commands*' } };
    try {
      return await fn();
    } finally {
      delete def.locales;
    }
  };

  it('英文頻道：已翻譯的遊戲顯示英文說明，還沒翻譯的顯示中文', async () => {
    await withEnglish(async () => {
      const { host, calls, langs } = setup();
      langs.set('C1', 'en');
      await host.game('C1', 'U1', 'alice', 'liarsdice help');
      expect(lastEph(calls).text).toBe("*Liar's Dice commands*");
      await host.game('C1', 'U1', 'alice', 'coup help');
      expect(lastEph(calls).text).toContain('政變');
    });
  });

  it('英文房間的規則連結：已翻譯的指向英文頁，還沒翻譯的指向中文頁', async () => {
    await withEnglish(async () => {
      const { host, calls, langs } = setup();
      langs.set('C1', 'en');
      // 房間公告可能是新發的，也可能是更新同一則
      const lobby = () => calls.filter((c) => ['chat.postMessage', 'chat.update'].includes(c.method) && c.args.text?.includes('room (host')).at(-1)!.args.text;
      await host.game('C1', 'U1', 'alice', 'liarsdice new');
      expect(lobby()).toContain(`wiki/${encodeURI("Liar's-Dice-Rules")}|`);
      await host.game('C1', 'U1', 'alice', 'liarsdice cancel');
      await host.game('C1', 'U1', 'alice', 'coup new');
      expect(lobby()).toContain(`wiki/${encodeURI('政變-遊戲規則')}|`);
    });
  });
});
