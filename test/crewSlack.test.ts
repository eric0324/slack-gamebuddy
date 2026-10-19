// 星際探險隊接上 Slack adapter：頻道進度帶入與寫入、戰績。GAMES 還沒加 crew（主控整合時加），這裡先 mock 進去
import { describe, expect, it } from 'vitest';
import { applyCrew, type CAction, type CState } from '../src/crew.js';
import { CrewStore } from '../src/crewStore.js';
import { GameHost, type SlackClient } from '../src/slack.js';
import { StatsStore } from '../src/stats.js';

type Call = { method: string; args: Record<string, any> };

function fakeClient() {
  const calls: Call[] = [];
  let ts = 0;
  const record = (method: string, result: (args: any) => unknown) => async (args: any) => {
    calls.push({ method, args });
    return result(args);
  };
  const client: SlackClient = {
    chat: {
      postMessage: record('chat.postMessage', (a) => ({ ok: true, channel: a.channel, ts: String(++ts) })),
      update: record('chat.update', () => ({ ok: true })),
      postEphemeral: record('chat.postEphemeral', () => ({ ok: true })),
    },
    conversations: { open: record('conversations.open', (a) => ({ ok: true, channel: { id: `D:${a.users}` } })) },
    views: { open: record('views.open', () => ({ ok: true })) },
  };
  return { client, calls };
}

const rng = () => 0.99999;
const lastEph = (calls: Call[]) => calls.filter((c) => c.method === 'chat.postEphemeral').at(-1)!.args;
const crewState = (host: GameHost) => host.state('crew' as never, 'C1') as unknown as CState;

// 3 人局（p3 是指揮官、領出）停在第一墩可以出牌，p3 有 🟦9 任務：這墩 p3 贏就成功
function oneTrickToWin(prev: CState): CState {
  let s = prev;
  const step = (a: CAction) => (s = applyCrew(s, a, rng).state);
  step({ type: 'join', user: 'p2' });
  step({ type: 'join', user: 'p3' });
  step({ type: 'start', user: 'p1' });
  while (s.phase === 'assign' || !s.ready) step({ type: 'timeout', id: s.timers.phase! });
  const c = structuredClone(s);
  c.players[0].hand = ['blue:1', 'green:1'];
  c.players[1].hand = ['blue:2', 'green:2'];
  c.players[2].hand = ['blue:9', 'green:9'];
  c.tasks = [{ card: 'blue:9', owner: 'p3', done: false }];
  return c;
}

describe('crew/missions: Slack adapter 的頻道進度', () => {
  it('開新房帶入 CrewStore 的已解鎖關卡', async () => {
    const { client } = fakeClient();
    const crew = new CrewStore(':memory:');
    crew.set('C1', 7);
    const host = new GameHost(client, { rng, setTimer: () => {}, crew });
    await host.game('C1', 'p1', 'alice', 'crew new');
    expect(crewState(host)).toMatchObject({ mission: 7, unlocked: 7 });
  });

  it('沒有設定 store 時從第 1 關開始', async () => {
    const { client } = fakeClient();
    const host = new GameHost(client, { rng, setTimer: () => {} });
    await host.game('C1', 'p1', 'alice', 'crew new');
    expect(crewState(host)).toMatchObject({ mission: 1, unlocked: 1 });
  });

  it('`/game crew level` 沒有房間也列出 store 裡已解鎖的關卡', async () => {
    const { client, calls } = fakeClient();
    const crew = new CrewStore(':memory:');
    crew.set('C1', 3);
    const host = new GameHost(client, { rng, setTimer: () => {}, crew });
    await host.game('C1', 'Z', 'zed', 'crew level');
    expect(lastEph(calls).text).toContain('第 3 關');
    expect(lastEph(calls).text).not.toContain('第 4 關');
  });

  it('成功時把 crewProgress 寫進 CrewStore，result 照合作遊戲記錄關卡編號', async () => {
    const { client } = fakeClient();
    const crew = new CrewStore(':memory:');
    const stats = new StatsStore(':memory:');
    crew.set('C1', 5);
    const host = new GameHost(client, { rng, setTimer: () => {}, crew, stats });
    await host.game('C1', 'p1', 'alice', 'crew new');
    host.setState('crew' as never, 'C1', oneTrickToWin(crewState(host)) as never);
    for (const [user, card] of [['p3', 'blue:9'], ['p1', 'blue:1'], ['p2', 'blue:2']]) {
      await host.button('ww:crew:0', `C1|play:${crewState(host).seq}:${card}`, user, user);
    }
    expect(crewState(host).outcome).toBe('success');
    expect(crew.get('C1')).toBe(6);
    expect(stats.summary('C1', 'p1')).toEqual([{ kind: 'crew', games: 1, wins: null, best: 5 }]);
  });

  it('沒有設定 store 時忽略 crewProgress', async () => {
    const { client } = fakeClient();
    const host = new GameHost(client, { rng, setTimer: () => {} });
    await host.game('C1', 'p1', 'alice', 'crew new');
    host.setState('crew' as never, 'C1', oneTrickToWin(crewState(host)) as never);
    for (const [user, card] of [['p3', 'blue:9'], ['p1', 'blue:1'], ['p2', 'blue:2']]) {
      await host.button('ww:crew:0', `C1|play:${crewState(host).seq}:${card}`, user, user);
    }
    expect(crewState(host).outcome).toBe('success');
  });
});
