# Publishing @upekshaip/qr-stream — step by step

The package ships in two phases:

- **Phase A — now:** private preview on **GitHub Packages** as
  `@upekshaip/qr-stream`, published from this repo. Installing requires a
  GitHub token, so nothing is publicly visible while the research article is
  unfinished.
- **Phase B — after the article:** public release on **npmjs.com** (keep the
  scoped name public, or rename to unscoped `qr-stream` if it's still free).

This repo is the package's development home. The web app
([github.com/upekshaip/QR](https://github.com/upekshaip/QR), live at
qr.upekshaip.com) consumes it as an ordinary npm dependency.

---

## Phase A — private preview on GitHub Packages

### A1. Release flow

```bash
npm install     # once per clone
npm run build
npm test        # green suite required — prepublishOnly re-runs it anyway
git add -A && git commit
git tag v0.1.1 && git push --follow-tags
```

The tag push triggers the **"Publish to GitHub Packages"** workflow
(`.github/workflows/publish.yml`), which builds, runs the full test suite via
`prepublishOnly`, and uploads — using the built-in `GITHUB_TOKEN`, so there
are no secrets to configure. (You can also run it manually from the Actions
tab.) Verify: the new version appears under github.com/upekshaip?tab=packages
within a minute.

After a release, update the app:

```bash
cd <qr-app> && npm update @upekshaip/qr-stream
```

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
3. Commit → tag `vX.Y.Z` → push with `--follow-tags` (see A1).

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
4. **Pre-flight**:
   ```bash
   npm run build
   npm test
   npm pack --dry-run
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
   npm publish --access public
   ```
7. **Afterwards:** tag the release (`git tag vX.Y.Z && git push --follow-tags`);
   add the npm badge to the README
   (`[![npm](https://img.shields.io/npm/v/@upekshaip/qr-stream)](https://www.npmjs.com/package/@upekshaip/qr-stream)`);
   cite the exact name/version in the article's artifact section; remove the
   private-preview note from the README install section and drop the
   `@upekshaip:registry` line from the app's `.npmrc`.

## Fixing mistakes

- **Published something broken?** Publish a patch version — existing
  versions can never be overwritten (both registries).
- **Remove a GitHub Packages version:** package page → settings → manage
  versions (private packages can delete versions freely).
- **Remove from npmjs:** `npm unpublish` only works within 72 h and is
  discouraged; prefer `npm deprecate <name>@<version> "message"`.
