## 1. 大廳連結

- [x] 1.1 先寫失敗的測試 (`test/slack.test.ts`)：大廳底部那一行有 `/game <代號> help`、wiki 連結和連到 Discussions 的「💬 社群討論」；確認紅燈
- [x] 1.2 改 `src/slack.ts` 大廳底部那一行，讓 1.1 綠燈；更新 characterization snapshot，確認差異只有底部那一行

## 2. issue 表單與文件

- [x] 2.1 新增 `.github/ISSUE_TEMPLATE/bug.yml`、`improvement.yml`、`config.yml`；遊戲下拉選單包含全部 36 款和「大廳／其他」；用 YAML parser 確認格式正確
- [x] 2.2 README 加上社群討論連結；wiki 首頁和側邊欄加上社群討論連結 (問過再 push)
- [x] 2.3 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈
