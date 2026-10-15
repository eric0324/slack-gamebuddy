// 各遊戲 engine 共用的小工具：洗牌、只讓某人看到的回覆、階段計時、房間公告
import type { GameEvent, Rng } from './engine.js';

// Fisher–Yates 洗牌，回傳新陣列，不改原陣列
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 只讓某人看到的訊息；回傳 false 表示 state 沒變
export const reply = (c: { events: GameEvent[] }, to: string, text: string) => {
  c.events.push({ type: 'ephemeral', to, text });
  return false;
};

// 開一個新的階段計時器：舊的計時器 id 對不上，觸發時會被忽略
export function startTimer(c: { s: { timerSeq: number; timers: { phase?: number } }; events: GameEvent[] }, ms: number) {
  c.s.timers.phase = ++c.s.timerSeq;
  c.events.push({ type: 'startTimer', id: c.s.timerSeq, ms });
}

// 房間公告：玩家名單和是否還能加入
export const lobbyEvent = (title: string, s: { host: string; phase: string; players: { id: string }[] }): GameEvent => ({
  type: 'lobby',
  title,
  host: s.host,
  players: s.players.map((p) => p.id),
  open: s.phase === 'lobby',
});
