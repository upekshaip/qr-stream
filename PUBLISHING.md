# Publishing @upekshaip/qr-stream — step by step

The package ships in two phases:

- **Phase A — now:** private preview on **GitHub Packages** as
  `@upekshaip/qr-stream`, published from the standalone mirror repo
  [github.com/upekshaip/qr-stream](https://github.com/upekshaip/qr-stream).
  Installing requires a GitHub token, so nothing is publicly visible while
  the research article is unfinished.
- **Phase B — after the article:** public release on **npmjs.com** (keep the
  scoped name public, or rename to unscoped `qr-stream` if it's still free).

The monorepo (`upekshaip/QR`) stays the development home; the app consumes
the package source directly via a tsconfig path alias. The mirror repo exists
for releases: repo page, tags, and the publish workflow.

---

## Phase A — private preview on GitHub Packages

### A0. One-time setup

1. Create the private mirror repo (once):
   ```bash
   gh repo create upekshaip/qr-stream --private
   ```
   (or on github.com → New repository → name `qr-stream` → Private → no README.)
2. Nothing else — publishing inside the mirror uses the workflow's built-in
   `GITHUB_TOKEN`; no npm account, no PAT, no secrets to configure.

### A1. Release flow

From the monorepo root:

```bash
npm test                 # green suite
npm run build            # Next app builds (nothing app-side broke)
git add -A && git commit # the mirror is built from COMMITTED history
npm run sync:pkg         # subtree-split packages/qr-stream → mirror main
```

Then in the mirror repo (github.com/upekshaip/qr-stream):

- **Actions → "Publish to GitHub Packages" → Run workflow**, or tag a
  release:
  ```bash
  git clone https://github.com/upekshaip/qr-stream.git && cd qr-stream
  git tag v0.1.0 && git push --tags
  ```

The workflow installs, and `npm publish` triggers `prepublishOnly`
(build + full test suite) before uploading. Verify: the package appears under
github.com/upekshaip?tab=packages within a minute.

### A2. Installing the private package (any machine/project)

1. Create a **classic** personal access token with the `read:packages` scope
   (github.com → Settings → Developer settings → Tokens).
2. In the consuming project (or `~/.npmrc`):
   ```ini
   @upekshaip:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=YOUR_TOKEN
   ```
3. `npm install @upekshaip/qr-stream`

The runnable [examples/](examples/) need no token — they use a local `file:`
dependency on the repo itself.

### A3. Version bumps (private phase)

1. Bump `version` in `package.json` **and** `src/version.ts`
   (`test/version.test.ts` enforces the sync).
2. Update `CHANGELOG.md`: new version heading with the date.
3. Commit → `npm run sync:pkg` → tag/dispatch in the mirror.

Semver applies even privately: `0.x.y` — patch for fixes, minor for
features; you cannot overwrite an already-published version, ever.

---

## Phase B — public release on npmjs.com (after the article)

1. **Decide the final name.** Check whether the unscoped name is still free:
   ```bash
   npm view qr-stream   # "npm error 404" means it's still free
   ```
   - `@upekshaip/qr-stream` (public, scoped) — zero code changes, can never
     collide; needs `--access public` on first publish.
   - `qr-stream` (unscoped) — shorter; update `name` in `package.json` and
     the import lines in README/docs/examples.
2. **One-time npm setup:** account at npmjs.com/signup, enable 2FA,
   `npm login`, verify with `npm whoami`.
3. **Point publishes at npmjs:** remove the `publishConfig` block from
   `package.json` (it currently pins the GitHub registry).
4. **Pre-flight** (from the monorepo root):
   ```bash
   npm run build:lib
   npm test
   npm pack --dry-run -w packages/qr-stream
   ```
   The pack list must contain **only**: `dist/index.js`, `dist/index.cjs`,
   `dist/index.d.ts`, `dist/index.d.cts`, `README.md`, `CHANGELOG.md`,
   `LICENSE`, `package.json`. No source maps, no tests, no examples. The
   `.d.cts` matters — the `exports` map serves it to CommonJS TypeScript
   consumers.
5. **Version + changelog** as in A3 (a public `1.0.0` is a good moment to
   declare the API stable).
6. **Publish:**
   ```bash
   cd packages/qr-stream
   npm publish --access public
   ```
7. **Afterwards:** sync the mirror and tag the release
   (`npm run sync:pkg`, then tag in the mirror); add the npm badge to the
   README (`[![npm](https://img.shields.io/npm/v/@upekshaip/qr-stream)](https://www.npmjs.com/package/@upekshaip/qr-stream)`);
   cite the exact name/version in the article's artifact section; remove the
   private-preview note from the README install section.

## Fixing mistakes

- **Published something broken?** Publish a patch version — existing
  versions can never be overwritten (both registries).
- **Remove a GitHub Packages version:** package page → settings → manage
  versions (private packages can delete versions freely).
- **Remove from npmjs:** `npm unpublish` only works within 72 h and is
  discouraged; prefer `npm deprecate <name>@<version> "message"`.
