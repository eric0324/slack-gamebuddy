## 1. 改用 @ 標記

- [x] 1.1 先改 `test/citadels.test.ts`：牌桌訊息、回合結束、場上一覽的斷言改成 `<@id>`，確認紅燈
- [x] 1.2 改 `src/citadels.ts`，`npx vitest run` 與 `npx tsc --noEmit` 全綠
