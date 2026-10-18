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
 * 小红书笔记深链：
 *   PATROL_XHS_NOTE_URLS=https://www.xiaohongshu.com/explore/xxxx,...
 *   PATROL_XHS_KEYWORD=ChunkFlow
 * ASC 评价页：
 *   PATROL_ASC_RATINGS_URL=https://appstoreconnect.apple.com/apps/.../ratings
 */

function splitEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
 * 不同发件人关键词本来就不一样 —— 继续按这个格式往 BILL_RULES 里加即可。
 *
 * 覆盖整条链接：PATROL_COSTS_URLS=https://mail.google.com/...
 */
const BILL_RULES = [
  // 你提供的准确规则：发件人 × 主题（各供应商不同）
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
  // 继续追加，例如：
  // { from: ["Netlify", "netlify.com"], subject: ["invoice", "receipt", "billing"] },
  // { from: ["Supabase", "supabase.com"], subject: ["invoice", "receipt"] },
  // { from: ['"X Subscription"'], subject: ["receipt"] },
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
 * 深链（直接打开）
 * 成本：Gmail 精确账单搜索
 * 监控：CF / Netlify / Fly / Supabase / DeepSeek / 腾讯云
 * 收入：ASC Trends Insights
 *
 * 腾讯云可覆盖：PATROL_TENCENT_URL=https://console.cloud.tencent.com/...
 */
const DEEP_LINKS = {
  netlifyBilling:
    "https://app.netlify.com/teams/zhangyihuan0301/billing/general#content",
  flyBilling: "https://fly.io/dashboard/yihuan-227/billing",
  cloudflareDomains:
    "https://dash.cloudflare.com/168fef0b1e7e1631140a33e1c880bf01/domains/overview",
  supabaseUsage:
    "https://supabase.com/dashboard/org/dqhfurerclflwieyeekj/usage?projectRef=vlyhuejpsebsduuhvniw",
  deepseekUsage: "https://platform.deepseek.com/usage",
  tencentConsole:
    process.env.PATROL_TENCENT_URL ||
    "https://console.cloud.tencent.com/expense/overview",
  ascTrends: "https://appstoreconnect.apple.com/trends/insights?pageid=8",
  /** ChunkFlow ASC Ratings（可用 PATROL_ASC_RATINGS_URL 覆盖）
   *  实测稳定深链是 /distribution/ratings/ios（不要用无 /ios 的短链，登录后常被甩到 /apps） */
  ascRatings:
    process.env.PATROL_ASC_RATINGS_URL ||
    "https://appstoreconnect.apple.com/apps/6795199051/distribution/ratings/ios",
  /** 小红书：通知 inbox（看评论/赞） */
  xhsNotify: "https://www.xiaohongshu.com/notification",
  /** 关键词搜索结果（打开后再点进笔记） */
  xhsSearch:
    "https://www.xiaohongshu.com/search_result?keyword=" +
    encodeURIComponent(process.env.PATROL_XHS_KEYWORD || "ChunkFlow"),
};

const CORE_MODULES = {
  revenue: {
    id: "revenue",
    label: "收入",
    urls: [DEEP_LINKS.ascTrends],
    navClicks: [], // 深链已到位，不再乱点
    hostHints: ["appstoreconnect.apple.com"],
    scrollPasses: 4,
    settleMs: 5000,
  },

  costs: {
    id: "costs",
    label: "成本",
    // 账单邮件；平台用量归监控模块
    urls: [GMAIL_BILLS],
    navClicks: [],
    hostHints: ["mail.google.com"],
    scrollPasses: 3,
    settleMs: 5000,
    /** 点开确认/收据邮件，列表预览常截断金额 */
    gmailEnrich: true,
  },

  status: {
    id: "status",
    label: "监控",
    urls: [
      DEEP_LINKS.cloudflareDomains,
      DEEP_LINKS.netlifyBilling,
      DEEP_LINKS.flyBilling,
      DEEP_LINKS.supabaseUsage,
      DEEP_LINKS.deepseekUsage,
      DEEP_LINKS.tencentConsole,
    ],
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
    // ASC 评价 + 小红书笔记深链（默认只抓笔记，不刷消息/搜索）
    urls: [
      DEEP_LINKS.ascRatings,
      ...(splitEnv("PATROL_XHS_NOTE_URLS") || []),
    ],
    // 按主机分流，避免 ASC 点到「消息」或卡在版本页
    navClicks: [],
    ascNavClicks: NAV.ascRatings,
    xhsNavClicks: [],
    hostHints: ["appstoreconnect.apple.com", "xiaohongshu.com"],
    scrollPasses: 6,
    settleMs: 6000,
    /** 小红书页：点开评论区再滚 */
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
