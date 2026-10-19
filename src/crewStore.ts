// 星際探險隊的頻道戰役進度：每個頻道已解鎖的最高關卡，存在 SQLite（和戰績同一個檔案）
import Database from 'better-sqlite3';

export class CrewStore {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crew_progress (
        channel TEXT PRIMARY KEY,
        unlocked INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  // 沒有資料時是第 1 關
  get(channel: string): number {
    const row = this.db.prepare('SELECT unlocked FROM crew_progress WHERE channel = ?').get(channel) as { unlocked: number } | undefined;
    return row?.unlocked ?? 1;
  }

  set(channel: string, unlocked: number): void {
    this.db
      .prepare('INSERT INTO crew_progress (channel, unlocked, updated_at) VALUES (?, ?, ?) ON CONFLICT(channel) DO UPDATE SET unlocked = excluded.unlocked, updated_at = excluded.updated_at')
      .run(channel, unlocked, Date.now());
  }
}
