# Publishing qr-stream to npm — step by step

A checklist for when the research article is done and you're ready to release. **Nothing here has been done yet** — the package is intentionally `"private": true` so it cannot be published by accident.

## 0. One-time setup

1. Create an npm account at https://www.npmjs.com/signup (free).
2. Enable 2FA on the account (npm requires it for publishing).
3. Log in from your terminal:
   ```bash
   npm login
   ```
   This opens a browser to authenticate. Verify with `npm whoami` → should print your username.

## 1. Decide the final name

The unscoped name **`qr-stream` was still available as of 2026-07-02** (registry returned 404). Check again before publishing:

```bash
npm view qr-stream        # "npm error 404" means it's still free
```

Options:
- **`qr-stream`** (unscoped) — short and memorable; first-come-first-served.
- **`@upekshaip/qr-stream`** (scoped) — can never collide; scoped packages need `--access public` on first publish.

Update the `"name"` field in `packages/qr-stream/package.json` accordingly.

## 2. Pre-flight checks

From the repo root:

```bash
npm run build -w qr-stream      # builds dist/ (esm + cjs + .d.ts)
```

Then inspect exactly what would be uploaded (only `dist/` + `README.md` + `package.json` should appear):

```bash
cd packages/qr-stream
npm publish --dry-run
```

Review the file list and the unpacked size it prints. Nothing sensitive, no source maps you don't want, no stray files.

## 3. Flip the safety switch

In `packages/qr-stream/package.json`, remove the line:

```json
"private": true,
```

(That flag exists solely to block accidental publishing while the article is unfinished.)

## 4. Version

The package starts at `0.1.0`. Versioning follows [semver](https://semver.org/):

- `0.x.y` — pre-1.0, API may still change
- **patch** (`0.1.1`): bug fixes → `npm version patch`
- **minor** (`0.2.0`): new features, backwards compatible → `npm version minor`
- **major** (`1.0.0`): breaking API changes → `npm version major`

`npm version` also creates a git commit + tag for you.

## 5. Publish

```bash
cd packages/qr-stream
npm publish --access public
```

(`--access public` is mandatory for scoped names, harmless for unscoped ones. The `prepublishOnly` script runs the build automatically, so you can never publish a stale `dist/`.)

Verify: the package page appears at `https://www.npmjs.com/package/<name>` within a minute, and `npm install <name>` works in a scratch folder.

## 6. After publishing

- Tag the release on GitHub: `git push --follow-tags`, then draft a Release note.
- Add the npm badge to the README: `[![npm](https://img.shields.io/npm/v/qr-stream)](https://www.npmjs.com/package/qr-stream)`
- Cite the package name/version in the research article's artifact section.

## Fixing mistakes

- **Published something broken?** Publish a patch version. You cannot overwrite an existing version — ever.
- **Need to remove it entirely?** `npm unpublish <name> --force` works only within 72 hours of publish and is discouraged; prefer `npm deprecate <name>@<version> "message"`.
