## 1. 轉換

- [x] 1.1 用轉換腳本把 `src/`、`test/`、`README.md`、`openspec/`、`deploy/` 的全形括弧換成半形並依規則補空白；確認 `grep -rl "[（）]"` 沒有剩下
- [x] 1.2 程式裡接在文字後面的字尾字串補開頭空白；程式碼片段結尾後面接括號時補空白；`src/slack.ts` 房間公告處理名稱以括號結尾的遊戲
- [x] 1.3 更新測試字串、正規表示式跳脫和 characterization snapshot，`npm test`、`npm run typecheck` 全綠

## 2. wiki

- [ ] 2.1 wiki 所有頁面套用同一個轉換；心電感應 (合作) 三頁改名為「心電感應-(合作)」，確認 Home、Sidebar 和 README 的連結對得上（問過再 push）
