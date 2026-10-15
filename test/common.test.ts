import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { lobbyEvent, reply, shuffle, startTimer } from '../src/common.js';

describe('共用小工具', () => {
  it('shuffle：回傳新陣列、不改原陣列，固定 rng 時結果固定（Fisher–Yates）', () => {
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
