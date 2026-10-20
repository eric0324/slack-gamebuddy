// 重構安全網：記下使用者看得到的文字（遊戲清單、大廳、各遊戲指令說明），重構前後必須完全一樣
import { describe, expect, it } from 'vitest';
import { GameHost, type SlackClient } from '../src/slack.js';

const KINDS = ['undercover', 'spyfall', 'avalon', 'codenames', 'liarsdice', 'justone', 'coup', 'hanabi', 'wavelength', 'decrypto', 'wavecoop', 'insider', 'skull', 'nimmt', 'loveletter', 'cockroach', 'chameleon', 'nothanks', 'taboo', 'sushigo', 'meme', 'herd', 'kittens', 'criminal', 'wager', 'incan', 'dixit', 'citadels', 'emoji', 'crew', 'saboteur', 'forsale', 'machikoro', 'splendor', 'deception'];
const TABS = ['deduction', 'team', 'coop', 'bluff'];

function setup() {
  const ephs: any[] = [];
  const responds: any[] = [];
  const client = {
    chat: { postMessage: async () => ({ ok: true, ts: '1' }), update: async () => ({ ok: true }), postEphemeral: async (a: any) => void ephs.push(a) },
    conversations: { open: async () => ({ ok: true, channel: { id: 'D1' } }) },
    views: { open: async () => ({ ok: true }) },
  } as unknown as SlackClient;
  const host = new GameHost(client, { rng: () => 0.5, setTimer: () => undefined, gifs: {}, respond: async (_u, p) => void responds.push(p) });
  return { host, ephs, responds };
}

describe('重構安全網', () => {
  it('遊戲清單文字和預設大廳', async () => {
    const { host, ephs } = setup();
    await host.game('C1', 'U1', 'alice', '');
    expect(ephs[0].text).toMatchSnapshot();
    expect(ephs[0].blocks).toMatchSnapshot();
  });

  it('大廳四個分類', async () => {
    const { host, responds } = setup();
    for (const t of TABS) await host.button('ww:lobbyTab:0', `C1|${t}`, 'U1', 'alice', undefined, 'https://hooks/x');
    expect(responds.map((p) => p.blocks)).toMatchSnapshot();
  });

  it('每款遊戲的指令說明', async () => {
    const { host, ephs } = setup();
    for (const k of KINDS) await host.game('C1', 'U1', 'alice', `${k} help`);
    expect(Object.fromEntries(KINDS.map((k, i) => [k, ephs[i].text]))).toMatchSnapshot();
  });
});
