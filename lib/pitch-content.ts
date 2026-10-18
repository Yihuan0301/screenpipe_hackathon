/**
 * Pitch narrative for FounderHUD bookend slides.
 * Speakable English — matches the hub UI language.
 */

export type PitchPlatform = {
  name: string;
  role: string;
  /** Host for favicon / address bar */
  domain: string;
  /** Shown in browser address bar */
  url: string;
  /** Optional direct logo when Google favicon fails (e.g. CN sites) */
  logoUrl?: string;
  /** What Screenpipe / patrol pulls from this screen — pitch keywords */
  extract: string[];
  /** Short lines shown in the click-preview mock page */
  previewLines: string[];
};

/** The scattered post-launch stack indie founders babysit by hand. */
export const PITCH_PLATFORMS: PitchPlatform[] = [
  {
    name: "App Store Connect",
    role: "Revenue · ratings",
    domain: "appstoreconnect.apple.com",
    url: "appstoreconnect.apple.com/apps",
    extract: ["Proceeds", "Units", "Ratings", "Reviews", "Conversion"],
    previewLines: [
      "Sales and Trends · Last 7 days",
      "Proceeds  €1,284.50",
      "Units     312  ·  Rating  4.6★",
    ],
  },
  {
    name: "Rednote",
    role: "Community voice",
    domain: "xiaohongshu.com",
    url: "www.xiaohongshu.com/explore",
    // Google s2 returns a generic globe for this host; DuckDuckGo has the real mark
    logoUrl: "https://icons.duckduckgo.com/ip3/xiaohongshu.com.ico",
    extract: ["Comments", "Sentiment", "Mentions", "Pain points"],
    previewLines: [
      "Note comments · live feed",
      "“Sync keeps failing on Wi-Fi…”",
      "“Love the dark mode — finally”",
    ],
  },
  {
    name: "Gmail",
    role: "Bills · receipts",
    domain: "mail.google.com",
    url: "mail.google.com/mail/u/0/#inbox",
    extract: ["Invoices", "Amount", "Vendor", "Due date"],
    previewLines: [
      "Inbox · Receipts & billing",
      "Fly.io  ·  Invoice  ·  $42.18",
      "Netlify ·  Receipt  ·  €19.00",
    ],
  },
  {
    name: "Cloudflare",
    role: "DNS · edge",
    domain: "cloudflare.com",
    url: "dash.cloudflare.com",
    extract: ["Traffic", "Errors", "Latency", "DNS"],
    previewLines: [
      "Analytics · Edge overview",
      "Requests  2.4M  ·  4xx  0.8%",
      "DNS healthy · WAF quiet",
    ],
  },
  {
    name: "Netlify",
    role: "Hosting · usage",
    domain: "netlify.com",
    url: "app.netlify.com/teams",
    extract: ["Bandwidth", "Builds", "Deploys", "Quota"],
    previewLines: [
      "Team usage · This month",
      "Bandwidth  48 GB / 100 GB",
      "Build mins  112  ·  Deploys  27",
    ],
  },
  {
    name: "Fly.io",
    role: "Compute",
    domain: "fly.io",
    url: "fly.io/dashboard",
    extract: ["Machines", "Regions", "CPU", "Spend"],
    previewLines: [
      "Machines · Production",
      "ams · fra · sjc  ·  3 running",
      "CPU avg  18%  ·  Billable hrs",
    ],
  },
  {
    name: "Supabase",
    role: "DB · auth",
    domain: "supabase.com",
    url: "supabase.com/dashboard",
    extract: ["DB size", "Auth users", "API calls", "Storage"],
    previewLines: [
      "Project · Database",
      "DB  1.2 GB  ·  Auth  4,812",
      "API  890k req  ·  Storage OK",
    ],
  },
  {
    name: "DeepSeek",
    role: "LLM spend",
    domain: "deepseek.com",
    url: "platform.deepseek.com",
    extract: ["Tokens", "Spend", "Model", "RPM"],
    previewLines: [
      "Usage · API billing",
      "Tokens  12.4M  ·  Cost  $18.20",
      "Model  deepseek-chat  ·  RPM",
    ],
  },
  {
    name: "Tencent Cloud",
    role: "CN infra",
    domain: "cloud.tencent.com",
    url: "console.cloud.tencent.com",
    extract: ["CDN", "CN latency", "Billing", "Bandwidth"],
    previewLines: [
      "Console · China edge",
      "CDN hit  94%  ·  Latency  38ms",
      "Monthly bill  ¥286.00",
    ],
  },
];

/** Real site favicon — prefers optional override, else Google s2. */
export function platformLogoUrl(
  platform: PitchPlatform | string,
  size = 128
): string {
  if (typeof platform !== "string" && platform.logoUrl) {
    return platform.logoUrl;
  }
  const domain = typeof platform === "string" ? platform : platform.domain;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** The four things every morning tab-hop is really for — pitch slam */
export const PITCH_SIGNALS = [
  {
    key: "revenue",
    label: "Revenue",
    hint: "Store proceeds · units",
  },
  {
    key: "costs",
    label: "Costs",
    hint: "Invoices · AI spend",
  },
  {
    key: "monitor",
    label: "Monitor",
    hint: "Quotas · uptime · before they blow up",
  },
  {
    key: "feedback",
    label: "Feedback",
    hint: "Store reviews · social comments",
  },
] as const;

export const PITCH_OPEN = {
  brand: "FounderHUD",
  eyebrow: "After you ship",
  headline: "Your product is live.\nYour day is still a pile of tabs.",
  support:
    "Revenue in one place. Bills in another. Reviews somewhere else. Then 10 more logins. Every morning starts with copy-paste.",
  pains: [
    "Jumping between apps burns your best hours",
    "Numbers go stale as soon as you leave the tab",
    "Problems stay hidden until something breaks",
  ],
  bridge: "What if the screen itself fed the HUD?",
  bridgeSub: "Click a tab — or hit the four signals — then scroll into the cockpit.",
  scrollHint: "Scroll to enter the HUD",
  signalsCta: "All that… for four things",
  signalsTitle: "What I’m really checking",
  signalsSub: "Nine tabs. Four signals. One HUD.",
};

export const PITCH_CLOSE = {
  brand: "FounderHUD",
  eyebrow: "The payoff",
  headline: "One click.\nThe product workflow runs itself.",
  support:
    "Those sites stay. They just stop eating your morning. Screenpipe reads the screens. Patrol keeps the HUD up to date.",
  bridgeLabel: "Auto workflow",
  before: {
    title: "Before",
    body: "Open ASC · dig Gmail · skim Rednote · check CF / Netlify / Fly / Supabase / DeepSeek — then maybe decide.",
    caption: "By hand · one by one · outdated",
  },
  now: {
    title: "Now",
    body: "Collection runs in the background. Revenue, costs, monitor, and feedback are already in the HUD.",
    caption: "Screenpipe · patrol · live",
  },
  /** Final slam — core stack */
  finale: {
    kicker: "Core tech",
    line: "screenpipe + Playwright.",
    /** One sentence per line — avoids ugly mid-phrase wraps */
    subLines: [
      "See the screen.",
      "Run the workflow.",
      "Get what matters.",
    ],
    /** Three punchy strengths under the slam */
    strengths: ["Innovative", "Fast", "Automatic"],
  },
  tagline: "Screen is the universal API.",
};
