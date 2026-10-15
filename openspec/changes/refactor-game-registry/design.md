## Context

- 狼人殺以外的 17 款遊戲已經用同一個 `GameDef` 介面接上 `GameHost`（`states`、`apply`、`parse`、`button`、`help`），但介面的實作和遊戲資訊散在 `slack.ts` 各處。
- 有 3 個地方還是寫死特定遊戲：`modal()` 的 4 個 callback、視窗打不開時的備用指令文字、`chat()` 交給圈內人。

## Goals / Non-Goals

**Goals:**
- 新增一款遊戲只需要：新增 `src/games/<遊戲>.ts`、在 `GAMES` 加一行
- 使用者看到的所有文字和按鈕完全不變

**Non-Goals:**
- 不動 engine（`src/<遊戲>.ts`），那是 ②③ 的範圍
- 不動狼人殺的 adapter
- 不改任何指令、按鈕 value、文字

## Decisions

1. **`GameDef` 擴充成完整的遊戲描述**（放在 `src/games/types.ts`）：
   ```ts
   interface GameDef<S, A> {
     kind: string; emoji: string; name: string; players: string; category: Category; desc: string;
     noBots?: boolean;              // 遊戲清單那一行加「（不支援 bot）」
     help: string;
     apply(state: S | undefined, action: A, rng: Rng): { state: S; events: GameEvent[] };
     parse(text, user, channel): A | null;
     button(kind, value, user, channel): A | null;
     modals?: Record<string, { action(user, texts): A; fallback: string }>; // callback 種類 → action，以及視窗打不開時的提示
     chat?(user, text): A;          // 頻道一般訊息（圈內人）
   }
   ```
   遊戲清單那一行由欄位組出來：`• ${emoji} *${name}*（\`${kind}\`）：${players}${noBots ? '（不支援 bot）' : ''}，開房 \`/game ${kind} new\``，和現在的文字逐字相同（有 characterization test 把關）。
2. **`GAMES` 的順序就是大廳和遊戲清單的順序**，和現在的 `CATALOG` 相同。狼人殺的那一列另外寫在 `slack.ts`，放在最前面。
3. **狀態統一存在 `Map<kind, Map<channel, state>>`**，對外只開 `state(kind, channel)` 和 `setState(kind, channel, s)`；`kind` 的型別是 `GAMES` 裡所有代號的 union，打錯字 typecheck 會擋。
4. **共用的房間指令解析** `parseUndercoverCommand` 留在 `src/games/undercover.ts`，另外提供 `parseRoomCommand`（只接受 new、start、cancel、addbot、removebot），其他遊戲改用它，結果和現在相同。
5. **先寫 characterization test 再搬**：用 vitest snapshot 記下 `/game` 遊戲清單文字、大廳四個分類的 blocks、17 份 `/game <遊戲> help` 的文字。重構過程中 snapshot 不能變。

## Risks / Trade-offs

- [一次改動很大] → 每搬幾款遊戲就跑一次全部測試；snapshot 加上現有 984 個測試把關
- [測試 80 幾處要改] → 用腳本機械式替換 `host.xxxGames.get(` → `host.state('xxx', `，改完再人工檢查
- [檔案數變多] → 每個檔案都很小（30～60 行），集中一款遊戲，找起來比現在快
