# ProxyOrbit

**HTTP/HTTPS proxy inspector for developers.** Run a local intercepting proxy, watch every request in real time, inspect headers and bodies, and replay requests — without Wireshark, without Charles, without a subscription.

Part of the [SlothLabs](https://slothlabs.org) family — native Rust, free forever.

---

## What it does

ProxyOrbit starts a local HTTP/HTTPS proxy on a port you choose (default 8080) and automatically configures your system's network settings to route traffic through it. Every request is captured and displayed in a live feed with method, status, URL, timing, and full request/response detail.

Close the app and your system proxy settings are restored automatically.

---

## Features

| Feature | Status |
|---|---|
| HTTP/HTTPS intercepting proxy (tokio + hyper) | ✅ |
| Real-time request log with live feed | ✅ |
| Request detail — method, status, headers, body, timing | ✅ |
| System proxy auto-configure (`networksetup` on macOS) | ✅ |
| System proxy auto-restore on exit | ✅ |
| Filter / search by URL, method, or status | ✅ |
| Start / stop proxy from the UI | ✅ |
| Request count + proxy status badge | ✅ |
| Mock mode for browser preview (`?mock=1`) | ✅ |
| Windows & Linux support | 🚧 Coming soon |

---

## Installation

### Download

Grab the latest `.dmg` from the [Releases](https://github.com/slothlabsorg/proxyorbit/releases) page.

### macOS (Homebrew) — coming soon

```bash
brew install slothlabs/tap/proxyorbit
```

> **Note:** ProxyOrbit is currently macOS only. Windows and Linux support is coming soon.

---

## Usage

1. Launch ProxyOrbit
2. Click **Start proxy** — the status badge turns green and your system proxy is set
3. Open any browser or app and make requests as normal
4. Watch the live request log — click any row for full detail
5. Click **Stop proxy** to stop capturing and restore your system settings

---

## Development

Requirements: Node 18+, Rust stable, Tauri v2 CLI.

```bash
npm install
npm run tauri dev
```

Browser dev mode (mock data, no Tauri binary):

```bash
npm run dev
# Open http://localhost:1423/?mock=1
```

---

## Testing

```bash
# Unit tests (Vitest)
npm test

# Playwright screenshot suite
npm run screenshots
```

Rust unit tests:

```bash
cd src-tauri
cargo test
```

---

## Contributing

1. Fork the repo and create a branch: `git checkout -b my-feature`
2. Make your changes and run the test suites above
3. Open a pull request — all PRs require review before merging to `main`
4. Direct pushes to `main` are disabled

For significant changes, open an issue first to discuss the approach.

---

## Roadmap

### v0.2
- HTTPS MITM with certificate trust flow
- Request replay
- Request/response body search and highlight
- Export captured traffic (HAR format)
- Filter by host / path regex

### v0.3
- Windows and Linux support
- Conditional breakpoints (pause and edit a request before it continues)
- Mock responses — intercept a URL and return custom JSON

---

## Support the project

ProxyOrbit is free and built on nights and weekends. If it saves you time, consider supporting continued development:

- [Ko-fi](https://ko-fi.com/slothlabs)
- [GitHub Sponsors](https://github.com/sponsors/slothlabsorg)
- [Polar.sh](https://polar.sh/slothlabs)

---

## License

MIT © SlothLabs
