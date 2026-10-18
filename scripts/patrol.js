/**
 * LaunchShadow 巡逻
 *
 *   npm run patrol:core
 *
 * 若某站跳登录 / 二次验证：终端会暂停，你在浏览器里登完后按 Enter 继续。
 */

const path = require("path");
const os = require("os");
const fs = require("fs");
const readline = require("readline");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

/** 加载仓库根目录 .env.local（不覆盖已有 process.env） */
function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

const {
  profileDir,
  modules,
  CORE_MODULES,
} = require("../config/patrol-targets");
const { acceptCookies } = require("./lib/accept-cookies");

const userDataDir =
  process.env.PATROL_PROFILE || path.join(os.homedir(), profileDir);

const CACHE_PATH = path.join(__dirname, "..", "data", "patrol-cache.json");
const STATUS_PATH = path.join(__dirname, "..", "data", "patrol-status.json");

function writePatrolStatus(patch) {
  try {
    fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    let prev = {};
    if (fs.existsSync(STATUS_PATH)) {
      try {
        prev = JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
      } catch {
        prev = {};
      }
    }
    const next = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STATUS_PATH, JSON.stringify(next, null, 2));
  } catch {
    /* ignore */
  }
}

function moduleUrls(mod) {
  if (Array.isArray(mod.urls) && mod.urls.length) return mod.urls;
  if (mod.url) return [mod.url];
  return [];
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return { updatedAt: null, modules: {} };
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

/** Rebuild data/comments-structured.md after comments Sync. */
function refreshCommentsStructuredMd() {
  const script = path.join(__dirname, "write-comments-structured.js");
  try {
    execFileSync(process.execPath, [script], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "inherit", "inherit"],
      timeout: 30000,
    });
  } catch (err) {
    console.warn(
      "[patrol] comments-structured.md refresh failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/** mail.google.com 未登录时常被甩到 Workspace 营销页（不是收件箱） */
function isGmailMarketing(url, text) {
  const u = (url || "").toLowerCase();
  if (/workspace\.google\.com/.test(u)) return true;
  const head = (text || "").slice(0, 2500);
  if (
    /Get more done with Gmail|Create an account|For work/i.test(head) &&
    !/收件箱|写邮件|Primary|Compose|Inbox/i.test(head)
  ) {
    return true;
  }
  return false;
}

/**
 * 只认「很像真的登录墙」——以前太严，Cloudflare 页面里的 challenge 等词
 * 会误杀已登录页面。
 */
function looksBlocked(url, text) {
  const u = (url || "").toLowerCase();
  const head = (text || "").slice(0, 2500).toLowerCase();

  if (isGmailMarketing(url, text)) {
    return { blocked: true, reason: "gmail marketing page (not signed in)" };
  }

  // 明确跳到了身份提供商 / 登录路径
  if (
    /appleid\.apple\.com|idmsa\.apple\.com|accounts\.google\.com|login\.fly\.io|auth0\.com|okta\.com/.test(
      u
    ) ||
    /\/login\b|\/signin\b|\/sign-in\b|\/authenticate\b/.test(u)
  ) {
    return { blocked: true, reason: `login url: ${u}` };
  }

  // 正文很短 + 明显登录文案
  if (
    head.length < 1200 &&
    /(sign in to (continue|apple|cloudflare|netlify|fly)|log in to (continue|your account)|enter your password|扫码登录|请登录)/i.test(
      head
    )
  ) {
    return { blocked: true, reason: "short page + login copy" };
  }

  // 二次验证（仍要页面不太长，避免误伤）
  if (
    head.length < 4000 &&
    /(two-factor authentication|authenticator app|enter (the )?(6|verification|authentication) code|verify (your )?(identity|device)|二次验证|人机验证)/i.test(
      head
    )
  ) {
    return { blocked: true, reason: "2FA / verification copy" };
  }

  return { blocked: false, reason: "" };
}

/** 小红书笔记弹层：找到右侧可滚动栏（正文+评论），不要滚整页背景 */
async function findXhsNoteScroller(page) {
  return page.evaluate(() => {
    const mark = (el, via) => {
      el.setAttribute("data-patrol-xhs-scroller", "1");
      return { ok: true, via };
    };

    // 0) 官方右栏 scroller（实测 class：note-scroller）
    const known = document.querySelector(
      ".note-scroller, [class*='note-scroller'], [class*='NoteScroller']"
    );
    if (known && known.scrollHeight > known.clientHeight + 20) {
      return mark(known, "note-scroller");
    }

    const isScrollable = (el) => {
      if (!el || el === document.body || el === document.documentElement) {
        return false;
      }
      const st = getComputedStyle(el);
      const oy = st.overflowY;
      const canOverflow =
        oy === "auto" || oy === "scroll" || oy === "overlay";
      return canOverflow && el.scrollHeight > el.clientHeight + 24;
    };

    const walkUp = (el) => {
      let n = el;
      while (n && n !== document.body) {
        if (isScrollable(n)) return n;
        // 有些容器 overflow 写在父级但自身更高
        if (n.scrollHeight > n.clientHeight + 40) return n;
        n = n.parentElement;
      }
      return null;
    };

    // 1) 从「说点什么…」评论框往上找（一定在右侧栏底部）
    const nodes = Array.from(
      document.querySelectorAll("textarea, input, [contenteditable], div, span")
    );
    const say = nodes.find((el) => {
      const ph = (
        el.getAttribute("placeholder") ||
        el.getAttribute("aria-placeholder") ||
        ""
      ).trim();
      const t = (el.textContent || "").trim();
      return /说点什么|写评论|Add a comment|Leave a comment/i.test(ph || t);
    });
    if (say) {
      const hit = walkUp(say);
      if (hit) {
        hit.setAttribute("data-patrol-xhs-scroller", "1");
        return { ok: true, via: "say-something" };
      }
    }

    // 2) 从「共 N 条评论」往上找
    const commentMark = Array.from(document.querySelectorAll("div, span")).find(
      (el) => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        return (
          t.length < 40 &&
          (/共\s*\d+\s*条评论/.test(t) || /^评论\s*\d+$/.test(t))
        );
      }
    );
    if (commentMark) {
      const hit = walkUp(commentMark);
      if (hit) {
        hit.setAttribute("data-patrol-xhs-scroller", "1");
        return { ok: true, via: "comment-mark" };
      }
    }

    // 3) 视口右半边、面积最大的可滚动块（笔记弹层右栏）
    let best = null;
    let bestScore = 0;
    for (const el of document.querySelectorAll("div, section, aside, main")) {
      const r = el.getBoundingClientRect();
      if (r.width < 220 || r.height < 240) continue;
      if (r.left < window.innerWidth * 0.32) continue; // 只要右边
      if (r.top > window.innerHeight * 0.85) continue;
      if (!isScrollable(el) && el.scrollHeight <= el.clientHeight + 40) continue;
      const score = Math.min(el.scrollHeight, 8000) * r.height;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.setAttribute("data-patrol-xhs-scroller", "1");
      return { ok: true, via: "right-panel" };
    }
    return { ok: false, via: "none" };
  });
}

async function measureXhsScroller(page) {
  return page.evaluate(() => {
    const el =
      document.querySelector("[data-patrol-xhs-scroller='1']") ||
      document.querySelector(".note-scroller");
    if (!el) return null;
    const t = (el.innerText || "").slice(-280);
    // 只认列表尾部固定文案，避免评论里「到底了」误伤
    const endCopy =
      /(^|\n)\s*(暂时没有更多(?:评论|了)?|没有更多了|已加载全部)\s*($|\n)/m.test(
        t
      ) || /^-?\s*THE END\s*-?$/m.test(t);
    return {
      y: el.scrollTop,
      h: el.scrollHeight,
      clientH: el.clientHeight,
      endCopy,
    };
  });
}

/** 右栏滚动：优先 wheel（才能触发评论懒加载），scrollTop 仅作辅 */
async function scrollXhsNotePanel(page, delta = 720) {
  const found = await findXhsNoteScroller(page);
  const before = await measureXhsScroller(page);

  const box = await page
    .locator("[data-patrol-xhs-scroller='1'], .note-scroller")
    .first()
    .boundingBox()
    .catch(() => null);

  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.62);
    await page.mouse.wheel(0, delta);
  } else {
    const vp = page.viewportSize() || { width: 1400, height: 900 };
    await page.mouse.move(vp.width * 0.72, vp.height * 0.45);
    await page.mouse.wheel(0, delta);
  }

  // scrollTop 兜底（部分环境 wheel 不生效）
  await page.evaluate((dy) => {
    const el =
      document.querySelector("[data-patrol-xhs-scroller='1']") ||
      document.querySelector(".note-scroller");
    if (!el) return;
    el.scrollTop = el.scrollTop + dy;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, delta);

  const after = await measureXhsScroller(page);
  return {
    found,
    result: after
      ? {
          ok: true,
          before: before?.y ?? 0,
          after: after.y,
          h: after.h,
          clientH: after.clientH,
          endCopy: after.endCopy,
        }
      : { ok: false },
  };
}

/** 点右下角评论气泡（.chat-wrapper + 数字），才会滚到评论楼 */
async function clickXhsCommentBubble(page) {
  const chat = page.locator(
    ".engage-bar .chat-wrapper, .interact-container .chat-wrapper, .buttons.engage-bar-style .chat-wrapper"
  ).first();

  try {
    await chat.waitFor({ state: "visible", timeout: 4000 });
    const box = await chat.boundingBox().catch(() => null);
    if (box && box.x >= 500) {
      const before = await page.evaluate(
        () => document.querySelector(".note-scroller")?.scrollTop || 0
      );
      await chat.click({ timeout: 2500 });
      // 等右栏跳到评论区（通常 <400ms），最多等 800ms
      await page
        .waitForFunction(
          (prev) =>
            (document.querySelector(".note-scroller")?.scrollTop || 0) >
            prev + 40,
          before,
          { timeout: 800 }
        )
        .catch(() => {});
      const jumped = await page.evaluate(
        () => document.querySelector(".note-scroller")?.scrollTop || 0
      );
      console.log(`  → xhs: clicked comment bubble (scrollTop=${jumped})`);
      return true;
    }
  } catch {
    /* fallback below */
  }

  // 兜底：engage-bar 第三颗按钮坐标
  try {
    const bar = page
      .locator(".engage-bar .interact-container, .engage-bar .buttons")
      .first();
    const box = await bar.boundingBox({ timeout: 800 }).catch(() => null);
    if (box) {
      await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.5);
      await page.waitForTimeout(350);
      console.log("  → xhs: clicked comment via engage-bar coords");
      return true;
    }
  } catch {
    /* ignore */
  }
  console.warn("  → xhs: comment bubble not found");
  return false;
}

function isGmailThreadOpen(url) {
  // List: #search/query  or #inbox — open thread usually has /FMfc… or #all/…
  const u = url || "";
  if (/workspace\.google\.com/i.test(u)) return false;
  // Open conversation hashes look like …/#inbox/FMfc… or …/#search/…/FMfc…
  return /#[^/]+\/[A-Za-z0-9_-]{6,}/.test(u) || /\/FMfcgx/i.test(u);
}

/**
 * Open one Gmail row by subject — click subject / mid-row, NEVER the star.
 */
async function openGmailThreadBySubject(page, label) {
  const row = page
    .locator("tr.zA, tr[role='row'], div[role='listitem']")
    .filter({ hasText: label })
    .first();

  if ((await row.count().catch(() => 0)) === 0) return false;

  const before = page.url();

  // Prefer subject cell (span.bog = subject in classic Gmail)
  const subject = row.locator("span.bog, .y6 span.bqe, .y6 span, td.a4W").first();
  if ((await subject.count().catch(() => 0)) > 0) {
    await subject.click({ timeout: 4000 }).catch(() => null);
  } else {
    // Mid-row click: past checkbox + star columns (~left 18%)
    const box = await row.boundingBox().catch(() => null);
    if (!box) return false;
    await page.mouse.click(
      box.x + Math.max(box.width * 0.42, 120),
      box.y + box.height * 0.5
    );
  }

  await page.waitForTimeout(1800);

  // If URL unchanged, we likely hit star — retry mid-row once
  if (page.url() === before && !isGmailThreadOpen(page.url())) {
    console.warn(`  → gmail: click may have hit star — retry mid-row for 「${label.slice(0, 28)}」`);
    const box = await row.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
      await page.waitForTimeout(1800);
    }
  }

  // Conversation pane visible even if hash is weird
  const pane = await page
    .locator("h2.hP, div[data-message-id], div.a3s, div[role='list'] .ii")
    .first()
    .isVisible()
    .catch(() => false);

  return isGmailThreadOpen(page.url()) || pane || page.url() !== before;
}

/**
 * Gmail 账单搜索页：列表预览常截断金额（Cloudflare 的 $10.46 在正文里）。
 * 点开确认/收据邮件抓全文，再返回搜索列表。
 */
async function enrichGmailBills(page) {
  console.log("  → gmail: open bill threads for full amounts");
  const labels = [
    "[Confirmation] Purchase confirmed",
    "Your receipt from Fly.io",
    "Your invoice is available",
  ];
  const chunks = [];
  const startUrl = page.url();

  for (const label of labels) {
    // Always return to search list before next open
    if (!/#search\//i.test(page.url())) {
      await page.goto(startUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const opened = await openGmailThreadBySubject(page, label).catch(() => false);

    if (!opened) {
      console.log(`  → gmail: no/failed open 「${label.slice(0, 40)}」`);
      continue;
    }

    console.log(`  → gmail: opened thread 「${label.slice(0, 40)}」 @ ${page.url().slice(0, 72)}`);
    await page.waitForTimeout(800);
    const body = await capturePageText(page);
    if (body && body.length > 80) chunks.push(body);

    // Back to search results for the next label
    await page.goto(startUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    }).catch(async () => {
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    });
    await page.waitForTimeout(1600);
  }

  return chunks.join("\n\n--- gmail-thread ---\n\n");
}

/** 小红书笔记页：点评论气泡后滚右栏；懒加载涨高前不要误判到底 */
async function enrichXiaohongshu(page) {
  console.log("  → xhs: open comments then scroll right panel");

  await clickXhsCommentBubble(page);

  const found = await findXhsNoteScroller(page);
  console.log(
    `  → xhs: scroller ${found.ok ? "✓" : "✗"} (${found.via || "none"})`
  );

  const maxPasses = 28;
  let lastH = 0;
  let stableBottom = 0;
  let endHits = 0;

  for (let i = 1; i <= maxPasses; i++) {
    await scrollXhsNotePanel(page, 1100);
    // 等评论懒加载把 scrollHeight 撑高
    await page.waitForTimeout(600);

    const m = await measureXhsScroller(page);
    if (!m) {
      console.warn("  → xhs: scroller lost, stop");
      break;
    }

    const nearBottom = m.y + m.clientH >= m.h - 20;
    const grew = m.h > lastH + 40;
    if (m.h > lastH) lastH = m.h;

    // 尾语文案必须同时贴底，且连续 2 次，避免中途误停
    if (m.endCopy && nearBottom && !grew) {
      endHits += 1;
      if (endHits >= 2) {
        console.log(`  → xhs: end copy confirmed @ ${i}/${maxPasses}`);
        break;
      }
    } else {
      endHits = 0;
    }

    // 「贴底 + 高度连续不再涨」才算真到底（虚拟列表会先假贴底）
    if (nearBottom && !grew) {
      stableBottom += 1;
      if (stableBottom >= 4) {
        console.log(
          `  → xhs: comments bottom confirmed @ ${i}/${maxPasses} (h=${m.h})`
        );
        break;
      }
    } else {
      stableBottom = 0;
    }

    if (i === 1 || i % 3 === 0) {
      console.log(
        `  → xhs: scroll ${i}/${maxPasses} y=${Math.round(m.y)} h=${m.h}`
      );
    }
  }
}

async function tryNavClicks(page, labels = []) {
  for (const label of labels) {
    const re = new RegExp(`^\\s*${label}\\s*$|${label}`, "i");
    const candidates = [
      page.getByRole("link", { name: re }).first(),
      page.getByRole("button", { name: re }).first(),
      page.getByRole("menuitem", { name: re }).first(),
      page.getByText(re).first(),
    ];
    for (const loc of candidates) {
      try {
        if (!(await loc.isVisible({ timeout: 800 }).catch(() => false))) continue;
        console.log(`  → click nav: ${label}`);
        await loc.click({ timeout: 5000 });
        await page.waitForTimeout(1800);
        return true;
      } catch {
        /* next locator */
      }
    }
  }
  return false;
}

function ascAppIdFrom(pageUrl) {
  return (
    (pageUrl.match(/\/apps\/(\d+)/) || [])[1] ||
    (process.env.PATROL_ASC_APP_ID || "").trim() ||
    ""
  );
}

function ascRatingsUrlFrom(pageUrl) {
  if (process.env.PATROL_ASC_RATINGS_URL) {
    return process.env.PATROL_ASC_RATINGS_URL.trim();
  }
  const appId = ascAppIdFrom(pageUrl);
  if (!appId) return "";
  return `https://appstoreconnect.apple.com/apps/${appId}/distribution/ratings/ios`;
}

function isAscRatingsUrl(u) {
  return (
    /appstoreconnect\.apple\.com/i.test(u) &&
    /\/ratings(\/|$|\?)/i.test(u) &&
    !/version\/inflight/i.test(u)
  );
}

/** 登录后常停在 Apps 总列表，没有侧栏 Ratings */
function isAscAppsListUrl(u) {
  return (
    /appstoreconnect\.apple\.com\/apps\/?(\?|#|$)/i.test(u) &&
    !/appstoreconnect\.apple\.com\/apps\/\d+/i.test(u)
  );
}

/** 侧栏 / href 点进 Ratings（深链常被 ASC 重定向到 version/inflight） */
async function clickAscRatingsSidebar(page) {
  // 1) 优先点带 ratings 的真实链接（左侧 nav）
  const hrefClick = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href*='ratings']"));
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (/version/i.test(href)) continue;
      const r = a.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.left > 480) continue;
      a.click();
      return href;
    }
    return null;
  });
  if (hrefClick) {
    console.log(`  → asc: href click ${hrefClick.slice(0, 60)}`);
    await page.waitForTimeout(1800);
    await page.waitForURL(/ratings/i, { timeout: 12000 }).catch(() => {});
    if (isAscRatingsUrl(page.url())) return true;
  }

  // 2) 文案匹配（含中文）
  const hit = await page.evaluate(() => {
    const want = /ratings\s*and\s*reviews|评价与评论|Ratings\s*&\s*Reviews/i;
    const nodes = Array.from(
      document.querySelectorAll(
        "a, button, [role='link'], [role='menuitem'], nav span, nav div, aside span, aside div"
      )
    );
    for (const el of nodes) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 40) continue;
      if (!want.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.left > 480) continue;
      const target = el.closest("a, button, [role='link']") || el;
      target.click();
      return t;
    }
    return null;
  });
  if (hit) {
    console.log(`  → asc: sidebar click 「${hit}」`);
    await page.waitForTimeout(2000);
    await page.waitForURL(/ratings/i, { timeout: 12000 }).catch(() => {});
    return isAscRatingsUrl(page.url());
  }

  // 3) Playwright 强制点
  const loc = page
    .locator("a, button, [role='link']")
    .filter({ hasText: /^\s*Ratings and Reviews\s*$/i })
    .first();
  if (await loc.count().catch(() => 0)) {
    await loc.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.waitForURL(/ratings/i, { timeout: 10000 }).catch(() => {});
    if (isAscRatingsUrl(page.url())) return true;
  }

  return tryNavClicks(page, ["Ratings and Reviews", "评价与评论"]);
}

/**
 * ASC：不能停在 /apps 列表、version/inflight。
 * 登录后 Apple 常甩到图1(/apps) → 必须强跳图2(/ratings/ios)。
 */
async function ensureAscRatingsPage(page) {
  const start = page.url();
  if (!/appstoreconnect\.apple\.com/i.test(start)) return false;

  const appId = ascAppIdFrom(start);
  const ratingsUrl = ascRatingsUrlFrom(start);

  for (let attempt = 1; attempt <= 5; attempt++) {
    const now = page.url();
    if (isAscRatingsUrl(now)) {
      console.log(`  → asc: ✓ ratings ${now.slice(0, 88)}`);
      return true;
    }

    console.warn(`  → asc: attempt ${attempt}/5 @ ${now.slice(0, 72)}`);

    if (/\/login|idmsa\.apple|appleid\.apple/i.test(now)) {
      console.warn("  → asc: still on login — abort ensure");
      return false;
    }

    // 图1：Apps 总列表 — 没有侧栏，只能深链进图2
    if (isAscAppsListUrl(now) || !new RegExp(`/apps/${appId}/`, "i").test(now)) {
      console.log(`  → asc: leave apps list → ${ratingsUrl}`);
      await page
        .goto(ratingsUrl, { waitUntil: "domcontentloaded", timeout: 60_000 })
        .catch((e) => console.warn("  → asc: ratings goto", e.message || e));
      await page.waitForTimeout(1600);
      if (isAscRatingsUrl(page.url())) return true;

      // 仍在列表：点 ChunkFlow / 目标 App 卡片再进
      if (isAscAppsListUrl(page.url())) {
        const clickedApp = await page.evaluate((id) => {
          const a =
            document.querySelector(`a[href*="/apps/${id}"]`) ||
            Array.from(document.querySelectorAll("a")).find((el) =>
              /chunkflow/i.test(el.textContent || "")
            );
          if (a) {
            a.click();
            return a.getAttribute("href") || "app";
          }
          return null;
        }, appId);
        if (clickedApp) {
          console.log(`  → asc: clicked app ${String(clickedApp).slice(0, 50)}`);
          await page.waitForTimeout(2000);
        }
      }
    }

    if (isAscRatingsUrl(page.url())) return true;

    // 已在 App 内但非 ratings：点侧栏
    if (new RegExp(`/apps/${appId}/`, "i").test(page.url())) {
      await clickAscRatingsSidebar(page);
      await page.waitForTimeout(1000);
      if (isAscRatingsUrl(page.url())) {
        console.log(`  → asc: ✓ via sidebar ${page.url().slice(0, 88)}`);
        return true;
      }
    }

    // 再强跳一次 ratings/ios
    await page
      .goto(ratingsUrl, { waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch((e) => console.warn("  → asc: ratings goto2", e.message || e));
    await page.waitForTimeout(1400);
    if (isAscRatingsUrl(page.url())) return true;

    if (/version|inflight/i.test(page.url())) {
      console.warn("  → asc: redirected to version — re-click sidebar");
      await clickAscRatingsSidebar(page);
      await page.waitForTimeout(1500);
    }
  }

  const ok = isAscRatingsUrl(page.url());
  console.log(
    ok
      ? `  → asc: ✓ ${page.url().slice(0, 88)}`
      : `  → asc: ✗ 仍非评价页 ${page.url().slice(0, 88)}`
  );
  return ok;
}

/** 量当前页「最该滚」的容器（window 或内部 overflow） */
async function measurePageScroll(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    let best = {
      y: window.scrollY || root.scrollTop || 0,
      h: Math.max(root.scrollHeight, document.body?.scrollHeight || 0),
      vh: window.innerHeight,
    };

    const consider = (el) => {
      if (!el || el === document.documentElement) return;
      const st = window.getComputedStyle(el);
      const oy = st.overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return;
      if (el.scrollHeight <= el.clientHeight + 24) return;
      if (el.scrollHeight > best.h) {
        best = { y: el.scrollTop, h: el.scrollHeight, vh: el.clientHeight };
      }
    };

    document
      .querySelectorAll("main, [role='main'], aside, section, div")
      .forEach(consider);

    return best;
  });
}

function scrollNearBottom(m, slack = 12) {
  return m.y + m.vh >= m.h - slack;
}

/** ASC 评价页：等正文真正出来再滚（否则空壳会被当成「已到底」） */
async function waitForAscRatingsContent(page, timeoutMs = 25000) {
  console.log("  → asc: wait for ratings content…");
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const info = await page.evaluate(() => {
      const t = (document.body?.innerText || "").replace(/\s+\n/g, "\n").trim();
      const ready =
        t.length > 500 &&
        (/out of 5|Most Recent Reviews|Customer Reviews|Ratings and Reviews|All Versions|All Ratings/i.test(
          t
        ) ||
          /\d+(\.\d+)?\s*out of\s*5/i.test(t));
      return { ready, len: t.length };
    });
    if (info.ready) {
      console.log(`  → asc: content ready (${info.len} chars)`);
      return true;
    }
    await page.waitForTimeout(500);
  }
  console.warn("  → asc: content wait timeout");
  return false;
}

/** 展开「Most Recent Reviews」并量评价区高度 */
async function prepareAscReviewsPanel(page) {
  await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll("button, [role='button'], a, h2, h3, span, div")
    );
    for (const el of nodes) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/most recent reviews/i.test(t) || t.length > 48) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.left < 200) continue;
      (el.closest("button, [role='button'], a") || el).click();
      break;
    }
  });
  await page.waitForTimeout(600);
}

async function measureAscReviews(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const t = document.body?.innerText || "";
    // 评价卡片：带星级日期的块大致可数
    const starish = (t.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/gi) || [])
      .length;
    return {
      y: window.scrollY || root.scrollTop || 0,
      h: Math.max(root.scrollHeight, document.body?.scrollHeight || 0),
      vh: window.innerHeight,
      textLen: t.length,
      reviewHints: starish,
    };
  });
}

/**
 * ASC 专用：保持小步慢滚节奏；一旦滚不动立刻停（去掉到底后那几下空刷）。
 */
async function scrollAscRatingsUntilBottom(page, opts = {}) {
  const maxPasses = opts.maxPasses ?? 12;
  const delta = opts.delta ?? 420;
  const settleMs = opts.settleMs ?? 900;

  await prepareAscReviewsPanel(page);

  const vp = page.viewportSize() || { width: 1400, height: 900 };
  const mx = Math.floor(vp.width * 0.62);
  const my = Math.floor(vp.height * 0.58);

  let lastY = -1;

  for (let i = 1; i <= maxPasses; i++) {
    await page.mouse.move(mx, my);
    await page.mouse.click(mx, my).catch(() => {});
    await page.mouse.wheel(0, delta);
    await page.evaluate((dy) => {
      window.scrollBy(0, dy);
      const root = document.scrollingElement;
      if (root) root.scrollTop += dy;
    }, delta);
    await page.waitForTimeout(settleMs);

    const m = await measureAscReviews(page);
    const noMove = lastY >= 0 && Math.abs(m.y - lastY) < 8;
    console.log(
      `  → asc: scroll ${i}/${maxPasses} y=${Math.round(m.y)} h=${m.h} reviews≈${m.reviewHints}`
    );

    // 速度不变；只删掉「已经贴底还继续刷」的空下滑
    if (i >= 2 && noMove) {
      console.log(`  → asc: reviews bottom @ ${i}/${maxPasses}`);
      return;
    }
    lastY = m.y;
  }
  console.log(`  → asc: scroll cap ${maxPasses}`);
}

/**
 * 往下滚直到触底。空壳页面（高度≈视口、正文很短）绝不提前停。
 */
async function scrollUntilBottom(page, opts = {}) {
  const maxPasses = opts.maxPasses ?? 6;
  const delta = opts.delta ?? 900;
  const settleMs = opts.settleMs ?? 1200;
  const label = opts.label || "scroll";
  const minHeightSlack = opts.minHeightSlack ?? 180; // 内容要比视口高才算「可滚」
  const confirmNeeded = opts.confirmNeeded ?? 2;

  // 点主内容区再滚，避免滚到左边栏
  const vp = page.viewportSize() || { width: 1400, height: 900 };
  await page.mouse.move(vp.width * 0.58, vp.height * 0.5).catch(() => {});

  let lastH = 0;
  let stableBottom = 0;
  let stagnant = 0;

  for (let i = 1; i <= maxPasses; i++) {
    const before = await measurePageScroll(page);
    const textLen = (await capturePageText(page)).length;
    const hasRealPage = before.h > before.vh + minHeightSlack && textLen > 400;

    if (
      hasRealPage &&
      scrollNearBottom(before) &&
      before.h <= lastH + 20 &&
      i > 1
    ) {
      stableBottom += 1;
      if (stableBottom >= confirmNeeded) {
        console.log(
          `  → ${label}: already at bottom (confirmed) h=${before.h}`
        );
        return;
      }
    }

    console.log(`[patrol:${label}] scroll ${i}/${maxPasses}`);
    await page.mouse.move(vp.width * 0.58, vp.height * 0.55).catch(() => {});
    await page.mouse.wheel(0, delta);
    // 同步滚内部最高的 overflow 容器
    await page.evaluate((dy) => {
      const root = document.scrollingElement || document.documentElement;
      let best = null;
      let bestH = 0;
      for (const el of document.querySelectorAll("main, [role='main'], div")) {
        const st = getComputedStyle(el);
        if (!/(auto|scroll|overlay)/.test(st.overflowY)) continue;
        if (el.scrollHeight <= el.clientHeight + 40) continue;
        if (el.scrollHeight > bestH) {
          bestH = el.scrollHeight;
          best = el;
        }
      }
      if (best) best.scrollTop += dy;
      else window.scrollBy(0, dy);
      root.scrollTop += dy;
    }, delta);

    await page.waitForTimeout(settleMs + Math.floor(Math.random() * 300));

    const after = await measurePageScroll(page);
    const afterLen = (await capturePageText(page)).length;
    const realAfter = after.h > after.vh + minHeightSlack && afterLen > 400;
    const grew = after.h > lastH + 40;
    if (after.h > lastH) lastH = after.h;

    if (realAfter && scrollNearBottom(after) && !grew) {
      stableBottom += 1;
      if (stableBottom >= confirmNeeded) {
        console.log(
          `  → ${label}: reached bottom @ ${i}/${maxPasses} (h=${after.h})`
        );
        return;
      }
    } else {
      stableBottom = 0;
    }

    const moved =
      Math.abs(after.y - before.y) >= 8 || Math.abs(after.h - before.h) >= 8;
    if (!moved && realAfter) {
      stagnant += 1;
      if (stagnant >= 3) {
        console.log(`  → ${label}: no progress, stop @ ${i}/${maxPasses}`);
        return;
      }
    } else {
      stagnant = 0;
    }
  }
}

async function capturePageText(page) {
  try {
    return await page.evaluate(() => {
      const body = document.body;
      if (!body) return "";
      return (body.innerText || "").replace(/\s+\n/g, "\n").trim().slice(0, 12000);
    });
  } catch {
    return "";
  }
}

async function tryClearOverlay(page) {
  // 先接受 Cookie（Cloudflare 底部 Accept All Cookies 常导致页面发灰）
  await acceptCookies(page);

  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.body.style.pointerEvents = "auto";
      document.documentElement.style.pointerEvents = "auto";
    });
  } catch {
    /* ignore */
  }
}

/** 是否已离开登录墙（ASC 登录后常停在 /apps，也算已登录） */
function leftLoginWall(url) {
  const u = (url || "").toLowerCase();
  if (/idmsa\.apple\.com|appleid\.apple\.com|accounts\.google\.com/.test(u)) {
    return false;
  }
  // Gmail 未登录会被甩到营销页 —— 不算已登录
  if (/workspace\.google\.com/.test(u)) return false;
  if (/\/login\b|\/signin\b|\/sign-in\b|\/authenticate\b/.test(u)) {
    return false;
  }
  // ASC 根路径 https://appstoreconnect.apple.com/ 还在跳转中，别算已登录
  if (/^https?:\/\/appstoreconnect\.apple\.com\/?$/i.test(u)) {
    return false;
  }
  return true;
}

async function pageLooksLoggedIn(page) {
  try {
    const u = page.url();
    const t = await capturePageText(page);
    if (!leftLoginWall(u)) return false;
    if (isGmailMarketing(u, t)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync / UI：不跳过登录墙。打开 Chrome 后在窗口里登，脚本自动检测到就继续。
 * 终端模式：仍可用 Enter / s。
 */
async function waitForManualLogin(page, modId) {
  await tryClearOverlay(page);

  const fromUi = process.env.PATROL_FROM_UI === "1";
  // 旧开关：明确要求跳过时才 skip（默认 UI 不再 skip）
  if (process.env.PATROL_AUTO_SKIP === "1" && !fromUi) {
    console.warn(`  → [${modId}] PATROL_AUTO_SKIP=1，跳过登录墙`);
    return "skip";
  }

  writePatrolStatus({
    phase: "waiting_login",
    module: modId,
    message:
      "Chrome is open — sign in there. Sync continues automatically when you’re in.",
  });

  console.log(`
⚠️  [${modId}] 需要登录或二次验证
   → 请在弹出的 Chrome 窗口里完成登录（不用先手动跑 chrome:debug）
   → 登录成功后脚本会自动继续
   ${fromUi ? "   →（UI Sync：无终端，请只在 Chrome 里操作）" : "   → 也可按 Enter 继续，或输入 s 跳过"}
`);

  // Marketing page: push toward Google sign-in once
  try {
    const u0 = page.url();
    if (/workspace\.google\.com/i.test(u0)) {
      await page.goto("https://accounts.google.com/ServiceLogin?service=mail", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(1500);
    }
  } catch {
    /* ignore */
  }

  const deadline = Date.now() + (fromUi ? 5 * 60_000 : 10 * 60_000);

  if (fromUi) {
    while (Date.now() < deadline) {
      if (await pageLooksLoggedIn(page)) {
        console.log(`  → 检测到已登录 @ ${page.url().slice(0, 64)} — 自动继续`);
        writePatrolStatus({
          phase: "syncing",
          module: modId,
          message: "Login detected · continuing sync…",
        });
        await tryClearOverlay(page);
        await page.waitForTimeout(800);
        return "continue";
      }
      await page.waitForTimeout(1000);
    }
    writePatrolStatus({
      phase: "error",
      module: modId,
      message: "Login timed out — sign in in Chrome, then Sync again.",
    });
    return "skip";
  }

  const result = await new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      try {
        rl.close();
      } catch {
        /* ignore */
      }
      resolve(v);
    };

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("  登录后自动继续（或 Enter / s）… ", (answer) => {
      finish(answer.trim().toLowerCase() === "s" ? "skip" : "continue");
    });

    const timer = setInterval(async () => {
      try {
        if (Date.now() > deadline) {
          finish("skip");
          return;
        }
        if (await pageLooksLoggedIn(page)) {
          console.log(`\n  → 检测到已登录 @ ${page.url().slice(0, 64)} — 自动继续`);
          finish("continue");
        }
      } catch {
        /* page may be navigating */
      }
    }, 800);
  });

  if (result === "skip") return "skip";
  await tryClearOverlay(page);
  await page.waitForTimeout(1000);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  return "continue";
}

async function patrolUrl(page, mod, url, index, total) {
  console.log(`[patrol:${mod.id}] (${index}/${total}) → ${url}`);

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
  } catch (err) {
    console.warn(`  goto warn: ${err.message || err}`);
  }

  const isXhsNoteUrl =
    /xiaohongshu\.com\/(explore|discovery\/item)\//i.test(url);

  // 笔记页：等右栏/评论按钮就绪即可，别干等 settleMs（评论模块默认 6s）
  if (isXhsNoteUrl) {
    await page
      .locator(".note-scroller, .engage-bar .chat-wrapper")
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(200);
  } else {
    const settle = mod.settleMs ?? 4000;
    await page.waitForTimeout(settle);
    await page
      .waitForLoadState("networkidle", { timeout: 8000 })
      .catch(() => {});
  }
  await acceptCookies(page);

  let text = await capturePageText(page);
  let finalUrl = page.url();
  let check = looksBlocked(finalUrl, text);

  // Gmail：被甩到 workspace.google.com 营销页 → 先回真正的 mail.google.com
  if (
    /mail\.google\.com/i.test(url) &&
    isGmailMarketing(finalUrl, text)
  ) {
    console.warn(
      "  → gmail: landed on Workspace marketing page — forcing mail.google.com"
    );
    const inbox = "https://mail.google.com/mail/u/0/#inbox";
    try {
      await page.goto(inbox, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
    } catch (err) {
      console.warn("  gmail inbox goto warn:", err.message || err);
    }
    await page.waitForTimeout(2500);
    text = await capturePageText(page);
    finalUrl = page.url();
    check = looksBlocked(finalUrl, text);
  }

  if (check.blocked) {
    console.warn(`  检测到登录墙 (${check.reason})`);
    if (isGmailMarketing(finalUrl, text) || /accounts\.google\.com/i.test(finalUrl)) {
      console.warn(
        "  → 请在调试 Chrome 里登录 Gmail（mail.google.com），不要停在 workspace.google.com 广告页"
      );
    }
    const action = await waitForManualLogin(page, mod.id);
    if (action === "skip") {
      console.warn("  → 已跳过该 URL");
      return {
        url: finalUrl,
        requestedUrl: url,
        title: await page.title().catch(() => ""),
        text: "",
        blocked: true,
        capturedAt: new Date().toISOString(),
      };
    }
    // ASC：评论模块强跳 ratings；收入 Trends 必须回到 trends，不能踢去评价页
    const wantsAscRatings =
      mod.id === "comments" || /\/ratings\b/i.test(url);
    const resumeUrl =
      /appstoreconnect\.apple\.com/i.test(url) && wantsAscRatings
        ? ascRatingsUrlFrom(url)
        : url;
    console.log(`  → 登录后强跳 ${resumeUrl.slice(0, 80)}`);
    try {
      await page.goto(resumeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
    } catch (err) {
      console.warn("  goto after login warn:", err.message || err);
    }
    await page.waitForTimeout(2000);
    text = await capturePageText(page);
    finalUrl = page.url();
    check = looksBlocked(finalUrl, text);
  }

  const isXhsNote =
    /xiaohongshu\.com\/(explore|discovery\/item)\//i.test(finalUrl) ||
    isXhsNoteUrl;

  const isAsc =
    /appstoreconnect\.apple\.com/i.test(finalUrl) ||
    /appstoreconnect\.apple\.com/i.test(url);

  // ASC Ratings（comments）：别停在 version/inflight；进不去就放弃抓取
  // ASC Trends（revenue）：绝不能踢去 ratings，否则收入永远抓不到
  const wantsAscRatings =
    mod.id === "comments" || /\/ratings\b/i.test(url);
  if (isAsc && !check.blocked && wantsAscRatings) {
    const onRatings = await ensureAscRatingsPage(page);
    if (!onRatings || !isAscRatingsUrl(page.url())) {
      console.error(
        `  → asc: DEMO FAIL — 未进 Ratings，跳过抓取 @ ${page.url().slice(0, 80)}`
      );
      return {
        url: page.url(),
        requestedUrl: url,
        title: await page.title().catch(() => ""),
        text: "",
        blocked: true,
        error: "asc_not_on_ratings",
        capturedAt: new Date().toISOString(),
      };
    }
    // 登录刚跳进来时常是空壳——先等评价正文，再滚
    await waitForAscRatingsContent(page);
    text = await capturePageText(page);
    finalUrl = page.url();
  } else if (
    isAsc &&
    !check.blocked &&
    mod.id === "revenue" &&
    /trends/i.test(url)
  ) {
    if (!/trends/i.test(page.url())) {
      console.log(`  → asc: revenue resume Trends → ${url.slice(0, 72)}`);
      await page
        .goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
        .catch((e) => console.warn("  → asc: trends goto", e.message || e));
      await page.waitForTimeout(2500);
    }
    text = await capturePageText(page);
    finalUrl = page.url();
  } else if (
    !isXhsNote &&
    !check.blocked &&
    (mod.navClicks?.length || mod.xhsNavClicks?.length || mod.ascNavClicks?.length)
  ) {
    const labels = isAsc
      ? mod.ascNavClicks || mod.navClicks || []
      : /xiaohongshu\.com/i.test(finalUrl)
        ? mod.xhsNavClicks || mod.navClicks || []
        : mod.navClicks || [];
    if (labels.length) {
      await tryNavClicks(page, labels);
      await page.waitForTimeout(1200);
      text = await capturePageText(page);
      finalUrl = page.url();
    }
  }

  // 小红书笔记：enrich 里已经点气泡 + 下滑，外面不再重复慢滚
  let xhsEnriched = false;
  if (mod.xhsEnrich && isXhsNote && !check.blocked) {
    await enrichXiaohongshu(page);
    xhsEnriched = true;
  }

  // Gmail 账单：点开线程拿全文（列表预览常没有 $ 金额）
  let gmailExtra = "";
  if (
    mod.gmailEnrich &&
    /mail\.google\.com/i.test(finalUrl) &&
    !check.blocked
  ) {
    gmailExtra = await enrichGmailBills(page);
    finalUrl = page.url();
  }

  const passes = xhsEnriched ? 0 : mod.scrollPasses ?? 3;
  const useXhsPanel =
    mod.xhsEnrich &&
    /xiaohongshu\.com\/(explore|discovery\/item)/i.test(finalUrl);

  // ASC Ratings：小步慢滚；Trends / 其它页：滚到底停
  if (passes > 0 && !useXhsPanel) {
    if (isAsc && wantsAscRatings) {
      await scrollAscRatingsUntilBottom(page, {
        maxPasses: 12,
        delta: 420,
        settleMs: 900,
      });
    } else {
      await scrollUntilBottom(page, {
        maxPasses: passes,
        delta: 900,
        settleMs: 1400,
        label: mod.id,
      });
    }
  } else if (useXhsPanel) {
    for (let i = 1; i <= passes; i++) {
      console.log(`[patrol:${mod.id}] scroll ${i}/${passes}`);
      await scrollXhsNotePanel(page, 900);
      await page.waitForTimeout(350);
    }
  }
  await page.waitForTimeout(xhsEnriched ? 400 : isAsc ? 800 : 2000);

  text = await capturePageText(page);
  if (gmailExtra) {
    text = `${text}\n\n--- gmail-threads ---\n\n${gmailExtra}`;
  }
  finalUrl = page.url();
  check = looksBlocked(finalUrl, text);
  const title = await page.title().catch(() => "");

  // 登录页 / Gmail 营销页绝不当有效数据；其它页正文够长才入库
  const usable =
    text.length > 200 &&
    !check.blocked &&
    !isGmailMarketing(finalUrl, text) &&
    !/workspace\.google\.com/i.test(finalUrl);

  if (usable) {
    console.log(
      `  ✓ captured ${text.length} chars @ ${finalUrl.slice(0, 72)}`
    );
    return {
      url: finalUrl,
      requestedUrl: url,
      title,
      text,
      blocked: false,
      capturedAt: new Date().toISOString(),
    };
  }

  console.warn(
    `  ✗ 仍无有效正文 (${check.reason || "too short"}，len=${text.length})`
  );
  return {
    url: finalUrl,
    requestedUrl: url,
    title,
    text: "",
    blocked: true,
    capturedAt: new Date().toISOString(),
  };
}

function isCockpitUrl(url) {
  return /localhost:3000|127\.0\.0\.1:3000|\[::1\]:3000/i.test(url || "");
}

/** 巡逻结束后把焦点拉回 cockpit，避免 CDP 新标签停在 about:blank 抢走画面 */
async function restoreCockpitTab(context, preferred = []) {
  const alive = preferred.filter((p) => {
    try {
      return p && !p.isClosed();
    } catch {
      return false;
    }
  });
  const pages = context.pages?.() || [];
  const cockpit =
    alive.find((p) => isCockpitUrl(p.url())) ||
    pages.find((p) => isCockpitUrl(p.url()));
  if (cockpit) {
    await cockpit.bringToFront().catch(() => {});
    console.log("[patrol] restored cockpit tab →", cockpit.url());
  }
}

async function patrolModule(context, mod, cache) {
  const urls = moduleUrls(mod);
  if (!urls.length) {
    console.warn(`[patrol:${mod.id}] no urls, skip`);
    return;
  }

  // 记住 cockpit 标签，避免 CDP 新开 about:blank 盖住演示页
  const cockpitPages = (context.pages?.() || []).filter((p) =>
    isCockpitUrl(p.url())
  );

  const page = await context.newPage();
  const snapshots = [];

  try {
    for (let i = 0; i < urls.length; i++) {
      try {
        // 绝不导航到 cockpit 自己的页（防呆）
        if (isCockpitUrl(urls[i])) continue;
        const snap = await patrolUrl(page, mod, urls[i], i + 1, urls.length);
        if (snap.text && snap.text.length > 40) snapshots.push(snap);
      } catch (err) {
        console.warn(
          `[patrol:${mod.id}] failed on ${urls[i]}:`,
          err.message || err
        );
      }
    }
  } finally {
    await page.close().catch(() => {});
    await restoreCockpitTab(context, cockpitPages);
  }

  // Don't wipe a good cache with an empty failed run (browser closed mid-sync)
  const prev = cache.modules?.[mod.id];
  const prevSnaps = prev?.snapshots || [];
  if (!snapshots.length && prevSnaps.length) {
    console.warn(
      `[patrol:${mod.id}] 0 new snapshots — keeping previous ${prevSnaps.length}`
    );
    cache.modules[mod.id] = {
      ...prev,
      updatedAt: new Date().toISOString(),
      keptPrevious: true,
    };
  } else {
    cache.modules[mod.id] = {
      id: mod.id,
      label: mod.label,
      hostHints: mod.hostHints || [],
      snapshots,
      updatedAt: new Date().toISOString(),
    };
  }

  console.log(
    `[patrol:${mod.id}] done — ${snapshots.length} usable snapshot(s)`
  );
}

function cdpEndpoint() {
  return (
    process.env.CDP_URL ||
    `http://127.0.0.1:${process.env.CDP_PORT || "9222"}`
  );
}

/** CDP 端口是否在听（避免「连不上就强起第二个 Chrome → about:blank」） */
async function isCdpAlive(endpoint) {
  try {
    const base = endpoint.replace(/\/$/, "");
    const res = await fetch(`${base}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function connectViaCdp() {
  const endpoint = cdpEndpoint();
  console.log("[patrol] trying CDP →", endpoint);
  // noDefaults: 跳过 Browser.setDownloadBehavior（真 Chrome 常不支持，否则直接失败）
  const browser = await chromium.connectOverCDP(endpoint, {
    noDefaults: true,
  });
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(
      "CDP 已连接但没有可用 BrowserContext（勿对真 Chrome 调 newContext）"
    );
  }
  return { browser, context, viaCdp: true, endpoint };
}

async function launchOwnChrome() {
  console.warn(`
[patrol] 未检测到真 Chrome CDP。
  推荐流程（避免 Cloudflare 灰层）：
    1) npm run chrome:debug
    2) 在窗口里登录各站
    3) 再跑 npm run patrol:core
  本次将回退为 Playwright 自启 Chrome（可能再次遇到灰层）…
`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1400, height: 900 },
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return { browser: null, context, viaCdp: false };
}

/** Sync 前置：CDP 没开就自动拉起 start-chrome.js */
async function ensureDebugChrome(startUrl) {
  const endpoint = cdpEndpoint();
  if (await isCdpAlive(endpoint)) return true;

  writePatrolStatus({
    phase: "starting_chrome",
    message: "Opening Chrome for Sync…",
  });
  console.log("[patrol] CDP down — auto-starting chrome:debug…");

  const starter = path.join(__dirname, "start-chrome.js");
  const { spawn } = require("child_process");
  spawn(process.execPath, [starter], {
    cwd: path.join(__dirname, ".."),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CHROME_START_URL:
        startUrl ||
        process.env.CHROME_START_URL ||
        "https://mail.google.com/mail/u/0/#inbox",
    },
  }).unref();

  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await isCdpAlive(endpoint)) {
      console.log("[patrol] ✓ Chrome CDP ready");
      writePatrolStatus({
        phase: "syncing",
        message: "Chrome ready · opening consoles…",
      });
      return true;
    }
  }
  return false;
}

async function getBrowserSession(modId) {
  // 默认优先 CDP；设 PATROL_FORCE_LAUNCH=1 可强制自启
  if (process.env.PATROL_FORCE_LAUNCH === "1") {
    return launchOwnChrome();
  }

  const endpoint = cdpEndpoint();
  let cdpUp = await isCdpAlive(endpoint);

  // UI Sync：没有 chrome:debug 就自己开，不再要求用户先跑命令
  if (!cdpUp && process.env.PATROL_FROM_UI === "1") {
    const startUrl =
      modId === "costs"
        ? "https://mail.google.com/mail/u/0/#inbox"
        : modId === "comments"
          ? "https://appstoreconnect.apple.com/"
          : "https://mail.google.com/mail/u/0/#inbox";
    cdpUp = await ensureDebugChrome(startUrl);
    if (!cdpUp) {
      writePatrolStatus({
        phase: "error",
        message: "Could not start Chrome — check that Google Chrome is installed.",
      });
      throw new Error("Could not start Chrome for Sync (CDP not ready).");
    }
  }

  try {
    const session = await connectViaCdp();
    if (process.env.PATROL_FROM_UI === "1") {
      const pages = session.context.pages?.() || [];
      const cockpitOpen = pages.some((p) => isCockpitUrl(p.url()));
      if (cockpitOpen) {
        console.warn(`
[patrol] tip: Cockpit 最好用另一个浏览器打开，调试 Chrome 留给控制台登录态。
`);
      }
    }
    return session;
  } catch (err) {
    console.warn("[patrol] CDP 连接失败:", err.message || err);

    // 调试 Chrome 已在跑时：绝不能 launchPersistentContext（会抢 profile → about:blank）
    if (cdpUp || (await isCdpAlive(endpoint))) {
      throw new Error(
        `真 Chrome CDP 在线（${endpoint}）但 Playwright 接管失败。\n` +
          `  不要关调试 Chrome 窗口，也不要再开第二个 Chrome。\n` +
          `  原错误: ${err.message || err}`
      );
    }

    if (process.env.PATROL_FROM_UI === "1") {
      throw new Error(
        "Sync could not attach to Chrome after auto-start. Try Sync once more."
      );
    }
    return launchOwnChrome();
  }
}

const PATROL_LOCK = path.join(__dirname, "..", "data", ".patrol.lock");

function acquirePatrolLock() {
  fs.mkdirSync(path.dirname(PATROL_LOCK), { recursive: true });
  if (fs.existsSync(PATROL_LOCK)) {
    try {
      const prev = Number(fs.readFileSync(PATROL_LOCK, "utf8").trim());
      if (prev && prev !== process.pid) {
        try {
          process.kill(prev, 0);
          console.error(
            `[patrol] 已有巡逻在跑 (pid ${prev})。演示时只能跑一个，先停掉再开。`
          );
          process.exit(1);
        } catch {
          /* stale lock */
        }
      }
    } catch {
      /* ignore */
    }
  }
  fs.writeFileSync(PATROL_LOCK, String(process.pid));
  const release = () => {
    try {
      if (fs.existsSync(PATROL_LOCK)) {
        const cur = fs.readFileSync(PATROL_LOCK, "utf8").trim();
        if (cur === String(process.pid)) fs.unlinkSync(PATROL_LOCK);
      }
    } catch {
      /* ignore */
    }
  };
  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    release();
    process.exit(143);
  });
}

async function patrol() {
  acquirePatrolLock();

  const arg = (process.argv[2] || process.env.PATROL_MODULES || "").trim();
  const useCore = arg === "core" || process.env.PATROL_CORE === "1";

  const source = useCore ? CORE_MODULES : modules;
  const filter = useCore
    ? []
    : arg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const targets = Object.values(source).filter(
    (m) => filter.length === 0 || filter.includes(m.id)
  );

  console.log("[patrol] profile →", userDataDir);
  console.log(
    "[patrol] mode    →",
    useCore ? "CORE (成本=Gmail，状态=控制台)" : "full"
  );
  console.log(
    "[patrol] modules →",
    targets.map((t) => t.id).join(", ")
  );
  console.log("[patrol] cache   →", CACHE_PATH);

  const cache = loadCache();
  cache.updatedAt = new Date().toISOString();
  if (!cache.modules) cache.modules = {};

  const primaryMod = targets[0]?.id || "status";
  writePatrolStatus({
    phase: "starting",
    module: primaryMod,
    message: "Starting Sync…",
  });

  const session = await getBrowserSession(primaryMod);
  const { context, viaCdp } = session;

  console.log(
    viaCdp
      ? `[patrol] ✓ 已接管真 Chrome (${session.endpoint})`
      : "[patrol] 使用 Playwright 自启 Chrome"
  );
  if (process.env.PATROL_FROM_UI === "1") {
    console.log(
      "[patrol] tip: 若需登录，请在 Chrome 窗口操作 — Sync 会自动继续\n"
    );
  } else {
    console.log(
      "[patrol] tip: 登录/2FA 时在 Chrome 操作，终端按 Enter；跳过输入 s\n"
    );
  }

  try {
    for (const mod of targets) {
      writePatrolStatus({
        phase: "syncing",
        module: mod.id,
        message: `Syncing ${mod.label || mod.id}…`,
      });
      await patrolModule(context, mod, cache);
      saveCache(cache);
      if (mod.id === "comments") {
        const n = cache.modules?.comments?.snapshots?.length || 0;
        if (n > 0) refreshCommentsStructuredMd();
        else
          console.warn(
            "[patrol] skip comments-structured.md refresh — no snapshots"
          );
      }
    }
    writePatrolStatus({
      phase: "done",
      module: primaryMod,
      message: "Sync complete · data updated",
    });
    console.log("\n[patrol] finished — 刷新 http://localhost:3000");
  } catch (err) {
    writePatrolStatus({
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    if (viaCdp) {
      // 不要 browser.close()——那会把真 Chrome 一起关掉
      // 进程退出即断开 CDP，窗口继续留着
      console.log("[patrol] CDP 会话结束（Chrome 窗口保持打开）");
    } else {
      await context.close().catch(() => {});
    }
  }
}

patrol().catch((err) => {
  console.error("[patrol] failed:", err.message || err);
  process.exit(1);
});
