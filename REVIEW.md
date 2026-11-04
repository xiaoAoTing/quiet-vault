# Implementation review — 2026-11-04

## Scope

New independent project under `/Users/mccullough/repo/quiet-vault`. Parent directory is not a Git repository; no parent filesystem AGENTS.md was found. Existing sibling projects were left unchanged. A new local main branch was initialized. No remote was configured, so no push or remote repository creation was attempted.

## Review and fixes

An independent, read-only code-review agent reviewed encryption, persistence, import/export, locking and mobile UI. Findings addressed:

- Cancel pending unlock/create operations when the page becomes hidden; check visibility again before establishing a plaintext session.
- Serialize version comparison and localStorage writes with Web Locks, rejecting unsupported browsers instead of silently falling back to unsafe writes.
- Use identical compact serialization for size checks and exported backups.
- Provide category search in the management dialog on mobile.
- Associate the password label explicitly with its input, keeping reveal/copy buttons outside the label.
- Explain that background locking discards unsaved forms.

## Verification evidence and limitations

- Actual source files were successfully created in the requested workspace.
- Application source (`main.tsx`, `vault.ts`, `icons.tsx`) passed TypeScript 5.9.3 strict static checking using an existing sibling project's compiler, cached React types, and a temporary declaration of the documented hash-wasm Argon2id API. This is a limited source check, **not** verification against the installed hash-wasm package.
- `npm install` could not reach npm: terminal networking is disabled and registry DNS resolution fails. Offline installation also failed because hash-wasm, Playwright Test and some registry metadata are not cached. No runtime crypto dependency was substituted or mocked in the application.
- `npm run build`, `npm test`, and `npm run test:e2e` were attempted and could not execute because `tsc`, `vitest`, and `playwright` are not installed in this project. There is no verified production build, browser smoke test or passing encryption test result.
- Crypto unit tests and desktop/mobile Playwright tests are included, but remain unexecuted. No package-lock could be generated from a successful resolution. Run the README commands in a network-enabled environment before trusting this MVP with real credentials.

This is source implementation plus limited static review, not an independently audited password manager or a verified runnable delivery.


## UI refresh — 2026-11-04

The UI now uses a centered, single-column archive layout, charcoal surfaces, mint accents, local monospace fonts, simple category navigation and compact password rows with update dates. It takes structural inspiration from https://www.ceee.vip/; the reference page's text was accessible, but its screenshot and stylesheet were unavailable, so the colors are an interpretation rather than a verified reproduction. No crypto or storage code was changed.

A separate read-only UI review identified a long-category-name overflow risk. Added wrapping/minimum-width rules for titles and breadcrumbs, protected action widths and constrained desktop navigation items. Mobile category navigation scrolls horizontally; category search remains available in the management dialog. Touch controls retain 44px heights, visible focus and reduced-motion support.

Current verification supersedes the initial dependency-related limitations above:

- Dependencies are now available locally. `npm run build` passes, including the real TypeScript project check and production bundling.
- `npm test` passes: all 4 real Argon2id/AES-GCM tests.
- `npm run test:e2e` cannot start the Vite test server: sandbox denies listening on `127.0.0.1:4173` (`EPERM`).
- A separate attempt to load the production build through Playwright request routing also failed at Chromium startup due to a macOS MachPort permission denial. No browser screenshot or responsive visual acceptance is claimed.
- The pre-existing untracked `pnpm-lock.yaml` was preserved and is outside this UI commit.

## Master password policy and open-source release — 2026-11-04

Creating a vault now requires a master password of at least 12 characters containing uppercase letters, lowercase letters and digits. Unlocking existing vaults and importing backups are unaffected, so vaults created under the previous rules remain usable. Unit tests and Playwright e2e coverage were added for the policy.

Final verification:

- `npm run build`: passes (TypeScript project check and production bundling).
- `npm test`: 2 files, 7/7 tests pass.
- `npm run test:e2e`: 8/8 pass across desktop and mobile, including the master password policy test.
- The earlier Vite server EPERM and Chromium MachPort limitations did not recur in this local run.

