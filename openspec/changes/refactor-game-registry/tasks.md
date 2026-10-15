## 1. 安全網

- [ ] 1.1 新增 characterization test：用 snapshot 記下遊戲清單文字、大廳四個分類的 blocks、17 份指令說明，在重構前跑一次產生 snapshot

## 2. 搬移

- [ ] 2.1 新增 `src/games/types.ts`（`GameDef`、`Category`）和 `parseRoomCommand`
- [ ] 2.2 17 款遊戲各新增 `src/games/<遊戲>.ts`，把說明、解析、按鈕、大廳資訊、視窗、頻道訊息搬過去
- [ ] 2.3 新增 `src/games/index.ts` 的 `GAMES`
- [ ] 2.4 `slack.ts` 的遊戲清單、`CATALOG`、`Kind`、`defs`、`modal()`、視窗備用文字、`chat()` 改成從 `GAMES` 產生
- [ ] 2.5 `GameHost` 改用 `state()`／`setState()`，拿掉 17 個 `xxxGames` 欄位

## 3. 測試與驗證

- [ ] 3.1 `test/slack.test.ts` 改用 `host.state()`，import 改到 `src/games/*`
- [ ] 3.2 跑全部測試、typecheck，snapshot 沒有變
