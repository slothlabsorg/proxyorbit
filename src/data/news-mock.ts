import type { NewsFeed } from '@/types/news'

// ── Mock / fallback feed ─────────────────────────────────────────────────────
// This data is shown when the remote feed is unreachable (no internet, dev
// mode, Playwright tests). It also acts as the reference for what a real
// feed payload looks like.
//
// Deploy the real feed at: https://slothlabs.org/news/feed.json
// Format must match the NewsFeed interface in src/types/news.ts

export const MOCK_FEED: NewsFeed = {
  version: 1,
  items: [
    {
      id: 'po-v100-release',
      type: 'changelog',
      priority: 10,
      publishedAt: '2026-05-15T00:00:00Z',
      badge: 'UPDATE',
      badgeTone: 'primary',
      title: 'ProxyOrbit v1.0.0',
      body: `## What's new\n\n- **HTTP/HTTPS proxy** — captures all traffic on a configurable local port\n- **MITM inspection** — decrypt and inspect TLS sessions with a built-in CA certificate\n- **Request interception** — pause, edit, and forward or drop any request in real time\n- **Request replay** — resend any captured request with optional edits\n- **System proxy integration** — one-click macOS system proxy configuration\n- **WebSocket support** — captures CONNECT tunnels alongside plain HTTP`,
      collapsed: false,
      action: { label: 'Full changelog', url: 'https://github.com/slothlabs/proxyorbit/blob/main/CHANGELOG.md' },
      targetApps: ['proxyorbit'],
    },
    {
      id: 'po-tip-intercept-replay',
      type: 'tip',
      priority: 7,
      publishedAt: '2026-05-14T00:00:00Z',
      badge: 'TIP',
      badgeTone: 'success',
      title: 'Intercept, edit, and replay requests',
      body: `Enable **Intercept** in the toolbar to pause requests before they reach the server. The intercept modal lets you modify the method, URL, headers, and body — then forward or drop.\n\nTo replay a previously captured request, select it in the capture list and click **Replay**. Replays run outside the proxy stream so they don't pollute your capture log.`,
      targetApps: ['proxyorbit'],
    },
    {
      id: 'po-tip-ssl-certificate',
      type: 'tip',
      priority: 6,
      publishedAt: '2026-05-13T00:00:00Z',
      badge: 'TIP',
      badgeTone: 'warning',
      title: 'Trust the ProxyOrbit CA to inspect HTTPS',
      body: `MITM inspection requires installing the ProxyOrbit CA certificate as a trusted root.\n\n**macOS:** Open **Settings → MITM** and click **Export CA** to save the \`.pem\`, then double-click it and add it to the System keychain with "Always Trust".\n\n**curl / Node.js / Python:** set \`NODE_EXTRA_CA_CERTS\`, \`REQUESTS_CA_BUNDLE\`, or pass \`--cacert\` pointing at the exported PEM.`,
      targetApps: ['proxyorbit'],
    },
    {
      id: 'slothlabs-roadmap-2026',
      type: 'news',
      priority: 5,
      publishedAt: '2026-05-10T00:00:00Z',
      badge: 'NEW',
      badgeTone: 'neutral',
      title: 'SlothLabs 2026 roadmap',
      body: `We're building a suite of developer tools that make local development simpler and safer. ProxyOrbit is the latest — here's what's coming next:\n\n- **ProxyOrbit scripting** — Lua/JS rules engine to automate request rewrites\n- **CloudOrbit Pro** — team vaults, shared sessions, audit logs\n- **Multi-platform** — Windows and Linux support (preview)\n\nWe release fast and often. Star the repo to stay updated.`,
      collapsed: true,
      action: { label: 'Follow SlothLabs', url: 'https://github.com/slothlabs' },
      targetApps: ['all'],
    },
    {
      id: 'po-sponsor-placeholder',
      type: 'ad',
      priority: 3,
      publishedAt: '2026-05-01T00:00:00Z',
      badge: 'SPONSOR',
      badgeTone: 'neutral',
      title: 'Want to reach backend developers?',
      body: `ProxyOrbit is used by developers who debug HTTP traffic, test APIs, and inspect TLS sessions daily. If your tool, service, or course targets backend or mobile engineers, **your ad could appear here**.\n\nSponsored placements are clearly labeled and help fund development.`,
      sponsored: true,
      action: { label: 'Advertise with SlothLabs', url: 'https://slothlabs.org/advertise' },
      targetApps: ['all'],
    },
  ],
}
