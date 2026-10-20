// 狼人殺以外的遊戲接上 Slack adapter 的共同介面：每款遊戲一個 GameDef，集中在 src/games/<遊戲>.ts
import type { GameEvent, Rng } from '../engine.js';

export const WIKI = 'https://github.com/eric0324/slack-gamebuddy/wiki';

export type Category = 'deduction' | 'bluff' | 'party' | 'team' | 'coop' | 'strategy';

export interface GameDef<S extends { phase: string }, A extends { type: string }> {
  kind: string;
  emoji: string;
  name: string;
  players: string; // 例如「3～6 人」
  category: Category;
  desc: string; // 大廳的一句介紹
  noBots?: boolean; // 遊戲清單那一行加「(不支援 bot)」
  help: string; // `/game <遊戲> help` 的指令說明
  apply(state: S | undefined, action: A, rng: Rng): { state: S; events: GameEvent[] };
  parse(text: string, user: string, channel: string): A | null;
  button(kind: string, value: string, user: string, channel: string): A | null;
  modals?: Record<string, { action(user: string, texts: string[]): A; fallback: string }>; // 視窗種類 → action；fallback 是視窗打不開時的提示
  chat?(user: string, text: string): A; // 頻道裡的一般訊息
}
