/**
 * Fixed-cost ledger seed — book amounts in EUR.
 */

export type CostCategory =
  | "Top-up"
  | "Dev Tool"
  | "Infrastructure"
  | "Platform";

export type OpsCostEntry = {
  id: string;
  date: string;
  vendor: string;
  category: CostCategory;
  /** As charged on the invoice (any currency) */
  original: string;
  /** EUR book amount; null = excluded from gross profit */
  eur: number | null;
  amortizeMonths: number | null;
  note: string;
};

/** Rough FX for seeding / live capture (display is always EUR). */
export const USD_EUR = 0.92;
export const CNY_EUR = 0.127;

function eurFromOriginal(original: string, fallbackEur: number | null): number | null {
  if (fallbackEur !== null && Number.isFinite(fallbackEur)) return fallbackEur;
  const m = original.match(/^(EUR|USD|CNY)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = parseFloat(m[2]);
  const cur = m[1].toUpperCase();
  if (cur === "EUR") return n;
  if (cur === "USD") return Math.round(n * USD_EUR * 100) / 100;
  if (cur === "CNY") return Math.round(n * CNY_EUR * 100) / 100;
  return null;
}

export const OPS_COST_ENTRIES: OpsCostEntry[] = [
  {
    id: "2026-08-19-deepseek",
    date: "2026-08-19",
    vendor: "DeepSeek",
    category: "Top-up",
    original: "CNY 50.00",
    eur: null,
    amortizeMonths: null,
    note: "Pre-recharge — excluded from gross profit",
  },
  {
    id: "2026-08-18-cursor",
    date: "2026-08-18",
    vendor: "Cursor",
    category: "Dev Tool",
    original: "EUR 21.48",
    eur: 21.48,
    amortizeMonths: null,
    note: "Pro monthly fee",
  },
  {
    id: "2026-08-01-fly",
    date: "2026-08-01",
    vendor: "Fly.io (spaCy)",
    category: "Infrastructure",
    original: "USD 6.12",
    eur: eurFromOriginal("USD 6.12", null),
    amortizeMonths: null,
    note: "August bill",
  },
  {
    id: "2026-07-26-apple",
    date: "2026-07-26",
    vendor: "Apple Developer",
    category: "Platform",
    original: "USD 99.00",
    eur: eurFromOriginal("USD 99.00", null),
    amortizeMonths: 12,
    note: "Annual fee — amortized over 12 months",
  },
  {
    id: "2026-07-15-cursor",
    date: "2026-07-15",
    vendor: "Cursor",
    category: "Dev Tool",
    original: "EUR 21.63",
    eur: 21.63,
    amortizeMonths: null,
    note: "Pro monthly fee (2nd charge this month)",
  },
  {
    id: "2026-07-03-cursor",
    date: "2026-07-03",
    vendor: "Cursor",
    category: "Dev Tool",
    original: "EUR 21.63",
    eur: 21.63,
    amortizeMonths: null,
    note: "Pro monthly fee",
  },
  {
    id: "2026-07-01-deepseek",
    date: "2026-07-01",
    vendor: "DeepSeek",
    category: "Top-up",
    original: "CNY 10.00",
    eur: null,
    amortizeMonths: null,
    note: "Pre-recharge — excluded from gross profit",
  },
  {
    id: "2026-06-15-deepseek",
    date: "2026-06-15",
    vendor: "DeepSeek",
    category: "Top-up",
    original: "CNY 10.00",
    eur: null,
    amortizeMonths: null,
    note: "Pre-recharge — excluded from gross profit",
  },
  {
    id: "2026-06-03-cursor",
    date: "2026-06-03",
    vendor: "Cursor",
    category: "Dev Tool",
    original: "EUR 21.63",
    eur: 21.63,
    amortizeMonths: null,
    note: "Pro monthly fee",
  },
  {
    id: "2026-05-19-deepseek",
    date: "2026-05-19",
    vendor: "DeepSeek",
    category: "Top-up",
    original: "CNY 10.00",
    eur: null,
    amortizeMonths: null,
    note: "Pre-recharge — excluded from gross profit",
  },
  {
    id: "2026-05-03-cursor",
    date: "2026-05-03",
    vendor: "Cursor",
    category: "Dev Tool",
    original: "EUR 21.63",
    eur: 21.63,
    amortizeMonths: null,
    note: "Pro monthly fee",
  },
  {
    id: "2026-04-04-deepseek",
    date: "2026-04-04",
    vendor: "DeepSeek",
    category: "Top-up",
    original: "CNY 10.00",
    eur: null,
    amortizeMonths: null,
    note: "Pre-recharge — excluded from gross profit",
  },
  {
    id: "2026-04-03-cursor",
    date: "2026-04-03",
    vendor: "Cursor",
    category: "Dev Tool",
    original: "EUR 21.63",
    eur: 21.63,
    amortizeMonths: null,
    note: "Pro monthly fee",
  },
];

export function formatEur(n: number | null): string {
  if (n === null) return "Excl.";
  return `€${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Convert a USD money string ("$146", "$1.15K") to EUR display. Leaves € / unit counts alone. */
export function usdMoneyToEurDisplay(value: string): string {
  const s = (value || "").trim();
  if (!s || s.startsWith("€")) return s;
  if (!/^\$/.test(s) && !/USD/i.test(s)) return s;

  const withK = s.match(/(?:USD\s*)?\$?\s*([\d,.]+)\s*K$/i);
  if (withK) {
    const n = parseFloat(withK[1].replace(/,/g, "")) * 1000;
    if (!Number.isFinite(n)) return s;
    const eur = n * USD_EUR;
    if (eur >= 1000) {
      return `€${(eur / 1000).toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })}K`;
    }
    return `€${eur.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }

  const plain = s.match(/(?:USD\s*)?\$?\s*([\d,.]+)$/i);
  if (plain) {
    const n = parseFloat(plain[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) return s;
    const eur = Math.round(n * USD_EUR * 100) / 100;
    return `€${eur.toLocaleString("en-US", {
      minimumFractionDigits: eur % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return s.replace(/^\$/, "€").replace(/USD\s*/i, "€");
}

/** @deprecated use formatEur */
export const formatCny = formatEur;

export function opsCostSummary() {
  const counted = OPS_COST_ENTRIES.filter((e) => e.eur !== null);
  const totalEur = counted.reduce((s, e) => s + (e.eur || 0), 0);
  const byCat = counted.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + (e.eur || 0);
      return acc;
    },
    {} as Record<string, number>
  );
  const excludedTopups = OPS_COST_ENTRIES.filter(
    (e) => e.category === "Top-up"
  ).length;

  return {
    totalEur,
    /** @deprecated alias */
    totalCny: totalEur,
    entryCount: OPS_COST_ENTRIES.length,
    countedCount: counted.length,
    byCat,
    excludedTopups,
  };
}

export type LiveCostCapture = {
  id: string;
  date: string;
  vendor: string;
  category: CostCategory;
  original: string;
  eur: number | null;
  note: string;
  source: "gmail" | "fly" | "netlify";
  capturedAt: string;
  matchedLedgerId?: string;
};

const MONTHS: Record<string, string> = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

function toIsoDate(paid: string): string {
  const m = paid.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (m && MONTHS[m[1]]) {
    return `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(paid);
  if (Number.isNaN(d.getTime())) return paid;
  return d.toISOString().slice(0, 10);
}

/** Gmail CN UI often shows "10月9日" next to the thread */
function parseGmailCnDate(text: string, capturedAt: string): string | null {
  const m = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const y = capturedAt.slice(0, 4) || String(new Date().getFullYear());
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function matchLedger(vendorKey: string, originalAmount: string): string | undefined {
  const amount = originalAmount.replace(/[^0-9.]/g, "");
  return OPS_COST_ENTRIES.find(
    (e) =>
      e.vendor.toLowerCase().includes(vendorKey) &&
      e.original.replace(/[^0-9.]/g, "") === amount
  )?.id;
}

export function parseLiveCostCaptures(
  items: { text?: string; app?: string; ts?: string }[]
): LiveCostCapture[] {
  const hits: LiveCostCapture[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const text = item.text || "";
    const capturedAt = item.ts || new Date().toISOString();
    const fromGmail = /gmail|mail\.google|inbox/i.test(
      `${item.app || ""} ${text.slice(0, 200)}`
    );
    const fromFly = /fly\.io/i.test(text) && /Last Invoice|Billing/i.test(text);

    if (/Fly\.io/i.test(text) && /Paid on/i.test(text)) {
      const flyRe =
        /\$([0-9]+(?:\.[0-9]{2})?)\s+Paid on ([A-Za-z]+ \d{1,2}, \d{4})/gi;
      let m: RegExpExecArray | null;
      while ((m = flyRe.exec(text)) !== null) {
        const usd = parseFloat(m[1]);
        const date = toIsoDate(m[2]);
        const original = `USD ${usd.toFixed(2)}`;
        const key = `fly-email-${date}-${usd}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          id: key,
          date,
          vendor: "Fly.io",
          category: "Infrastructure",
          original,
          eur: Math.round(usd * USD_EUR * 100) / 100,
          note: `Pulled from Gmail receipt · Paid ${m[2]}`,
          source: "gmail",
          capturedAt,
          matchedLedgerId: matchLedger("fly", original),
        });
      }
    }

    if (fromFly) {
      const last = text.match(/Last Invoice\s*\n?\s*\$([0-9]+(?:\.[0-9]{2})?)/i);
      if (last) {
        const usd = parseFloat(last[1]);
        const original = `USD ${usd.toFixed(2)}`;
        const key = `fly-dash-${usd}`;
        if (!seen.has(key) && !hits.some((h) => h.original === original)) {
          seen.add(key);
          hits.push({
            id: key,
            date: capturedAt.slice(0, 10),
            vendor: "Fly.io",
            category: "Infrastructure",
            original,
            eur: Math.round(usd * USD_EUR * 100) / 100,
            note: "Pulled from Fly billing dashboard",
            source: "fly",
            capturedAt,
            matchedLedgerId: matchLedger("fly", original),
          });
        }
      }
    }

    if (
      fromGmail &&
      /Cloudflare/i.test(text) &&
      /(invoice|Purchase confirmed|purchase of\s*\$)/i.test(text)
    ) {
      // Full email body: "We confirmed your purchase of $10.46 with visa card."
      // List preview often truncates before the $ amount.
      const amtRe =
        /purchase of\s*\$([0-9]+(?:\.[0-9]{2})?)|\$([0-9]+(?:\.[0-9]{2})?)\s+with\s+(?:visa|mastercard|card)/gi;
      let matchedAmt = false;
      let m: RegExpExecArray | null;
      while ((m = amtRe.exec(text)) !== null) {
        const usd = parseFloat(m[1] || m[2]);
        if (!Number.isFinite(usd) || usd <= 0) continue;
        const date = parseGmailCnDate(text, capturedAt) || capturedAt.slice(0, 10);
        const original = `USD ${usd.toFixed(2)}`;
        const key = `cf-gmail-${date}-${usd}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matchedAmt = true;
        hits.push({
          id: key,
          date,
          vendor: "Cloudflare",
          category: "Infrastructure",
          original,
          eur: Math.round(usd * USD_EUR * 100) / 100,
          note: `Pulled from Gmail confirmation · $${usd.toFixed(2)}`,
          source: "gmail",
          capturedAt,
          matchedLedgerId: matchLedger("cloudflare", original),
        });
      }
      if (!matchedAmt) {
        const key = `cf-gmail-${capturedAt.slice(0, 10)}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({
            id: key,
            date: capturedAt.slice(0, 10),
            vendor: "Cloudflare",
            category: "Infrastructure",
            original: "—",
            eur: null,
            note: "Seen in Gmail list · open confirmation for $ amount",
            source: "gmail",
            capturedAt,
          });
        }
      }
    }
  }

  hits.sort(
    (a, b) =>
      new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
  );
  return hits;
}

export function mergeLedgerWithLive(live: LiveCostCapture[]): {
  rows: (OpsCostEntry & {
    live?: boolean;
    liveSource?: LiveCostCapture["source"];
    liveCapturedAt?: string;
  })[];
  fresh: LiveCostCapture[];
  matchedIds: Set<string>;
} {
  const matchedIds = new Set(
    live.map((h) => h.matchedLedgerId).filter(Boolean) as string[]
  );
  const fresh = live.filter((h) => !h.matchedLedgerId);

  const liveRows = fresh.map((h) => ({
    id: h.id,
    date: h.date,
    vendor: h.vendor,
    category: h.category,
    original: h.original,
    eur: h.eur,
    amortizeMonths: null as number | null,
    note: h.note,
    live: true as const,
    liveSource: h.source,
    liveCapturedAt: h.capturedAt,
  }));

  const seedRows = OPS_COST_ENTRIES.map((e) => ({
    ...e,
    live: matchedIds.has(e.id) ? true : undefined,
    liveSource: matchedIds.has(e.id)
      ? live.find((h) => h.matchedLedgerId === e.id)?.source
      : undefined,
    liveCapturedAt: matchedIds.has(e.id)
      ? live.find((h) => h.matchedLedgerId === e.id)?.capturedAt
      : undefined,
  }));

  return {
    rows: [...liveRows, ...seedRows],
    fresh,
    matchedIds,
  };
}
