# ProxyOrbit — Handoff Checklist

Manual items that need to be done by hand on whichever machine picks this up
next. Code work continues normally; the items below cannot be automated by an
agent because they involve Apple keys, secrets, or out-of-band testing.

Status as of last push:
- Launch date: **TBD later in 2026** (hold until after the June 5 + June 15
  releases are stable in the wild)
- Site countdown: see slothlabs.org `/next/proxyorbit/` permalink (TBD copy)

---

## 1. Apple Developer — must be done by hand

ProxyOrbit needs the same signing setup as the rest of the Orbit suite, plus
two extra wrinkles because it installs a system-wide proxy and (eventually)
a CA cert for HTTPS interception.

### One-time Apple setup
- [ ] developer.apple.com → Certificates → create a **Developer ID Application**
      certificate. Download the `.cer`, double-click to install in Keychain.
- [ ] Keychain Access → My Certificates → expand the Developer ID certificate →
      right-click the private key → Export → `.p12` with a strong password.
      **Save the password** — it becomes `APPLE_CERTIFICATE_PASSWORD`.
- [ ] Base64 the .p12: `base64 -i Certificates.p12 -o Certificates.b64.txt`
- [ ] appleid.apple.com → Sign-in and Security → **App-Specific Passwords** →
      generate one (label it "proxyorbit-notarize"). This is `APPLE_PASSWORD`.
- [ ] developer.apple.com → Membership → record the **Team ID** (10-char
      string). This is `APPLE_TEAM_ID`.
- [ ] Confirm the **signing identity** string with
      `security find-identity -v -p codesigning`. This is
      `APPLE_SIGNING_IDENTITY`.

### GitHub repo secrets to add (Settings → Secrets and variables → Actions)
- [ ] `APPLE_CERTIFICATE` — contents of `Certificates.b64.txt`
- [ ] `APPLE_CERTIFICATE_PASSWORD` — the .p12 export password
- [ ] `APPLE_SIGNING_IDENTITY` — the `Developer ID Application: …` string
- [ ] `APPLE_ID` — your Apple ID email
- [ ] `APPLE_PASSWORD` — the app-specific password
- [ ] `APPLE_TEAM_ID` — 10-char team id
- [ ] `RELEASE_TOKEN` — fine-grained PAT, Contents:Write on this repo only

### Tauri updater key (separate from Apple)
- [ ] `npx tauri signer generate -w ~/.tauri/proxyorbit.key` (set a password)
- [ ] Copy the printed **public** key into `src-tauri/tauri.conf.json` →
      `plugins.updater.pubkey` (replace any placeholder)
- [ ] `TAURI_PRIVATE_KEY` secret = contents of `~/.tauri/proxyorbit.key`
- [ ] `TAURI_KEY_PASSWORD` secret = the password you set

### Release flow source-of-truth
- `.github/workflows/release.yml` has APPLE_* envs commented out near the
  build step. Uncomment once the secrets exist.
- `tauri.conf.json` → `bundle.macOS.signingIdentity` flips to the prod string
  once the cert is on the runner.

### First end-to-end notarized release
- [ ] Tag `v0.1.0` and push.
- [ ] Watch the Actions run — should produce a signed + notarized DMG.
- [ ] Pull the DMG to a clean Mac, confirm Gatekeeper accepts it.
- [ ] Confirm `latest.json` is committed back to main and serves over 200.

---

## 2. News feature — manual test plan

Same pattern as the rest of the suite (NewsBell + News screen + UpdaterModal).

- [ ] `npm run tauri dev` opens cleanly (no Rust panics)
- [ ] Sidebar **News** entry loads articles, markdown renders, refresh works
- [ ] NewsBell red unread dot appears for unseen items; dropdown opens
- [ ] Items show right tone from `badgeTone` in the JSON feed
- [ ] Item click opens detail or external link
- [ ] Unread dot clears after open and persists across restarts
- [ ] Feed URL: `https://slothlabs.org/news/feed.json` with `proxyorbit` filter
- [ ] Network failure: kill internet, refresh → graceful error state

---

## 3. Updater feature — manual test plan

- [ ] Cold start with current version: no banner, no modal, no dot
- [ ] Cold start with `latest.json` forced higher: UpdaterModal opens
- [ ] Modal shows markdown changelog + "Install & Restart" + Dismiss
- [ ] Dismiss → modal closes, NewsBell shows "Update available" item
- [ ] Install & Restart → progress bar to 100% → relaunches with new version
- [ ] Bad signature in `latest.json` → updater refuses with a clear error

---

## 4. Other ProxyOrbit-specific items

- [ ] **Real proxy capture**: start the proxy, set as system proxy via the
      one-click button, confirm `networksetup -getwebproxy "Wi-Fi"` shows
      `127.0.0.1` on the configured port. Hit a few HTTP endpoints from
      Safari/curl, confirm requests appear in the live log.
- [ ] **Stop button restores network state**: click stop, confirm system
      proxy reverts to off (no orphaned `networksetup` config).
- [ ] **HTTPS interception**: when the CA cert install flow is wired up,
      confirm the cert lands in the System keychain with explicit user
      consent (NEVER silent install) and HTTPS request bodies decrypt in
      the inspector.
- [ ] **Replay request**: pick a captured request, click Replay, confirm a
      new identical request fires and shows in the log.
- [ ] **Intercept rule**: create a rule that pauses on a path match, hit
      that path, confirm the request pauses and the editor opens. Edit
      headers, resume, confirm the modified request hits the server.
- [ ] **Filter / search**: with a busy log (100+ requests), confirm domain
      filter and method filter narrow the list cleanly without dropping
      live entries that match.
- [ ] **Memory at idle**: leave the app running idle for an hour, confirm
      RSS stays under 30 MB (the headline pitch — guard against regressions).
- [ ] **Non-admin path**: run on a fresh user account without sudo, confirm
      proxy start works (port > 1024) without prompting for admin.
- [ ] First-launch empty state shows the "Start proxy" CTA cleanly.

---

## 5. Pre-flight before tagging v0.1.0

- [ ] `cargo test` from `src-tauri/` is green (tokio + hyper 0.14 paths)
- [ ] `npm run build` (frontend) succeeds with no TS errors
- [ ] `npm run tauri build` produces a working `.app` and `.dmg` locally
- [ ] All Apple secrets confirmed in GitHub
- [ ] `update-manifest.yml` dry-run test (push a pre-release tag first)
- [ ] News feed shows a launch announcement at the top of the bell
- [ ] System proxy auto-revert works on app crash (test with `kill -9`)

When everything above is green, tag `v0.1.0` and let the CI ship it.
