## 1. 預設語系

- [x] 1.1 先寫失敗的測試 (`test/i18n.test.ts`)：`LangStore` 指定預設語系時，沒設定過的頻道回傳預設語系；沒指定時是 `zh-TW`；`DEFAULT_LANG` 的解析 (沒設定是 `en`、不支援的值當 `en`、大小寫不拘)；預設英文時新頻道的大廳是英文
- [x] 1.2 先寫失敗的測試：同一個資料庫檔案已經有戰績 (`games`、`matches`)、梗圖投稿、星際探險隊進度的頻道，第一次啟動時被設成 `zh-TW`；已設定過語系的不變；第二次啟動時不再自動設定 (之後才玩的頻道維持預設語系)
- [x] 1.3 實作 `src/langStore.ts` 和 `src/index.ts`，讓 1.1、1.2 綠燈

## 2. 文件與驗證

- [x] 2.1 README 說明 `DEFAULT_LANG` (預設 `en`，玩過的頻道保留中文)；`.env.example` 加上 `DEFAULT_LANG`
- [x] 2.2 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈
