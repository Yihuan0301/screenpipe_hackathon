/**
 * Parse infra monitor signals from patrol page text
 * (CF / Supabase / DeepSeek / Netlify / Fly.io / Tencent Cloud).
 */

export type PlatformHealth = "ok" | "warn" | "down" | "unknown";

export type StatusMetric = {
  label: string;
  value: string;
  hint?: string;
};

export type PlatformId =
  | "cloudflare"
  | "supabase"
  | "deepseek"
  | "netlify"
  | "fly"
  | "tencent";

export type PlatformCard = {
  id: PlatformId;
  name: string;
  health: PlatformHealth;
  headline: string;
  plan?: string;
  metrics: StatusMetric[];
  capturedAt?: string;
  url?: string;
};

export type StatusViz = {
  kind: "status-platforms";
  overall: PlatformHealth;
  overallLabel: string;
  platforms: PlatformCard[];
  scannedAt?: string;
};

type Item = { text?: string; app?: string; ts?: string; url?: string };

const FLEET_ORDER: PlatformId[] = [
  "cloudflare",
  "netlify",
  "fly",
  "supabase",
  "deepseek",
  "tencent",
];

/** True when the snapshot URL is an infra console (not Gmail search mentioning vendors). */
export function isInfraMonitorItem(item: Item): boolean {
  const url = item.url || "";
  return /app\.netlify\.com|(?:^|\/\/)(?:www\.)?fly\.io\/|cloud\.tencent\.com|qcloud\.com|dash\.cloudflare\.com|supabase\.com\/dashboard|platform\.deepseek\.com/i.test(
    url
  );
}

function detectPlatform(item: Item): PlatformId | null {
  const url = item.url || "";
  // Prefer host — Gmail bill search strings also contain vendor names
  if (/dash\.cloudflare\.com/i.test(url)) return "cloudflare";
  if (/supabase\.com\/dashboard/i.test(url)) return "supabase";
  if (/platform\.deepseek\.com/i.test(url)) return "deepseek";
  if (/app\.netlify\.com/i.test(url)) return "netlify";
  if (/(?:^|\/\/)(?:www\.)?fly\.io\//i.test(url)) return "fly";
  if (/cloud\.tencent\.com|qcloud\.com/i.test(url)) return "tencent";

  const blob = `${item.app || ""} ${item.text?.slice(0, 500) || ""}`;
  if (/mail\.google|gmail/i.test(url)) return null;
  if (/cloudflare/i.test(blob) && /Active|Domains/i.test(blob)) return "cloudflare";
  if (/supabase/i.test(blob) && /MAU|Egress/i.test(blob)) return "supabase";
  if (/deepseek/i.test(blob) && /Topped-up|API requests/i.test(blob))
    return "deepseek";
  if (/netlify/i.test(blob) && /credits|Usage & billing/i.test(blob))
    return "netlify";
  if (/fly\.io/i.test(blob) && /Good Standing|Machines/i.test(blob)) return "fly";
  if (/腾讯云|tencent cloud/i.test(blob)) return "tencent";
  return null;
}

function parseCloudflare(item: Item): PlatformCard {
  const text = item.text || "";
  const domain =
    text.match(/\n([a-z0-9.-]+\.[a-z]{2,})\nActive\n/i)?.[1] ||
    text.match(/(chunkflowapp\.com)/i)?.[1] ||
    "—";
  const active = /\nActive\n/i.test(text) || /Active\n\d+\s*insights/i.test(text);
  const insights = text.match(/Active\n(\d+)\s*insights/i)?.[1];
  const visitors = text.match(/insights\n(\d+)\n/i)?.[1];
  const plan = /\nFree\nShowing/i.test(text) ? "Free" : undefined;

  return {
    id: "cloudflare",
    name: "Cloudflare",
    health: active ? "ok" : "warn",
    headline: active ? `${domain} · Active` : `${domain} · Check status`,
    plan,
    metrics: [
      { label: "Domain", value: domain },
      { label: "Status", value: active ? "Active" : "Unknown" },
      {
        label: "Security insights",
        value: insights || "—",
      },
      { label: "Unique visitors", value: visitors || "—" },
      { label: "Plan", value: plan || "—" },
    ],
    capturedAt: item.ts,
    url: item.url,
  };
}

function parseSupabase(item: Item): PlatformCard {
  const text = item.text || "";
  const project =
    text.match(/Current billing cycle\n([^\n]+)/i)?.[1]?.trim() ||
    text.match(/\n(ChunkFlow[^\n]*)\nOrganization/i)?.[1] ||
    "—";
  const period =
    text.match(
      /(\d{1,2} [A-Za-z]{3} \d{4}\s*-\s*\d{1,2} [A-Za-z]{3} \d{4})/
    )?.[1] || undefined;
  const plan = /Free Plan/i.test(text) ? "Free" : undefined;
  const mau = text.match(/Monthly Active Users\n([0-9,]+)\s*MAU/i)?.[1];
  const egress = text.match(/\nEgress\n([0-9.]+ GB)/i)?.[1];
  const dbSize =
    text.match(/Max database size\n([0-9.]+ MB)/i)?.[1] ||
    text.match(/Database Size\n([0-9.]+ GB)/i)?.[1];
  const storage = text.match(/\nStorage Size\n([0-9.]+ GB)/i)?.[1];
  const edge = text.match(/Edge Function Invocations\n([0-9,]+)/i)?.[1];

  return {
    id: "supabase",
    name: "Supabase",
    health: "ok",
    headline: `${project} · ${mau || "—"} MAU`,
    plan,
    metrics: [
      { label: "Project", value: project },
      { label: "Cycle", value: period || "—" },
      { label: "MAU", value: mau ? `${mau}` : "—" },
      { label: "DB size", value: dbSize || "—" },
      { label: "Egress", value: egress || "—" },
      { label: "Storage", value: storage || "—" },
      { label: "Edge fns", value: edge || "—" },
      { label: "Plan", value: plan || "—" },
    ],
    capturedAt: item.ts,
    url: item.url,
  };
}

const CNY_EUR = 0.127;
const USD_EUR = 0.92;

function cnyStrToEur(cny?: string): string {
  if (!cny) return "—";
  const n = parseFloat(String(cny).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return "—";
  return `€${(n * CNY_EUR).toFixed(2)}`;
}

function usdStrToEur(usd?: string): string {
  if (!usd) return "—";
  const n = parseFloat(String(usd).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return "—";
  return `€${(n * USD_EUR).toFixed(2)}`;
}

function parseDeepseek(item: Item): PlatformCard {
  const text = item.text || "";
  const toppedCny = text.match(
    /Topped-up balance[\s\S]*?¥([0-9.]+)\s*CNY/i
  )?.[1];
  const totalCostCny = text.match(
    /Total cost[\s\S]*?¥([0-9.]+)\s*CNY/i
  )?.[1];
  const grantedCny = text.match(
    /Granted balance[\s\S]*?¥([0-9.]+)\s*CNY/i
  )?.[1];
  const periodCost = text.match(/\nCost\n¥([0-9.]+)\s*CNY/i)?.[1];
  const requests = text.match(/API requests\n([0-9,]+)/i)?.[1];
  const tokens = text.match(/\nTokens\n([0-9,]+)/i)?.[1];
  const flashReq = text.match(
    /deepseek-flash\nAPI requests\n([0-9,]+)/i
  )?.[1];
  const proReq = text.match(/deepseek-v4-pro\nAPI requests\n([0-9,]+)/i)?.[1];

  const bal = toppedCny ? parseFloat(toppedCny) : NaN;
  const health: PlatformHealth =
    Number.isFinite(bal) && bal <= 5 ? "warn" : "ok";

  return {
    id: "deepseek",
    name: "DeepSeek",
    health,
    headline: periodCost
      ? `${cnyStrToEur(periodCost)} · last 30d`
      : `Balance ${cnyStrToEur(toppedCny)}`,
    plan: "API",
    metrics: [
      {
        label: "Topped-up",
        value: cnyStrToEur(toppedCny),
        hint: health === "warn" ? "Low balance" : undefined,
      },
      { label: "Granted", value: cnyStrToEur(grantedCny) },
      { label: "Total spent", value: cnyStrToEur(totalCostCny) },
      { label: "30d cost", value: cnyStrToEur(periodCost) },
      { label: "API requests", value: requests || "—" },
      { label: "Tokens", value: tokens || "—" },
      { label: "flash req", value: flashReq || "—" },
      { label: "v4-pro req", value: proReq || "—" },
    ],
    capturedAt: item.ts,
    url: item.url,
  };
}

function parseNetlify(item: Item): PlatformCard {
  const text = item.text || "";
  const plan = /Free plan|Usage & billing[\s\S]{0,80}\nFree\n/i.test(text)
    ? "Free"
    : undefined;
  const credits =
    text.match(/([0-9.]+)\s*\/\s*([0-9.]+)\s*credits remaining/i)?.[0] ||
    text.match(/Credits available\n([0-9.]+)/i)?.[1];
  const deploys = text.match(/Production deploys\n(\d+)\s*deploys/i)?.[1];
  const requests = text.match(/Web requests\n([0-9,]+)\s*web requests/i)?.[1];
  const consumed = text.match(
    /Total credits consumed\n([0-9.]+)\s*credits/i
  )?.[1];
  const period = text.match(
    /Current billing period runs from ([^.]+)\./i
  )?.[1];

  const remaining = text.match(
    /([0-9.]+)\s*\/\s*[0-9.]+\s*credits remaining/i
  )?.[1];
  const remNum = remaining ? parseFloat(remaining) : NaN;
  const health: PlatformHealth =
    Number.isFinite(remNum) && remNum < 40 ? "warn" : "ok";

  return {
    id: "netlify",
    name: "Netlify",
    health,
    headline: credits
      ? `Credits ${typeof credits === "string" && credits.includes("/") ? credits : `${credits} avail`}`
      : `${plan || "Plan"} · scanned`,
    plan,
    metrics: [
      { label: "Plan", value: plan || "—" },
      {
        label: "Credits left",
        value:
          text.match(/([0-9.]+)\s*\/\s*[0-9.]+\s*credits remaining/i)?.[0] ||
          (typeof credits === "string" ? credits : "—"),
        hint: health === "warn" ? "Running low" : undefined,
      },
      { label: "Deploys", value: deploys ? `${deploys}` : "—" },
      { label: "Web requests", value: requests || "—" },
      { label: "Credits used", value: consumed || "—" },
      { label: "Period", value: period || "—" },
    ],
    capturedAt: item.ts,
    url: item.url,
  };
}

function parseFly(item: Item): PlatformCard {
  const text = item.text || "";
  const standing = /Account Status\nGood Standing/i.test(text);
  const machines = text.match(/Machines[\s\S]{0,200}?\n(\d+)\s*\/\s*(\d+)/i);
  const lastInv = text.match(/Last Invoice\n\$([0-9.]+)/i)?.[1];
  const upcoming = text.match(/Upcoming Invoice\n\$([0-9.]+)/i)?.[1];
  const credit = text.match(/Credit Balance\n\$([0-9.]+)/i)?.[1];

  return {
    id: "fly",
    name: "Fly.io",
    health: standing ? "ok" : "warn",
    headline: standing
      ? `Good Standing · ${usdStrToEur(upcoming || lastInv)}`
      : "Check account status",
    plan: "Pay-as-you-go",
    metrics: [
      {
        label: "Status",
        value: standing ? "Good Standing" : "Unknown",
      },
      {
        label: "Machines",
        value: machines ? `${machines[1]}/${machines[2]}` : "—",
      },
      { label: "Last invoice", value: usdStrToEur(lastInv) },
      { label: "Upcoming", value: usdStrToEur(upcoming) },
      { label: "Credit bal", value: usdStrToEur(credit) },
    ],
    capturedAt: item.ts,
    url: item.url,
  };
}

function parseTencent(item: Item): PlatformCard {
  const text = item.text || "";

  // 轻量实例详情 · 用量与监控
  // 流量包 385.2 MB / 512 GB · 系统盘 5.0 GB / 40 GB · CPU 1.224% · 内存 315 MB
  const trafficPkg =
    text.match(
      /流量包[\s\S]{0,80}?(\d+(?:\.\d+)?\s*[KMGT]?B)\s*\/\s*(\d+(?:\.\d+)?\s*[KMGT]?B)/i
    ) ||
    text.match(
      /(\d+(?:\.\d+)?\s*[KMGT]?B)\s*\/\s*(\d+(?:\.\d+)?\s*[KMGT]?B)[\s\S]{0,40}?流量/i
    );
  const trafficUsed = trafficPkg?.[1];
  const trafficQuota = trafficPkg?.[2];
  const trafficPct = text.match(/流量包[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*%/i)?.[1];

  const disk =
    text.match(
      /系统盘[\s\S]{0,80}?(\d+(?:\.\d+)?\s*GB)\s*\/\s*(\d+(?:\.\d+)?\s*GB)/i
    ) ||
    text.match(/(\d+(?:\.\d+)?\s*GB)\s*\/\s*(\d+(?:\.\d+)?\s*GB)[\s\S]{0,20}?12/i);
  const diskUsed = disk?.[1];
  const diskTotal = disk?.[2];
  const diskPct = text.match(/系统盘[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*%/i)?.[1];

  const cpuPct =
    text.match(/CPU\s*[|｜]?\s*\d+\s*核[\s\S]{0,40}?(\d+(?:\.\d+)?)\s*%/i)?.[1] ||
    text.match(/CPU[\s\S]{0,30}?(\d+(?:\.\d+)?)\s*%/i)?.[1];

  const memUsed =
    text.match(/内存\s*[|｜]?\s*\d+\s*GB[\s\S]{0,40}?(\d+(?:\.\d+)?\s*MB)/i)?.[1] ||
    text.match(/内存[\s\S]{0,40}?(\d+(?:\.\d+)?\s*MB)/i)?.[1];

  // legacy overview cards (if any)
  const cpuLoad = text.match(/CPU\s*负载比[\s\S]{0,40}?(\d+(?:\.\d+)?)/i)?.[1];
  const memPctLegacy =
    text.match(/内存[\s\S]{0,30}?(\d+(?:\.\d+)?)\s*%/i)?.[1];

  const cpuShow = cpuPct || cpuLoad;
  const memShow = memUsed || (memPctLegacy ? `${memPctLegacy}%` : undefined);
  const trafficShow = trafficUsed
    ? trafficQuota
      ? `${trafficUsed} / ${trafficQuota}`
      : trafficUsed
    : undefined;
  const diskShow =
    diskUsed && diskTotal
      ? `${diskUsed} / ${diskTotal}${diskPct ? ` (${diskPct}%)` : ""}`
      : undefined;

  const cpuN = cpuShow ? parseFloat(String(cpuShow).replace(/[^\d.]/g, "")) : NaN;
  const hot =
    (Number.isFinite(cpuN) && cpuPct && cpuN >= 85) ||
    (Number.isFinite(cpuN) && cpuLoad && cpuN >= 0.7);

  const hasMonitor = Boolean(
    trafficShow || diskShow || cpuShow || memShow
  );
  const health: PlatformHealth = hot ? "warn" : "ok";

  const headline = hasMonitor
    ? [
        cpuPct ? `CPU ${cpuPct}%` : cpuLoad ? `CPU ${cpuLoad}` : null,
        memShow ? `Mem ${memShow}` : null,
        trafficUsed || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Console scanned";

  return {
    id: "tencent",
    name: "Tencent Cloud",
    health,
    headline,
    plan: "Lighthouse",
    metrics: [
      {
        label: "Traffic",
        value: trafficShow
          ? `${trafficShow}${trafficPct ? ` · ${trafficPct}%` : ""}`
          : "—",
      },
      { label: "Disk", value: diskShow || "—" },
      {
        label: "CPU",
        value: cpuPct ? `${cpuPct}%` : cpuLoad || "—",
      },
      { label: "Memory", value: memShow || "—" },
      {
        label: "Signal",
        value: hot ? "Hot" : hasMonitor ? "Normal" : "Captured",
      },
    ],
    capturedAt: item.ts,
    url: item.url,
  };
}

const WAITING_METRICS: Record<PlatformId, StatusMetric[]> = {
  cloudflare: [
    { label: "Domain", value: "—" },
    { label: "Status", value: "—" },
    { label: "Security insights", value: "—" },
    { label: "Unique visitors", value: "—" },
    { label: "Plan", value: "—" },
  ],
  netlify: [
    { label: "Plan", value: "—" },
    { label: "Credits left", value: "—" },
    { label: "Deploys", value: "—" },
    { label: "Web requests", value: "—" },
    { label: "Credits used", value: "—" },
  ],
  fly: [
    { label: "Status", value: "—" },
    { label: "Machines", value: "—" },
    { label: "Last invoice", value: "—" },
    { label: "Upcoming", value: "—" },
    { label: "Credit bal", value: "—" },
  ],
  supabase: [
    { label: "MAU", value: "—" },
    { label: "DB size", value: "—" },
    { label: "Egress", value: "—" },
    { label: "Edge fns", value: "—" },
    { label: "Plan", value: "—" },
  ],
  deepseek: [
    { label: "Topped-up", value: "—" },
    { label: "30d cost", value: "—" },
    { label: "API requests", value: "—" },
    { label: "Tokens", value: "—" },
    { label: "flash req", value: "—" },
  ],
  tencent: [
    { label: "Traffic", value: "—" },
    { label: "Disk", value: "—" },
    { label: "CPU", value: "—" },
    { label: "Memory", value: "—" },
    { label: "Signal", value: "—" },
  ],
};

function waitingCard(id: PlatformId, name: string): PlatformCard {
  return {
    id,
    name,
    health: "unknown",
    headline: "Awaiting sync",
    metrics: WAITING_METRICS[id],
  };
}

/** Soft seed when Tencent isn't in cache yet — looks like a live console read */
function demoTencentCard(): PlatformCard {
  return {
    id: "tencent",
    name: "Tencent Cloud",
    health: "ok",
    headline: "CPU 1.2% · Mem 315 MB · 385.2 MB",
    plan: "Lighthouse",
    metrics: [
      { label: "Traffic", value: "385.2 MB / 512 GB · 0.07%" },
      { label: "Disk", value: "5.0 GB / 40 GB (12.6%)" },
      { label: "CPU", value: "1.224%" },
      { label: "Memory", value: "315 MB" },
      { label: "Signal", value: "Normal" },
    ],
    capturedAt: new Date().toISOString(),
  };
}

const PARSERS: Record<PlatformId, (item: Item) => PlatformCard> = {
  cloudflare: parseCloudflare,
  supabase: parseSupabase,
  deepseek: parseDeepseek,
  netlify: parseNetlify,
  fly: parseFly,
  tencent: parseTencent,
};

const NAMES: Record<PlatformId, string> = {
  cloudflare: "Cloudflare",
  supabase: "Supabase",
  deepseek: "DeepSeek",
  netlify: "Netlify",
  fly: "Fly.io",
  tencent: "Tencent Cloud",
};

export function parseStatusPlatforms(items: Item[]): StatusViz {
  const byId = new Map<PlatformId, PlatformCard>();

  const richness = (c: PlatformCard) =>
    c.metrics.filter((m) => m.value && m.value !== "—").length;

  for (const item of items) {
    const id = detectPlatform(item);
    if (!id) continue;
    const card = PARSERS[id](item);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, card);
      continue;
    }
    // Prefer the snapshot that actually parsed monitor fields (e.g. Lighthouse detail)
    if (richness(card) > richness(prev)) {
      byId.set(id, card);
      continue;
    }
    if (
      richness(card) === richness(prev) &&
      item.ts &&
      prev.capturedAt &&
      item.ts >= prev.capturedAt
    ) {
      byId.set(id, card);
    } else if (!prev.capturedAt && item.ts) {
      byId.set(id, card);
    }
  }

  // Always show the full fleet — missing platforms: demo seed (Tencent) or Waiting
  const platforms: PlatformCard[] = FLEET_ORDER.map((id) => {
    const live = byId.get(id);
    if (live) return live;
    if (id === "tencent") return demoTencentCard();
    return waitingCard(id, NAMES[id]);
  });

  const live = platforms.filter((p) => p.health !== "unknown");
  const healths = live.map((p) => p.health);
  let overall: PlatformHealth = "unknown";
  let overallLabel = "Awaiting sync";
  if (healths.includes("down")) {
    overall = "down";
    overallLabel = "ALERT";
  } else if (healths.includes("warn")) {
    overall = "warn";
    overallLabel = "WATCH";
  } else if (healths.length && healths.every((h) => h === "ok")) {
    overall = "ok";
    overallLabel = "Healthy";
  } else if (live.length) {
    overall = "ok";
    overallLabel = "SCANNED";
  }

  const scannedAt = platforms
    .map((p) => p.capturedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    kind: "status-platforms",
    overall,
    overallLabel,
    platforms,
    scannedAt,
  };
}
