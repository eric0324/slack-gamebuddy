## Why
描述者會用「x」代替關鍵字來鑽漏洞，例如「失x」「老x」，讓隊友一看就猜到，又不會被判說到禁語。

## What Changes
- 描述階段，描述者的訊息含有替代字就算犯規，和說到禁語一樣：對手隊 +1，換下一張。
- 替代字：英文字母 x (不分大小寫、全形半形) 和乘號 ×、✕、✖，以及常見的佔位符號 ○、〇、●、*、＊。
- 公告寫明是用了替代字，例如「🚨 A 犯規！用了「x」代替文字，題目是「老虎」。」
- 隊友猜詞不受影響。

## Capabilities
### Modified Capabilities
- `taboo/rounds`：新增「禁用替代字」requirement；犯規的條件多一項。

## Impact
- `src/taboo.ts` 的 `chat()`、`test/taboo.test.ts`；wiki 禁語規則頁和 `/game taboo help` 說明 (含 characterization snapshot)。
