## 1. 測試（紅燈）

- [ ] 1.1 `test/slack.test.ts`：合作分類按鈕改成只有 justone、hanabi、wavecoop；`/game soclover` 顯示遊戲大廳；`/game stats` 列出舊的 `soclover` 紀錄；刪掉四葉草的 describe 區塊；遊戲代號清單拿掉 soclover
- [ ] 1.2 `test/characterization.test.ts`：KINDS 拿掉 soclover
- [ ] 1.3 跑測試確認紅燈

## 2. 程式（綠燈）

- [ ] 2.1 `src/games/index.ts` 拿掉 soclover
- [ ] 2.2 刪除 `src/soclover.ts`、`src/socloverWords.ts`、`src/games/soclover.ts`、`test/soclover.test.ts`、`test/socloverWords.test.ts`
- [ ] 2.3 更新 characterization snapshot，確認 diff 只有刪掉四葉草的行
- [ ] 2.4 全部測試、typecheck 綠燈

## 3. 文件與歸檔

- [x] 3.1 README 拿掉四葉草（遊戲介紹、wiki 連結、Slack App 設定的 description 和 usage_hint）
- [x] 3.2 wiki 刪除四葉草兩頁，更新首頁和側邊欄
- [x] 3.3 `openspec validate` 通過後歸檔，確認 `openspec/specs/soclover/` 已移除
