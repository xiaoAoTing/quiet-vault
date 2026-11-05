# AGENTS.md

## 工作规则

- 本仓库的所有改动（代码、样式、测试、文档）在完成并通过验证后，必须立即提交并推送到远程 `origin` 的 `main` 分支，无需再次询问用户确认。
- 提交前至少运行 `npm run build`；涉及逻辑或交互的改动同时运行 `npm test` 与 `npm run test:e2e`。
- 提交信息使用 Conventional Commits（`feat:`、`fix:`、`style:`、`test:`、`docs:`、`chore:` 等），用英文书写。
- 不强制推送，不改写已推送的历史。
- 不提交 `node_modules/`、`dist/`、`test-results/`、`playwright-report/`、`*.qvault`、`quiet-vault-*.json`、`.env*`、`server.log`（已在 `.gitignore` 中忽略）。
