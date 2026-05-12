# Changelog

## v1.0.0 — 2026-05-11

First stable release. Ships a usable alternative to Charles / Proxyman for the common
developer case: run a local proxy, capture requests, replay them.

### Added
- **Request/response body + headers capture** — full headers list, pretty-printed
  JSON body viewer, binary marker, 1 MiB per-body cap (configurable).
- **HTTPS MITM inspection** — toggle in Settings generates a local root CA at
  `~/.proxyorbit/ca/` and mints per-host leaf certs on the fly. Install the CA
  once (see README) and HTTPS bodies become visible like HTTP.
- **Copy as cURL** — from the detail panel, one click to clipboard with
  method / URL / headers / body ready to paste.
- **Replay** — edit method, URL, headers, or body on a captured entry and
  re-send without replaying it through the proxy log.
- **Intercept + modify** — toggle on, next request pauses in the proxy and
  surfaces a modal. Edit anything, choose *Forward* or *Drop*, or let it
  time out at 60 s. 444 returned on drop.
- **In-app docs** for corporate/MDM/Zscaler environments — shell aliases
  (`proxyon`/`proxyoff`), editor and CLI tool config snippets, CA install
  commands per OS.
- **Windows + Linux builds** — `.msi`, `.exe`, `.deb`, `.AppImage`. `.deb`
  declares `libwebkit2gtk-4.1-0` runtime deps to avoid the cold-install crash.
- **`Tunnels` filter toggle** — CONNECT tunnel handshakes now hidden by
  default (TLS setup noise, not real requests); toggle on to see them.
- **Auto-updater** via `tauri-plugin-updater` — background check, banner in
  UI, user-triggered install.

### Changed
- macOS auto-configure system proxy now prompts once via `osascript "with
  administrator privileges"` for `networksetup` (required on Sonoma+), and
  sets user-level `HTTPS_PROXY` / `SSL_CERT_FILE` / `NODE_EXTRA_CA_CERTS` /
  `REQUESTS_CA_BUNDLE` / `CURL_CA_BUNDLE` via `launchctl setenv` so new
  terminals and IDEs pick them up automatically.
- Disables PAC auto-discovery when enabling the proxy — corporate DHCP
  servers sometimes hand out PAC URLs that silently override manual config.
- Detail panel reorganised into tabs: Overview / Headers / Body / Replay.
- Request row grid widened so CONNECT method badge no longer overlaps the
  HTTPS protocol badge.

### Fixed
- Duplicate rows on dev restart (React StrictMode double-subscribed to the
  Tauri event channel) — dedup-by-id guard.
- `running: true` was set before the TCP bind actually succeeded; synchronous
  bind now precedes the running flag so the UI reflects real listen state.
- macOS titlebar dragging (the traffic lights area) via
  `getCurrentWindow().startDragging()` on a mousedown in the custom bar.
- Unsigned macOS bundles no longer fail the workflow when `APPLE_*` secrets
  are empty — signing removed for v1.0 so the release workflow is unblocked.
- `.deb` runtime dep list added — previously crashed on clean Ubuntu with
  "libwebkit2gtk-4.1.so.0: cannot open shared object file".
- Workflow `apt install` now includes `xdg-utils` for AppImage build.

### Deferred to v1.1
- **WebSocket frame inspection** — hyper upgrade-to-WS handling + WS frame
  relay + UI with a stream-of-frames viewer. Deferred to keep v1.0 shippable.
- **Windows / Linux GUI auto-configure** — `netsh winhttp set proxy` +
  per-browser proxy files (GNOME/KDE) need a platform abstraction.
- **HAR export**.

### Known limitations
- Body capture collects the full body before forwarding (with a 1 MiB cap).
  For multi-gigabyte downloads through the proxy, only the first 1 MiB is
  delivered to the client. Acceptable for a dev tool; documented.
- Corporate MDM tooling (Zscaler, Jamf) can silently block `networksetup`
  state changes — the `proxyon`/`proxyoff` shell aliases in the docs are the
  supported fallback.
