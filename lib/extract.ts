/**
 * Heuristic extractors — hackathon MVP without requiring Claude API.
 * Swap in LLM later for higher accuracy.
 */

import {
  formatEur,
  opsCostSummary,
  parseLiveCostCaptures,
  usdMoneyToEurDisplay,
  type LiveCostCapture,
} from "@/lib/ops-costs";
import {
  parseStatusPlatforms,
  type StatusViz,
} from "@/lib/status-platforms";
import {
  parseCommentsFeed,
  type CommentsViz,
} from "@/lib/comments-feed";

export type ModuleId = "revenue" | "costs" | "status" | "comments";

export type AscKpi = {
  label: string;
  value: string;
  changePct?: number;
};

export type AscTopApp = {
  name: string;
  platform?: string;
  appleId?: string;
  units: string;
  sharePct: number;
  changePct?: number;
};

export type AscDevice = {
  name: string;
  pct: number;
};

export type RevenueAscViz = {
  kind: "revenue-asc";
  period?: string;
  endingOn?: string;
  kpis: AscKpi[];
  topApps: AscTopApp[];
  territories: string[];
  devices: AscDevice[];
};

/** Structured viz payload for expanded cockpit panels */
export type ModuleViz = RevenueAscViz | StatusViz | CommentsViz;

export type { StatusViz, CommentsViz };

/** Side-rail AI briefing (heuristic; swap LLM later) */
export type ModuleBriefing = {
  summary: string;
  suggestions: string[];
};

export type ModuleSnapshot = {
  id: ModuleId;
  preview: string;
  details: { label: string; value: string }[];
  confidence: "high" | "medium" | "low" | "none";
  sourceSnippet?: string;
  updatedAt?: string;
  viz?: ModuleViz;
  briefing?: ModuleBriefing;
  /** Cover-flow 卡片上、大数字下方的极简要点（来自明细/briefing） */
  teaser?: string;
  /** 成本：本次巡逻从邮件抓到的增量 */
  liveCaptures?: LiveCostCapture[];
};

function formatChangeLabel(pct?: number): string {
  if (pct === undefined || !Number.isFinite(pct)) return "flat";
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

/** 基于 ASC Trends 结构化信号生成侧栏分析（无外部 LLM） */
export function buildRevenueBriefing(viz: RevenueAscViz): ModuleBriefing {
  const sales = viz.kpis.find((k) => k.label === "Sales");
  const units = viz.kpis.find((k) => k.label === "App Units");
  const iap = viz.kpis.find((k) => k.label === "In-App Purchases");
  const top = viz.topApps[0];
  const leadDevice = viz.devices[0];
  const period = viz.period || "last 30 days";

  const salesDelta = sales?.changePct;
  const unitsDelta = units?.changePct;
  const iapDelta = iap?.changePct;

  let tone = "steady";
  if ((salesDelta ?? 0) >= 50 || (unitsDelta ?? 0) >= 20) tone = "surging";
  else if ((salesDelta ?? 0) > 0 || (unitsDelta ?? 0) > 0) tone = "up modestly";
  else if ((salesDelta ?? 0) < 0 && (unitsDelta ?? 0) < 0) tone = "softening";

  const summaryParts = [
    `${period} ASC Trends looks ${tone}: Sales ${sales?.value ?? "—"} (${formatChangeLabel(salesDelta)})`,
    units
      ? `, App Units ${units.value} (${formatChangeLabel(unitsDelta)})`
      : "",
    iap
      ? `; IAP count ${iap.value} (${formatChangeLabel(iapDelta)} — not subscriber headcount)`
      : "",
    top ? `. ${top.name} drives ${top.sharePct}% of Units` : "",
    leadDevice
      ? `, led by ${leadDevice.name} (${leadDevice.pct}%)`
      : "",
    viz.territories.length
      ? `. Territory signal spans ${viz.territories.length} markets (${viz.territories.slice(0, 3).join(", ")}${viz.territories.length > 3 ? "…" : ""})`
      : "",
    ".",
  ];

  const suggestions: string[] = [];

  if ((salesDelta ?? 0) > 30 && (unitsDelta ?? 0) > 0) {
    suggestions.push(
      "Revenue is outpacing installs — revisit paywall tiers and lock in what's working as the default path."
    );
  } else if ((unitsDelta ?? 0) > 15 && (salesDelta ?? 0) < 10) {
    suggestions.push(
      "Installs are up but proceeds lag — tighten day-one trial → subscribe flow; don't optimize for downloads alone."
    );
  } else {
    suggestions.push(
      "Cross-check ASC Subscriptions for active subs and renewals; don't treat IAP count as subscriber count."
    );
  }

  if (leadDevice && leadDevice.name === "iPhone" && leadDevice.pct >= 85) {
    suggestions.push(
      `Traffic is almost all iPhone (${leadDevice.pct}%) — prioritize iPhone ASO and screenshots; iPad/desktop can wait.`
    );
  } else if (leadDevice) {
    suggestions.push(
      `Device mix is spread (top: ${leadDevice.name} ${leadDevice.pct}%) — split conversion funnels by device instead of one-size UI.`
    );
  }

  if (viz.territories.includes("China mainland")) {
    suggestions.push(
      "China mainland shows in Trends — tune copy, payment expectations, and push timing (use your own user timezone data)."
    );
  } else if (viz.territories.length > 0) {
    suggestions.push(
      `Territory signal leans ${viz.territories[0]} — consider a localized A/B or pricing test on your top market.`
    );
  }

  if (top && (top.changePct ?? 0) > 0) {
    suggestions.push(
      `${top.name} Units ${formatChangeLabel(top.changePct)} — log acquisition channel/creative in the weekly review and reuse what worked.`
    );
  } else {
    suggestions.push(
      "Put active subscriptions beside Trends Sales to separate new purchases from renewals."
    );
  }

  return {
    summary: summaryParts.join(""),
    suggestions: suggestions.slice(0, 4),
  };
}

const MONEY_RE =
  /(?:USD|US\$|\$|€|£)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:USD|dollars?)/gi;

function formatUsdNumberAsEur(n: number): string {
  return usdMoneyToEurDisplay(`$${n}`);
}

function findMoneyAmounts(text: string): string[] {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MONEY_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] || m[2];
    if (!raw) continue;
    const n = parseFloat(raw.replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 1) {
      const alreadyEur = /€/.test(m[0]);
      hits.push(
        alreadyEur
          ? `€${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
          : formatUsdNumberAsEur(n)
      );
    }
  }
  return Array.from(new Set(hits)).slice(0, 6);
}

function joinCorpus(
  items: { text?: string; app?: string; ts?: string }[]
): string {
  return items
    .map((i) => i.text || "")
    .filter(Boolean)
    .join("\n---\n");
}

function formatChange(pct?: number): string {
  if (pct === undefined || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

/**
 * ASC Trends 把数值和涨跌粘在一起：`$146148%` → $146 / +148%
 * `1.15K15%` → 1.15K / +15%  ·  `30329%` → 303 / +29%
 */
function splitGluedDigits(
  digits: string,
  prefix: "" | "$"
): { value: string; changePct: number } | null {
  let best: { value: string; changePct: number; score: number } | null = null;

  for (let cLen = 1; cLen <= 3 && cLen < digits.length; cLen++) {
    const valueDigits = digits.slice(0, -cLen);
    const changePct = Number(digits.slice(-cLen));
    if (!valueDigits || /^0\d/.test(valueDigits)) continue;
    if (!Number.isFinite(changePct) || changePct > 999) continue;

    let score = 0;
    if (changePct <= 999) score += 10;

    if (prefix === "$") {
      // ASC Sales 常见：$146 + 148% 粘成 $146148%
      if (valueDigits.length >= 2 && valueDigits.length <= 3) score += 35;
      else if (valueDigits.length === 4) score += 12;
      else if (valueDigits.length === 1) score -= 10;
      if (valueDigits.length <= 3 && cLen === 3) score += 10;
      else if (cLen === 2) score += 4;
    } else if (valueDigits.length >= 2 && valueDigits.length <= 4) {
      score += 20;
      if (cLen === 2) score += 8;
      else if (cLen === 3) score += 3;
    } else if (valueDigits.length === 5) {
      score += 8;
    }

    if (!best || score > best.score) {
      const n = Number(valueDigits);
      best = {
        score,
        changePct,
        value:
          prefix === "$"
            ? formatUsdNumberAsEur(n)
            : n.toLocaleString("en-US"),
      };
    }
  }

  return best ? { value: best.value, changePct: best.changePct } : null;
}

function splitValueChange(
  raw: string
): { value: string; changePct?: number } | null {
  const s = raw.trim();

  // 1.15K15% / $1.15K12%
  const withK = s.match(/^(\$?[\d.]+K)(\d+(?:\.\d+)?)%$/i);
  if (withK) {
    const value = withK[1].startsWith("$")
      ? usdMoneyToEurDisplay(withK[1])
      : withK[1];
    return { value, changePct: parseFloat(withK[2]) };
  }

  // $146148%
  const dollar = s.match(/^\$([\d,]+(?:\.\d+)?)%$/);
  if (dollar) {
    const body = dollar[1].replace(/,/g, "");
    if (body.includes(".")) {
      // $12.3415% — 少见，按小数点后拆不了就放弃
      return null;
    }
    return splitGluedDigits(body, "$");
  }

  // 30329%
  const plain = s.match(/^([\d,]+)%$/);
  if (plain) {
    return splitGluedDigits(plain[1].replace(/,/g, ""), "");
  }

  return null;
}

function parseAscRevenue(corpus: string): RevenueAscViz | null {
  const isAsc =
    /appstoreconnect\.apple\.com|App Store Connect|App Units|Top Apps/i.test(
      corpus
    );
  if (!isAsc) return null;

  const period =
    corpus.match(
      /([A-Z][a-z]{2} \d{1,2}\s*[-–]\s*[A-Z][a-z]{2} \d{1,2},?\s*\d{4})/
    )?.[1] ?? undefined;
  const endingOn =
    corpus.match(/Ending on\s+([A-Z][a-z]{2} \d{1,2},?\s*\d{4})/i)?.[1] ??
    undefined;

  const kpis: AscKpi[] = [];

  const unitsRaw = corpus.match(
    /App Units\s*\n[^\n]*\n\s*(\$?[\d,.]+K?\d+(?:\.\d+)?%)/i
  )?.[1];
  if (unitsRaw) {
    const split = splitValueChange(unitsRaw);
    if (split) {
      kpis.push({
        label: "App Units",
        value: split.value,
        changePct: split.changePct,
      });
    }
  }

  const iapRaw = corpus.match(
    /In-App Purchases\s*\n[^\n]*\n\s*(\$?[\d,.]+K?\d+(?:\.\d+)?%)/i
  )?.[1];
  if (iapRaw) {
    const split = splitValueChange(iapRaw);
    if (split) {
      kpis.push({
        label: "In-App Purchases",
        value: split.value,
        changePct: split.changePct,
      });
    }
  }

  const salesRaw = corpus.match(
    /Sales\s*\n[^\n]*\n\s*(\$[\d,.]+(?:\.\d+)?\d+(?:\.\d+)?%)/i
  )?.[1];
  if (salesRaw) {
    const split = splitValueChange(salesRaw);
    if (split) {
      kpis.push({
        label: "Sales",
        value: usdMoneyToEurDisplay(
          split.value.startsWith("€") || split.value.startsWith("$")
            ? split.value
            : `$${split.value}`
        ),
        changePct: split.changePct,
      });
    }
  }

  const topApps: AscTopApp[] = [];
  const topBlock = corpus.match(
    /Top Apps([\s\S]*?)(?=\nTerritories|\nDevices|$)/i
  )?.[1];
  if (topBlock) {
    // ChunkFlow\niOS\t6795199051\t1.15K\t100%\n15%
    const rowRe =
      /([A-Za-z][\w .+-]{1,40})\s*\n(?:(iOS|macOS|tvOS|visionOS)\s*)?\t?(\d{6,})\t([\d.]+K?)\t(\d+(?:\.\d+)?)%\s*\n?\s*(\d+(?:\.\d+)?)%?/g;
    let row: RegExpExecArray | null;
    while ((row = rowRe.exec(topBlock)) !== null) {
      topApps.push({
        name: row[1].trim(),
        platform: row[2] || undefined,
        appleId: row[3],
        units: row[4],
        sharePct: parseFloat(row[5]),
        changePct: row[6] ? parseFloat(row[6]) : undefined,
      });
    }
  }

  const territories: string[] = [];
  const territoryBlock = corpus.match(
    /Territories([\s\S]*?)(?=\nDevices|\nTake a Tour|$)/i
  )?.[1];
  if (territoryBlock) {
    const known = [
      "China mainland",
      "United States",
      "Hong Kong",
      "United Kingdom",
      "Japan",
      "Germany",
      "France",
      "Canada",
      "Taiwan",
      "Australia",
      "South Korea",
      "Singapore",
    ];
    for (const name of known) {
      if (territoryBlock.includes(name)) territories.push(name);
    }
  }

  const devices: AscDevice[] = [];
  const deviceBlock = corpus.match(
    /Devices([\s\S]*?)(?=\nTake a Tour|$)/i
  )?.[1];
  if (deviceBlock) {
    const deviceRe =
      /(\d+(?:\.\d+)?)%\s*\n\s*(iPhone|iPad|Desktop|Apple Watch|Apple TV|Mac)/gi;
    let d: RegExpExecArray | null;
    while ((d = deviceRe.exec(deviceBlock)) !== null) {
      devices.push({ name: d[2], pct: parseFloat(d[1]) });
    }
  }

  if (kpis.length === 0 && topApps.length === 0 && devices.length === 0) {
    return null;
  }

  return {
    kind: "revenue-asc",
    period,
    endingOn,
    kpis,
    topApps,
    territories,
    devices,
  };
}

export function extractRevenue(
  items: { text?: string; app?: string; ts?: string }[]
): ModuleSnapshot {
  const corpus = joinCorpus(items);
  const viz = parseAscRevenue(corpus);

  if (viz && viz.kpis.length > 0) {
    const sales =
      viz.kpis.find((k) => k.label === "Sales") ?? viz.kpis[viz.kpis.length - 1];
    const units = viz.kpis.find((k) => k.label === "App Units");
    const iap = viz.kpis.find((k) => k.label === "In-App Purchases");
    const top = viz.topApps[0];

    return {
      id: "revenue",
      preview: sales.value,
      details: [
        {
          label: "Sales",
          value: `${sales.value} (${formatChange(sales.changePct)})`,
        },
        {
          label: "App Units",
          value: units
            ? `${units.value} (${formatChange(units.changePct)})`
            : "—",
        },
        {
          label: "IAP",
          value: iap ? `${iap.value} (${formatChange(iap.changePct)})` : "—",
        },
        {
          label: "Top App",
          value: top
            ? `${top.name} · ${top.units} (${top.sharePct}%)`
            : "—",
        },
        {
          label: "Period",
          value: viz.period || viz.endingOn || "—",
        },
        {
          label: "Top device",
          value: viz.devices[0]
            ? `${viz.devices[0].name} ${viz.devices[0].pct}%`
            : "—",
        },
      ],
      confidence: "high",
      sourceSnippet: corpus.slice(0, 220),
      updatedAt: items[0]?.ts,
      viz,
      briefing: buildRevenueBriefing(viz),
      teaser: [
        sales
          ? `Sales ${formatChange(sales.changePct)}`
          : null,
        units ? `Units ${units.value}` : null,
        iap ? `IAP ${formatChange(iap.changePct)}` : null,
        viz.devices[0]
          ? `${viz.devices[0].name} ${viz.devices[0].pct}%`
          : null,
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(" · "),
    };
  }

  const amounts = findMoneyAmounts(corpus);
  const hasAsc =
    /App Store|Proceeds|Trends|Sales|Units|收入|销量|appstoreconnect/i.test(
      corpus
    );

  if (amounts.length === 0) {
    return {
      id: "revenue",
      preview: "No proceeds yet",
      details: [
        {
          label: "Status",
          value: "No App Store Connect Trends amounts in cache yet",
        },
        { label: "Next", value: "Sync ASC Trends, then review Sales / Units" },
        {
          label: "Focus",
          value: "Paywall conversion · active subs · territories",
        },
        { label: "Source", value: items.length ? `${items.length} frames` : "—" },
      ],
      confidence: "none",
    };
  }

  return {
    id: "revenue",
    preview: amounts[0],
    details: [
      {
        label: hasAsc ? "Amount signal" : "Largest amount",
        value: amounts[0],
      },
      { label: "Other amounts", value: amounts.slice(1).join(" · ") || "—" },
      { label: "Snippets", value: String(items.length) },
      { label: "Confidence", value: hasAsc ? "medium" : "low" },
    ],
    confidence: hasAsc ? "medium" : "low",
    sourceSnippet: corpus.slice(0, 180),
    updatedAt: items[0]?.ts,
  };
}

function buildCostsBriefing(ledger: {
  totalEur: number;
  entryCount: number;
  byCat: Record<string, number>;
  excludedTopups: number;
}): ModuleBriefing {
  const total = formatEur(ledger.totalEur);
  const cursor = ledger.byCat["Dev Tool"] || 0;
  const infra = ledger.byCat["Infrastructure"] || 0;
  const platform = ledger.byCat["Platform"] || 0;

  return {
    summary: `Fixed-cost ledger shows ${total} across ${ledger.entryCount} lines (Apr–Aug 2026). Dev tools dominate (${formatEur(cursor)}); platform includes amortized Apple Developer; ${ledger.excludedTopups} DeepSeek top-ups stay off gross profit.`,
    suggestions: [
      "Treat Cursor Pro as recurring burn — track EUR monthly so FX doesn't quietly erode margin.",
      "Amortize Apple Developer annual fee over 12 months in monthly P&L so one month doesn't spike.",
      "Don't book DeepSeek prepay as COGS until tokens are consumed — match spend to usage.",
      infra > 0
        ? `Fly.io (${formatEur(infra)}) is still small vs tools — check real usage before upgrading plans.`
        : "Roll Fly / Netlify / CF invoices into the ledger so infra cost is complete.",
      platform > 0
        ? "Reconcile ledger against inbox receipts to catch missing invoices early."
        : "When ASC annual renewal lands, book it under platform cost — avoid a yearly blind spot.",
    ].slice(0, 4),
  };
}

export function extractCosts(
  items: { text?: string; app?: string; ts?: string }[]
): ModuleSnapshot {
  const ledger = opsCostSummary();
  const liveCaptures = parseLiveCostCaptures(items);
  const corpus = joinCorpus(items);
  const amounts = findMoneyAmounts(corpus);
  const isBill =
    /invoice|receipt|billing|usage|charged|subscription|支付|账单|费用|Cloudflare|Fly|Supabase|Netlify|DeepSeek|腾讯|Cursor/i.test(
      corpus
    );

  const liveExtra = liveCaptures
    .filter((h) => !h.matchedLedgerId && h.eur != null)
    .reduce((s, h) => s + (h.eur || 0), 0);
  const preview = formatEur(ledger.totalEur + liveExtra);
  const fresh = liveCaptures.find((h) => !h.matchedLedgerId) || liveCaptures[0];
  const patrolHint = fresh
    ? `${fresh.vendor} ${fresh.original}`
    : amounts[0] || "—";

  return {
    id: "costs",
    preview,
    details: [
      { label: "Ledger (EUR)", value: formatEur(ledger.totalEur) },
      {
        label: "Dev tools",
        value: formatEur(ledger.byCat["Dev Tool"] || 0),
      },
      {
        label: "Platform",
        value: formatEur(ledger.byCat["Platform"] || 0),
      },
      {
        label: "Live email",
        value: fresh
          ? `${patrolHint} · ${fresh.source}`
          : amounts.length
            ? `${patrolHint}${isBill ? " · bill hit" : ""}`
            : "Waiting on inbox",
      },
      { label: "Lines", value: String(ledger.entryCount) },
      {
        label: "Top-ups excl.",
        value: String(ledger.excludedTopups),
      },
    ],
    confidence: amounts.length || ledger.entryCount ? "high" : "none",
    sourceSnippet: corpus.slice(0, 180) || "ops-costs ledger seed",
    updatedAt: items[0]?.ts || fresh?.capturedAt,
    briefing: buildCostsBriefing(ledger),
    liveCaptures,
    teaser: [
      `Ledger ${formatEur(ledger.totalEur)}`,
      ledger.byCat["Dev Tool"]
        ? `Tools ${formatEur(ledger.byCat["Dev Tool"])}`
        : null,
      fresh ? `Live ${fresh.vendor}` : `${ledger.entryCount} lines`,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function buildStatusBriefing(viz: StatusViz): ModuleBriefing {
  const live = viz.platforms.filter((p) => p.health !== "unknown");
  const ds = viz.platforms.find((p) => p.id === "deepseek");
  const sb = viz.platforms.find((p) => p.id === "supabase");
  const cf = viz.platforms.find((p) => p.id === "cloudflare");
  const nl = viz.platforms.find((p) => p.id === "netlify");
  const fly = viz.platforms.find((p) => p.id === "fly");
  const tc = viz.platforms.find((p) => p.id === "tencent");

  const bits = [
    cf?.health !== "unknown" ? cf?.headline : null,
    nl?.health !== "unknown" ? `Netlify ${nl?.headline}` : null,
    fly?.health !== "unknown" ? `Fly ${fly?.headline}` : null,
    sb?.health !== "unknown" ? sb?.headline : null,
    ds?.health !== "unknown" ? `DeepSeek ${ds?.headline}` : null,
    tc?.health !== "unknown" ? `Tencent ${tc?.headline}` : null,
  ].filter(Boolean);

  return {
    summary: `Monitor ${viz.overallLabel.toLowerCase()} · ${live.length}/${viz.platforms.length} live. ${bits.join(" · ")}.`.replace(
      /\s+/g,
      " "
    ).trim(),
    suggestions: [
      viz.overall === "warn" && ds?.health === "warn"
        ? "DeepSeek balance is low — top up before traffic spikes so inference doesn't drop."
        : "Treat CF · Netlify · Fly · Supabase · DeepSeek · Tencent Cloud as your infra heartbeat; fix anomalies before feature work.",
      nl?.health === "ok"
        ? `Netlify credits left ${nl.metrics.find((m) => m.label === "Credits left")?.value || "n/a"} - watch free-tier deploy burn so you don't hit a hard throttle.`
        : "Sync Netlify usage before judging whether frontend deploys are eating quota.",
      fly?.health === "ok"
        ? `Fly Machines ${fly.metrics.find((m) => m.label === "Machines")?.value || "n/a"} - upcoming ${fly.metrics.find((m) => m.label === "Upcoming")?.value || "n/a"} - scale cost against machine count.`
        : "Once Fly billing is wired in, machine count and invoices belong in weekly cost review.",
      tc?.health === "unknown"
        ? "Tencent Cloud spend isn't connected yet — add it to compare regional vs overseas cloud in one view."
        : sb?.health !== "unknown"
          ? `Supabase MAU ${sb?.metrics.find((m) => m.label === "MAU")?.value || "n/a"} - Free tier DB is 0.5 GB; plan upgrade before you hit the cap.`
          : "If Supabase metrics are missing, confirm database and Auth consoles are readable first.",
    ].slice(0, 4),
  };
}

export function extractStatus(
  items: { text?: string; app?: string; ts?: string; url?: string }[]
): ModuleSnapshot {
  const corpus = joinCorpus(items);
  const viz = parseStatusPlatforms(items);
  const live = viz.platforms.filter((p) => p.health !== "unknown");

  const bad =
    viz.overall === "down" ||
    /\b(All systems (down|outage)|Service unavailable|Deploy(ment)? failed|Site is down|Critical incident)\b/i.test(
      corpus
    );

  let preview = viz.overallLabel;
  let confidence: ModuleSnapshot["confidence"] = "low";

  if (bad) {
    preview = "ALERT";
    confidence = "high";
  } else if (live.length > 0) {
    preview = viz.overallLabel;
    confidence = "high";
  } else if (items.length > 0) {
    preview = "SCANNED";
    confidence = "low";
  } else {
    preview = "Awaiting sync";
    confidence = "none";
  }

  const byId = Object.fromEntries(viz.platforms.map((p) => [p.id, p]));

  const teaserLive = live.length;

  return {
    id: "status",
    preview,
    details: [
      { label: "Cloudflare", value: byId.cloudflare?.headline || "—" },
      { label: "Netlify", value: byId.netlify?.headline || "—" },
      { label: "Fly.io", value: byId.fly?.headline || "—" },
      {
        label: "Monitor",
        value:
          confidence === "none"
            ? "Sync consoles to see service health"
            : `${teaserLive}/${viz.platforms.length} live`,
      },
    ],
    confidence,
    sourceSnippet: corpus.slice(0, 180),
    updatedAt: viz.scannedAt || items[0]?.ts,
    viz,
    briefing: live.length ? buildStatusBriefing(viz) : undefined,
    teaser:
      confidence === "none"
        ? "Waiting on infra sync · CF · Netlify · Fly…"
        : `${preview} · ${teaserLive}/${viz.platforms.length} live · CF · Fly · Supabase`,
  };
}

export function extractComments(
  items: { text?: string; app?: string; ts?: string; url?: string }[]
): ModuleSnapshot {
  const viz = parseCommentsFeed(items);
  const top = viz.comments[0];

  if (viz.total === 0) {
    return {
      id: "comments",
      preview: "No reviews yet",
      details: [
        {
          label: "Status",
          value: "No Rednote or App Store reviews ingested yet",
        },
        {
          label: "Rednote",
          value: "Sync note comments to show up here",
        },
        {
          label: "App Store",
          value: "Sync Ratings & Reviews to show up here",
        },
        { label: "Next", value: "Pull both channels, then run theme clustering" },
      ],
      confidence: "none",
      teaser: "Waiting on Rednote · App Store review sync",
    };
  }

  const channel =
    top?.platform === "appstore"
      ? "App Store"
      : top?.platform === "xiaohongshu"
        ? "Rednote"
        : "mixed";

  // Cockpit is English-facing — don't dump raw CJK XHS nicknames into the card
  const authorLabel = displayReviewAuthor(top?.author, top?.platform);

  const briefing: ModuleBriefing = {
    summary: `${viz.total} reviews in the pool (Rednote ${viz.xhsCount} · App Store ${viz.ascCount} across ${viz.sources.length} sources). Latest signal from ${channel}${authorLabel !== "—" ? ` · ${authorLabel}` : ""} — see theme clusters for the English read-out.`,
    suggestions: [
      viz.xhsCount === 0
        ? "No Rednote comments yet — sync before you can compare community buzz with store ratings."
        : "Turn high-engagement Rednote threads and recurring questions into FAQ and next-release copy.",
      viz.ascCount === 0
        ? "App Store reviews aren't in yet — when they land, triage low stars first and harvest five-star lines for ASO."
        : "Template replies for ASC low scores; pull five-star quotes into screenshots and keywords.",
      "Watch whether speaking anxiety, pricing, and stability spike on both channels — that sets iteration priority.",
      "Merge channels: if the same pain shows on both sides, treat it as a product fix, not a messaging patch.",
    ].slice(0, 4),
  };

  return {
    id: "comments",
    preview: `${viz.total} reviews`,
    details: [
      { label: "Rednote", value: `${viz.xhsCount}` },
      { label: "App Store", value: `${viz.ascCount}` },
      {
        label: "Latest channel",
        value: channel,
      },
      {
        label: "Latest author",
        value: authorLabel,
      },
    ],
    confidence: "high",
    sourceSnippet: undefined,
    updatedAt: viz.scannedAt || items[0]?.ts,
    viz,
    briefing,
    teaser: `Rednote ${viz.xhsCount} · ASC ${viz.ascCount}${
      authorLabel !== "—" ? ` · ${authorLabel}` : ""
    }`,
  };
}

/** English UI: don't show Chinese XHS nicknames on the card */
function displayReviewAuthor(
  author: string | undefined,
  platform?: string
): string {
  const raw = (author || "").trim();
  if (!raw) return "—";
  if (/[\u4e00-\u9fff]/.test(raw)) {
    return platform === "appstore" ? "ASC reviewer" : "Rednote reviewer";
  }
  return raw.slice(0, 28);
}
