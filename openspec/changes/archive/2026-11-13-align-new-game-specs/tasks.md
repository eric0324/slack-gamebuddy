## 1. 確認現有測試涵蓋

- [x] 1.1 確認 `test/sync.test.ts` 的結算測試是兩則訊息、`test/math.test.ts` 有檢查錯誤選項差距、簡單沒有等值 (`equal` 為 0)、`set` 有不認識的字時設定不變；困難分母不同補一條斷言，跑 `npx vitest run test/math.test.ts test/sync.test.ts` 綠燈

## 2. 驗證與歸檔

- [x] 2.1 `openspec validate align-new-game-specs`、`npm test`、`npm run typecheck` 全綠後歸檔
