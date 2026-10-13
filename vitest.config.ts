import { configDefaults, defineConfig } from 'vitest/config';

// 排除 Claude Code 代理的 git worktree，避免重複跑到其他分支的測試
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '.claude/**'] } });
