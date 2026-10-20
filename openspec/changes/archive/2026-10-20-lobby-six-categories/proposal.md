## Why

遊戲越來越多，大廳的「🎲 心理戰」一類就有 18 款，佔了全部遊戲的一半，打開來要捲很久才找得到想玩的。重新分成 6 類，每類最多 9 款，比較好掃。

## What Changes

- 大廳分類從 4 類改成 6 類，順序：🔍 身分推理、🎭 吹牛心機、😂 派對創意、⚔️ 團隊對抗、🤝 合作、🧩 策略桌遊；剛打開時顯示身分推理
- 遊戲歸屬：
  - 🔍 身分推理 (8)：狼人殺、誰是臥底、間諜危機、阿瓦隆、圈內人、變色龍、矮人礦坑、詭影神探
  - 🎭 吹牛心機 (6)：吹牛骰、政變、骷髏與玫瑰、蟑螂撲克、情書、犯人在跳舞
  - 😂 派對創意 (5)：梗圖大亂鬥、妙語說書人、Emoji 傳話、從眾心理、猜猜看
  - ⚔️ 團隊對抗 (4)：機密代號、心電感應、截碼戰、禁語 (不變)
  - 🤝 合作 (4)：一字千金、花火、心電感應 (合作)、星際探險隊 (不變)
  - 🧩 策略桌遊 (9)：誰是牛頭王、不要謝謝、壽司派對、炸彈貓、印加寶藏、富饒之城、地產大亨、骰子街、璀璨寶石
- 各遊戲 setup spec 裡「大廳分類是…」的寫法跟著改；梗圖大亂鬥、壽司派對原本寫的「排在 X 後面」拿掉 (分類換了，順序跟著遊戲清單)
- 「遊戲清單與使用說明」的情境整理成每個新分類一個，不再每款遊戲各寫一個「從大廳開房」
- OpenSpec 的 MODIFIED 不能刪除或改名情境，所以用 REMOVED＋ADDED 換掉：大廳的 requirement 改名為「遊戲大廳與分類」，各遊戲的「遊戲清單與指令說明」改名為「大廳與指令說明」，內容只有分類不同

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `game-commands`：「遊戲清單與使用說明」→「遊戲大廳與分類」
- 19 款遊戲的 `*/setup`：「遊戲清單與指令說明」→「大廳與指令說明」，大廳分類改成新的 (chameleon、deception、insider、saboteur、criminal、meme、herd、emoji、dixit、wager、kittens、citadels、incan、sushigo、forsale、nimmt、machikoro、splendor、nothanks)

## Impact

- Code：`src/games/types.ts` 的 `Category` 加 `party`、`strategy`；`src/slack.ts` 的 `CATEGORIES`；各遊戲 GameDef 的 `category`
- Tests：`test/slack.test.ts` 的大廳測試、各遊戲 GameDef 的 category 斷言、characterization snapshot
- Docs：README (如果有提到分類)、wiki 各遊戲首頁的「分類」
