# AGENTS.md

## 安全底线（不可违反）

- 保险库只在用户主动点击「锁定」时锁定。刷新页面、关闭后重开、闲置计时、切到后台、页面隐藏都不得自动锁定，也不得要求重新输入主密码。
- 跨刷新保持解锁只能依赖不可导出的 CryptoKey（IndexedDB 结构化克隆）恢复会话；严禁以明文、可逆加密、编码或任何其他形式存储主密码，也不得把密钥原始字节写入 localStorage / sessionStorage。
- 手动「锁定」必须同步写入锁定标记并删除持久化的会话密钥，确保锁定后刷新页面仍然需要主密码。

## 工作规则

- 本仓库的所有改动（代码、样式、测试、文档）在完成并通过验证后，必须立即提交并推送到远程 `origin` 的 `main` 分支，无需再次询问用户确认。
- 提交前至少运行 `npm run build`；涉及逻辑或交互的改动同时运行 `npm test` 与 `npm run test:e2e`。
- 提交信息使用 Conventional Commits（`feat:`、`fix:`、`style:`、`test:`、`docs:`、`chore:` 等），用英文书写。
- 不强制推送，不改写已推送的历史。
- 不提交 `node_modules/`、`dist/`、`test-results/`、`playwright-report/`、`*.qvault`、`quiet-vault-*.json`、`.env*`、`server.log`（已在 `.gitignore` 中忽略）。
