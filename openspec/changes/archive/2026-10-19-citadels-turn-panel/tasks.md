## 1. 事件與 adapter

- [x] 1.1 先寫 `test/slack.test.ts` 測試：按鈕來自私下訊息時，帶 `replace` 的第一則私下回應用 `response_url` 取代 (`replace_original: true`)；不是私下訊息、或事件沒有 `replace` 時照常 `postEphemeral`；`respond` 失敗退回 `postEphemeral`。確認紅燈
- [x] 1.2 `src/engine.ts` 的 `ephemeral`、`prompt` 事件加 `replace?`；`src/slack.ts` 的 `button()`/`deliver()`/`send()` 實作取代；`src/index.ts` 傳 `is_ephemeral`。確認 1.1 綠燈

## 2. 富饒之城回合面板

- [x] 2.1 先寫 `test/citadels.test.ts` 測試，對應 spec「回合面板」五個 scenario 和「選角選單原地更新」，加上墓地等待訊息、錯誤訊息帶 `replace`。確認紅燈
- [x] 2.2 `src/citadels.ts`：私下事件標 `replace`、抽出回合選單主體、動作後自動送下一步、資訊併進選單、結束回合訊息。`npx vitest run test/citadels.test.ts` 全綠

## 3. 整合

- [x] 3.1 `npx vitest run` 與 `npx tsc --noEmit` 全部通過
