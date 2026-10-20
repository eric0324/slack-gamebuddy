// 梗圖大亂鬥的頻道梗圖庫：玩家投稿的梗圖存在 SQLite (和戰績同一個檔案)，每個頻道各自一份
import Database from 'better-sqlite3';

export type SubmittedMeme = { id: number; url: string; name: string; by: string };

const COLUMNS = 'id, url, name, user_id AS by';

export class MemeStore {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meme_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        url TEXT NOT NULL,
        name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(channel, url)
      );
    `);
  }

  // 回傳編號；AUTOINCREMENT 讓刪掉的編號不會再被用
  add(channel: string, url: string, name: string, user: string): number {
    const r = this.db.prepare('INSERT INTO meme_images (channel, url, name, user_id, created_at) VALUES (?, ?, ?, ?, ?)').run(channel, url, name, user, Date.now());
    return Number(r.lastInsertRowid);
  }

  list(channel: string): SubmittedMeme[] {
    return this.db.prepare(`SELECT ${COLUMNS} FROM meme_images WHERE channel = ? ORDER BY id`).all(channel) as SubmittedMeme[];
  }

  get(channel: string, id: number): SubmittedMeme | undefined {
    return this.db.prepare(`SELECT ${COLUMNS} FROM meme_images WHERE channel = ? AND id = ?`).get(channel, id) as SubmittedMeme | undefined;
  }

  findByUrl(channel: string, url: string): SubmittedMeme | undefined {
    return this.db.prepare(`SELECT ${COLUMNS} FROM meme_images WHERE channel = ? AND url = ?`).get(channel, url) as SubmittedMeme | undefined;
  }

  remove(channel: string, id: number): boolean {
    return this.db.prepare('DELETE FROM meme_images WHERE channel = ? AND id = ?').run(channel, id).changes > 0;
  }
}
