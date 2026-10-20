// 戰績：把全真人遊戲的結果存在 SQLite，依頻道和玩家計算場數與勝率；狼人殺另外記陣營和角色。
import { t, type Lang } from './i18n/index.js';
import Database from 'better-sqlite3';
import { isWolf, roleName, type Role } from './engine.js';
import { tx } from './i18n/games/werewolf.js';

export interface Tally {
  games: number;
  wins: number;
}

// 跨遊戲戰績的一行：合作遊戲 wins 是 null、best 是最高分
export interface GameSummary {
  kind: string;
  games: number;
  wins: number | null;
  best: number | null;
}

export type Leaderboard =
  | { by: 'wins'; rows: { user: string; wins: number; games: number }[] }
  | { by: 'score'; rows: { user: string; best: number; games: number }[] };

// 狼人殺的舊表和其他遊戲的新表合在一起看 (合作遊戲 won 是 NULL)
const ALL_PLAYS = `
  SELECT g.channel AS channel, 'werewolf' AS kind, gp.user_id AS user_id, gp.won AS won, NULL AS score
  FROM games g JOIN game_players gp ON gp.game_id = g.id
  UNION ALL
  SELECT m.channel, m.kind, mp.user_id, mp.won, m.score
  FROM matches m JOIN match_players mp ON mp.match_id = m.id`;

export interface PlayerStats {
  total: Tally;
  factions: Partial<{ good: Tally; wolves: Tally }>;
  roles: Partial<{ [role in Role]: Tally }>;
}

// 角色顯示順序
const ROLE_ORDER: Role[] = ['werewolf', 'wolfKing', 'seer', 'witch', 'knight', 'villager'];

export class StatsStore {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        ended_at INTEGER NOT NULL,
        winner TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS game_players (
        game_id INTEGER NOT NULL REFERENCES games(id),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        won INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS game_players_user ON game_players(user_id);
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        kind TEXT NOT NULL,
        ended_at INTEGER NOT NULL,
        score INTEGER
      );
      CREATE TABLE IF NOT EXISTS match_players (
        match_id INTEGER NOT NULL REFERENCES matches(id),
        user_id TEXT NOT NULL,
        won INTEGER
      );
      CREATE INDEX IF NOT EXISTS matches_channel ON matches(channel, kind);
    `);
  }

  record(channel: string, winner: 'good' | 'wolves', players: { id: string; role: Role }[], endedAt = Date.now()) {
    const insertGame = this.db.prepare('INSERT INTO games (channel, ended_at, winner) VALUES (?, ?, ?)');
    const insertPlayer = this.db.prepare('INSERT INTO game_players (game_id, user_id, role, won) VALUES (?, ?, ?, ?)');
    this.db.transaction(() => {
      const { lastInsertRowid } = insertGame.run(channel, endedAt, winner);
      for (const p of players) {
        const won = (winner === 'wolves') === isWolf(p.role);
        insertPlayer.run(lastInsertRowid, p.id, p.role, won ? 1 : 0);
      }
    })();
  }

  // 狼人殺以外的遊戲：score 有值就是合作遊戲，不記勝負
  recordMatch(channel: string, kind: string, players: string[], winners: string[], score?: number, endedAt = Date.now()) {
    const insertMatch = this.db.prepare('INSERT INTO matches (channel, kind, ended_at, score) VALUES (?, ?, ?, ?)');
    const insertPlayer = this.db.prepare('INSERT INTO match_players (match_id, user_id, won) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      const { lastInsertRowid } = insertMatch.run(channel, kind, endedAt, score ?? null);
      for (const id of players) insertPlayer.run(lastInsertRowid, id, score === undefined ? (winners.includes(id) ? 1 : 0) : null);
    })();
  }

  // 某人在這個頻道每款遊戲的戰績，依場數由多到少
  summary(channel: string, user: string): GameSummary[] {
    return this.db
      .prepare(
        `SELECT kind, COUNT(*) AS games, SUM(won) AS wins, MAX(score) AS best
         FROM (${ALL_PLAYS}) WHERE channel = ? AND user_id = ?
         GROUP BY kind ORDER BY games DESC, kind`,
      )
      .all(channel, user) as GameSummary[];
  }

  // 前 10 名：對戰依勝場、勝率、場數；指定的遊戲是合作遊戲時依最高分、場數
  leaderboard(channel: string, kind?: string): Leaderboard {
    const coop = kind !== undefined && !!this.db.prepare('SELECT 1 FROM matches WHERE channel = ? AND kind = ? AND score IS NOT NULL LIMIT 1').get(channel, kind);
    const where = `channel = ?${kind ? ' AND kind = ?' : ''}`;
    const args = kind ? [channel, kind] : [channel];
    if (coop) {
      const rows = this.db
        .prepare(
          `SELECT user_id AS user, MAX(score) AS best, COUNT(*) AS games FROM (${ALL_PLAYS})
           WHERE ${where} AND score IS NOT NULL GROUP BY user_id ORDER BY best DESC, games DESC, user_id LIMIT 10`,
        )
        .all(...args) as { user: string; best: number; games: number }[];
      return { by: 'score', rows };
    }
    const rows = this.db
      .prepare(
        `SELECT user_id AS user, SUM(won) AS wins, COUNT(*) AS games FROM (${ALL_PLAYS})
         WHERE ${where} AND won IS NOT NULL GROUP BY user_id
         ORDER BY wins DESC, CAST(SUM(won) AS REAL) / COUNT(*) DESC, games DESC, user_id LIMIT 10`,
      )
      .all(...args) as { user: string; wins: number; games: number }[];
    return { by: 'wins', rows };
  }

  stats(channel: string, user: string): PlayerStats | null {
    const rows = this.db
      .prepare(
        `SELECT gp.role AS role, COUNT(*) AS games, SUM(gp.won) AS wins
         FROM game_players gp JOIN games g ON g.id = gp.game_id
         WHERE g.channel = ? AND gp.user_id = ?
         GROUP BY gp.role`,
      )
      .all(channel, user) as { role: Role; games: number; wins: number }[];
    if (!rows.length) return null;
    const result: PlayerStats = { total: { games: 0, wins: 0 }, factions: {}, roles: {} };
    for (const r of rows) {
      const faction = isWolf(r.role) ? 'wolves' : 'good';
      const f = (result.factions[faction] ??= { games: 0, wins: 0 });
      f.games += r.games;
      f.wins += r.wins;
      result.total.games += r.games;
      result.total.wins += r.wins;
      result.roles[r.role] = { games: r.games, wins: r.wins };
    }
    return result;
  }

  close() {
    this.db.close();
  }
}

// /werewolf stats：狼人殺的詳細戰績；lang 是頻道語系
export function formatStats(who: string, stats: PlayerStats | null, lang: Lang = 'zh-TW'): string {
  if (!stats) return tx(lang, 'statsNone', { who });
  const line = (r: Tally) => tx(lang, 'statsLine', { games: r.games, wins: r.wins, pct: Math.round((r.wins / r.games) * 100) });
  const lines = [tx(lang, 'statsTitle', { who }), tx(lang, 'statsTotal', { line: line(stats.total) })];
  if (stats.factions.good) lines.push(tx(lang, 'statsGood', { line: line(stats.factions.good) }));
  if (stats.factions.wolves) lines.push(tx(lang, 'statsWolves', { line: line(stats.factions.wolves) }));
  const roles = ROLE_ORDER.filter((r) => stats.roles[r]).map((r) => tx(lang, 'statsRole', { role: roleName(lang, r), line: line(stats.roles[r]!) }));
  lines.push(tx(lang, 'statsRoles', { roles: roles.join(tx(lang, 'sep')) }));
  return lines.join('\n');
}

const pct = (wins: number, games: number) => `${Math.round((wins / games) * 100)}%`;

// label：遊戲代號 → 顯示名稱 (例如「💀 骷髏與玫瑰」)；lang：頻道語系
export function formatSummary(who: string, rows: GameSummary[], label: (kind: string) => string, lang: Lang = 'zh-TW'): string {
  if (!rows.length) return t(lang, 'stats.none', { who });
  const games = rows.reduce((n, r) => n + r.games, 0);
  const versus = rows.filter((r) => r.wins !== null);
  const vGames = versus.reduce((n, r) => n + r.games, 0);
  const vWins = versus.reduce((n, r) => n + r.wins!, 0);
  const total = vGames ? t(lang, 'stats.totalVersus', { games, vGames, vWins, pct: pct(vWins, vGames) }) : t(lang, 'stats.total', { games });
  const lines = rows.map((r) =>
    r.wins === null
      ? t(lang, 'stats.coopLine', { label: label(r.kind), games: r.games, best: r.best! })
      : t(lang, 'stats.versusLine', { label: label(r.kind), games: r.games, wins: r.wins, pct: pct(r.wins, r.games) }),
  );
  return [t(lang, 'stats.title', { who }), total, ...lines].join('\n');
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function formatLeaderboard(board: Leaderboard, title: string, lang: Lang = 'zh-TW'): string {
  if (!board.rows.length) return t(lang, 'rank.none');
  const rank = (i: number) => MEDALS[i] ?? `${i + 1}.`;
  const lines =
    board.by === 'wins'
      ? board.rows.map((r, i) => t(lang, 'rank.winsLine', { rank: rank(i), user: r.user, wins: r.wins, games: r.games, pct: pct(r.wins, r.games) }))
      : board.rows.map((r, i) => t(lang, 'rank.scoreLine', { rank: rank(i), user: r.user, best: r.best, games: r.games }));
  return [t(lang, 'rank.title', { title }), ...lines].join('\n');
}
