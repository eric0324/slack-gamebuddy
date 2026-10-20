## 1. 收尾

- [x] 1.1 圈內人改用截碼戰的英文詞庫 (`DECRYPTO_WORDS_BY_LANG`)，刪掉 `src/insiderWords.ts`；圈內人和截碼戰的測試綠燈
- [x] 1.2 先寫失敗的測試 (`test/i18n.test.ts`)：英文頻道的梗圖庫 list／add (預設名稱 My meme)／remove 和沒設定梗圖庫的提示；英文局視窗打不開的提示；英文頻道沒開過房的 `/game crew level`；確認紅燈
- [x] 1.3 實作梗圖庫字典、GameDef `modals` 各語系提示、`src/slack.ts` 帶語系、星際探險隊用 action 的語系，讓 1.2 綠燈

## 2. 文件與驗證

- [x] 2.1 wiki 首頁和側邊欄加上英文頁面 (問過再 push)；確認含特殊字元的英文頁名 (例如 Wits & Wagers) 連結能打開
- [x] 2.2 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈
