## Why
從眾心理、炸彈貓、犯人在跳舞、猜猜看四款新遊戲各自有 change，但大廳分類和戰績規則表是共用的 requirement；MODIFIED 會整段取代，各寫一份依序歸檔會互相覆蓋，所以統一寫在這裡，最後歸檔。

## What Changes
- 大廳 🔍 推理加上犯人在跳舞；🎲 心理戰加上從眾心理、炸彈貓、猜猜看
- 戰績的獲勝規則表加上四款遊戲

## Capabilities
### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」
- `player-stats`：「記錄各遊戲結果」

## Impact
- 只有 spec；程式在四款遊戲各自的 change 實作。必須在四款遊戲的 change 之後歸檔。
