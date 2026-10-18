/**
 * 分工：
 *   成本 costs  → Gmail 搜账单邮件
 *   监控 status → 控制台看部署/用量（CF / Netlify / Fly / Supabase / DeepSeek / 腾讯云）
 *   收入 revenue → ASC Trends
 *   评论 comments → 小红书 + App Store Connect Ratings
 *
 *   npm run chrome:debug   # 先开真 Chrome 登录
 *   npm run patrol:comments
 *
 * 个人控制台深链请写在 .env.local（勿提交）：
 *   PATROL_CLOUDFLARE_URL / PATROL_NETLIFY_URL / PATROL_FLY_URL /
 *   PATROL_SUPABASE_URL / PATROL_DEEPSEEK_URL / PATROL_TENCENT_URL /
 *   PATROL_ASC_RATINGS_URL / PATROL_XHS_NOTE_URLS / PATROL_XHS_KEYWORD
 */

function splitEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function envUrl(name) {
  const v = (process.env[name] || "").trim();
  return v || null;
}

const NAV = {
  revenue: ["Trends", "Sales and Trends", "Sales", "App Analytics", "趋势"],
  costs: ["Inbox", "Primary", "Important"],
  status: [
    "Sites",
    "Projects",
    "Overview",
    "Deployments",
    "Usage",
    "Analytics",
    "Workers",
    "生产",
  ],
  /** ASC 侧栏专用（不要和 XHS「消息/通知」混用） */
  ascRatings: ["Ratings and Reviews", "Ratings", "Reviews", "评价与评论"],
  xhsInbox: ["消息", "通知"],
};

/**
 * Gmail 账单：每个供应商「发件人 + 专属主题词」一组（OR 起来）。
 * 覆盖整条链接：PATROL_COSTS_URLS=https://mail.google.com/...
 */
const BILL_RULES = [
  {
    from: ['"Fly.io, Inc."', "fly.io"],
    subject: ['"Your receipt from Fly.io"', "receipt"],
  },
  {
    from: ["Cloudflare", "cloudflare.com"],
    subject: [
      '"[Confirmation] Purchase confirmed"',
      '"Your invoice is available"',
      "invoice",
    ],
  },
];

const GMAIL_BILL_QUERY = BILL_RULES.map((r) => {
  const fromPart = r.from.map((f) => `from:${f}`).join(" OR ");
  const subPart = r.subject.map((s) => `subject:${s}`).join(" OR ");
  return `((${fromPart}) (${subPart}))`;
}).join(" OR ");

const GMAIL_BILLS =
  "https://mail.google.com/mail/u/0/#search/" +
  encodeURIComponent(GMAIL_BILL_QUERY);

/**
 * 深链：通用入口可留仓库；带账号 / org / 实例 ID 的只从 .env.local 读。
 */
const DEEP_LINKS = {
  netlifyBilling: envUrl("PATROL_NETLIFY_URL"),
  flyBilling: envUrl("PATROL_FLY_URL"),
  cloudflareDomains: envUrl("PATROL_CLOUDFLARE_URL"),
  supabaseUsage: envUrl("PATROL_SUPABASE_URL"),
  deepseekUsage:
    envUrl("PATROL_DEEPSEEK_URL") || "https://platform.deepseek.com/usage",
  tencentConsole: envUrl("PATROL_TENCENT_URL"),
  ascTrends: "https://appstoreconnect.apple.com/trends/insights?pageid=8",
  /** 稳定深链：/distribution/ratings/ios */
  ascRatings: envUrl("PATROL_ASC_RATINGS_URL"),
  xhsNotify: "https://www.xiaohongshu.com/notification",
  xhsSearch:
    "https://www.xiaohongshu.com/search_result?keyword=" +
    encodeURIComponent(process.env.PATROL_XHS_KEYWORD || "your-app"),
};

function statusUrls() {
  return [
    DEEP_LINKS.cloudflareDomains,
    DEEP_LINKS.netlifyBilling,
    DEEP_LINKS.flyBilling,
    DEEP_LINKS.supabaseUsage,
    DEEP_LINKS.deepseekUsage,
    DEEP_LINKS.tencentConsole,
  ].filter(Boolean);
}

function commentsUrls() {
  const urls = [];
  if (DEEP_LINKS.ascRatings) urls.push(DEEP_LINKS.ascRatings);
  urls.push(...(splitEnv("PATROL_XHS_NOTE_URLS") || []));
  return urls;
}

const CORE_MODULES = {
  revenue: {
    id: "revenue",
    label: "收入",
    urls: [DEEP_LINKS.ascTrends],
    navClicks: [],
    hostHints: ["appstoreconnect.apple.com"],
    scrollPasses: 4,
    settleMs: 5000,
  },

  costs: {
    id: "costs",
    label: "成本",
    urls: [GMAIL_BILLS],
    navClicks: [],
    hostHints: ["mail.google.com"],
    scrollPasses: 3,
    settleMs: 5000,
    gmailEnrich: true,
  },

  status: {
    id: "status",
    label: "监控",
    urls: statusUrls(),
    navClicks: [],
    hostHints: [
      "dash.cloudflare.com",
      "app.netlify.com",
      "fly.io",
      "supabase.com",
      "platform.deepseek.com",
      "cloud.tencent.com",
      "qcloud.com",
    ],
    scrollPasses: 3,
    settleMs: 5000,
  },

  comments: {
    id: "comments",
    label: "评论",
    urls: commentsUrls(),
    navClicks: [],
    ascNavClicks: NAV.ascRatings,
    xhsNavClicks: [],
    hostHints: ["appstoreconnect.apple.com", "xiaohongshu.com"],
    scrollPasses: 6,
    settleMs: 6000,
    xhsEnrich: true,
  },
};

module.exports = {
  profileDir: ".launchshadow-chrome",
  CORE_MODULES,
  DEEP_LINKS,
  NAV,
  GMAIL_BILLS,
  BILL_RULES,

  modules: {
    revenue: {
      ...CORE_MODULES.revenue,
      urls: splitEnv("PATROL_REVENUE_URLS") || CORE_MODULES.revenue.urls,
    },
    costs: {
      ...CORE_MODULES.costs,
      urls: splitEnv("PATROL_COSTS_URLS") || CORE_MODULES.costs.urls,
    },
    status: {
      ...CORE_MODULES.status,
      urls: splitEnv("PATROL_STATUS_URLS") || CORE_MODULES.status.urls,
    },
    comments: {
      ...CORE_MODULES.comments,
      urls: splitEnv("PATROL_COMMENTS_URLS") || CORE_MODULES.comments.urls,
    },
  },
};
