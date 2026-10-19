## Why
印加寶藏、妙語說書人、富饒之城、Emoji 傳話、星際探險隊五款新遊戲各自有 change，但大廳分類和戰績規則表是共用的 requirement；MODIFIED 會整段取代，各寫一份依序歸檔會互相覆蓋，所以統一寫在這裡，最後歸檔。

## What Changes
- 大廳 🤝 合作加上星際探險隊；🎲 心理戰加上印加寶藏、妙語說書人、富饒之城、Emoji 傳話
- 戰績的獲勝規則表加上五款遊戲

## Capabilities
### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」
- `player-stats`：「記錄各遊戲結果」

## Impact
- 只有 spec；程式在五款遊戲各自的 change 實作。必須在五款遊戲的 change 之後歸檔。
