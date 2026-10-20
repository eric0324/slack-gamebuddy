import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from '../src/common.js';

describe('共用小工具', () => {
  it('shuffle：回傳新陣列、不改原陣列，固定 rng 時結果固定 (Fisher–Yates)', () => {
    const items = [1, 2, 3, 4, 5];
    const seq = [0.1, 0.9, 0.5, 0.3];
    let i = 0;
    const out = shuffle(items, () => seq[i++]);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    // i=4: j=floor(0.1*5)=0 → [5,2,3,4,1]；i=3: j=floor(0.9*4)=3 → 不變；i=2: j=floor(0.5*3)=1 → [5,3,2,4,1]；i=1: j=floor(0.3*2)=0 → [3,5,2,4,1]
    expect(out).toEqual([3, 5, 2, 4, 1]);
    expect(i).toBe(4);
  });

  it('reply：只讓某人看到，回傳 false', () => {
    const c = { events: [] as GameEvent[] };
    expect(reply(c, 'U1', '還沒輪到你。')).toBe(false);
    expect(c.events).toEqual([{ type: 'ephemeral', to: 'U1', text: '還沒輪到你。' }]);
  });

  it('startTimer：遞增 timerSeq、設定 timers.phase、送出計時事件', () => {
    const c = { s: { timerSeq: 4, timers: { phase: 2 } as { phase?: number } }, events: [] as GameEvent[] };
    startTimer(c, 120_000);
    expect(c.s).toEqual({ timerSeq: 5, timers: { phase: 5 } });
    expect(c.events).toEqual([{ type: 'startTimer', id: 5, ms: 120_000 }]);
  });

  it('lobbyEvent：房間公告事件，開放中是 phase 為 lobby', () => {
    const s = { host: 'U1', phase: 'lobby', players: [{ id: 'U1' }, { id: 'U2' }] };
    expect(lobbyEvent('骷髏與玫瑰', s)).toEqual({ type: 'lobby', title: '骷髏與玫瑰', host: 'U1', players: ['U1', 'U2'], open: true });
    expect(lobbyEvent('骷髏與玫瑰', { ...s, phase: 'turn' })).toMatchObject({ open: false });
  });
});

type P = { id: string; score: number };
const newPlayer = (id: string): P => ({ id, score: 0 });
const room = (phase = 'lobby', ids = ['H', 'A']) => ({
  s: { host: 'H', phase, players: ids.map(newPlayer), timers: { phase: 3 } as { phase?: number } },
  events: [] as GameEvent[],
  rng: () => 0,
});
const ephemeral = (c: { events: GameEvent[] }) => c.events.filter((e) => e.type === 'ephemeral').map((e) => (e as { text: string }).text);

describe('共用房間邏輯', () => {
  it('joinRoom：加入後更新房間公告；開始後、重複加入、房間已滿都拒絕', () => {
    const c = room();
    expect(joinRoom(c, '測試', 'B', 3, newPlayer)).toBe(true);
    expect(c.s.players.map((p) => p.id)).toEqual(['H', 'A', 'B']);
    expect(c.events).toEqual([{ type: 'lobby', title: '測試', host: 'H', players: ['H', 'A', 'B'], open: true }]);
    expect(joinRoom(c, '測試', 'C', 3, newPlayer)).toBe(false);
    expect(joinRoom(c, '測試', 'A', 9, newPlayer)).toBe(false);
    const started = room('turn');
    expect(joinRoom(started, '測試', 'B', 9, newPlayer)).toBe(false);
    expect([...ephemeral(c), ...ephemeral(started)]).toEqual(['房間已滿。', '你已經在房間裡了。', '遊戲已經開始了。']);
  });

  it('leaveRoom：玩家離開；房主離開取消房間；開始後不能離開；不在房間就忽略', () => {
    const c = room();
    expect(leaveRoom(c, '測試', 'A')).toBe(true);
    expect(c.s.players.map((p) => p.id)).toEqual(['H']);
    expect(leaveRoom(c, '測試', 'Z')).toBe(false);
    expect(leaveRoom(c, '測試', 'H')).toBe(true);
    expect(c.s.phase).toBe('ended');
    expect(c.events.at(-1)).toEqual({ type: 'announce', text: '🛑 房主離開，遊戲已取消。' });
    const started = room('turn');
    expect(leaveRoom(started, '測試', 'A')).toBe(false);
    expect(ephemeral(started)).toEqual(['遊戲已經開始了，不能離開。']);
  });

  it('addBots／removeBots：只有房主、開始前；bot 編號接續、名字不重複；超過上限提示房間已滿', () => {
    const c = room();
    expect(addBots(c, '測試', 'H', 3, 4, newPlayer)).toBe(true);
    const bots = c.s.players.slice(2).map((p) => p.id);
    expect(bots).toHaveLength(2);
    expect(bots.map((id) => id.split(':')[1])).toEqual(['1', '2']);
    expect(new Set(bots.map((id) => id.split(':')[2])).size).toBe(2);
    expect(ephemeral(c)).toEqual(['房間已滿。']);
    expect(addBots(c, '測試', 'H', 1, 4, newPlayer)).toBe(false);
    expect(removeBots(c, '測試', 'H', 1)).toBe(true);
    expect(c.s.players.map((p) => p.id)).toEqual(['H', 'A', bots[0]]);
    expect(addBots(c, '測試', 'A', 1, 9, newPlayer)).toBe(false);
    expect(removeBots(c, '測試', 'A', 1)).toBe(false);
    expect(removeBots(room(), '測試', 'H', 1)).toBe(false);
    expect(ephemeral(c).slice(1)).toEqual(['房間已滿。', '只有房主可以加入 bot。', '只有房主可以移除 bot。']);
  });

  it('cancelGame：只有房主；結束遊戲、清掉計時器、公告 (可以附加文字)', () => {
    const c = room('turn');
    expect(cancelGame(c, 'A')).toBe(false);
    expect(ephemeral(c)).toEqual(['只有房主可以取消遊戲。']);
    expect(cancelGame(c, 'H', '答案是「貓」。')).toBe(true);
    expect(c.s).toMatchObject({ phase: 'ended', timers: {} });
    expect(c.events.at(-1)).toEqual({ type: 'announce', text: '🛑 房主已取消遊戲。答案是「貓」。' });
  });

  describe('runGame', () => {
    type S = { host: string; phase: string; players: P[]; timers: { phase?: number }; done?: boolean };
    type A = { type: 'new'; user: string; channel: string } | { type: 'rematch'; user: string; channel: string } | { type: 'poke'; user: string };
    const lobby = (_prev: S | undefined, host: string): { state: S; events: GameEvent[] } => {
      const state = { host, phase: 'lobby', players: [newPlayer(host)], timers: {} };
      return { state, events: [{ type: 'announce', text: `lobby:${host}` }] };
    };
    const opts = {
      finished: (s: S) => !!s.done,
      isPlayer: (s: S, user: string) => s.players.some((p) => p.id === user),
      createLobby: lobby,
      handle: (c: { s: S; events: GameEvent[] }, a: { type: 'poke'; user: string }) => {
        c.s.phase = `poked:${a.user}`;
        return a.user !== 'nochange';
      },
    };
    const run = (state: S | undefined, action: A, extra = {}) => runGame(state, action, () => 0, { ...opts, ...extra });

    it('開房：頻道沒有遊戲或上一局結束才能開', () => {
      expect(run(undefined, { type: 'new', user: 'H', channel: 'C' }).state.host).toBe('H');
      const playing = lobby(undefined, 'H').state;
      const busy = run(playing, { type: 'new', user: 'X', channel: 'C' });
      expect(busy.state).toBe(playing);
      expect(busy.events).toEqual([{ type: 'ephemeral', to: 'X', text: '這個頻道已經有遊戲了。' }]);
      expect(run({ ...playing, phase: 'ended' }, { type: 'new', user: 'X', channel: 'C' }).state.host).toBe('X');
    });

    it('再來一局：只有正常結束、上一局的真人玩家可以開', () => {
      const ended = { ...lobby(undefined, 'H').state, phase: 'ended', done: true };
      expect(run(ended, { type: 'rematch', user: 'H', channel: 'C' }).state.phase).toBe('lobby');
      expect(run({ ...ended, done: false }, { type: 'rematch', user: 'H', channel: 'C' }).events).toEqual([]);
      expect(run(ended, { type: 'rematch', user: 'X', channel: 'C' }).events[0]).toMatchObject({ text: '只有上一局的玩家可以開新的一局。' });
      expect(run({ ...ended, phase: 'lobby' }, { type: 'rematch', user: 'H', channel: 'C' }).events[0]).toMatchObject({ text: '這個頻道已經有遊戲了。' });
      expect(run(undefined, { type: 'rematch', user: 'H', channel: 'C' }).events).toEqual([]);
    });

    it('其他 action：交給 handle；沒變就回傳原本的 state；已結束就忽略；變了才跑 afterChange', () => {
      const s = lobby(undefined, 'H').state;
      const after: string[] = [];
      const changed = run(s, { type: 'poke', user: 'A' }, { afterChange: (c: { s: S }) => after.push(c.s.phase) });
      expect(changed.state.phase).toBe('poked:A');
      expect(s.phase).toBe('lobby');
      expect(after).toEqual(['poked:A']);
      expect(run(s, { type: 'poke', user: 'nochange' }).state).toBe(s);
      expect(run({ ...s, phase: 'ended' }, { type: 'poke', user: 'A' }).events).toEqual([]);
    });

    it('extra：額外的 ctx 欄位會帶進 handle', () => {
      let seen: unknown;
      run(lobby(undefined, 'H').state, { type: 'poke', user: 'A' }, { extra: { botChain: 0 }, handle: (c: { botChain?: number }) => ((seen = c.botChain), true) });
      expect(seen).toBe(0);
    });
  });
});
