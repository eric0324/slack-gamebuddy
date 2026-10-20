## Why
地產大亨、骰子街、璀璨寶石、詭影神探四款新遊戲各自有 change，但大廳分類和戰績規則表是共用的 requirement；MODIFIED 會整段取代，各寫一份依序歸檔會互相覆蓋，所以統一寫在這裡，最後歸檔。

## What Changes
- 大廳 🔍 推理加上詭影神探；🎲 心理戰加上地產大亨、骰子街、璀璨寶石
- 戰績的獲勝規則表加上四款遊戲

## Capabilities
### New Capabilities
(無)

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」
- `player-stats`：「記錄各遊戲結果」

## Impact
- 只有 spec；程式在四款遊戲各自的 change 實作。必須在四款遊戲的 change 之後歸檔。
