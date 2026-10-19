// 妙語說書人接上 Slack adapter：GAMES 還沒加 dixit（主控整合時才加），這裡先用 mock 把它放進去
import { describe, expect, it } from 'vitest';
import { MemeStore } from '../src/memeStore.js';
import { GameHost, type SlackClient } from '../src/slack.js';

function dixitHost(badImage?: string) {
  const calls: { method: string; args: any }[] = [];
  let ts = 0;
  const record = (method: string, result: (a: any) => unknown) => async (args: any) => {
    calls.push({ method, args });
    if (badImage && (args.blocks ?? []).some((b: any) => b.image_url === badImage)) throw new Error('invalid_blocks');
    return result(args);
  };
  const client: SlackClient = {
    chat: { postMessage: record('chat.postMessage', () => ({ ok: true, ts: String(++ts) })), update: record('chat.update', () => ({ ok: true })), postEphemeral: record('chat.postEphemeral', () => ({ ok: true })) },
    conversations: { open: record('conversations.open', (a) => ({ ok: true, channel: { id: `D:${a.users}` } })) },
    views: { open: record('views.open', () => ({ ok: true })) },
  };
  const memes = new MemeStore(':memory:');
  const host = new GameHost(client, { rng: () => 0.99999, setTimer: () => undefined, gifs: {}, memes });
  return { host, calls, memes };
}

async function start(host: GameHost, channel = 'C1') {
  await host.game(channel, 'U1', 'alice', 'dixit new');
  await host.button('ww:join:0', `${channel}|join`, 'U2', 'bob');
  await host.button('ww:join:0', `${channel}|join`, 'U3', 'carol');
  await host.button('ww:start:2', `${channel}|start`, 'U1', 'alice');
}

const dixitState = (host: GameHost, channel = 'C1') => (host as any).state('dixit', channel);

describe('dixit/setup: 開局帶入頻道投稿梗圖', () => {
  it('dixit 的 start 帶入這個頻道的投稿，其他頻道的不會帶入', async () => {
    const { host, memes } = dixitHost();
    memes.add('C1', 'https://x.com/a.png', '老闆', 'U9');
    memes.add('C2', 'https://x.com/b.png', '別頻道', 'U8');
    await start(host);
    const s = dixitState(host);
    const all = [...s.deck, ...s.players.flatMap((p: any) => p.hand)].map((c: any) => c.url);
    expect(all).toContain('https://x.com/a.png');
    expect(all).not.toContain('https://x.com/b.png');
  });

  it('按手牌、選牌、在視窗送出提示，頻道公告提示', async () => {
    const { host, calls } = dixitHost();
    await start(host);
    await host.button('ww:dixit:0', 'C1|hand', 'U1', 'alice');
    const hand = calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
    expect(hand.blocks.filter((b: any) => b.type === 'image')).toHaveLength(7);
    await host.button('ww:dixit:2', `C1|pick:${dixitState(host).seq}:2`, 'U1', 'alice', 'T1');
    expect(calls.find((c) => c.method === 'views.open')!.args).toMatchObject({ trigger_id: 'T1', view: { callback_id: 'ww:dixitClue', private_metadata: 'C1' } });
    await host.modal('ww:dixitClue', 'C1', 'U1', 'alice', ['週一早上']);
    expect(dixitState(host).phase).toBe('play');
    expect(calls.filter((c) => c.method === 'chat.postMessage').map((c) => c.args.text)).toContainEqual(expect.stringContaining('週一早上'));
  });

  it('投票圖片失效時頻道仍收到投票訊息，文字列出網址，按鈕可以投票', async () => {
    const { host, calls, memes } = dixitHost('https://x.com/dead.png');
    // 牌庫不洗動：投稿的牌在最後，先把它換到房主手牌第 1 張
    memes.add('C1', 'https://x.com/dead.png', '壞圖', 'U9');
    await start(host);
    const s = structuredClone(dixitState(host));
    s.players[0].hand[0] = { url: 'https://x.com/dead.png', by: 'U9' };
    (host as any).setState('dixit', 'C1', s);
    await host.game('C1', 'U1', 'alice', 'dixit clue 1 好累');
    const seq = dixitState(host).seq;
    for (const [u, name] of [['U2', 'bob'], ['U3', 'carol']]) {
      await host.button('ww:dixit:0', `C1|play:${seq}:0`, u, name);
      await host.button('ww:dixit:1', `C1|play:${seq}:1`, u, name);
    }
    expect(dixitState(host).phase).toBe('vote');
    const vote = calls.filter((c) => c.method === 'chat.postMessage').at(-1)!.args;
    expect(vote.text).toContain('1. https://x.com/dead.png');
    expect(vote.blocks.some((b: any) => b.type === 'image')).toBe(false);
    await host.button('ww:dixit:1', `C1|vote:${dixitState(host).seq}:0`, 'U2', 'bob');
    expect(dixitState(host).players[1].vote).toBe(0);
  });
});
