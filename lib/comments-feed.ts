/**
 * Parse 小红书 + App Store Connect ratings/reviews from patrol captures.
 */

export type CommentPlatform = "xiaohongshu" | "appstore";

export type FeedComment = {
  id: string;
  author: string;
  body: string;
  rating?: number;
  likes?: string;
  time?: string;
  platform: CommentPlatform;
  source:
    | "xhs-note"
    | "xhs-notification"
    | "xhs-search"
    | "asc-ratings"
    | "unknown";
};

export type CommentsViz = {
  kind: "comments-feed";
  total: number;
  xhsCount: number;
  ascCount: number;
  comments: FeedComment[];
  sources: string[];
  scannedAt?: string;
};

type Item = { text?: string; app?: string; ts?: string; url?: string };

/** ASC 控制台侧栏 / 页头 —— 绝不是用户评价 */
const ASC_UI_LINE =
  /^(ChunkFlow|Distribution|Analytics|TestFlight|iOS App|Add Platform|General|App Information|App Review|History|App Store|TRUST & SAFETY|App Privacy|App Accessibility|Ratings and Reviews|GROWTH & MARKETING|In-App Events|Custom Product Pages|Asset Library|Product Page Optimization|Promo Codes|Game Center|MONETIZATION|Pricing and Availability|In-App Purchases|Subscriptions|FEATURING|Nominations|iOS Ratings and Reviews|All Countries or Regions|iOS Ratings|out of 5|\d+\s*Ratings|Most Recent Reviews.*|All Versions|All Ratings|All Reviews|Reply|Report a Concern|New|Waiting for Review|Ready for Distribution|Filters|Export|Respond|App Store Connect)$/i;

function looksLikeAscChrome(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (ASC_UI_LINE.test(t)) return true;
  if (/Product Page Optimization|Custom Product Pages|Pricing and Availability|In-App (Events|Purchases)|Asset Library|Promo Codes|Game Center|Nominations/i.test(t))
    return true;
  if (/^(Distribution|Analytics|TestFlight)[A-Za-z]*$/i.test(t)) return true;
  if (/^Version\s+[\d.]+/i.test(t)) return true;
  if (/^[\d.]+\s*(Waiting for Review|Ready for Distribution)/i.test(t))
    return true;
  return false;
}

function looksLikeUiChrome(line: string) {
  const t = line.trim();
  if (looksLikeAscChrome(t)) return true;
  if (/^展开\s*\d+\s*条回复/.test(t)) return true;
  if (/^(回复|作者|置顶|评论了|回复了)$/.test(t)) return true;
  return /^(首页|发现|发布|消息|我|关注|商城|直播|搜索|分享|点赞|收藏|评论|转发|发送|登录|注册|打开App|下载|复制链接|举报|不感兴趣|说点什么|Ratings|Reviews|App Store Connect|Filters|Export|Respond)$/i.test(
    t
  );
}

/** 作者 / 客服回复 —— 不当作用户评价 */
export function looksLikeCreatorReply(text: string): boolean {
  const t = (text || "").trim();
  return /^(非常感谢你的喜欢|感谢支持|亲[，,]|你好呀|官方|客服|已收到你的反馈|目前只支持|你好，你可以通过|不是哦，可能是撞名)/.test(
    t
  );
}

/**
 * 误把昵称当正文：author=「回复」+ body=用户名，或正文本身就是短 handle。
 */
function looksLikeUsernameOnly(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 28) return false;
  if (/展开\s*\d+\s*条回复/.test(t)) return true;
  // 有标点 / 较长中文句子 → 不像昵称
  if (/[。！？!?,，、：:]/.test(t)) return false;
  if (/[\u4e00-\u9fff]{6,}/.test(t)) return false;
  if (
    /(好用|推荐|法语|学习|app|软件|贵|网络|安卓|口语|发音|创新|喜欢|支持)/i.test(
      t
    )
  ) {
    return false;
  }
  // 短 handle：bujiang / Aeon_a / Fiona Ca / 7bike4fun / Aline🖤
  if (/^[\w.\-@+#·]+$/i.test(t) && t.length <= 24) return true;
  if (
    /^[\w.\-@+#·\u4e00-\u9fff\u{1F300}-\u{1FAFF}]+$/u.test(t) &&
    t.length <= 18 &&
    !/[的了是我你在有和]/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * 笔记标题 / 营销钩子（不是用户评论）。
 * 例：「自学法语必备｜彻底解决法语开口难的app来了」
 */
export function looksLikeNoteTitle(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 6) return false;
  if (/[|｜]/.test(t) && /(必备|来了|推荐|解决|彻底|App|app|神器|干货)/i.test(t))
    return true;
  if (/^#/.test(t) || /#[\u4e00-\u9fffA-Za-z]{2,}/.test(t)) return true;
  if (/(必备|来了|神器|干货合集|保姆级|手把手).{0,12}(app|App|软件)/i.test(t))
    return true;
  if (/^(自学|零基础).{0,8}(必备|推荐)/.test(t) && t.length < 40) return true;
  if (/app来了|App来了|软件来了/i.test(t)) return true;
  return false;
}

/** 是否像真实用户评价正文（供星云 / LLM 过滤） */
export function isUserReviewBody(line: string): boolean {
  const t = (line || "").trim();
  if (t.length < 6 || t.length > 500) return false;
  if (looksLikeUiChrome(t) || looksLikeNoteTitle(t) || looksLikeAscChrome(t))
    return false;
  if (looksLikeCreatorReply(t) || looksLikeUsernameOnly(t)) return false;
  if (/^[\d.万+]+$/.test(t)) return false;
  if (/^(共\s*\d+\s*条评论|说点什么)/.test(t)) return false;
  // 纯控制台英文短语（Optimization / Regions / Availability…）
  if (
    /^[A-Za-z][A-Za-z\s&-]{2,40}$/.test(t) &&
    /^(Product|Page|Optimization|Regions?|Availability|Distribution|Application|Analytics|Recent|General|History|Privacy|Accessibility|Subscriptions?|Nominations?|Featuring|Monetization|Growth|Marketing|Safety|Library|Codes?)$/i.test(
      t
    )
  ) {
    return false;
  }
  return true;
}

function detectPlatform(item: Item): CommentPlatform | null {
  const blob = `${item.url || ""} ${item.app || ""} ${item.text?.slice(0, 300) || ""}`;
  if (/xiaohongshu\.com|小红书/i.test(blob)) return "xiaohongshu";
  if (/appstoreconnect\.apple\.com|Ratings and Reviews|Customer Reviews/i.test(blob))
    return "appstore";
  return null;
}

function xhsSource(url?: string): FeedComment["source"] {
  if (!url) return "unknown";
  if (/notification/i.test(url)) return "xhs-notification";
  if (/search_result|search\?/i.test(url)) return "xhs-search";
  if (/explore\/|discovery\/item|\/note\//i.test(url)) return "xhs-note";
  return "unknown";
}

function parseXhsItem(item: Item): FeedComment[] {
  const text = item.text || "";
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: FeedComment[] = [];
  const src = xhsSource(item.url);

  for (const line of lines) {
    const m = line.match(
      /^(.{1,24}?)\s*(评论了你|回复了你|提到了你)[:：]?\s*(.+)$/
    );
    if (m && isUserReviewBody(m[3])) {
      out.push({
        id: `xhs-n-${out.length}-${m[1]}`,
        author: m[1].trim(),
        body: m[3].trim(),
        platform: "xiaohongshu",
        source: "xhs-notification",
      });
    }
  }

  // 笔记页：只从「共 N 条评论」之后抽楼中楼，前面是标题/正文/话题
  let start = 0;
  const commentHdr = lines.findIndex((l) => /共\s*\d+\s*条评论/.test(l));
  if (commentHdr >= 0) start = commentHdr + 1;
  else if (src === "xhs-note") {
    // 找不到评论区标记时，宁可不抽「作者+下一行」，避免把标题当评论
    return out;
  }

  for (let i = start; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (looksLikeUiChrome(a) || looksLikeUiChrome(b)) continue;
    if (looksLikeNoteTitle(a) || looksLikeNoteTitle(b)) continue;
    // 「回复」当作者 + 昵称当正文 —— 展开回复区的错位
    if (/^(回复|作者|置顶)$/.test(a)) continue;
    if (looksLikeUsernameOnly(a) && looksLikeUsernameOnly(b)) continue;
    if (a.length < 2 || a.length > 24) continue;
    if (!isUserReviewBody(b)) continue;
    if (looksLikeCreatorReply(b)) continue;
    if (/^[\d.万]+$/.test(a)) continue;
    if (/^(刚刚|\d+\s*(分钟|小时|天)前|昨天|前天|\d{1,2}-\d{1,2})/.test(b))
      continue;
    if (/https?:|登录/.test(a) && a.length > 12) continue;
    // 作者行本身像标题也不要
    if (/[|｜#]/.test(a)) continue;

    const next = lines[i + 2] || "";
    const time =
      /^(刚刚|\d+\s*(分钟|小时|天)前|昨天|前天|\d{1,2}月\d{1,2}日)/.test(next)
        ? next
        : undefined;
    const likes = /^\d+$/.test(next) ? next : undefined;

    out.push({
      id: `xhs-c-${out.length}-${a.slice(0, 8)}`,
      author: a,
      body: b,
      time,
      likes,
      platform: "xiaohongshu",
      source: src === "unknown" ? "xhs-note" : src,
    });
    i += 1;
  }

  return out;
}

/**
 * ASC Ratings 文本结构（实测）：
 *   标题（可选）
 *   Oct 3, 2026 - 作者
 *   评价正文…
 *   Reply / Report a Concern
 *   Version x.y - Territory
 */
const ASC_DATE_AUTHOR =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s*[-–—]\s*(.+)$/i;

function parseAscItem(item: Item): FeedComment[] {
  const text = item.text || "";
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: FeedComment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ASC_DATE_AUTHOR);
    if (!m) continue;

    const author = (m[2] || "App Store user").trim().slice(0, 40);
    const prev = i > 0 ? lines[i - 1] : "";
    const title =
      prev &&
      !looksLikeAscChrome(prev) &&
      !ASC_DATE_AUTHOR.test(prev) &&
      prev.length >= 2 &&
      prev.length <= 80
        ? prev
        : "";

    const parts: string[] = [];
    for (let j = i + 1; j < lines.length && j < i + 10; j++) {
      const L = lines[j];
      if (/^(Reply|Report a Concern)/i.test(L)) break;
      if (/^Version\s+[\d.]+/i.test(L)) break;
      if (ASC_DATE_AUTHOR.test(L)) break;
      if (looksLikeAscChrome(L) || looksLikeUiChrome(L)) continue;
      if (L.length < 2) continue;
      parts.push(L);
    }

    let body = parts.join(" ").trim();
    // 只有标题没有正文时（短评），用标题当评价
    if (!body && title) body = title;
    else if (title && body && title.length <= 60 && !body.includes(title)) {
      // 标题 + 正文合并，便于星云抽词
      body = `${title}。${body}`;
    }

    if (!body || !isUserReviewBody(body)) continue;
    if (looksLikeAscChrome(body)) continue;

    out.push({
      id: `asc-${out.length}-${author.slice(0, 8)}`,
      author,
      body: body.slice(0, 480),
      platform: "appstore",
      source: "asc-ratings",
    });
  }

  return out;
}

export function parseCommentsFeed(items: Item[]): CommentsViz {
  const comments: FeedComment[] = [];
  const sources = new Set<string>();
  let scannedAt: string | undefined;

  for (const item of items) {
    if (!item.text || item.text.length < 40) continue;
    if (item.url) sources.add(item.url);
    if (item.ts && (!scannedAt || item.ts > scannedAt)) scannedAt = item.ts;

    const platform = detectPlatform(item);
    if (platform === "xiaohongshu") {
      comments.push(...parseXhsItem(item));
    } else if (platform === "appstore") {
      comments.push(...parseAscItem(item));
    } else if (/xiaohongshu|小红书/i.test(item.text)) {
      comments.push(...parseXhsItem(item));
    } else if (/Ratings|Reviews|App Store/i.test(item.text)) {
      comments.push(...parseAscItem(item));
    }
  }

  const seen = new Set<string>();
  const unique = comments.filter((c) => {
    if (!isUserReviewBody(c.body)) return false;
    if (looksLikeCreatorReply(c.body)) return false;
    if (/^(回复|作者|置顶)$/.test((c.author || "").trim())) return false;
    if (looksLikeUsernameOnly(c.body)) return false;
    const k = `${c.platform}::${c.author}::${c.body}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const xhsCount = unique.filter((c) => c.platform === "xiaohongshu").length;
  const ascCount = unique.filter((c) => c.platform === "appstore").length;

  return {
    kind: "comments-feed",
    total: unique.length,
    xhsCount,
    ascCount,
    comments: unique,
    sources: [...sources],
    scannedAt,
  };
}

/** @deprecated alias — prefer parseCommentsFeed */
export const parseXhsComments = parseCommentsFeed;
