import { describe, expect, it } from 'vitest';
import { GIFS } from '../src/gifs.js';
import { MEME_IMAGES } from '../src/memeImages.js';
import { MemeStore } from '../src/memeStore.js';
import { StatsStore } from '../src/stats.js';
import { mention, type GameEvent } from '../src/engine.js';
import { buttonAction, GameHost, slackText, parseCommand, type SlackClient } from '../src/slack.js';
import { parseAvalonCommand } from '../src/games/avalon.js';
import { parseCodenamesCommand } from '../src/games/codenames.js';
import { parseDecryptoCommand } from '../src/games/decrypto.js';
import { parseHanabiCommand } from '../src/games/hanabi.js';
import { parseJustOneCommand } from '../src/games/justone.js';
import { parseLiarsDiceCommand } from '../src/games/liarsdice.js';
import { parseSpyfallCommand } from '../src/games/spyfall.js';
import { parseUndercoverCommand } from '../src/games/undercover.js';
import { parseWavelengthCommand } from '../src/games/wavelength.js';
import { parseWavecoopCommand } from '../src/games/wavecoop.js';
import { parseInsiderCommand } from '../src/games/insider.js';
import { parseLoveLetterCommand } from '../src/games/loveletter.js';
import { parseNimmtCommand } from '../src/games/nimmt.js';
import { parseSkullCommand } from '../src/games/skull.js';
import { parseCockroachCommand } from '../src/games/cockroach.js';
import { parseChameleonCommand } from '../src/games/chameleon.js';
import { parseNoThanksCommand } from '../src/games/nothanks.js';
import { parseTabooCommand } from '../src/games/taboo.js';
import { TABOO_CARDS } from '../src/tabooCards.js';
import { parseSushiGoCommand } from '../src/games/sushigo.js';
import { parseMemeCommand } from '../src/games/meme.js';

type Call = { method: string; args: Record<string, any> };

function fakeClient(opts: { viewsFail?: boolean; badImage?: string } = {}) {
  const calls: Call[] = [];
  let ts = 0;
  const record = (method: string, result: (args: any) => unknown) => async (args: any) => {
    calls.push({ method, args });
    return result(args);
  };
  const client: SlackClient = {
    chat: {
      postMessage: record('chat.postMessage', (a) => {
        if (opts.badImage && (a.blocks ?? []).some((b: any) => b.image_url === opts.badImage)) throw new Error('invalid_blocks');
        return { ok: true, channel: a.channel, ts: String(++ts) };
      }),
      update: record('chat.update', (a) => {
        if (opts.badImage && (a.blocks ?? []).some((b: any) => b.image_url === opts.badImage)) throw new Error('invalid_blocks');
        return { ok: true };
      }),
      postEphemeral: record('chat.postEphemeral', (a) => {
        if (opts.badImage && (a.blocks ?? []).some((b: any) => b.image_url === opts.badImage)) throw new Error('invalid_blocks');
        return { ok: true };
      }),
    },
    conversations: {
      open: record('conversations.open', (a) => ({ ok: true, channel: { id: `D:${a.users}` } })),
    },
    views: {
      open: record('views.open', () => {
        if (opts.viewsFail) throw new Error('expired_trigger_id');
        return { ok: true };
      }),
    },
  };
  return { client, calls };
}

function setup() {
  const { client, calls } = fakeClient();
  const timers: { ms: number; fn: () => void }[] = [];
  const responds: { url: string; payload: any }[] = [];
  const host = new GameHost(client, {
    rng: () => 0.99999,
    setTimer: (fn, ms) => void timers.push({ fn, ms }),
    respond: async (url, payload) => void responds.push({ url, payload }),
  });
  return { host, calls, timers, responds };
}

const buttonsOf = (call: Call) =>
  (call.args.blocks ?? []).flatMap((b: any) => (b.type === 'actions' ? b.elements : []));

describe('parseCommand', () => {
  it('把子指令轉成 engine action', () => {
    expect(parseCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseCommand(' cancel ', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseCommand('vote', 'U1', 'C1')).toEqual({ type: 'endDiscussion', user: 'U1' });
  });

  it('不認識的子指令回傳 null', () => {
    expect(parseCommand('', 'U1', 'C1')).toBeNull();
    expect(parseCommand('dance', 'U1', 'C1')).toBeNull();
  });
});

describe('Slack：指令與房間', () => {
  it('/werewolf new 在頻道貼出有「加入」「離開」「開始遊戲」按鈕的房間公告', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    const post = calls.find((c) => c.method === 'chat.postMessage')!;
    expect(post.args.channel).toBe('C1');
    expect(post.args.text).toContain('<@U1>');
    const ids = buttonsOf(post).map((b: any) => b.action_id);
    expect(ids).toEqual(['ww:join:0', 'ww:leave:1', 'ww:start:2', 'ww:addbot:3', 'ww:removebot:4']);
  });

  it('按「加入」會更新同一則房間公告', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    const update = calls.find((c) => c.method === 'chat.update')!;
    expect(update.args).toMatchObject({ channel: 'C1', ts: '1' });
    expect(update.args.text).toContain('<@U2>');
  });

  it('錯誤訊息只讓本人看到', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    await host.command('C1', 'U1', 'alice', 'start');
    expect(calls.at(-1)).toMatchObject({
      method: 'chat.postEphemeral',
      args: { channel: 'C1', user: 'U1', text: expect.stringContaining('至少需要 6 人') },
    });
  });

  it('不認識的指令回覆使用說明', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'dance');
    expect(calls.at(-1)).toMatchObject({
      method: 'chat.postEphemeral',
      args: { user: 'U1', text: expect.stringContaining('/werewolf new') },
    });
  });

  it('不同頻道的遊戲互不影響', async () => {
    const { host } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    await host.command('C2', 'U9', 'zed', 'new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(host.games.get('C1')!.players.map((p) => p.id)).toEqual(['U1', 'U2']);
    expect(host.games.get('C2')!.players.map((p) => p.id)).toEqual(['U9']);
  });
});

// 6 人局：U1、U2 狼人，U3 預言家，U4 女巫，U5、U6 村民
const NAMES: Record<string, string> = { U1: 'alice', U2: 'bob', U3: 'carol', U4: 'dave', U5: 'erin', U6: 'frank' };
async function startedHost() {
  const ctx = setup();
  await ctx.host.command('C1', 'U1', 'alice', 'new');
  for (const u of ['U2', 'U3', 'U4', 'U5', 'U6']) await ctx.host.button('ww:join:0', 'C1|join', u, NAMES[u]);
  await ctx.host.command('C1', 'U1', 'alice', 'start');
  return ctx;
}
const postsTo = (calls: Call[], channel: string) =>
  calls.filter((c) => c.method === 'chat.postMessage' && c.args.channel === channel);

describe('Slack：event 轉換', () => {
  it('dm：開啟私訊再發送身分', async () => {
    const { calls } = await startedHost();
    expect(calls).toContainEqual({ method: 'conversations.open', args: { users: 'U3' } });
    expect(postsTo(calls, 'D:U3').map((c) => c.args.text)).toContainEqual(expect.stringContaining('預言家'));
  });

  it('wolfChat：開啟狼人的多人私訊，擊殺提示也送到同一個對話', async () => {
    const { calls } = await startedHost();
    const opens = calls.filter((c) => c.method === 'conversations.open' && c.args.users === 'U1,U2');
    expect(opens).toHaveLength(1);
    const wolfPosts = postsTo(calls, 'D:U1,U2');
    expect(wolfPosts[0].args.text).toContain('<@U1>');
    expect(buttonsOf(wolfPosts.at(-1)!).map((b: any) => b.value)).toContain('C1|U5');
  });

  it('prompt (user)：按鈕用玩家名字當文字，value 帶著遊戲頻道', async () => {
    const { calls } = await startedHost();
    const seerPrompt = postsTo(calls, 'D:U3').find((c) => buttonsOf(c).length)!;
    const btns = buttonsOf(seerPrompt);
    expect(btns[0]).toMatchObject({ action_id: 'ww:seerCheck:0', value: 'C1|U1', text: { text: 'alice' } });
  });

  it('prompt (channel)：投票按鈕貼在遊戲頻道', async () => {
    const { host, calls } = await startedHost();
    for (const a of [
      { type: 'wolfVote', user: 'U1', target: 'U5' },
      { type: 'wolfVote', user: 'U2', target: 'U5' },
      { type: 'seerCheck', user: 'U3', target: 'U1' },
      { type: 'witchAct', user: 'U4', choice: 'skip' },
      { type: 'skipSpeaker', user: 'U1' },
      { type: 'endDiscussion', user: 'U1' },
    ] as const) {
      await host.dispatch('C1', a);
    }
    const vote = postsTo(calls, 'C1').at(-1)!;
    const btns = buttonsOf(vote);
    expect(btns.map((b: any) => b.text.text)).toEqual(['alice', 'bob', 'carol', 'dave', 'frank', '棄票']);
    expect(btns[0].action_id).toBe('ww:dayVote:0');
  });

  it('女巫的毒藥選項也顯示玩家名字', async () => {
    const { host, calls } = await startedHost();
    await host.dispatch('C1', { type: 'wolfVote', user: 'U1', target: 'U5' });
    await host.dispatch('C1', { type: 'wolfVote', user: 'U2', target: 'U5' });
    const witchPrompt = postsTo(calls, 'D:U4').at(-1)!;
    expect(buttonsOf(witchPrompt).map((b: any) => b.text.text)).toContain('毒 alice');
  });
});

describe('Slack：遊戲按鈕與計時', () => {
  it('把各種按鈕轉成 engine action', () => {
    expect(buttonAction('join', 'join', 'U1')).toEqual({ type: 'join', user: 'U1' });
    expect(buttonAction('leave', 'leave', 'U1')).toEqual({ type: 'leave', user: 'U1' });
    expect(buttonAction('wolfKill', 'U5', 'U1')).toEqual({ type: 'wolfVote', user: 'U1', target: 'U5' });
    expect(buttonAction('seerCheck', 'U1', 'U3')).toEqual({ type: 'seerCheck', user: 'U3', target: 'U1' });
    expect(buttonAction('witch', 'poison:U1', 'U4')).toEqual({ type: 'witchAct', user: 'U4', choice: 'poison:U1' });
    expect(buttonAction('dayVote', 'abstain', 'U2')).toEqual({ type: 'dayVote', user: 'U2', target: 'abstain' });
    expect(buttonAction('pkVote', 'U1', 'U2')).toEqual({ type: 'dayVote', user: 'U2', target: 'U1' });
    expect(buttonAction('shoot', 'none', 'U6')).toEqual({ type: 'shoot', user: 'U6', target: 'none' });
    expect(buttonAction('unknown', 'x', 'U1')).toBeNull();
  });

  it('在私訊裡按的按鈕會送到 value 指定的遊戲', async () => {
    const { host } = await startedHost();
    await host.button('ww:wolfKill:4', 'C1|U5', 'U1', 'alice');
    expect(host.games.get('C1')!.night!.wolfVotes).toEqual({ U1: 'U5' });
  });

  it('startTimer 會設定計時，時間到送出 timeout', async () => {
    const { host, timers, calls } = await startedHost();
    const wolfTimer = timers.find((t) => t.ms === 60_000)!;
    expect(wolfTimer).toBeDefined();
    wolfTimer.fn();
    await host.idle();
    expect(postsTo(calls, 'D:U1,U2').map((c) => c.args.text)).toContainEqual(expect.stringContaining('沒有擊殺目標'));
  });
});

describe('Slack：bot 玩家', () => {
  it('parseCommand 支援 addbot、removebot 和數量', () => {
    expect(parseCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseCommand('addbot 5', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 5 });
    expect(parseCommand('removebot  2', 'U1', 'C1')).toEqual({ type: 'removeBot', user: 'U1', count: 2 });
    expect(parseCommand('addbot 0', 'U1', 'C1')).toBeNull();
    expect(parseCommand('addbot abc', 'U1', 'C1')).toBeNull();
  });

  // rng 固定時：U1 狼人、第 1 個 bot 狼人、第 2 個預言家、第 3 個女巫、第 4、5 個村民
  async function botGame(rng?: () => number) {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: rng ?? (() => 0.99999), setTimer: () => {} });
    await host.command('C1', 'U1', 'alice', 'new');
    await host.command('C1', 'U1', 'alice', 'addbot 5');
    await host.command('C1', 'U1', 'alice', 'start');
    return { host, calls };
  }

  it('不私訊 bot，也不把提示送給 bot', async () => {
    const { calls } = await botGame();
    const opened = calls.filter((c) => c.method === 'conversations.open').map((c) => c.args.users);
    expect(opened.some((u: string) => u.includes('bot:'))).toBe(false);
    expect(calls.some((c) => String(c.args.channel).includes('bot:'))).toBe(false);
    expect(calls.some((c) => c.method === 'chat.postEphemeral' && String(c.args.user).includes('bot:'))).toBe(false);
  });

  it('狼人有真人也有 bot：私密對話只拉真人，名單列出 bot', async () => {
    const { host, calls } = await botGame();
    expect(calls).toContainEqual({ method: 'conversations.open', args: { users: 'U1' } });
    const wolfPosts = calls.filter((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U1');
    const bot1 = host.games.get('C1')!.players[1].id;
    expect(wolfPosts.map((c) => c.args.text).join('\n')).toContain(mention(bot1));
  });

  it('狼人全部都是 bot 時，不建立狼人的私密對話', async () => {
    // bot 加完之後才換上控制發牌的數字：第一次交換把 U1 換成村民，之後不再交換，狼人是第 1 和第 5 個 bot
    let seq: number[] = [];
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => seq.shift() ?? 0.99999, setTimer: () => {} });
    await host.command('C1', 'U1', 'alice', 'new');
    await host.command('C1', 'U1', 'alice', 'addbot 5');
    seq = [0, 0.99999, 0.99999, 0.99999, 0.99999];
    await host.command('C1', 'U1', 'alice', 'start');
    expect(host.games.get('C1')!.players.find((p) => p.id === 'U1')!.role).toBe('villager');
    const wolfOpens = calls.filter((c) => c.method === 'conversations.open' && c.args.users !== 'U1');
    expect(wolfOpens).toEqual([]);
  });

  it('按鈕上的 bot 顯示成 🤖<名字>', async () => {
    const { host, calls } = await botGame();
    const bot2 = host.games.get('C1')!.players[2].id;
    const wolfPrompt = calls.filter((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U1').find((c) => buttonsOf(c).length)!;
    expect(buttonsOf(wolfPrompt).map((b: any) => b.text.text)).toContain(mention(bot2));
  });
});

describe('Slack：公告 GIF', () => {
  async function nightAnnounce(gifs: Record<string, string[]>, rng: () => number) {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng, setTimer: () => {}, gifs });
    await host.command('C1', 'U1', 'alice', 'new');
    await host.command('C1', 'U1', 'alice', 'addbot 5');
    await host.command('C1', 'U1', 'alice', 'start');
    return calls.find((c) => c.method === 'chat.postMessage' && String(c.args.text).includes('天黑'))!;
  }
  const imageOf = (call: Call) => (call.args.blocks ?? []).find((b: any) => b.type === 'image');

  it('有設定 GIF 的公告送出文字加 image block', async () => {
    const call = await nightAnnounce({ night: ['https://x/a.gif'] }, () => 0.99999);
    expect(call.args.text).toContain('天黑');
    expect(imageOf(call)).toMatchObject({ type: 'image', image_url: 'https://x/a.gif' });
  });

  it('公告帶 image 時送出文字加 image block', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => {}, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'meme new');
    await host.game('C1', 'U1', 'alice', 'meme addbot 2');
    await host.game('C1', 'U1', 'alice', 'meme start');
    const call = calls.find((c) => c.method === 'chat.postMessage' && String(c.args.text).includes('第 1/6 輪：'))!;
    expect(imageOf(call)).toMatchObject({ type: 'image', image_url: MEME_IMAGES[0].url, alt_text: MEME_IMAGES[0].name });
  });

  it('多張 GIF 隨機選', async () => {
    const urls = ['https://x/a.gif', 'https://x/b.gif', 'https://x/c.gif'];
    const a = imageOf(await nightAnnounce({ night: urls }, () => 0)).image_url;
    const c = imageOf(await nightAnnounce({ night: urls }, () => 0.99999)).image_url;
    expect(urls).toContain(a);
    expect(urls).toContain(c);
    expect(a).not.toBe(c);
  });

  it('沒有設定 GIF 時只送文字', async () => {
    const call = await nightAnnounce({}, () => 0.99999);
    expect(call.args.text).toContain('天黑');
    expect(call.args.blocks).toBeUndefined();
  });

  it('預設設定檔每個時刻都有至少 10 張 Giphy GIF，而且不重複', () => {
    const keys = [
      'start', 'night', 'dawnDeath', 'dawnPeace', 'exile', 'wolfKingShot', 'pk', 'duelWin', 'duelLose', 'goodWin', 'wolvesWin',
      'guessRight', 'guessWrong', 'teamApproved', 'teamRejected', 'questSuccess', 'questFail', 'assassination',
    ];
    expect(Object.keys(GIFS).sort()).toEqual([...keys].sort());
    const all = Object.values(GIFS).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const k of keys) {
      const urls = GIFS[k as keyof typeof GIFS];
      expect(urls.length, k).toBeGreaterThanOrEqual(10);
      for (const u of urls) expect(u).toMatch(/^https:\/\/media\.giphy\.com\/media\/\w+\/200\.gif$/);
    }
  });
});

describe('Slack：輪流發言', () => {
  it('/werewolf next 轉成跳過發言者', () => {
    expect(parseCommand('next', 'U1', 'C1')).toEqual({ type: 'skipSpeaker', user: 'U1' });
  });

  it('「結束發言」按鈕轉成 endSpeech', () => {
    expect(buttonAction('endSpeech', 'U3', 'U3')).toEqual({ type: 'endSpeech', user: 'U3' });
  });
});

describe('Slack：再來一局', () => {
  it('「再來一局」按鈕轉成 rematch action，帶著遊戲頻道', () => {
    expect(buttonAction('rematch', 'rematch', 'U1', 'C1')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
  });

  it('遊戲結束後按「再來一局」，頻道出現新的房間公告', async () => {
    const { client, calls } = fakeClient();
    const timers: (() => void)[] = [];
    // 固定值的 rng 會讓 bot 每次都平票、遊戲永遠不會結束，所以用有種子的 LCG
    let seed = 7;
    const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const host = new GameHost(client, { rng, setTimer: (fn) => void timers.push(fn), gifs: {} });
    await host.command('C1', 'U1', 'alice', 'new');
    await host.command('C1', 'U1', 'alice', 'addbot 5');
    await host.command('C1', 'U1', 'alice', 'start');
    for (let i = 0; i < 500 && host.games.get('C1')!.phase !== 'ended'; i++) {
      timers.shift()?.();
      await host.idle();
    }
    expect(host.games.get('C1')!.phase).toBe('ended');
    const rematch = calls.filter((c) => buttonsOf(c).some((b: any) => b.action_id.startsWith('ww:rematch')));
    expect(rematch).toHaveLength(1);

    await host.button('ww:rematch:0', 'C1|rematch', 'U1', 'alice');
    expect(host.games.get('C1')).toMatchObject({ phase: 'lobby', host: 'U1' });
    const lobby = calls.at(-1)!;
    expect(lobby.method).toBe('chat.postMessage');
    expect(buttonsOf(lobby).map((b: any) => b.action_id)).toEqual(['ww:join:0', 'ww:leave:1', 'ww:start:2', 'ww:addbot:3', 'ww:removebot:4']);
  });
});

describe('Slack：騎士決鬥', () => {
  it('決鬥按鈕轉成 duel action', () => {
    expect(buttonAction('duel', 'U2', 'U7', 'C1')).toEqual({ type: 'duel', user: 'U7', target: 'U2' });
  });
});

describe('Slack：戰績查詢', () => {
  async function statsHost() {
    const { client, calls } = fakeClient();
    const stats = new StatsStore(':memory:');
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => {}, gifs: {}, stats });
    return { host, calls, stats };
  }
  const lastEphemeral = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/werewolf stats 查自己，只有自己看得到', async () => {
    const { host, calls, stats } = await statsHost();
    stats.record('C1', 'good', [{ id: 'U1', role: 'seer' }]);
    await host.command('C1', 'U1', 'alice', 'stats');
    expect(lastEphemeral(calls)).toMatchObject({ channel: 'C1', user: 'U1', text: expect.stringContaining('總計：1 場 1 勝 (100%)') });
  });

  it('/werewolf stats @某人 查別人 (支援有名字和沒名字的 mention 格式)', async () => {
    const { host, calls, stats } = await statsHost();
    stats.record('C1', 'wolves', [{ id: 'U2', role: 'werewolf' }]);
    for (const text of ['stats <@U2|bob>', 'stats <@U2>']) {
      await host.command('C1', 'U1', 'alice', text);
      expect(lastEphemeral(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('📊 <@U2> 在這個頻道的戰績') });
    }
  });

  it('不是 mention 時提示要用 @ 選擇玩家', async () => {
    const { host, calls } = await statsHost();
    await host.command('C1', 'U1', 'alice', 'stats bob');
    expect(lastEphemeral(calls).text).toContain('@');
  });

  it('全真人的遊戲結束時存進戰績', async () => {
    const { host, stats } = await statsHost();
    await host.command('C1', 'U1', 'alice', 'new');
    for (const u of ['U2', 'U3', 'U4', 'U5', 'U6']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.command('C1', 'U1', 'alice', 'start');
    // U1、U2 狼人，U3 預言家，U4 女巫。預言家先死，今晚刀女巫 → 狼人獲勝
    const s = host.games.get('C1')!;
    host.games.set('C1', {
      ...s,
      players: s.players.map((p) => (p.id === 'U3' ? { ...p, alive: false } : p)),
      night: { ...s.night!, seerDone: true },
    });
    await host.dispatch('C1', { type: 'wolfVote', user: 'U1', target: 'U4' });
    await host.dispatch('C1', { type: 'wolfVote', user: 'U2', target: 'U4' });
    await host.dispatch('C1', { type: 'witchAct', user: 'U4', choice: 'skip' });
    expect(host.games.get('C1')!.phase).toBe('ended');
    expect(stats.stats('C1', 'U1')!.total).toEqual({ games: 1, wins: 1 });
    expect(stats.stats('C1', 'U3')!.total).toEqual({ games: 1, wins: 0 });
  });
});

describe('Slack：使用說明', () => {
  const helpFor = async (text: string) => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', text);
    return calls.at(-1)!;
  };

  it('/werewolf help 回覆條列式使用說明，每個指令一行，最後附 wiki 連結', async () => {
    const call = await helpFor('help');
    expect(call).toMatchObject({ method: 'chat.postEphemeral', args: { user: 'U1' } });
    const lines = call.args.text.split('\n');
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'next', 'vote', 'cancel', 'stats']) {
      expect(lines.filter((l: string) => l.includes(`/werewolf ${cmd}`)).length, cmd).toBe(1);
    }
    expect(lines.at(-1)).toContain('https://github.com/eric0324/slack-gamebuddy/wiki/');
  });

  it('只輸入 /werewolf 或不認識的子指令，回覆同一份說明', async () => {
    const help = (await helpFor('help')).args.text;
    expect((await helpFor('')).args.text).toBe(help);
    expect((await helpFor('dance')).args.text).toBe(help);
  });
});

describe('Slack：開始遊戲按鈕', () => {
  it('「開始遊戲」按鈕轉成 start action', () => {
    expect(buttonAction('start', 'start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
  });

  it('房主按下會開始遊戲；非房主和人數不足時只有按的人看到提示', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    expect(calls.at(-1)).toMatchObject({ method: 'chat.postEphemeral', args: { user: 'U1', text: expect.stringContaining('至少需要 6 人') } });

    for (const u of ['U2', 'U3', 'U4', 'U5', 'U6']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U2', 'U2');
    expect(calls.at(-1)).toMatchObject({ method: 'chat.postEphemeral', args: { user: 'U2', text: '只有房主可以開始遊戲。' } });
    expect(host.games.get('C1')!.phase).toBe('lobby');

    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    expect(host.games.get('C1')!.phase).toBe('night');
  });
});

describe('Slack：讀取頻道訊息', () => {
  it('頻道訊息轉成 chat action，不會產生任何 Slack 呼叫', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    for (const u of ['U2', 'U3', 'U4', 'U5', 'U6']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.command('C1', 'U1', 'alice', 'start');
    // 第一夜：U1、U2 狼人刀 U5，U3 預言家查 U1，U4 女巫不用藥 → 天亮後 U5 的遺言
    for (const a of [
      { type: 'wolfVote', user: 'U1', target: 'U5' },
      { type: 'wolfVote', user: 'U2', target: 'U5' },
      { type: 'seerCheck', user: 'U3', target: 'U1' },
      { type: 'witchAct', user: 'U4', choice: 'skip' },
      { type: 'skipSpeaker', user: 'U1' },
    ] as const) {
      await host.dispatch('C1', a);
    }
    const before = calls.length;
    await host.chat('C1', 'U3', '我是預言家，查殺 <@U1>');
    expect(calls.length).toBe(before);
    expect(host.games.get('C1')!.claims).toContainEqual({ by: 'U3', night: 1, target: 'U1', wolf: true });
  });

  it('沒有遊戲的頻道直接忽略', async () => {
    const { host, calls } = setup();
    await host.chat('C9', 'U1', '我是預言家');
    expect(calls).toEqual([]);
    expect(host.games.has('C9')).toBe(false);
  });
});

describe('game-commands: /game 指令與多款遊戲', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game 列出可以玩的遊戲', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    const text = lastEph(calls).text;
    for (const s of ['狼人殺', 'werewolf', '誰是臥底', 'undercover', '/game undercover new', '間諜危機', 'spyfall', '4～10 人', '/game spyfall new', '阿瓦隆', 'avalon', '5～10 人', '/game avalon new', '機密代號', 'codenames', '4～12 人', '/game codenames new']) {
      expect(text).toContain(s);
    }
  });

  it('/game werewolf new 和 /werewolf new 效果相同', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'werewolf new');
    expect(host.games.get('C1')).toMatchObject({ phase: 'lobby', host: 'U1' });
    expect(calls.find((c) => c.method === 'chat.postMessage')!.args.text).toContain('狼人殺房間');
  });

  it('/game undercover new 開誰是臥底的房間，按鈕加入會更新公告', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'undercover new');
    expect(calls.at(-1)!.args.text).toContain('誰是臥底房間');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(host.state('undercover', 'C1')!.players.map((p) => p.id)).toEqual(['U1', 'U2']);
    expect(calls.at(-1)).toMatchObject({ method: 'chat.update', args: { text: expect.stringContaining('<@U2>') } });
  });

  it('/game undercover help 列出誰是臥底的指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'undercover help');
    const text = lastEph(calls).text;
    for (const s of ['new', 'addbot', 'removebot', 'start', 'next', 'vote', 'cancel', 'guess']) expect(text).toContain(`/game undercover ${s}`);
  });

  it('一個頻道同時只有一局：狼人殺進行中不能開誰是臥底，反過來也一樣', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'werewolf new');
    await host.game('C1', 'U2', 'bob', 'undercover new');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
    expect(host.state('undercover', 'C1')).toBeUndefined();

    const other = setup();
    await other.host.game('C2', 'U1', 'alice', 'undercover new');
    await other.host.command('C2', 'U2', 'bob', 'new');
    expect(lastEph(other.calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
  });

  it('遊戲結束後可以換一款遊戲', async () => {
    const { host } = setup();
    await host.game('C1', 'U1', 'alice', 'werewolf new');
    await host.game('C1', 'U1', 'alice', 'werewolf cancel');
    await host.game('C1', 'U1', 'alice', 'undercover new');
    expect(host.state('undercover', 'C1')).toMatchObject({ phase: 'lobby' });
  });

  it('對誰是臥底使用狼人殺的指令：只讓輸入的人看到不適用', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'undercover new');
    await host.game('C1', 'U1', 'alice', 'werewolf start');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: '這個指令不適用於目前的遊戲。' });
    await host.command('C1', 'U1', 'alice', 'start');
    expect(lastEph(calls)).toMatchObject({ text: '這個指令不適用於目前的遊戲。' });
  });

  it('誰是臥底的開始按鈕、私訊發詞和計時都交給誰是臥底', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'undercover new');
    for (const u of ['U2', 'U3', 'U4']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const s = host.state('undercover', 'C1')!;
    expect(s.phase).toBe('speech');
    expect(calls.some((c) => c.method === 'chat.postMessage' && String(c.args.text).includes('你的詞是：'))).toBe(true);
    const speaker = s.speaker;
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('undercover', 'C1')!.speaker).not.toBe(speaker);
  });

  it('白板用 /game undercover guess 猜詞', () => {
    expect(parseUndercoverCommand('guess  牛奶 ', 'U1', 'C1')).toEqual({ type: 'guess', user: 'U1', word: '牛奶' });
    expect(parseUndercoverCommand('addbot 3', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 3 });
    expect(parseUndercoverCommand('vote', 'U1', 'C1')).toEqual({ type: 'endDiscussion', user: 'U1' });
    expect(parseUndercoverCommand('dance', 'U1', 'C1')).toBeNull();
  });

  it('/game stats 是跨遊戲戰績 (包含狼人殺的紀錄)；/werewolf stats 維持狼人殺詳細戰績', async () => {
    const { client, calls } = fakeClient();
    const stats = new StatsStore(':memory:');
    stats.record('C1', 'good', [{ id: 'U1', role: 'seer' }]);
    const host = new GameHost(client, { stats, setTimer: () => {} });
    await host.game('C1', 'U1', 'alice', 'stats');
    expect(lastEph(calls).text).toContain('🐺 狼人殺 1 場 1 勝 (100%)');
    await host.command('C1', 'U1', 'alice', 'stats');
    expect(lastEph(calls).text).toContain('總計：1 場 1 勝');
  });

  it('已移除的四葉草：/game soclover 顯示大廳；舊紀錄照樣列出，名稱顯示代號', async () => {
    const { client, calls } = fakeClient();
    const stats = new StatsStore(':memory:');
    stats.recordMatch('C1', 'soclover', ['U1', 'U2', 'U3'], [], 12);
    const host = new GameHost(client, { stats, setTimer: () => {} });
    await host.game('C1', 'U1', 'alice', 'soclover new');
    expect(lastEph(calls).blocks.find((b: any) => b.type === 'actions')).toBeDefined();
    expect(calls.some((c) => c.method === 'chat.postMessage')).toBe(false);
    await host.game('C1', 'U1', 'alice', 'stats');
    expect(lastEph(calls).text).toContain('soclover 1 場，最高 12 分');
  });
});

describe('game-commands: 間諜危機', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game spyfall new 開間諜危機的房間，按鈕加入會更新公告', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'spyfall new');
    expect(calls.at(-1)!.args.text).toContain('間諜危機房間');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(host.state('spyfall', 'C1')!.players.map((p) => p.id)).toEqual(['U1', 'U2']);
  });

  it('/game spyfall help 列出間諜危機的指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'spyfall help');
    const text = lastEph(calls).text;
    for (const s of ['new', 'addbot', 'removebot', 'start', 'next', 'vote', 'cancel', 'guess']) expect(text).toContain(`/game spyfall ${s}`);
  });

  it('一個頻道同時只有一局：間諜危機和其他遊戲互相擋', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'spyfall new');
    await host.game('C1', 'U2', 'bob', 'undercover new');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
    await host.game('C1', 'U2', 'bob', 'werewolf start');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '這個指令不適用於目前的遊戲。' });

    const other = setup();
    await other.host.game('C2', 'U1', 'alice', 'undercover new');
    await other.host.game('C2', 'U2', 'bob', 'spyfall new');
    expect(lastEph(other.calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
    expect(other.host.state('spyfall', 'C2')).toBeUndefined();
  });

  it('開始按鈕、私訊、選人和回答完畢按鈕、計時都交給間諜危機', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'spyfall new');
    for (const u of ['U2', 'U3', 'U4']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    expect(host.state('spyfall', 'C1')!.qa).toMatchObject({ step: 'choose', asker: 'U4' });
    expect(calls.some((c) => c.method === 'chat.postMessage' && String(c.args.text).includes('你是間諜'))).toBe(true);
    await host.button('ww:askTarget:1', 'C1|U2', 'U4', 'U4');
    expect(host.state('spyfall', 'C1')!.qa).toMatchObject({ step: 'answer', target: 'U2' });
    await host.button('ww:endAnswer:0', 'C1|U2', 'U2', 'U2');
    expect(host.state('spyfall', 'C1')!.qa).toMatchObject({ step: 'choose', asker: 'U2' });
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('spyfall', 'C1')!.qa!.step).toBe('answer');
  });

  it('指令解析：guess 地點、next、vote、addbot', () => {
    expect(parseSpyfallCommand('guess  KTV包廂 ', 'U1', 'C1')).toEqual({ type: 'guess', user: 'U1', location: 'KTV包廂' });
    expect(parseSpyfallCommand('next', 'U1', 'C1')).toEqual({ type: 'skipSpeaker', user: 'U1' });
    expect(parseSpyfallCommand('vote', 'U1', 'C1')).toEqual({ type: 'endDiscussion', user: 'U1' });
    expect(parseSpyfallCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseSpyfallCommand('guess', 'U1', 'C1')).toBeNull();
    expect(parseSpyfallCommand('dance', 'U1', 'C1')).toBeNull();
  });
});

describe('game-commands: 阿瓦隆', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game avalon new 開阿瓦隆的房間，按鈕加入會更新公告', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'avalon new');
    expect(calls.at(-1)!.args.text).toContain('阿瓦隆房間');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(host.state('avalon', 'C1')!.players.map((p) => p.id)).toEqual(['U1', 'U2']);
  });

  it('/game avalon help 列出阿瓦隆的指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'avalon help');
    const text = lastEph(calls).text;
    for (const s of ['new', 'addbot', 'removebot', 'start', 'next', 'cancel']) expect(text).toContain(`/game avalon ${s}`);
  });

  it('一個頻道同時只有一局：阿瓦隆和其他遊戲互相擋', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'avalon new');
    await host.game('C1', 'U2', 'bob', 'spyfall new');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
    const other = setup();
    await other.host.game('C2', 'U1', 'alice', 'werewolf new');
    await other.host.game('C2', 'U2', 'bob', 'avalon new');
    expect(lastEph(other.calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
    expect(other.host.state('avalon', 'C2')).toBeUndefined();
  });

  it('開始、身分私訊、壞人群組、發言、選人、投票、出任務、計時都交給阿瓦隆', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'avalon new');
    for (const u of ['U2', 'U3', 'U4', 'U5']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    expect(calls.some((c) => c.method === 'chat.postMessage' && String(c.args.text).includes('你是梅林'))).toBe(true);
    expect(calls.some((c) => c.method === 'conversations.open' && c.args.users === 'U4,U5')).toBe(true);
    for (const u of ['U1', 'U2', 'U3', 'U4', 'U5']) await host.button('ww:endSpeech:0', `C1|${u}`, u, u);
    expect(host.state('avalon', 'C1')!.phase).toBe('pick');
    await host.button('ww:pickMember:0', 'C1|U1', 'U5', 'U5');
    await host.button('ww:pickMember:1', 'C1|U2', 'U5', 'U5');
    await host.button('ww:confirmTeam:0', 'C1|confirm', 'U5', 'U5');
    for (const u of ['U1', 'U2', 'U3', 'U4', 'U5']) await host.button('ww:teamVote:0', 'C1|approve', u, u);
    expect(host.state('avalon', 'C1')!.phase).toBe('quest');
    expect(calls.some((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U1' && String(c.args.text).includes('任務 1'))).toBe(true);
    await host.button('ww:quest:0', 'C1|success', 'U1', 'U1');
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('avalon', 'C1')!.results).toEqual(['success']);
  });

  it('刺殺按鈕貼在壞人群組，刺客按下後結束', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'avalon new');
    for (const u of ['U2', 'U3', 'U4', 'U5']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    // 沒人操作：投票算贊成、任務算成功 → 3 個任務成功後進入刺殺
    for (let i = 0; i < 100 && host.state('avalon', 'C1')!.phase !== 'assassinate'; i++) {
      timers.at(-1)!.fn();
      await host.idle();
    }
    expect(host.state('avalon', 'C1')!.phase).toBe('assassinate');
    const post = calls.filter((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U4,U5').at(-1)!;
    expect(buttonsOf(post).map((b: any) => b.action_id)).toEqual(['ww:assassinate:0', 'ww:assassinate:1', 'ww:assassinate:2']);
    await host.button('ww:assassinate:0', 'C1|U1', 'U4', 'U4');
    expect(host.state('avalon', 'C1')).toMatchObject({ phase: 'ended', winner: 'evil' });
  });

  it('指令解析：next、addbot；沒有 vote 和 guess', () => {
    expect(parseAvalonCommand('next', 'U1', 'C1')).toEqual({ type: 'skipSpeaker', user: 'U1' });
    expect(parseAvalonCommand('addbot 4', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 4 });
    expect(parseAvalonCommand('vote', 'U1', 'C1')).toBeNull();
    expect(parseAvalonCommand('guess x', 'U1', 'C1')).toBeNull();
  });
});

describe('game-commands: 機密代號', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  async function startedHost() {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'codenames new');
    for (const u of ['U2', 'U3', 'U4']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls, timers };
  }

  it('/game codenames new 開機密代號的房間，按鈕加入會更新公告', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'codenames new');
    expect(calls.at(-1)!.args.text).toContain('機密代號房間');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(host.state('codenames', 'C1')!.players.map((p) => p.id)).toEqual(['U1', 'U2']);
  });

  it('/game codenames help 列出機密代號的指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'codenames help');
    const text = lastEph(calls).text;
    for (const s of ['new', 'start', 'clue', 'next', 'cancel']) expect(text).toContain(`/game codenames ${s}`);
  });

  it('一個頻道同時只有一局', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'codenames new');
    await host.game('C1', 'U2', 'bob', 'avalon new');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
    const other = setup();
    await other.host.game('C2', 'U1', 'alice', 'undercover new');
    await other.host.game('C2', 'U2', 'bob', 'codenames new');
    expect(lastEph(other.calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
  });

  it('開始後貼出 5×5 牌桌，隊長收到答案；給提示、按字卡翻牌後牌桌原地更新', async () => {
    const { host, calls } = await startedHost();
    const boardPost = calls.find((c) => c.method === 'chat.postMessage' && buttonsOf(c).some((b: any) => b.action_id.startsWith('ww:guess:')))!;
    const rows = boardPost.args.blocks.filter((b: any) => b.type === 'actions');
    expect(rows).toHaveLength(5);
    expect(rows[0].elements.map((b: any) => b.action_id)).toEqual(['ww:guess:0', 'ww:guess:1', 'ww:guess:2', 'ww:guess:3', 'ww:guess:4']);
    expect(rows[0].elements[0].value).toBe('C1|0');
    expect(calls.some((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U2' && String(c.args.text).includes('答案'))).toBe(true);
    await host.game('C1', 'U2', 'U2', 'codenames clue 水果 2');
    expect(host.state('codenames', 'C1')!.phase).toBe('guess');
    await host.button('ww:guess:0', 'C1|0', 'U4', 'U4');
    expect(host.state('codenames', 'C1')!.cards[0].revealed).toBe(true);
    const boardPosts = calls.filter((c) => c.method === 'chat.postMessage' && buttonsOf(c).some((b: any) => b.action_id.startsWith('ww:guess:')));
    expect(boardPosts).toHaveLength(1);
    const update = calls.filter((c) => c.method === 'chat.update' && buttonsOf(c).some((b: any) => b.action_id.startsWith('ww:guess:'))).at(-1);
    expect(update).toBeDefined();
    const first = update!.args.blocks.find((b: any) => b.type === 'actions').elements[0];
    expect(first).toMatchObject({ style: 'primary', text: { text: expect.stringContaining('🟦') } });
  });

  it('結束猜牌按鈕和計時交給機密代號', async () => {
    const { host, timers } = await startedHost();
    await host.game('C1', 'U2', 'U2', 'codenames clue 水果 2');
    await host.button('ww:guess:0', 'C1|0', 'U4', 'U4');
    await host.button('ww:endGuess:0', 'C1|end', 'U4', 'U4');
    expect(host.state('codenames', 'C1')).toMatchObject({ phase: 'clue', turn: 'red' });
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('codenames', 'C1')!.turn).toBe('blue');
  });

  it('指令解析：clue、next', () => {
    expect(parseCodenamesCommand('clue 水果 2', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', word: '水果', count: 2 });
    expect(parseCodenamesCommand('clue 水 果 2', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', word: '水 果', count: 2 });
    expect(parseCodenamesCommand('clue 水果', 'U1', 'C1')).toBeNull();
    expect(parseCodenamesCommand('next', 'U1', 'C1')).toEqual({ type: 'skipTurn', user: 'U1' });
    expect(parseCodenamesCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
  });
});

describe('game-commands: 吹牛骰', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game 清單有吹牛骰；/game liarsdice help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['吹牛骰', 'liarsdice', '2～8 人', '/game liarsdice new']) expect(lastEph(calls).text).toContain(s);
    await host.game('C1', 'U1', 'alice', 'liarsdice help');
    for (const s of ['new', 'addbot', 'removebot', 'start', 'bid', 'cancel']) expect(lastEph(calls).text).toContain(`/game liarsdice ${s}`);
  });

  it('開房、加入、開始、私訊骰子、喊數、開、計時都交給吹牛骰', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'liarsdice new');
    expect(calls.at(-1)!.args.text).toContain('吹牛骰房間');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    expect(calls.some((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U1' && String(c.args.text).includes('你的骰子'))).toBe(true);
    await host.game('C1', 'U3', 'U3', 'liarsdice bid 16 6');
    expect(host.games.get('C1')).toBeUndefined();
    await host.button('ww:challenge:0', 'C1|U1', 'U1', 'U1');
    timers.at(-1)!.fn();
    await host.idle();
    expect(calls.some((c) => String(c.args.text).includes('<@U3> 輸了'))).toBe(true);
  });

  it('一個頻道同時只有一局；指令解析', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'liarsdice new');
    await host.game('C1', 'U2', 'bob', 'codenames new');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
    expect(parseLiarsDiceCommand('bid 3 5', 'U1', 'C1')).toEqual({ type: 'bid', user: 'U1', quantity: 3, face: 5 });
    expect(parseLiarsDiceCommand('bid 3', 'U1', 'C1')).toBeNull();
    expect(parseLiarsDiceCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseLiarsDiceCommand('next', 'U1', 'C1')).toBeNull();
  });
});

describe('game-commands: 一字千金', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game 清單有一字千金；/game justone help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['一字千金', 'justone', '3～7 人', '/game justone new']) expect(lastEph(calls).text).toContain(s);
    await host.game('C1', 'U1', 'alice', 'justone help');
    for (const s of ['new', 'start', 'clue', 'guess', 'next', 'cancel']) expect(lastEph(calls).text).toContain(`/game justone ${s}`);
  });

  it('開房、開始、私訊詞、給提示、猜詞、跳過按鈕、計時都交給一字千金', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'justone new');
    expect(calls.at(-1)!.args.text).toContain('一字千金房間');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const word = host.state('justone', 'C1')!.word!;
    expect(calls.some((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U1' && String(c.args.text).includes(word))).toBe(true);
    await host.game('C1', 'U1', 'U1', 'justone clue 牛頓');
    await host.game('C1', 'U2', 'U2', 'justone clue 紅色');
    expect(host.state('justone', 'C1')!.phase).toBe('guess');
    await host.game('C1', 'U3', 'U3', `justone guess ${word}`);
    expect(host.state('justone', 'C1')).toMatchObject({ score: 1, card: 2 });
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('justone', 'C1')!.phase).toBe('guess');
    await host.button('ww:skipGuess:0', 'C1|U1', 'U1', 'U1');
    expect(host.state('justone', 'C1')!.card).toBe(3);
  });

  it('指令解析', () => {
    expect(parseJustOneCommand('clue 牛頓', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', word: '牛頓' });
    expect(parseJustOneCommand('clue 水 果', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', word: '水 果' });
    expect(parseJustOneCommand('guess 蘋果', 'U1', 'C1')).toEqual({ type: 'guess', user: 'U1', word: '蘋果' });
    expect(parseJustOneCommand('next', 'U1', 'C1')).toEqual({ type: 'skipStep', user: 'U1' });
    expect(parseJustOneCommand('clue', 'U1', 'C1')).toBeNull();
  });
});

describe('game-commands: 政變', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game 清單有政變；/game coup help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['政變', 'coup', '3～6 人', '/game coup new']) expect(lastEph(calls).text).toContain(s);
    await host.game('C1', 'U1', 'alice', 'coup help');
    for (const s of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(lastEph(calls).text).toContain(`/game coup ${s}`);
  });

  it('行動、目標、質疑、阻擋、私訊翻牌和交換的按鈕都交給政變', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'coup new');
    expect(calls.at(-1)!.args.text).toContain('政變房間');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    expect(calls.some((c) => c.method === 'chat.postMessage' && c.args.channel === 'D:U1' && String(c.args.text).includes('你的手牌'))).toBe(true);
    // U3 宣稱公爵收稅，U1 質疑成功 → U3 在私訊選一張翻開
    await host.button('ww:coupAction:2', 'C1|tax', 'U3', 'U3');
    await host.button('ww:challenge:0', 'C1|challenge', 'U1', 'U1');
    expect(host.state('coup', 'C1')!.losing).toEqual(['U3']);
    await host.button('ww:loseCard:0', 'C1|0', 'U3', 'U3');
    expect(host.state('coup', 'C1')!.players[2].cards[0].revealed).toBe(true);
    // U1 外援，U2 用公爵阻擋，沒人質疑就擋下來
    await host.button('ww:coupAction:1', 'C1|foreignAid', 'U1', 'U1');
    await host.button('ww:block:0', 'C1|duke', 'U2', 'U2');
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('coup', 'C1')!.players[0].coins).toBe(2);
    // U2 對 U1 勒索：選目標
    await host.button('ww:coupAction:3', 'C1|steal', 'U2', 'U2');
    await host.button('ww:coupTarget:0', 'C1|U1', 'U2', 'U2');
    expect(host.state('coup', 'C1')!.phase).toBe('challenge');
    // U3 交換
    const s = host.state('coup', 'C1')!;
    host.setState('coup', 'C1', { ...s, phase: 'action', turn: 2, pending: undefined });
    await host.button('ww:coupAction:4', 'C1|exchange', 'U3', 'U3');
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('coup', 'C1')!.phase).toBe('exchange');
    await host.button('ww:keepCard:0', 'C1|1', 'U3', 'U3');
    expect(host.state('coup', 'C1')!.phase).toBe('action');
  });
});

describe('game-commands: 花火', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game 清單有花火；/game hanabi help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['花火', 'hanabi', '2～5 人', '/game hanabi new']) expect(lastEph(calls).text).toContain(s);
    await host.game('C1', 'U1', 'alice', 'hanabi help');
    for (const s of ['new', 'start', 'hint', 'cancel']) expect(lastEph(calls).text).toContain(`/game hanabi ${s}`);
    expect(lastEph(calls).text).toContain('/game hanabi hint @某人 紅');
    expect(lastEph(calls).text).toContain('給提示');
    expect(lastEph(calls).text).not.toContain('<紅|');
  });

  it('給提示按鈕：選單只讓自己看到並帶按鈕，選人、選顏色後完成提示', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'hanabi new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    await host.button('ww:hanabiTurn:1', 'C1|hint', 'U2', 'bob');
    const menu = lastEph(calls);
    expect(menu).toMatchObject({ channel: 'C1', user: 'U2' });
    const values = (args: typeof menu) =>
      (args.blocks as { type: string; elements?: { value: string; text: { text: string } }[] }[])
        .find((b) => b.type === 'actions')!
        .elements!.map((e) => e.value);
    expect(values(menu)).toEqual(['C1|hintTarget:U1']);
    expect(JSON.stringify(menu.blocks)).toContain('"text":"alice"');
    await host.button('ww:hanabiTurn:0', 'C1|hintTarget:U1', 'U2', 'bob');
    expect(values(lastEph(calls))).toEqual(['C1|hint:U1:red', 'C1|hint:U1:1', 'C1|hint:U1:2']);
    await host.button('ww:hanabiTurn:0', 'C1|hint:U1:red', 'U2', 'bob');
    expect(host.state('hanabi', 'C1')).toMatchObject({ hints: 7, turn: 0 });
    await host.button('ww:hanabiTurn:0', 'C1|hint:U1:2', 'U2', 'bob');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: expect.stringContaining('還沒輪到你') });
    expect(host.state('hanabi', 'C1')!.hints).toBe(7);
  });

  it('看牌、出牌、棄牌按鈕和提示指令、計時都交給花火', async () => {
    const { client, calls } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'hanabi new');
    expect(calls.at(-1)!.args.text).toContain('花火房間');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    await host.button('ww:hanabiTurn:0', 'C1|peek', 'U1', 'alice');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('<@U2>：🟥3') });
    await host.button('ww:hanabiTurn:1', 'C1|discards', 'U3', 'carol');
    expect(lastEph(calls)).toMatchObject({ user: 'U3', text: expect.stringContaining('棄牌堆是空的') });
    await host.game('C1', 'U2', 'bob', 'hanabi hint <@U1|alice> 紅');
    expect(host.state('hanabi', 'C1')).toMatchObject({ hints: 7, turn: 0 });
    await host.button('ww:hanabiTurn:1', 'C1|play:0', 'U1', 'alice');
    expect(host.state('hanabi', 'C1')!.fireworks.red).toBe(1);
    await host.button('ww:hanabiTurn:6', 'C1|discard:0', 'U2', 'bob');
    expect(host.state('hanabi', 'C1')!.hints).toBe(8);
    timers.at(-1)!.fn();
    await host.idle();
    expect(host.state('hanabi', 'C1')!.turn).toBe(1);
  });

  it('提示指令解析：@某人 加上顏色或數字', () => {
    expect(parseHanabiCommand('hint <@U2|bob> 紅', 'U1', 'C1')).toEqual({ type: 'hint', user: 'U1', target: 'U2', color: 'red' });
    expect(parseHanabiCommand('hint <@U2> 3', 'U1', 'C1')).toEqual({ type: 'hint', user: 'U1', target: 'U2', number: 3 });
    expect(parseHanabiCommand('hint <@U2> 紫', 'U1', 'C1')).toBeNull();
    expect(parseHanabiCommand('hint bob 3', 'U1', 'C1')).toBeNull();
    expect(parseHanabiCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
  });
});

describe('game-commands: 遊戲大廳', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  const KINDS = ['werewolf', 'undercover', 'spyfall', 'avalon', 'codenames', 'liarsdice', 'justone', 'coup', 'hanabi', 'wavelength', 'decrypto', 'wavecoop', 'insider', 'skull', 'nimmt', 'loveletter', 'cockroach', 'chameleon', 'nothanks', 'taboo', 'sushigo', 'meme', 'herd', 'kittens', 'criminal', 'wager', 'incan', 'dixit', 'citadels', 'emoji', 'crew', 'saboteur', 'forsale', 'machikoro', 'splendor', 'deception'];

  const TABS = ['deduction', 'bluff', 'party', 'team', 'coop', 'strategy'];
  const TAB_GAMES: Record<string, string[]> = {
    deduction: ['werewolf', 'undercover', 'spyfall', 'avalon', 'insider', 'chameleon', 'saboteur', 'deception'],
    bluff: ['liarsdice', 'coup', 'skull', 'loveletter', 'cockroach', 'criminal'],
    party: ['meme', 'herd', 'wager', 'dixit', 'emoji'],
    team: ['codenames', 'wavelength', 'decrypto', 'taboo'],
    coop: ['justone', 'hanabi', 'wavecoop', 'crew'],
    strategy: ['nimmt', 'nothanks', 'sushigo', 'kittens', 'incan', 'citadels', 'forsale', 'machikoro', 'splendor'],
  };
  const openButtons = (blocks: any[]) => blocks.filter((b) => b.accessory).map((b) => b.accessory);
  const tabButtons = (blocks: any[]) => blocks.find((b) => b.type === 'actions')!.elements;

  it('/game、/game help、不認識的代號：只讓自己看到大廳，有六個分類按鈕，預設只列身分推理類', async () => {
    for (const text of ['', 'help', 'chess']) {
      const { host, calls } = setup();
      await host.game('C1', 'U1', 'alice', text);
      const eph = lastEph(calls);
      expect(eph.user).toBe('U1');
      const tabs = tabButtons(eph.blocks);
      expect(tabs.map((b: any) => b.value)).toEqual(TABS.map((t) => `C1|${t}`));
      expect(tabs.map((b: any) => b.text.text)).toEqual(['🔍 身分推理', '🎭 吹牛心機', '😂 派對創意', '⚔️ 團隊對抗', '🤝 合作', '🧩 策略桌遊']);
      expect(tabs.map((b: any) => b.style)).toEqual(['primary', undefined, undefined, undefined, undefined, undefined]);
      expect(tabs.every((b: any) => b.action_id.startsWith('ww:lobbyTab:'))).toBe(true);
      const buttons = openButtons(eph.blocks);
      expect(buttons.map((b) => b.value)).toEqual(TAB_GAMES.deduction.map((k) => `C1|${k}`));
      expect(buttons.every((b: any) => b.action_id.startsWith('ww:lobbyOpen:') && b.text.text === '開房')).toBe(true);
      const all = JSON.stringify(eph.blocks);
      for (const s of ['狼人殺', '6～12 人', 'wiki', '/game <代號> help']) expect(all).toContain(s);
      expect(all).not.toContain('吹牛骰');
    }
  });

  it('大廳底部有指令提示、wiki 和社群討論連結', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    const footer = lastEph(calls).blocks.at(-1);
    expect(footer.type).toBe('context');
    const text = footer.elements[0].text;
    expect(text).toContain('/game <代號> help');
    expect(text).toContain('|wiki>');
    expect(text).toContain('<https://github.com/eric0324/slack-gamebuddy/discussions|💬 社群討論>');
  });

  it('每個分類依序列出它的遊戲', async () => {
    const { host, responds } = setup();
    for (const t of TABS) {
      await host.button('ww:lobbyTab:0', `C1|${t}`, 'U1', 'alice', undefined, `https://hooks/${t}`);
      expect(openButtons(responds.at(-1)!.payload.blocks).map((b: any) => b.value.split('|')[1]), t).toEqual(TAB_GAMES[t]);
    }
  });

  it('每款遊戲剛好在一個分類裡', async () => {
    const { host, responds } = setup();
    const seen: string[] = [];
    for (const t of TABS) {
      await host.button('ww:lobbyTab:0', `C1|${t}`, 'U1', 'alice', undefined, `https://hooks/${t}`);
      const games = openButtons(responds.at(-1)!.payload.blocks).map((b: any) => b.value.split('|')[1]);
      expect(games.length, t).toBeGreaterThan(0);
      seen.push(...games);
    }
    expect(seen.sort()).toEqual([...KINDS].sort());
  });

  it('切換分類：用 response_url 換掉同一則大廳，標示目前分類，不另發新訊息', async () => {
    const { host, calls, responds } = setup();
    await host.game('C1', 'U1', 'alice', '');
    const before = calls.length;
    await host.button('ww:lobbyTab:4', 'C1|coop', 'U1', 'alice', undefined, 'https://hooks/x');
    expect(calls.length).toBe(before);
    expect(responds).toHaveLength(1);
    const { url, payload } = responds[0];
    expect(url).toBe('https://hooks/x');
    expect(payload.replace_original).toBe(true);
    expect(openButtons(payload.blocks).map((b: any) => b.value)).toEqual(['C1|justone', 'C1|hanabi', 'C1|wavecoop', 'C1|crew']);
    expect(tabButtons(payload.blocks).map((b: any) => b.style)).toEqual([undefined, undefined, undefined, undefined, 'primary', undefined]);
  });

  it('response_url 失敗或沒有時，改發一則新的大廳', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, respond: async () => { throw new Error('expired'); } });
    await host.button('ww:lobbyTab:5', 'C1|strategy', 'U1', 'alice', undefined, 'https://hooks/x');
    expect(openButtons(lastEph(calls).blocks).map((b: any) => b.value)).toEqual(TAB_GAMES.strategy.map((k) => `C1|${k}`));
    await host.button('ww:lobbyTab:3', 'C1|team', 'U1', 'alice');
    expect(lastEph(calls)).toMatchObject({ user: 'U1' });
    expect(openButtons(lastEph(calls).blocks).map((b: any) => b.value)).toEqual(['C1|codenames', 'C1|wavelength', 'C1|decrypto', 'C1|taboo']);
  });

  it('按開房等同 /game <代號> new，按的人當房主', async () => {
    const { host, calls } = setup();
    await host.button('ww:lobbyOpen:5', 'C1|liarsdice', 'U2', 'bob');
    expect(host.state('liarsdice', 'C1')).toMatchObject({ phase: 'lobby', host: 'U2' });
    expect(calls.at(-1)!.args.text).toContain('吹牛骰房間');
    const ww = setup();
    await ww.host.button('ww:lobbyOpen:0', 'C1|werewolf', 'U3', 'carol');
    expect(ww.host.games.get('C1')).toMatchObject({ phase: 'lobby', host: 'U3' });
  });

  it('頻道已經有遊戲時拒絕', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'werewolf new');
    await host.button('ww:lobbyOpen:7', 'C1|coup', 'U2', 'bob');
    expect(host.state('coup', 'C1')).toBeUndefined();
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '這個頻道已經有遊戲了。' });
  });
});

describe('game-lobby: 房間公告附上遊戲說明', () => {
  const lobbyPost = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postMessage' || c.method === 'chat.update').at(-1)!.args;
  const rulesLink = (name: string) => `https://github.com/eric0324/slack-gamebuddy/wiki/${encodeURI(`${name}-遊戲規則`)}`;

  it('開房時附上該遊戲的規則頁連結，有人加入後仍保留', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'liarsdice new');
    expect(lobbyPost(calls).text).toContain(rulesLink('吹牛骰'));
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(lobbyPost(calls).text).toContain(rulesLink('吹牛骰'));
  });

  it('狼人殺的房間也有', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    expect(lobbyPost(calls).text).toContain(rulesLink('狼人殺'));
  });
});

describe('game-commands: 訊息格式正確顯示', () => {
  it('標記外側緊貼中文或全形標點時補空格；已經有空白或半形標點時不變', () => {
    expect(slackText('📍 *間諜危機* (`spyfall`) 4～10 人')).toBe('📍 *間諜危機* (`spyfall`) 4～10 人');
    expect(slackText('請用 `/game justone clue <詞>` 給提示')).toBe('請用 `/game justone clue <詞>` 給提示');
    expect(slackText('輸入`/game`開房')).toBe('輸入 `/game` 開房');
    expect(slackText('*狼人殺指令*\n• `/werewolf new`：開房')).toBe('*狼人殺指令*\n• `/werewolf new` ：開房');
    expect(slackText('(`a`) and *b*.')).toBe('(`a`) and *b*.');
  });

  it('送出的公告、只讓自己看到的訊息和大廳都套用', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    expect(JSON.stringify(calls.at(-1)!.args.blocks)).toContain('*間諜危機* (`spyfall`)');
    await host.game('C1', 'U1', 'alice', 'liarsdice new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const turn = calls.find((c) => String(c.args.text).includes('喊數'))!;
    expect(turn.args.text).toContain('喊數： `/game liarsdice bid <數量> <點數>` (');
  });
});

describe('game-commands: 換遊戲後按鈕仍交給新遊戲', () => {
  it('取消誰是臥底後開吹牛骰，誰是臥底留下的計時器觸發後，加入按鈕仍然交給吹牛骰', async () => {
    const { client } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.game('C1', 'U1', 'alice', 'undercover new');
    for (const u of ['U2', 'U3', 'U4']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const stale = timers.at(-1)!;
    await host.game('C1', 'U1', 'alice', 'undercover cancel');
    await host.button('ww:lobbyOpen:5', 'C1|liarsdice', 'U1', 'alice');
    stale.fn();
    await host.idle();
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(host.state('liarsdice', 'C1')!.players.map((p) => p.id)).toEqual(['U1', 'U2']);
  });

  it('狼人殺的計時器也一樣', async () => {
    const { client } = fakeClient();
    const timers: { fn: () => void; ms: number }[] = [];
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: (fn, ms) => void timers.push({ fn, ms }), gifs: {} });
    await host.command('C1', 'U1', 'alice', 'new');
    await host.command('C1', 'U1', 'alice', 'addbot 5');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const stale = timers.at(-1)!;
    await host.command('C1', 'U1', 'alice', 'cancel');
    await host.game('C1', 'U1', 'alice', 'coup new');
    stale.fn();
    await host.idle();
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    expect(host.state('coup', 'C1')!.players.map((p) => p.id)).toEqual(['U1', 'U2']);
  });
});

describe('game-commands: 心電感應', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  // rng 固定：U1、U3 橘隊，U2、U4 紫隊，紫隊 U2 先出題，隊友 U4
  async function startGame(opts: { viewsFail?: boolean } = {}) {
    const { client, calls } = fakeClient(opts);
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'wavelength new');
    for (const u of ['U2', 'U3', 'U4']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單和大廳有心電感應；/game wavelength help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['心電感應', 'wavelength', '4～12 人', '/game wavelength new']) expect(lastEph(calls).text).toContain(s);
    expect(lastEph(calls).text).toContain('wavelength');
    await host.game('C1', 'U1', 'alice', 'wavelength help');
    for (const s of ['new', 'start', 'clue', 'cancel']) expect(lastEph(calls).text).toContain(`/game wavelength ${s}`);
  });

  it('指令解析：new、start、cancel、clue、addbot', () => {
    expect(parseWavelengthCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseWavelengthCommand('clue 麻辣 火鍋', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', text: '麻辣 火鍋' });
    expect(parseWavelengthCommand('clue', 'U1', 'C1')).toBeNull();
    expect(parseWavelengthCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseWavelengthCommand('guess 3', 'U1', 'C1')).toBeNull();
  });

  it('寫提示按鈕：用 trigger_id 開視窗，送出後變成提示', async () => {
    const { host, calls } = await startGame();
    await host.button('ww:wavelength:0', 'C1|clue', 'U2', 'bob', 'T123');
    const open = calls.find((c) => c.method === 'views.open')!.args;
    expect(open).toMatchObject({ trigger_id: 'T123', view: { type: 'modal', callback_id: 'ww:wavelengthClue', private_metadata: 'C1' } });
    expect(JSON.stringify(open.view)).toContain('寫提示');
    expect(open.view.blocks.map((b: any) => b.block_id)).toEqual(['text']);
    await host.modal('ww:wavelengthClue', 'C1', 'U2', 'bob', ['火鍋']);
    expect(host.state('wavelength', 'C1')).toMatchObject({ phase: 'guess', clue: '火鍋' });
  });

  it('視窗打不開時，只讓出題者看到改用指令', async () => {
    const { host, calls } = await startGame({ viewsFail: true });
    await host.button('ww:wavelength:0', 'C1|clue', 'U2', 'bob', 'T123');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: expect.stringContaining('/game wavelength clue') });
  });

  it('0～10 按鈕分兩列；猜位置和猜左右的按鈕交給心電感應', async () => {
    const { host, calls } = await startGame();
    await host.game('C1', 'U2', 'bob', 'wavelength clue 火鍋');
    const msg = calls.filter((c) => c.method === 'chat.postMessage').at(-1)!;
    const rows = msg.args.blocks.filter((b: any) => b.type === 'actions');
    expect(rows.map((b: any) => b.elements.length)).toEqual([6, 5]);
    expect(new Set(buttonsOf(msg).map((b: any) => b.action_id)).size).toBe(11);
    await host.button('ww:wavelength:9', 'C1|guess:9', 'U4', 'dan');
    expect(host.state('wavelength', 'C1')).toMatchObject({ phase: 'side', answer: 9 });
    await host.button('ww:wavelength:1', 'C1|side:right', 'U1', 'alice');
    await host.button('ww:wavelength:1', 'C1|side:right', 'U3', 'carol');
    expect(host.state('wavelength', 'C1')).toMatchObject({ round: 1, scores: { purple: 3, orange: 1 } });
  });

  it('沒有設 perRow 的按鈕訊息維持一列', async () => {
    const { host, calls } = await startGame();
    const msg = calls.filter((c) => c.method === 'chat.postMessage' && c.args.text?.includes('寫提示')).at(-1)!;
    expect(msg.args.blocks.filter((b: any) => b.type === 'actions')).toHaveLength(1);
    expect(host.state('wavelength', 'C1')!.phase).toBe('clue');
  });
});

describe('game-commands: 心電感應 (合作)', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  // rng 固定：出題順序 U1、U2、U3，第 1 題 U1 出題，U2、U3 猜，目標 10
  async function startGame(opts: { viewsFail?: boolean } = {}) {
    const { client, calls } = fakeClient(opts);
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.button('ww:lobbyOpen:0', 'C1|wavecoop', 'U1', 'alice');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單有心電感應 (合作)；/game wavecoop help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['心電感應 (合作)', 'wavecoop', '2～12 人', '/game wavecoop new']) expect(lastEph(calls).text).toContain(s);
    for (const text of ['wavecoop help', 'wavecoop dance']) {
      await host.game('C1', 'U1', 'alice', text);
      for (const s of ['new', 'start', 'clue', 'cancel']) expect(lastEph(calls).text).toContain(`/game wavecoop ${s}`);
    }
  });

  it('指令解析：new、start、cancel、clue、addbot', () => {
    expect(parseWavecoopCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseWavecoopCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseWavecoopCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseWavecoopCommand('clue 麻辣 火鍋', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', text: '麻辣 火鍋' });
    expect(parseWavecoopCommand('clue', 'U1', 'C1')).toBeNull();
    expect(parseWavecoopCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseWavecoopCommand('guess 3', 'U1', 'C1')).toBeNull();
  });

  it('從大廳開房：房間公告標示心電感應 (合作)，附上規則連結', async () => {
    const { host, calls } = await startGame();
    expect(host.state('wavecoop', 'C1')).toMatchObject({ host: 'U1', phase: 'clue' });
    const lobby = calls.find((c) => c.method === 'chat.postMessage' && c.args.text?.includes('心電感應 (合作) 房間'))!;
    expect(lobby.args.text).toContain(encodeURI('心電感應-(合作)-遊戲規則'));
  });

  it('寫提示按鈕：用 trigger_id 開視窗，送出後變成提示', async () => {
    const { host, calls } = await startGame();
    await host.button('ww:wavecoop:0', 'C1|clue', 'U1', 'alice', 'T123');
    const open = calls.find((c) => c.method === 'views.open')!.args;
    expect(open).toMatchObject({ trigger_id: 'T123', view: { type: 'modal', callback_id: 'ww:wavecoopClue', private_metadata: 'C1' } });
    await host.modal('ww:wavecoopClue', 'C1', 'U1', 'alice', ['火鍋']);
    expect(host.state('wavecoop', 'C1')).toMatchObject({ phase: 'guess', clue: '火鍋' });
  });

  it('視窗打不開時，只讓出題者看到改用指令', async () => {
    const { host, calls } = await startGame({ viewsFail: true });
    await host.button('ww:wavecoop:0', 'C1|clue', 'U1', 'alice', 'T123');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('/game wavecoop clue') });
  });

  it('用指令寫提示；猜位置的按鈕交給心電感應 (合作)', async () => {
    const { host } = await startGame();
    await host.game('C1', 'U1', 'alice', 'wavecoop clue 火鍋');
    expect(host.state('wavecoop', 'C1')).toMatchObject({ phase: 'guess', clue: '火鍋' });
    await host.button('ww:wavecoop:9', 'C1|guess:9', 'U2', 'bob');
    await host.button('ww:wavecoop:10', 'C1|guess:10', 'U3', 'carol');
    expect(host.state('wavecoop', 'C1')).toMatchObject({ round: 1, score: 4, total: 8 });
  });
});

describe('game-commands: 截碼戰', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  // rng 固定：U1、U3 黑隊，U2、U4 白隊；第 1 回合加密者是 U1、U2
  async function startGame(opts: { viewsFail?: boolean } = {}) {
    const { client, calls } = fakeClient(opts);
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'decrypto new');
    for (const u of ['U2', 'U3', 'U4']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單和大廳有截碼戰；/game decrypto help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['截碼戰', 'decrypto', '4～12 人', '/game decrypto new']) expect(lastEph(calls).text).toContain(s);
    expect(lastEph(calls).text).toContain('decrypto');
    await host.game('C1', 'U1', 'alice', 'decrypto help');
    for (const s of ['new', 'start', 'clue', 'cancel']) expect(lastEph(calls).text).toContain(`/game decrypto ${s}`);
  });

  it('指令解析：new、addbot、clue 用 / 分開剛好 3 個', () => {
    expect(parseDecryptoCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseDecryptoCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseDecryptoCommand('clue 海 / 火山 爆發 / 鐘', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', texts: ['海', '火山 爆發', '鐘'] });
    expect(parseDecryptoCommand('clue 海 / 火', 'U1', 'C1')).toBeNull();
    expect(parseDecryptoCommand('vote 123', 'U1', 'C1')).toBeNull();
  });

  it('寫提示按鈕：開 3 欄視窗，送出後依序變成提示', async () => {
    const { host, calls } = await startGame();
    await host.button('ww:decrypto:0', 'C1|clue', 'U1', 'alice', 'T1');
    const open = calls.find((c) => c.method === 'views.open')!.args;
    expect(open).toMatchObject({ trigger_id: 'T1', view: { callback_id: 'ww:decryptoClue', private_metadata: 'C1' } });
    expect(open.view.blocks.map((b: any) => b.block_id)).toEqual(['f0', 'f1', 'f2']);
    await host.modal('ww:decryptoClue', 'C1', 'U1', 'alice', ['海', '火', '鐘']);
    expect(host.state('decrypto', 'C1')!.teams.black.clues).toEqual(['海', '火', '鐘']);
  });

  it('視窗打不開時，只讓加密者看到改用指令', async () => {
    const { host, calls } = await startGame({ viewsFail: true });
    await host.button('ww:decrypto:0', 'C1|clue', 'U1', 'alice', 'T1');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('/game decrypto clue') });
  });

  it('投票選單 24 組分 4 列；投票和提示紀錄按鈕交給截碼戰', async () => {
    const { host, calls } = await startGame();
    await host.game('C1', 'U1', 'alice', 'decrypto clue 海 / 火 / 鐘');
    await host.game('C1', 'U2', 'bob', 'decrypto clue 甲 / 乙 / 丙');
    expect(host.state('decrypto', 'C1')!.phase).toBe('vote');
    await host.button('ww:decrypto:0', 'C1|decode', 'U3', 'carol');
    const menu = lastEph(calls);
    expect(menu.user).toBe('U3');
    expect(menu.blocks.filter((b: any) => b.type === 'actions').map((b: any) => b.elements.length)).toEqual([6, 6, 6, 6]);
    await host.button('ww:decrypto:0', 'C1|vote:decode:0:123', 'U3', 'carol');
    expect(host.state('decrypto', 'C1')!.decodeVotes).toEqual({ U3: '123' });
    await host.button('ww:decrypto:1', 'C1|history', 'U9', 'zed');
    expect(lastEph(calls)).toMatchObject({ user: 'U9', text: expect.stringContaining('提示紀錄') });
  });
});

describe('game-commands: 圈內人', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  const lastPost = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postMessage').at(-1)!.args;
  // rng 固定：主持人是 U1 (房主)，圈內人是 U2
  async function startGame() {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'insider new');
    for (const u of ['U2', 'U3', 'U4', 'U5']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單和大廳推理類有圈內人；/game insider help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['圈內人', 'insider', '4～8 人', '/game insider new']) expect(lastEph(calls).text).toContain(s);
    expect(JSON.stringify(lastEph(calls).blocks)).toContain('C1|insider');
    await host.game('C1', 'U1', 'alice', 'insider help');
    for (const s of ['new', 'start', 'ask', 'vote', 'cancel']) expect(lastEph(calls).text).toContain(`/game insider ${s}`);
    await host.game('C1', 'U1', 'alice', 'insider dance');
    expect(lastEph(calls).text).toContain('圈內人指令');
  });

  it('指令解析：new、start、cancel、addbot、ask、vote', () => {
    expect(parseInsiderCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseInsiderCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseInsiderCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseInsiderCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseInsiderCommand('ask 比 人 大嗎', 'U1', 'C1')).toEqual({ type: 'ask', user: 'U1', text: '比 人 大嗎' });
    expect(parseInsiderCommand('ask', 'U1', 'C1')).toBeNull();
    expect(parseInsiderCommand('vote', 'U1', 'C1')).toEqual({ type: 'skip', user: 'U1' });
    expect(parseInsiderCommand('dance', 'U1', 'C1')).toBeNull();
  });

  it('頻道訊息交給圈內人：主持人看到回答按鈕，按了頻道公告', async () => {
    const { host, calls } = await startGame();
    await host.chat('C1', 'U3', '是動物嗎？');
    const eph = lastEph(calls);
    expect(eph.user).toBe('U1');
    expect(eph.text).toContain('是動物嗎？');
    expect(buttonsOf({ method: '', args: eph }).map((b: any) => b.value)).toEqual([
      'C1|answer:1:yes',
      'C1|answer:1:no',
      'C1|answer:1:unknown',
      'C1|answer:1:correct',
    ]);
    await host.button('ww:insider:0', 'C1|answer:1:yes', 'U1', 'alice');
    expect(lastPost(calls).text).toContain('是動物嗎？');
    expect(lastPost(calls).text).toContain('✅ 是');
  });

  it('猜中、提早投票、投票的按鈕交給圈內人', async () => {
    const { host } = await startGame();
    await host.game('C1', 'U4', 'dave', 'insider ask 是貓嗎');
    await host.button('ww:insider:3', 'C1|answer:1:correct', 'U1', 'alice');
    expect(host.state('insider', 'C1')).toMatchObject({ phase: 'discuss', guesser: 'U4' });
    await host.game('C1', 'U1', 'alice', 'insider vote');
    expect(host.state('insider', 'C1')!.phase).toBe('vote');
    await host.button('ww:insider:0', 'C1|vote:U2', 'U3', 'carol');
    expect(host.state('insider', 'C1')!.votes).toEqual({ U3: 'U2' });
  });

  it('房主按開始投票按鈕', async () => {
    const { host } = await startGame();
    await host.chat('C1', 'U4', '是貓嗎');
    await host.button('ww:insider:3', 'C1|answer:1:correct', 'U1', 'alice');
    await host.button('ww:insider:0', 'C1|skip', 'U1', 'alice');
    expect(host.state('insider', 'C1')!.phase).toBe('vote');
  });

  it('其他遊戲 (非狼人殺) 進行中，頻道訊息不處理', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'decrypto new');
    const before = calls.length;
    await host.chat('C1', 'U1', '是動物嗎？');
    expect(calls.length).toBe(before);
  });
});

describe('game-commands: 骷髏與玫瑰', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  async function startGame() {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'skull new');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單和大廳有骷髏與玫瑰；/game skull help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['骷髏與玫瑰', 'skull', '3～6 人', '/game skull new']) expect(lastEph(calls).text).toContain(s);
    for (const text of ['skull help', 'skull foo']) {
      await host.game('C1', 'U1', 'alice', text);
      for (const s of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(lastEph(calls).text).toContain(`/game skull ${s}`);
    }
  });

  it('指令解析：new、start、cancel、addbot、removebot，其他不認識', () => {
    expect(parseSkullCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseSkullCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseSkullCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseSkullCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseSkullCommand('removebot', 'U1', 'C1')).toEqual({ type: 'removeBot', user: 'U1', count: 1 });
    expect(parseSkullCommand('bid 3', 'U1', 'C1')).toBeNull();
    expect(parseSkullCommand('guess x', 'U1', 'C1')).toBeNull();
  });

  it('按鈕交給骷髏與玫瑰：蓋牌選單只讓自己看到，蓋牌、挑戰、喊數、放棄、翻牌、我的牌', async () => {
    const { host, calls } = await startGame();
    const g = () => host.state('skull', 'C1')!;
    expect(g().phase).toBe('place');
    await host.button('ww:skull:0', 'C1|place', 'U1', 'alice');
    const menu = lastEph(calls);
    expect(menu.user).toBe('U1');
    const discButtons = menu.blocks.filter((b: any) => b.type === 'actions').flatMap((b: any) => b.elements);
    expect(discButtons.map((b: any) => b.value)).toEqual([`C1|disc:${g().step}:rose`, `C1|disc:${g().step}:skull`]);
    for (const u of ['U1', 'U2', 'U3']) await host.button('ww:skull:0', `C1|disc:${g().step}:rose`, u, u);
    expect(g()).toMatchObject({ phase: 'turn', turn: 2 });
    await host.button('ww:skull:1', 'C1|challenge', 'U3', 'carol');
    expect(lastEph(calls)).toMatchObject({ user: 'U3' });
    await host.button('ww:skull:0', `C1|bid:${g().step}:1`, 'U3', 'carol');
    expect(g()).toMatchObject({ phase: 'bid', bid: { n: 1, by: 'U3' } });
    await host.button('ww:skull:3', `C1|pass:${g().step}`, 'U1', 'alice');
    await host.button('ww:skull:3', `C1|pass:${g().step}`, 'U2', 'bob');
    expect(g().players[0].wins + g().players[1].wins + g().players[2].wins).toBe(1);
    await host.button('ww:skull:1', 'C1|mine', 'U2', 'bob');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: expect.stringContaining('你的牌') });
  });

  it('翻牌按鈕的 value 帶 bot 的 id 也能解析', async () => {
    const { host } = await startGame();
    const g = host.state('skull', 'C1')!;
    g.phase = 'flip';
    g.bid = { n: 2, by: 'U1' };
    g.players[0].stack = ['rose'];
    g.players[0].flipped = 1;
    g.revealed = 1;
    g.players[1].id = 'bot:1:Sam';
    g.players[1].hand = ['rose', 'rose', 'skull'];
    g.players[1].stack = ['rose'];
    await host.button('ww:skull:0', `C1|flip:${g.step}:bot:1:Sam`, 'U1', 'alice');
    expect(host.state('skull', 'C1')!.players[0].wins).toBe(1);
  });
});

describe('game-commands: 誰是牛頭王', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  const posts = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postMessage');
  // rng 固定、牌組不洗：U1 手牌 1～10、U2 手牌 11～20、四列 21～24
  async function startGame() {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'nimmt new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單有誰是牛頭王；/game nimmt help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['誰是牛頭王', 'nimmt', '2～10 人', '/game nimmt new']) expect(lastEph(calls).text).toContain(s);
    await host.game('C1', 'U1', 'alice', 'nimmt help');
    for (const s of ['new', 'addbot', 'removebot', 'start', 'play', 'cancel']) expect(lastEph(calls).text).toContain(`/game nimmt ${s}`);
    await host.game('C1', 'U1', 'alice', 'nimmt dance');
    expect(lastEph(calls).text).toContain('/game nimmt play');
  });

  it('指令解析：new、addbot、play <牌號>', () => {
    expect(parseNimmtCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseNimmtCommand('addbot 3', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 3 });
    expect(parseNimmtCommand('play 37', 'U1', 'C1')).toEqual({ type: 'pick', user: 'U1', card: 37 });
    expect(parseNimmtCommand('play x', 'U1', 'C1')).toBeNull();
    expect(parseNimmtCommand('vote', 'U1', 'C1')).toBeNull();
  });

  it('選牌選單只讓自己看到，10 張分 2 列；選牌、選列按鈕交給誰是牛頭王', async () => {
    const { host, calls } = await startGame();
    await host.button('ww:nimmt:0', 'C1|hand', 'U1', 'alice');
    const menu = lastEph(calls);
    expect(menu.user).toBe('U1');
    expect(menu.blocks.filter((b: any) => b.type === 'actions').map((b: any) => b.elements.length)).toEqual([5, 5]);
    await host.button('ww:nimmt:0', 'C1|pick:1:1', 'U1', 'alice');
    expect(host.state('nimmt', 'C1')!.players[0].pick).toBe(1);
    await host.game('C1', 'U2', 'bob', 'nimmt play 11');
    expect(host.state('nimmt', 'C1')!.phase).toBe('chooseRow');
    expect(buttonsOf(posts(calls).at(-1)!)).toHaveLength(4); // 選列訊息沒有 ref，照舊發新訊息
    await host.button('ww:nimmt:2', 'C1|row:1:2', 'U1', 'alice');
    expect(host.state('nimmt', 'C1')!.rows[2]).toEqual([1, 11]);
  });

  it('選牌進度更新同一則頻道訊息，揭曉時拿掉按鈕，下一回合發新訊息', async () => {
    const { host, calls } = await startGame();
    const first = posts(calls).filter((c) => String(c.args.text).includes('已選 0/2'));
    expect(first).toHaveLength(1);
    const before = posts(calls).length;
    await host.button('ww:nimmt:0', 'C1|pick:1:10', 'U1', 'alice');
    expect(posts(calls).length).toBe(before);
    const update = calls.filter((c) => c.method === 'chat.update').at(-1)!;
    expect(update.args.text).toContain('已選 1/2');
    await host.button('ww:nimmt:0', 'C1|pick:1:20', 'U2', 'bob');
    const revealed = calls.filter((c) => c.method === 'chat.update').at(-1)!;
    expect(revealed.args).toMatchObject({ ts: update.args.ts, text: expect.stringContaining('已揭曉') });
    expect(buttonsOf(revealed)).toHaveLength(0);
    await host.button('ww:nimmt:2', 'C1|row:1:0', 'U1', 'alice');
    expect(posts(calls).filter((c) => String(c.args.text).includes('已選 0/2'))).toHaveLength(2);
  });
});

describe('game-commands: 情書', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  const ephButtons = (calls: Call[]) => lastEph(calls).blocks.filter((b: any) => b.type === 'actions').flatMap((b: any) => b.elements);

  it('/game 清單有情書；/game loveletter help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['情書', 'loveletter', '2～6 人', '/game loveletter new']) expect(lastEph(calls).text).toContain(s);
    for (const text of ['loveletter help', 'loveletter xyz']) {
      await host.game('C1', 'U1', 'alice', text);
      for (const s of ['new', 'start', 'addbot', 'removebot', 'cancel']) expect(lastEph(calls).text).toContain(`/game loveletter ${s}`);
    }
  });

  it('指令解析：只有房間指令', () => {
    expect(parseLoveLetterCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseLoveLetterCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseLoveLetterCommand('removebot', 'U1', 'C1')).toEqual({ type: 'removeBot', user: 'U1', count: 1 });
    expect(parseLoveLetterCommand('play 1', 'U1', 'C1')).toBeNull();
  });

  it('從大廳開情書：按的人是房主', async () => {
    const { host, calls } = setup();
    await host.button('ww:lobbyOpen:11', 'C1|loveletter', 'U2', 'bob');
    expect(host.state('loveletter', 'C1')).toMatchObject({ phase: 'lobby', host: 'U2' });
    expect(calls.at(-1)!.args.text).toContain('情書房間');
  });

  it('出牌、選目標 (顯示名字、bot 也可以選)、猜角色、看手牌、棄牌紀錄都交給情書', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'loveletter new');
    await host.game('C1', 'U1', 'alice', 'loveletter addbot');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    // rng 固定：bot 先出衛兵，接著輪到 U1
    const s = host.state('loveletter', 'C1')!;
    expect(s.players[s.turn].id).toBe('U1');
    await host.button('ww:loveletter:0', 'C1|menu', 'U1', 'alice');
    expect(lastEph(calls).user).toBe('U1');
    await host.button('ww:loveletter:0', ephButtons(calls)[0].value, 'U1', 'alice');
    const target = ephButtons(calls)[0];
    expect(target.value).toMatch(/^C1\|tgt:\d+:0:bot:1:/);
    expect(target.text.text).toContain('🤖');
    await host.button('ww:loveletter:0', target.value, 'U1', 'alice');
    const guesses = ephButtons(calls);
    expect(guesses).toHaveLength(9);
    await host.button('ww:loveletter:0', guesses[0].value, 'U1', 'alice');
    expect(host.state('loveletter', 'C1')!.players.find((p) => p.id === 'U1')!.discards).toEqual(['guard']);
    await host.button('ww:loveletter:1', 'C1|hand', 'U1', 'alice');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('你的手牌') });
    await host.button('ww:loveletter:2', 'C1|log', 'U9', 'zed');
    expect(lastEph(calls)).toMatchObject({ user: 'U9', text: expect.stringContaining('棄牌紀錄') });
  });
});

describe('game-commands: 蟑螂撲克', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  const ephButtons = (calls: Call[]) => lastEph(calls).blocks.filter((b: any) => b.type === 'actions').flatMap((b: any) => b.elements);

  it('/game 清單有蟑螂撲克；/game cockroach help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['蟑螂撲克', 'cockroach', '2～6 人', '/game cockroach new']) expect(lastEph(calls).text).toContain(s);
    for (const text of ['cockroach help', 'cockroach foo']) {
      await host.game('C1', 'U1', 'alice', text);
      for (const s of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(lastEph(calls).text).toContain(`/game cockroach ${s}`);
    }
  });

  it('指令解析：只有房間指令', () => {
    expect(parseCockroachCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseCockroachCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseCockroachCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseCockroachCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseCockroachCommand('removebot', 'U1', 'C1')).toEqual({ type: 'removeBot', user: 'U1', count: 1 });
    expect(parseCockroachCommand('give rat', 'U1', 'C1')).toBeNull();
  });

  it('從大廳開蟑螂撲克：按的人是房主', async () => {
    const { host } = setup();
    await host.button('ww:lobbyOpen:16', 'C1|cockroach', 'U2', 'bob');
    expect(host.state('cockroach', 'C1')).toMatchObject({ phase: 'lobby', host: 'U2' });
  });

  it('出牌、選目標 (bot 也可以選)、宣稱、回答、偷看、傳下去、看手牌都交給蟑螂撲克', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'cockroach new');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.game('C1', 'U1', 'alice', 'cockroach addbot');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const g = () => host.state('cockroach', 'C1')!;
    // rng 固定：第一位出牌的是最後一位 (bot)，bot 把牌傳給某人後輪到真人
    const holder = g().card?.to ?? g().players[g().turn].id;
    expect(holder.startsWith('bot:')).toBe(false);
    await host.button('ww:cockroach:0', 'C1|hand', 'U9', 'zed');
    expect(lastEph(calls)).toMatchObject({ user: 'U9', text: expect.stringContaining('你不在這局遊戲裡') });
    await host.button('ww:cockroach:0', 'C1|hand', 'U1', 'alice');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('你的手牌') });
    expect(g().phase).toBe('respond');
    {
      const to = g().card!.to;
      await host.button('ww:cockroach:2', `C1|peek:${g().step}`, to, to);
      expect(g().phase).toBe('pass');
      await host.button('ww:cockroach:0', 'C1|passmenu', to, to);
      const target = ephButtons(calls)[0];
      expect(target.value).toMatch(/^C1\|to:\d+:U\d$/);
      await host.button('ww:cockroach:0', target.value, to, to);
      const says = ephButtons(calls);
      expect(says).toHaveLength(8);
      expect(says[0].value).toMatch(/^C1\|say:\d+:cockroach:U\d$/);
      await host.button('ww:cockroach:0', says[0].value, to, to);
      expect(g().phase).not.toBe('pass');
    }
    // 走到輪到真人出牌
    for (let i = 0; i < 50 && !(g().phase === 'give' && !g().players[g().turn].id.startsWith('bot:')); i++) {
      const to = g().card!.to;
      await host.button('ww:cockroach:0', `C1|no:${g().step}`, to, to);
    }
    const me = g().players[g().turn].id;
    await host.button('ww:cockroach:0', 'C1|play', me, me);
    const cards = ephButtons(calls);
    expect(cards[0].value).toMatch(/^C1\|card:\d+:/);
    await host.button('ww:cockroach:0', cards[0].value, me, me);
    const targets = ephButtons(calls);
    const bot = targets.find((b: any) => b.value.includes(':bot:'));
    expect(bot.text.text).toContain('🤖');
    expect(bot.value).toMatch(/^C1\|tgt:\d+:\w+:bot:1:/);
    await host.button('ww:cockroach:0', bot.value, me, me);
    const claims = ephButtons(calls);
    expect(claims).toHaveLength(8);
    const before = g().players.find((p) => p.id === me)!.hand.length;
    await host.button('ww:cockroach:0', claims[0].value, me, me);
    expect(g().players.find((p) => p.id === me)!.hand.length).toBe(before - 1);
  });
});

describe('game-commands: 變色龍', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  // rng 固定：主題卡是最後一張、祕密詞是 D4；變色龍和起始玩家都是 U3 (說詞順序 U3 → U1 → U2)
  async function startGame(opts: { viewsFail?: boolean } = {}) {
    const { client, calls } = fakeClient(opts);
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'chameleon new');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單和大廳推理類有變色龍；/game chameleon help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['變色龍', 'chameleon', '3～8 人', '/game chameleon new']) expect(lastEph(calls).text).toContain(s);
    expect(JSON.stringify(lastEph(calls).blocks)).toContain('C1|chameleon');
    for (const text of ['chameleon help', 'chameleon dance']) {
      await host.game('C1', 'U1', 'alice', text);
      expect(lastEph(calls).text).toContain('變色龍指令');
      for (const s of ['new', 'start', 'say', 'next', 'vote', 'guess', 'cancel']) expect(lastEph(calls).text).toContain(`/game chameleon ${s}`);
    }
  });

  it('指令解析：new、start、cancel、addbot、removebot、say、next、vote、guess', () => {
    expect(parseChameleonCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseChameleonCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseChameleonCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseChameleonCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseChameleonCommand('removebot', 'U1', 'C1')).toEqual({ type: 'removeBot', user: 'U1', count: 1 });
    expect(parseChameleonCommand('say 黃 色', 'U1', 'C1')).toEqual({ type: 'say', user: 'U1', text: '黃 色' });
    expect(parseChameleonCommand('say', 'U1', 'C1')).toBeNull();
    expect(parseChameleonCommand('next', 'U1', 'C1')).toEqual({ type: 'next', user: 'U1' });
    expect(parseChameleonCommand('vote', 'U1', 'C1')).toEqual({ type: 'startVote', user: 'U1' });
    expect(parseChameleonCommand('guess b3', 'U1', 'C1')).toEqual({ type: 'guess', user: 'U1', text: 'b3' });
    expect(parseChameleonCommand('guess', 'U1', 'C1')).toBeNull();
    expect(parseChameleonCommand('dance', 'U1', 'C1')).toBeNull();
  });

  it('從大廳開變色龍：按的人是房主', async () => {
    const { host, calls } = setup();
    await host.button('ww:lobbyOpen:16', 'C1|chameleon', 'U2', 'bob');
    expect(host.state('chameleon', 'C1')).toMatchObject({ phase: 'lobby', host: 'U2' });
    expect(calls.at(-1)!.args.text).toContain('變色龍房間');
  });

  it('說詞按鈕：用 trigger_id 開視窗，送出後變成說詞', async () => {
    const { host, calls } = await startGame();
    await host.button('ww:chameleon:0', 'C1|say', 'U3', 'carol', 'T123');
    const open = calls.find((c) => c.method === 'views.open')!.args;
    expect(open).toMatchObject({ trigger_id: 'T123', view: { type: 'modal', callback_id: 'ww:chameleonWord', private_metadata: 'C1' } });
    await host.modal('ww:chameleonWord', 'C1', 'U3', 'carol', ['浪漫']);
    expect(host.state('chameleon', 'C1')!.said).toEqual({ U3: '浪漫' });
  });

  it('視窗打不開時，只讓說詞者看到改用指令', async () => {
    const { host, calls } = await startGame({ viewsFail: true });
    await host.button('ww:chameleon:0', 'C1|say', 'U3', 'carol', 'T123');
    expect(lastEph(calls)).toMatchObject({ user: 'U3', text: expect.stringContaining('/game chameleon say') });
  });

  it('開始投票、投票、猜詞的按鈕交給變色龍', async () => {
    const { host } = await startGame();
    await host.game('C1', 'U3', 'carol', 'chameleon say 浪漫');
    await host.game('C1', 'U1', 'alice', 'chameleon say 鑽石');
    await host.game('C1', 'U2', 'bob', 'chameleon say 白色');
    expect(host.state('chameleon', 'C1')!.phase).toBe('discuss');
    await host.button('ww:chameleon:0', 'C1|startVote', 'U1', 'alice');
    expect(host.state('chameleon', 'C1')!.phase).toBe('vote');
    for (const u of ['U1', 'U2']) await host.button('ww:chameleon:2', 'C1|vote:U3', u, u);
    await host.button('ww:chameleon:0', 'C1|vote:U1', 'U3', 'carol');
    expect(host.state('chameleon', 'C1')!.phase).toBe('guess');
    await host.button('ww:chameleon:15', 'C1|guess:15', 'U3', 'carol');
    expect(host.state('chameleon', 'C1')!.phase).toBe('ended');
  });
});

describe('player-stats: 跨遊戲戰績與排行榜', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  // rng 固定：花火 2 人局 U2 先出，手牌是紅 3、紅 3、紅 4、紅 4、紅 5；失誤 2 次時打出紅 3 就爆炸結束
  async function explodeHanabi(players = ['U1', 'U2']) {
    const { client, calls } = fakeClient();
    const stats = new StatsStore(':memory:');
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {}, stats });
    await host.game('C1', 'U1', 'alice', 'hanabi new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const s = host.state('hanabi', 'C1')!;
    host.setState('hanabi', 'C1', { ...s, fuses: 2, players: s.players.map((p, i) => ({ ...p, id: players[i] })) });
    await host.button('ww:hanabiTurn:2', 'C1|play:0', players[1], 'bob');
    return { host, calls, stats };
  }

  it('遊戲正常結束就記錄；有 bot 的不記錄；取消的不記錄', async () => {
    const { host, stats } = await explodeHanabi();
    expect(host.state('hanabi', 'C1')!.phase).toBe('ended');
    expect(stats.summary('C1', 'U1')).toEqual([{ kind: 'hanabi', games: 1, wins: null, best: 0 }]);
    const withBot = await explodeHanabi(['U1', 'bot:1:Sam']);
    expect(withBot.host.state('hanabi', 'C1')!.phase).toBe('ended');
    expect(withBot.stats.summary('C1', 'U1')).toEqual([]);
    const { client } = fakeClient();
    const s2 = new StatsStore(':memory:');
    const h2 = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {}, stats: s2 });
    await h2.game('C1', 'U1', 'alice', 'coup new');
    await h2.game('C1', 'U1', 'alice', 'coup cancel');
    expect(s2.summary('C1', 'U1')).toEqual([]);
  });

  it('/game stats 查自己和別人的跨遊戲戰績', async () => {
    const { host, calls, stats } = await explodeHanabi();
    stats.recordMatch('C1', 'skull', ['U1', 'U2'], ['U2']);
    await host.game('C1', 'U1', 'alice', 'stats');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('總計 2 場，對戰 1 場 0 勝 (0%)') });
    expect(lastEph(calls).text).toContain('💀 骷髏與玫瑰 1 場 0 勝 (0%)');
    expect(lastEph(calls).text).toContain('🎆 花火 1 場，最高 0 分');
    await host.game('C1', 'U1', 'alice', 'stats <@U2|bob>');
    expect(lastEph(calls).text).toContain('<@U2> 在這個頻道的戰績');
    await host.game('C1', 'U1', 'alice', 'stats <@U9>');
    expect(lastEph(calls).text).toBe('這個頻道還沒有 <@U9> 的戰績。');
  });

  it('/game rank 總排行和單一遊戲；不認識的代號顯示用法', async () => {
    const { host, calls, stats } = await explodeHanabi();
    stats.recordMatch('C1', 'skull', ['U1', 'U2'], ['U2']);
    await host.game('C1', 'U1', 'alice', 'rank');
    expect(lastEph(calls).text).toBe(['🏆 這個頻道的排行榜', '🥇 <@U2> 1 勝／1 場 (100%)', '🥈 <@U1> 0 勝／1 場 (0%)'].join('\n'));
    await host.game('C1', 'U1', 'alice', 'rank hanabi');
    expect(lastEph(calls).text).toContain('🏆 🎆 花火排行榜');
    expect(lastEph(calls).text).toContain('最高 0 分');
    await host.game('C1', 'U1', 'alice', 'rank chess');
    expect(lastEph(calls).text).toContain('/game rank');
    await host.game('C2', 'U1', 'alice', 'rank');
    expect(lastEph(calls).text).toBe('這個頻道還沒有戰績。');
  });

  it('遊戲清單有戰績和排行榜的說明', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    expect(lastEph(calls).text).toContain('/game stats');
    expect(lastEph(calls).text).toContain('/game rank');
  });
});

describe('game-commands: 不要謝謝', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  async function startGame() {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'nothanks new');
    for (const u of ['U2', 'U3']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單和大廳有不要謝謝；/game nothanks help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['不要謝謝', 'nothanks', '3～7 人', '/game nothanks new']) expect(lastEph(calls).text).toContain(s);
    for (const text of ['nothanks help', 'nothanks foo']) {
      await host.game('C1', 'U1', 'alice', text);
      for (const s of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(lastEph(calls).text).toContain(`/game nothanks ${s}`);
      for (const s of ['🙅 不要謝謝', '✋ 收下', '👀 我的籌碼']) expect(lastEph(calls).text).toContain(s);
    }
  });

  it('指令解析：new、start、cancel、addbot、removebot，其他不認識', () => {
    expect(parseNoThanksCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseNoThanksCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseNoThanksCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseNoThanksCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseNoThanksCommand('removebot', 'U1', 'C1')).toEqual({ type: 'removeBot', user: 'U1', count: 1 });
    expect(parseNoThanksCommand('take', 'U1', 'C1')).toBeNull();
  });

  it('按鈕交給不要謝謝：不要謝謝、收下、我的籌碼、再來一局', async () => {
    const { host, calls } = await startGame();
    const g = () => host.state('nothanks', 'C1')!;
    expect(g()).toMatchObject({ phase: 'turn', turn: 2, card: 12 });
    await host.button('ww:nothanks:0', `C1|pass:${g().step}`, 'U3', 'carol');
    expect(g()).toMatchObject({ pot: 1, turn: 0 });
    await host.button('ww:nothanks:1', `C1|take:${g().step}`, 'U1', 'alice');
    expect(g().players[0].cards).toEqual([12]);
    await host.button('ww:nothanks:2', 'C1|mine', 'U1', 'alice');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('🪙 12 個籌碼') });
    for (let i = 0; i < 30 && g().phase !== 'ended'; i++) await host.button('ww:nothanks:1', `C1|take:${g().step}`, 'U1', 'alice');
    expect(g().phase).toBe('ended');
    await host.button('ww:rematch:0', 'C1|rematch', 'U2', 'bob');
    expect(g()).toMatchObject({ phase: 'lobby', host: 'U2' });
  });
});

describe('game-commands: 禁語', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  const lastPost = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postMessage').at(-1)!.args;
  // rng 固定：紅隊 U1、U3，藍隊 U2、U4；藍隊 U2 先描述，U4 猜；第一張卡是詞庫第一張
  async function startGame() {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'taboo new');
    for (const u of ['U2', 'U3', 'U4']) await host.button('ww:join:0', 'C1|join', u, u);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('/game 清單和大廳團隊對抗有禁語；/game taboo help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['禁語', 'taboo', '4～12 人', '/game taboo new']) expect(lastEph(calls).text).toContain(s);
    await host.game('C1', 'U1', 'alice', 'taboo help');
    for (const s of ['new', 'start', 'skip', 'card', 'cancel']) expect(lastEph(calls).text).toContain(`/game taboo ${s}`);
    await host.game('C1', 'U1', 'alice', 'taboo dance');
    expect(lastEph(calls).text).toContain('禁語指令');
  });

  it('指令解析：new、start、cancel、addbot、skip、card', () => {
    expect(parseTabooCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseTabooCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseTabooCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseTabooCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseTabooCommand('skip', 'U1', 'C1')).toEqual({ type: 'skip', user: 'U1' });
    expect(parseTabooCommand('card', 'U1', 'C1')).toEqual({ type: 'card', user: 'U1' });
    expect(parseTabooCommand('dance', 'U1', 'C1')).toBeNull();
  });

  it('從大廳開房', async () => {
    const { host } = setup();
    await host.button('ww:lobbyOpen:0', 'C1|taboo', 'U2', 'bob');
    expect(host.state('taboo', 'C1')).toMatchObject({ phase: 'lobby', host: 'U2' });
  });

  it('開始按鈕、跳過按鈕交給禁語；描述者看到題目卡', async () => {
    const { host, calls } = await startGame();
    await host.button('ww:taboo:0', 'C1|go', 'U2', 'bob');
    expect(host.state('taboo', 'C1')!.phase).toBe('describe');
    const eph = lastEph(calls);
    expect(eph.user).toBe('U2');
    expect(eph.text).toContain(TABOO_CARDS[0].word);
    expect(buttonsOf({ method: '', args: eph }).map((b: any) => b.value)).toEqual(['C1|skip:1']);
    await host.button('ww:taboo:0', 'C1|skip:1', 'U2', 'bob');
    expect(host.state('taboo', 'C1')!.scores).toEqual({ red: 1, blue: 0 });
  });

  it('頻道訊息交給禁語：隊友猜中有公告', async () => {
    const { host, calls } = await startGame();
    await host.button('ww:taboo:0', 'C1|go', 'U2', 'bob');
    await host.chat('C1', 'U4', `是${TABOO_CARDS[0].word}嗎`);
    expect(lastPost(calls).text).toContain(`猜中「${TABOO_CARDS[0].word}」`);
    expect(host.state('taboo', 'C1')!.scores).toEqual({ red: 0, blue: 1 });
  });
});

describe('game-commands: 壽司派對', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('/game 清單和大廳有壽司派對；/game sushigo help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['壽司派對', 'sushigo', '2～5 人', '/game sushigo new']) expect(lastEph(calls).text).toContain(s);
    for (const text of ['sushigo help', 'sushigo foo']) {
      await host.game('C1', 'U1', 'alice', text);
      for (const s of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(lastEph(calls).text).toContain(`/game sushigo ${s}`);
      for (const s of ['🍣 我的手牌', '🥢 用筷子再出一張']) expect(lastEph(calls).text).toContain(s);
    }
  });

  it('指令解析：new、start、cancel、addbot、removebot，其他不認識', () => {
    expect(parseSushiGoCommand('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseSushiGoCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseSushiGoCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseSushiGoCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseSushiGoCommand('removebot', 'U1', 'C1')).toEqual({ type: 'removeBot', user: 'U1', count: 1 });
    expect(parseSushiGoCommand('pick', 'U1', 'C1')).toBeNull();
  });

  it('按鈕交給壽司派對：我的手牌、選牌、筷子、再來一局', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'sushigo new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    const g = () => host.state('sushigo', 'C1')!;
    expect(g()).toMatchObject({ phase: 'pick', round: 1, turn: 1 });
    await host.button('ww:sushigo:0', 'C1|hand', 'U1', 'alice');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('選一張牌') });
    await host.button('ww:sushigo:0', `C1|pick:${g().seq}:tempura`, 'U1', 'alice');
    expect(g().players[0].pick).toBe('tempura');
    // 讓 alice 桌上有筷子，測筷子按鈕
    g().players[0].table = ['chopsticks'];
    await host.button('ww:sushigo:0', `C1|pick:${g().seq}:tempura`, 'U1', 'alice');
    await host.button('ww:sushigo:0', `C1|extra:${g().seq}:tempura`, 'U1', 'alice');
    expect(g().players[0].extra).toBe('tempura');
    await host.button('ww:sushigo:1', `C1|extra:${g().seq}:none`, 'U1', 'alice');
    expect(g().players[0].extra).toBeNull();
    for (let i = 0; i < 40 && g().phase !== 'ended'; i++) {
      for (const [u, n] of [['U1', 'alice'], ['U2', 'bob']]) {
        const me = g().players.find((p) => p.id === u)!;
        if (g().phase === 'pick') await host.button('ww:sushigo:0', `C1|pick:${g().seq}:${me.hand[0]}`, u, n);
        if (g().phase === 'pick' && me.extra === undefined) await host.button('ww:sushigo:0', `C1|extra:${g().seq}:none`, u, n);
      }
    }
    expect(g().phase).toBe('ended');
    await host.button('ww:rematch:0', 'C1|rematch', 'U2', 'bob');
    expect(g()).toMatchObject({ phase: 'lobby', host: 'U2' });
  });
});

describe('game-commands: 梗圖大亂鬥', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  async function startGame(opts: { viewsFail?: boolean } = {}) {
    const { client, calls } = fakeClient(opts);
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', 'meme new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await host.button('ww:join:0', 'C1|join', 'U3', 'carol');
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls, g: () => host.state('meme', 'C1')! };
  }

  it('/game 清單和大廳有梗圖大亂鬥；/game meme help 和不認識的子指令列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    for (const s of ['梗圖大亂鬥', 'meme', '3～8 人', '/game meme new']) expect(lastEph(calls).text).toContain(s);
    for (const text of ['meme help', 'meme foo']) {
      await host.game('C1', 'U1', 'alice', text);
      for (const s of ['new', 'addbot', 'removebot', 'start', 'cancel', 'write']) expect(lastEph(calls).text).toContain(`/game meme ${s}`);
      for (const s of ['🃏 我的手牌', '✍️ 自己寫']) expect(lastEph(calls).text).toContain(s);
    }
  });

  it('指令解析：write 後面的文字 (可以有空白)、房間指令，其他不認識', () => {
    expect(parseMemeCommand('write 當 PM 說 需求不會再改', 'U1', 'C1')).toEqual({ type: 'write', user: 'U1', text: '當 PM 說 需求不會再改' });
    expect(parseMemeCommand('addbot 2', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 2 });
    expect(parseMemeCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseMemeCommand('vote', 'U1', 'C1')).toBeNull();
  });

  it('自己寫按鈕：用 trigger_id 開視窗，送出後變成答案；也可以用指令', async () => {
    const { host, calls, g } = await startGame();
    await host.button('ww:meme:1', 'C1|write', 'U1', 'alice', 'T123');
    const open = calls.find((c) => c.method === 'views.open')!.args;
    expect(open).toMatchObject({ trigger_id: 'T123', view: { type: 'modal', callback_id: 'ww:memeWrite', private_metadata: 'C1' } });
    await host.modal('ww:memeWrite', 'C1', 'U1', 'alice', ['週一早上的我']);
    expect(g().players[0].answer).toEqual({ text: '週一早上的我', own: true });
    await host.game('C1', 'U2', 'bob', 'meme write 部署前一天');
    expect(g().players[1].answer).toEqual({ text: '部署前一天', own: true });
  });

  it('視窗打不開時，只讓本人看到改用指令', async () => {
    const { host, calls } = await startGame({ viewsFail: true });
    await host.button('ww:meme:1', 'C1|write', 'U1', 'alice', 'T123');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('/game meme write') });
  });

  it('手牌、出牌、投票按鈕交給梗圖大亂鬥，玩完 6 輪可以再來一局', async () => {
    const { host, calls, g } = await startGame();
    await host.button('ww:meme:0', 'C1|hand', 'U1', 'alice');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('挑一句') });
    for (let i = 0; i < 6; i++) {
      for (const [u, n] of [['U1', 'alice'], ['U2', 'bob'], ['U3', 'carol']]) await host.button('ww:meme:0', `C1|play:${g().seq}:0`, u, n);
      expect(g().phase).toBe('vote');
      for (const [u, n] of [['U1', 'alice'], ['U2', 'bob'], ['U3', 'carol']]) {
        const mine = g().answers.findIndex((a) => a.by === u);
        await host.button('ww:meme:0', `C1|vote:${g().seq}:${(mine + 1) % 3}`, u, n);
      }
    }
    expect(g().phase).toBe('ended');
    await host.button('ww:rematch:0', 'C1|rematch', 'U2', 'bob');
    expect(g()).toMatchObject({ phase: 'lobby', host: 'U2' });
  });
});

describe('meme/library: 頻道梗圖庫', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
  const posts = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postMessage').map((c) => c.args);

  function memeHost(opts: { badImage?: string } = {}) {
    const { client, calls } = fakeClient(opts);
    const memes = new MemeStore(':memory:');
    const checked: string[] = [];
    const checkImage = async (url: string) => (checked.push(url), !url.includes('notimage'));
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {}, memes, checkImage });
    return { host, calls, memes, checked };
  }

  it('投稿成功：頻道公告投稿者、編號、名稱和圖片；沒寫名稱是「自家梗」', async () => {
    const { host, calls, memes } = memeHost();
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/boss.png 老闆的 眼神');
    const post = posts(calls).at(-1)!;
    expect(post.text).toContain('<@U1> 投稿了一張梗圖：#1 老闆的 眼神');
    expect(post.blocks.find((b: any) => b.type === 'image')).toMatchObject({ image_url: 'https://x.com/boss.png' });
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/a.jpg');
    expect(memes.list('C1').map((m) => m.name)).toEqual(['老闆的 眼神', '自家梗']);
  });

  it('Slack 跳脫過的網址 (<網址> 或 <網址|文字>、&amp;) 會還原', async () => {
    const { host, memes } = memeHost();
    await host.game('C1', 'U1', 'alice', 'meme add <https://x.com/a.png?w=1&amp;h=2> A');
    await host.game('C1', 'U1', 'alice', 'meme add <https://x.com/b.png|x.com/b.png> B');
    expect(memes.list('C1').map((m) => m.url)).toEqual(['https://x.com/a.png?w=1&h=2', 'https://x.com/b.png']);
  });

  it('http 被擋且不檢查；不是圖片、重複、名稱超過 20 字、沒給網址都被擋，只讓本人看到', async () => {
    const { host, calls, memes, checked } = memeHost();
    await host.game('C1', 'U1', 'alice', 'meme add http://x.com/a.png');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: expect.stringContaining('https') });
    expect(checked).toEqual([]);
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/notimage.html');
    expect(lastEph(calls).text).toContain('公開的圖片網址');
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/a.png A');
    await host.game('C1', 'U2', 'bob', 'meme add https://x.com/a.png B');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: expect.stringContaining('#1') });
    await host.game('C1', 'U2', 'bob', `meme add https://x.com/b.png ${'字'.repeat(21)}`);
    expect(lastEph(calls).text).toContain('20');
    await host.game('C1', 'U2', 'bob', 'meme add');
    expect(lastEph(calls).text).toContain('/game meme add');
    expect(memes.list('C1')).toHaveLength(1);
  });

  it('頻道有其他遊戲進行中也能投稿；別的頻道看不到', async () => {
    const { host, memes } = memeHost();
    await host.game('C1', 'U1', 'alice', 'sushigo new');
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/a.png');
    expect(memes.list('C1')).toHaveLength(1);
    expect(memes.list('C2')).toHaveLength(0);
  });

  it('list 只讓自己看到；沒有投稿時顯示用法', async () => {
    const { host, calls } = memeHost();
    await host.game('C1', 'U2', 'bob', 'meme list');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: expect.stringContaining('還沒有投稿') });
    expect(lastEph(calls).text).toContain('/game meme add');
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/a.png 老闆');
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/b.png 同事');
    await host.game('C1', 'U2', 'bob', 'meme list');
    for (const s of ['#1', '老闆', '#2', '同事', '<@U1>']) expect(lastEph(calls).text).toContain(s);
  });

  it('remove：任何人都能刪，公告刪的人和投稿者；編號不存在被擋', async () => {
    const { host, calls, memes } = memeHost();
    await host.game('C1', 'U1', 'alice', 'meme add https://x.com/a.png 老闆的眼神');
    await host.game('C1', 'U2', 'bob', 'meme remove 1');
    expect(posts(calls).at(-1)!.text).toContain('🗑️ <@U2> 刪掉了 #1 老闆的眼神 (<@U1> 投稿)');
    expect(memes.list('C1')).toEqual([]);
    await host.game('C1', 'U2', 'bob', 'meme remove 99');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: expect.stringContaining('找不到') });
  });

  it('開始梗圖大亂鬥時帶入這個頻道的投稿', async () => {
    const { host, memes } = memeHost();
    memes.add('C1', 'https://x.com/a.png', '老闆', 'U9');
    await host.game('C1', 'U1', 'alice', 'meme new');
    await host.game('C1', 'U1', 'alice', 'meme addbot 2');
    await host.game('C1', 'U1', 'alice', 'meme start');
    expect(host.state('meme', 'C1')!.images.filter((m) => m.by)).toEqual([{ name: '老闆', url: 'https://x.com/a.png', by: 'U9' }]);
  });

  it('帶圖片的公告失敗時改發文字並附上網址，遊戲照常進行', async () => {
    const { host, calls, memes } = memeHost({ badImage: 'https://x.com/dead.png' });
    memes.add('C1', 'https://x.com/dead.png', '壞圖', 'U9');
    await host.game('C1', 'U1', 'alice', 'meme new');
    await host.game('C1', 'U1', 'alice', 'meme addbot 2');
    await host.game('C1', 'U1', 'alice', 'meme start');
    const round = posts(calls).find((p) => String(p.text).includes('第 1/6 輪') && !p.blocks)!;
    expect(round.text).toContain('壞圖');
    expect(round.text).toContain('https://x.com/dead.png');
    expect(posts(calls).some((p) => String(p.text).includes('我的手牌'))).toBe(true);
  });

  it('/game meme help 有 add、list、remove', async () => {
    const { host, calls } = memeHost();
    await host.game('C1', 'U1', 'alice', 'meme help');
    for (const s of ['add', 'list', 'remove']) expect(lastEph(calls).text).toContain(`/game meme ${s}`);
  });
});

describe('game-commands: 從眾心理、炸彈貓、犯人在跳舞、猜猜看', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('從大廳開房：按的人是房主；help 列出指令', async () => {
    for (const [kind, name] of [['herd', '從眾心理'], ['kittens', '炸彈貓'], ['criminal', '犯人在跳舞'], ['wager', '猜猜看']]) {
      const { host, calls } = setup();
      await host.button('ww:lobbyOpen:0', `C1|${kind}`, 'U1', 'alice');
      expect(calls.at(-1)!.args.text, kind).toContain(name);
      await host.game('C1', 'U1', 'alice', `${kind} help`);
      expect(lastEph(calls).text, kind).toContain(`/game ${kind} start`);
    }
  });

  async function started(kind: string, n: number) {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {} });
    await host.game('C1', 'U1', 'alice', `${kind} new`);
    for (let i = 2; i <= n; i++) await host.button('ww:join:0', 'C1|join', `U${i}`, `p${i}`);
    await host.button('ww:start:2', 'C1|start', 'U1', 'alice');
    return { host, calls };
  }

  it('從眾心理：作答按鈕開視窗，送出後記下答案', async () => {
    const { host, calls } = await started('herd', 4);
    await host.button('ww:herd:1', 'C1|write', 'U2', 'bob', 'T1');
    expect(calls.find((c) => c.method === 'views.open')!.args).toMatchObject({ trigger_id: 'T1', view: { callback_id: 'ww:herdAnswer', private_metadata: 'C1' } });
    await host.modal('ww:herdAnswer', 'C1', 'U2', 'bob', ['珍珠奶茶']);
    expect(host.state('herd', 'C1')!.answers).toEqual([{ user: 'U2', text: '珍珠奶茶' }]);
  });

  it('猜猜看：作答按鈕開視窗，送出後記下答案', async () => {
    const { host, calls } = await started('wager', 3);
    await host.button('ww:wager:1', 'C1|answer', 'U2', 'bob', 'T1');
    expect(calls.find((c) => c.method === 'views.open')!.args).toMatchObject({ trigger_id: 'T1', view: { callback_id: 'ww:wagerAnswer', private_metadata: 'C1' } });
    await host.modal('ww:wagerAnswer', 'C1', 'U2', 'bob', ['1,200']);
    expect(host.state('wager', 'C1')!.answers).toEqual({ U2: 1200 });
  });
});

describe('dixit/rounds: 帶圖片的按鈕訊息', () => {
  const imgs = [
    { url: 'https://x.com/1.png', title: '1' },
    { url: 'https://x.com/2.png', title: '2' },
  ];
  const opts = [
    { value: 'vote:1:0', label: '1' },
    { value: 'vote:1:1', label: '2' },
  ];
  const deliver = (host: GameHost, events: GameEvent[]) => (host as any).deliver('C1', events) as Promise<void>;
  const types = (call: Call) => call.args.blocks.map((b: any) => b.type);

  it('ephemeral：文字、每張一個 image block (title 是編號、alt_text 同 title)、按鈕', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { setTimer: () => undefined });
    await deliver(host, [{ type: 'prompt', kind: 'dixit', audience: 'ephemeral', user: 'U1', text: '手牌', options: opts, images: imgs }]);
    const call = calls.find((c) => c.method === 'chat.postEphemeral')!;
    expect(types(call)).toEqual(['section', 'image', 'image', 'actions']);
    expect(call.args.blocks[1]).toEqual({ type: 'image', image_url: 'https://x.com/1.png', alt_text: '1', title: { type: 'plain_text', text: '1' } });
    expect(buttonsOf(call).map((b: any) => b.text.text)).toEqual(['1', '2']);
  });

  it('頻道 ref 更新同一則訊息時也帶圖片', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { setTimer: () => undefined });
    const e = { type: 'prompt' as const, kind: 'dixit', audience: 'channel' as const, ref: 'dixit:1', text: '投票', options: opts, images: imgs };
    await deliver(host, [e, { ...e, text: '投票：已結束', options: [] }]);
    expect(types(calls.find((c) => c.method === 'chat.postMessage')!)).toEqual(['section', 'image', 'image', 'actions']);
    expect(types(calls.find((c) => c.method === 'chat.update')!)).toEqual(['section', 'image', 'image']);
  });

  it('Slack 拒絕帶圖片的訊息時改發文字版：依編號列網址、按鈕照常', async () => {
    const { client, calls } = fakeClient({ badImage: 'https://x.com/2.png' });
    const host = new GameHost(client, { setTimer: () => undefined });
    await deliver(host, [
      { type: 'prompt', kind: 'dixit', audience: 'channel', ref: 'dixit:1', text: '投票', options: opts, images: imgs },
      { type: 'prompt', kind: 'dixit', audience: 'ephemeral', user: 'U1', text: '手牌', options: opts, images: imgs },
    ]);
    const post = calls.filter((c) => c.method === 'chat.postMessage').at(-1)!;
    expect(types(post)).toEqual(['section', 'actions']);
    expect(post.args.text).toContain('1. https://x.com/1.png');
    expect(post.args.text).toContain('2. https://x.com/2.png');
    expect(buttonsOf(post).map((b: any) => b.value)).toEqual(['C1|vote:1:0', 'C1|vote:1:1']);
    const eph = calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!;
    expect(types(eph)).toEqual(['section', 'actions']);
    expect(eph.args.text).toContain('2. https://x.com/2.png');
  });

  it('沒有 images 的 prompt 輸出不變', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { setTimer: () => undefined });
    await deliver(host, [{ type: 'prompt', kind: 'x', audience: 'channel', text: 'hi', options: opts }]);
    const call = calls.find((c) => c.method === 'chat.postMessage')!;
    expect(call.args).toEqual({ channel: 'C1', text: 'hi', blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'hi' } }, { type: 'actions', elements: buttonsOf(call) }] });
  });
});

describe('game-commands: 印加寶藏、妙語說書人、富饒之城、Emoji 傳話、星際探險隊', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('從大廳開房：房間公告標示遊戲名稱；help 列出指令', async () => {
    for (const [kind, name] of [['incan', '印加寶藏'], ['dixit', '妙語說書人'], ['citadels', '富饒之城'], ['emoji', 'Emoji 傳話'], ['crew', '星際探險隊']]) {
      const { host, calls } = setup();
      await host.button('ww:lobbyOpen:0', `C1|${kind}`, 'U1', 'alice');
      expect(calls.filter((c) => c.method === 'chat.postMessage').some((c) => c.args.text?.includes(name)), kind).toBe(true);
      await host.game('C1', 'U1', 'alice', `${kind} help`);
      expect(lastEph(calls).text, kind).toContain(`/game ${kind} start`);
    }
  });
});

describe('game-commands: 矮人礦坑', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('大廳推理分類最後是矮人礦坑；從大廳開房、help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    expect(lastEph(calls).text + JSON.stringify(lastEph(calls).blocks)).toContain('矮人礦坑');
    await host.button('ww:lobbyOpen:0', 'C1|saboteur', 'U1', 'alice');
    expect(calls.filter((c) => c.method === 'chat.postMessage').some((c) => c.args.text?.includes('矮人礦坑'))).toBe(true);
    await host.game('C1', 'U1', 'alice', 'saboteur help');
    expect(lastEph(calls).text).toContain('/game saboteur start');
  });
});

describe('game-commands: 地產大亨', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('大廳策略桌遊分類有地產大亨；從大廳開房、help 列出指令', async () => {
    const { host, calls, responds } = setup();
    await host.button('ww:lobbyTab:0', 'C1|strategy', 'U1', 'alice', undefined, 'https://hooks/strategy');
    expect(JSON.stringify(responds.at(-1)!.payload.blocks)).toContain('🏠 *地產大亨* (`forsale`) 3～6 人');
    await host.button('ww:lobbyOpen:0', 'C1|forsale', 'U1', 'alice');
    expect(calls.filter((c) => c.method === 'chat.postMessage').some((c) => c.args.text?.includes('地產大亨'))).toBe(true);
    await host.game('C1', 'U1', 'alice', 'forsale help');
    expect(lastEph(calls).text).toContain('/game forsale start');
  });
});

describe('game-commands: 骰子街', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('大廳策略桌遊分類有骰子街；從大廳開房、help 列出指令', async () => {
    const { host, calls, responds } = setup();
    await host.button('ww:lobbyTab:0', 'C1|strategy', 'U1', 'alice', undefined, 'https://hooks/strategy');
    expect(JSON.stringify(responds.at(-1)!.payload.blocks)).toContain('🏘️ *骰子街* (`machikoro`) 2～5 人');
    await host.button('ww:lobbyOpen:0', 'C1|machikoro', 'U1', 'alice');
    expect(calls.filter((c) => c.method === 'chat.postMessage').some((c) => c.args.text?.includes('骰子街'))).toBe(true);
    await host.game('C1', 'U1', 'alice', 'machikoro help');
    expect(lastEph(calls).text).toContain('/game machikoro start');
  });
});

describe('game-commands: 璀璨寶石', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('大廳策略桌遊分類有璀璨寶石；從大廳開房、help 列出指令', async () => {
    const { host, calls, responds } = setup();
    await host.button('ww:lobbyTab:0', 'C1|strategy', 'U1', 'alice', undefined, 'https://hooks/strategy');
    expect(JSON.stringify(responds.at(-1)!.payload.blocks)).toContain('💍 *璀璨寶石* (`splendor`) 2～4 人');
    await host.button('ww:lobbyOpen:0', 'C1|splendor', 'U1', 'alice');
    expect(calls.filter((c) => c.method === 'chat.postMessage').some((c) => c.args.text?.includes('璀璨寶石'))).toBe(true);
    await host.game('C1', 'U1', 'alice', 'splendor help');
    expect(lastEph(calls).text).toContain('/game splendor start');
  });
});

describe('game-commands: 詭影神探', () => {
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('遊戲清單標示不支援 bot；大廳推理分類有詭影神探；從大廳開房、help 列出指令', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', '');
    expect(lastEph(calls).text).toContain('🔎 *詭影神探* (`deception`)：4～12 人 (不支援 bot)');
    expect(JSON.stringify(lastEph(calls).blocks)).toContain('🔎 *詭影神探* (`deception`) 4～12 人');
    await host.button('ww:lobbyOpen:0', 'C1|deception', 'U1', 'alice');
    expect(calls.filter((c) => c.method === 'chat.postMessage').some((c) => c.args.text?.includes('詭影神探'))).toBe(true);
    await host.game('C1', 'U1', 'alice', 'deception help');
    expect(lastEph(calls).text).toContain('/game deception start');
  });
});

describe('game-lobby: 名稱有空格的遊戲', () => {
  it('Emoji 傳話的房間公告規則連結用 - 取代空格 (GitHub wiki 的頁面網址)', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'emoji new');
    const lobby = calls.find((c) => c.method === 'chat.postMessage' && c.args.text?.includes('Emoji 傳話房間'))!;
    expect(lobby.args.text).toContain(encodeURI('Emoji-傳話-遊戲規則'));
  });
});

describe('game-lobby: 房間公告的人數上限與 bot 按鈕', () => {
  const lobbyOf = (calls: Call[]) => calls.filter((c) => (c.method === 'chat.postMessage' || c.method === 'chat.update') && c.args.text?.includes('房間 (房主')).at(-1)!;
  const labels = (calls: Call[]) => buttonsOf(lobbyOf(calls)).map((b: any) => b.text.text);
  const press = (host: GameHost, what: string, user = 'U1') => host.button(`ww:${what}:3`, `C1|${what}`, user, user === 'U1' ? 'alice' : 'bob');
  const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;

  it('人數上限用這款遊戲自己的上限', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'incan new');
    expect(lobbyOf(calls).args.text).toContain('玩家 (1/8)');
    const w = setup();
    await w.host.command('C1', 'U1', 'alice', 'new');
    expect(lobbyOf(w.calls).args.text).toContain('玩家 (1/12)');
  });

  it('支援 bot 的遊戲 (含狼人殺) 有「🤖 +」「🤖 -」，不支援的沒有', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'incan new');
    expect(labels(calls)).toEqual(['加入', '離開', '開始遊戲', '🤖 +', '🤖 -']);
    const w = setup();
    await w.host.command('C1', 'U1', 'alice', 'new');
    expect(labels(w.calls)).toEqual(['加入', '離開', '開始遊戲', '🤖 +', '🤖 -']);
    const g = setup();
    await g.host.game('C1', 'U1', 'alice', 'wager new');
    expect(labels(g.calls)).toEqual(['加入', '離開', '開始遊戲']);
  });

  it('房主按 🤖 + 加一個 bot、按 🤖 - 移除最後加入的 bot，公告跟著更新', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'incan new');
    await press(host, 'addbot');
    await press(host, 'addbot');
    const bots = host.state('incan', 'C1')!.players.map((p: any) => p.id).filter((id: string) => id.startsWith('bot:'));
    expect(bots).toHaveLength(2);
    expect(lobbyOf(calls).args.text).toContain('玩家 (3/8)');
    await press(host, 'removebot');
    expect(host.state('incan', 'C1')!.players.map((p: any) => p.id)).toEqual(['U1', bots[0]]);
  });

  it('狼人殺的 bot 按鈕也能用', async () => {
    const { host, calls } = setup();
    await host.command('C1', 'U1', 'alice', 'new');
    await press(host, 'addbot');
    expect(lobbyOf(calls).args.text).toContain('玩家 (2/12)');
  });

  it('非房主被拒；房間已滿、沒有 bot 沿用指令的提示', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U1', 'alice', 'incan new');
    await host.button('ww:join:0', 'C1|join', 'U2', 'bob');
    await press(host, 'addbot', 'U2');
    expect(lastEph(calls)).toMatchObject({ user: 'U2', text: '只有房主可以加入 bot。' });
    await press(host, 'removebot');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: '房間裡沒有 bot。' });
    await host.game('C1', 'U1', 'alice', 'incan addbot 6');
    await press(host, 'addbot');
    expect(lastEph(calls)).toMatchObject({ user: 'U1', text: '房間已滿。' });
    expect(host.state('incan', 'C1')!.players).toHaveLength(8);
  });
});

describe('citadels/turns: 牌桌訊息的名字不通知', () => {
  it('記得名字時換成名字；不知道名字時退回 @', async () => {
    const { host, calls } = setup();
    await host.game('C1', 'U2', 'bob', 'citadels help');
    await (host as any).send('C1', { type: 'announce', text: '👑 王冠：{{name:U2}}｜{{name:U9}}' }, 'citadels');
    expect(calls.at(-1)!.args.text).toBe('👑 王冠：bob｜<@U9>');
  });
});

describe('citadels/turns: 回合面板原地更新 (adapter)', () => {
  const menu = (user: string, text: string, replace = true): GameEvent => ({ type: 'prompt', kind: 'citadels', audience: 'ephemeral', user, text, options: [{ value: 'end:1', label: '✅ 結束回合' }], replace });
  const deliver = (host: GameHost, events: GameEvent[], panel?: { url: string; user: string }) => (host as any).deliver('C1', events, 'citadels', undefined, panel);

  it('按鈕來自私下訊息：第一則帶 replace 的回應用 response_url 取代，其他照常發', async () => {
    const { host, calls, responds } = setup();
    await deliver(host, [menu('U1', '回合選單'), { type: 'ephemeral', to: 'U1', text: '第二則', replace: true }], { url: 'https://r', user: 'U1' });
    expect(responds).toHaveLength(1);
    expect(responds[0]).toMatchObject({ url: 'https://r', payload: { replace_original: true, text: '回合選單' } });
    expect(responds[0].payload.blocks.some((b: any) => b.type === 'actions')).toBe(true);
    expect(calls.filter((c) => c.method === 'chat.postEphemeral').map((c) => c.args.text)).toEqual(['第二則']);
  });

  it('私下文字也能取代，而且不帶按鈕', async () => {
    const { host, calls, responds } = setup();
    await deliver(host, [{ type: 'ephemeral', to: 'U1', text: '✅ 你的回合結束了', replace: true }], { url: 'https://r', user: 'U1' });
    expect(responds[0].payload).toMatchObject({ replace_original: true, text: '✅ 你的回合結束了' });
    expect(calls.some((c) => c.method === 'chat.postEphemeral')).toBe(false);
  });

  it('不是私下訊息按的、沒有 replace、或給別人的，照常 postEphemeral', async () => {
    const { host, calls, responds } = setup();
    await deliver(host, [menu('U1', 'A')]);
    await deliver(host, [menu('U1', 'B', false)], { url: 'https://r', user: 'U1' });
    await deliver(host, [menu('U2', 'C')], { url: 'https://r', user: 'U1' });
    expect(responds).toHaveLength(0);
    expect(calls.filter((c) => c.method === 'chat.postEphemeral').map((c) => c.args.text)).toEqual(['A', 'B', 'C']);
  });

  it('respond 失敗時退回 postEphemeral', async () => {
    const { client, calls } = fakeClient();
    const host = new GameHost(client, { rng: () => 0.5, setTimer: () => {}, respond: async () => { throw new Error('expired_url'); } });
    await deliver(host, [menu('U1', '回合選單')], { url: 'https://r', user: 'U1' });
    expect(calls.filter((c) => c.method === 'chat.postEphemeral').map((c) => c.args.text)).toEqual(['回合選單']);
  });

  it('button()：來自私下訊息才把 response_url 交給面板', async () => {
    const { host } = setup();
    const spy: any[] = [];
    (host as any).deliver = (...args: any[]) => (spy.push(args), Promise.resolve());
    await host.game('C1', 'U1', 'alice', 'citadels new');
    await host.button('ww:citadels:0', 'C1|status', 'U1', 'alice', undefined, 'https://r', true);
    expect(spy.at(-1)[4]).toEqual({ url: 'https://r', user: 'U1' });
    await host.button('ww:citadels:0', 'C1|status', 'U1', 'alice', undefined, 'https://r', false);
    expect(spy.at(-1)[4]).toBeUndefined();
  });
});
