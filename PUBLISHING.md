# Publishing @upekshaip/qr-stream — step by step

The package is **public on npmjs.com** and published to **GitHub Packages** in
parallel from the same tag. npmjs is the canonical home; the GitHub Packages
copy exists for consumers already resolving the `@upekshaip` scope there.

This repo is the package's development home. The web app
([github.com/upekshaip/QR](https://github.com/upekshaip/QR), live at
qr.upekshaip.com) consumes it as an ordinary npm dependency.

> **History.** 0.1.0 (11 Jul 2026) and 0.1.1 shipped as a private preview on
> GitHub Packages while the research article was unfinished; 0.1.2
> (1 Sep 2026) opened the package to npmjs. npmjs therefore starts at 0.1.2
> while GitHub Packages also holds the two preview versions — expected, not
> a failed publish.

---

## Release flow

```bash
npm install          # once per clone
npm run build
npm test             # 82 tests; prepublishOnly re-runs build + tests anyway
npm pack --dry-run   # must list exactly 8 files (see the pre-flight below)

git add -A && git commit -m "release 0.1.3"
git tag v0.1.3 && git push --follow-tags
```

The tag push runs the **Publish** workflow
(`.github/workflows/publish.yml`), which has one job per registry:

| Job | Registry | Auth |
|---|---|---|
| `npmjs.com` | registry.npmjs.org | `NPM_TOKEN` repo secret (automation token) |
| `GitHub Packages` | npm.pkg.github.com | built-in `GITHUB_TOKEN`, nothing to configure |

Both run on Node 22 with actions v5 (`engines` stays `>=20`).

**If the `NPM_TOKEN` secret is not set**, the npmjs job skips its publish step
and prints a note instead of failing — so the run stays green and GitHub
Packages still gets the release. Create the token at npmjs.com → *Access
Tokens* → *Granular* or *Automation* (automation tokens bypass the 2FA prompt,
which is what CI needs), then add it under repo *Settings → Secrets and
variables → Actions* as `NPM_TOKEN`.

### Publishing by hand

Needed only when CI cannot do it — the 0.1.2 release was published this way.

```bash
npm login            # interactive, approves 2FA
npm whoami           # confirm
npm publish --access public
```

`publishConfig.access` is `"public"`, so a scoped publish goes out publicly;
`--access public` is redundant but harmless. There is **no**
`publishConfig.registry`: the default registry is npmjs, and the GitHub
Packages job passes `--registry` explicitly.

### Version bumps

1. Bump `version` in `package.json` **and** `src/version.ts`
   (`test/version.test.ts` enforces the sync — the build fails if they drift).
2. Add a `CHANGELOG.md` heading for the new version with its date.
3. Commit → tag `vX.Y.Z` → push with `--follow-tags`.

The project is still on **`0.x`**, so the exported surface (`protocol`,
`qrGen`, `qrDetect`, `TxEngine`, `Reassembler`, `crypto`, `estimate`,
`simulate`) is **not** frozen: patch (`0.1.3`) for fixes, minor (`0.2.0`)
for new features **and for breaking changes**, which semver permits below
1.0.0. Cut 1.0.0 when the surface is settled enough to promise that
breaking it requires a major bump. A published version can never be
overwritten on either registry.

### Pre-flight

`npm pack --dry-run` must list **only** these 8 entries:

```
dist/index.js      dist/index.cjs
dist/index.d.ts    dist/index.d.cts
README.md          CHANGELOG.md
LICENSE            package.json
```

No source maps, no tests, no examples. The `.d.cts` matters — the `exports`
map serves it to CommonJS TypeScript consumers.

Also confirm the import-safety contract, which the library guarantees and CI
checks: `node -e "require('./dist/index.cjs')"` must not throw. The core
touches browser APIs only inside functions, never at module import time.

---

## Installing

```bash
npm install @upekshaip/qr-stream
```

No `.npmrc`, no token. To resolve the scope from GitHub Packages instead, map
it and authenticate with a `read:packages` token:

```ini
@upekshaip:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

The runnable [examples/](examples/) need neither — they use a local `file:`
dependency on the repo itself.

---

## Fixing mistakes

- **Published something broken?** Publish a patch version — existing versions
  can never be overwritten on either registry.
- **Remove a GitHub Packages version:** package page → settings → manage
  versions.
- **Remove from npmjs:** `npm unpublish` works only within 72 h of publishing
  and is discouraged; prefer `npm deprecate <name>@<version> "message"`.
  Unpublishing does not free the version number for reuse.
