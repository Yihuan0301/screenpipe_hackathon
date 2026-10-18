/**
 * 在「真 Chrome」(CDP) 里逐个打开站点登录
 *
 * 前提：npm run chrome:debug 窗口还开着
 *   npm run login:cdp
 *
 * 每个站：浏览器里登录完 → 终端按 Enter → 打开下一个
 */

const path = require("path");
const os = require("os");
const readline = require("readline");
const { chromium } = require("playwright");
const { profileDir, CORE_MODULES } = require("../config/patrol-targets");
const { acceptCookies } = require("./lib/accept-cookies");

const userDataDir =
  process.env.PATROL_PROFILE || path.join(os.homedir(), profileDir);

const CDP =
  process.env.CDP_URL ||
  `http://127.0.0.1:${process.env.CDP_PORT || "9222"}`;

function ask(q) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(q, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

function buildLoginList() {
  const seen = new Set();
  const list = [];
  const order = ["costs", "status", "revenue", "comments"];
  for (const id of order) {
    const mod = CORE_MODULES[id];
    if (!mod) continue;
    for (const url of mod.urls || []) {
      let host;
      try {
        host = new URL(url).host;
      } catch {
        continue;
      }
      if (seen.has(host)) continue;
      seen.add(host);
      list.push({ id: mod.id, label: mod.label, url, host });
    }
  }
  return list;
}

function isUsablePage(page) {
  const u = page.url();
  return (
    !u.startsWith("chrome-extension://") &&
    !u.startsWith("devtools://") &&
    !u.startsWith("chrome://extensions")
  );
}

/** 专用标签：保证 goto 发生在你看得见的前台页 */
async function getFrontPage(context) {
  // 关掉空白 about:blank 垃圾页（保留一个）
  const pages = context.pages().filter(isUsablePage);
  let page = pages.find((p) => p.url() !== "about:blank") || pages[0];

  if (!page) {
    page = await context.newPage();
  }

  await page.bringToFront();
  return page;
}

async function main() {
  const sites = buildLoginList();

  console.log("════════════════════════════════════════");
  console.log(" LaunchShadow — CDP 逐站登录");
  console.log(" CDP    :", CDP);
  console.log(" Profile:", userDataDir);
  console.log(" 站点数 :", sites.length);
  console.log("════════════════════════════════════════");
  console.log("看浏览器地址栏是否变了；变了再登录，然后回终端按 Enter。\n");

  let browser;
  try {
    // noDefaults: 跳过 setDownloadBehavior（真 Chrome 常报 context management 不支持）
    browser = await chromium.connectOverCDP(CDP, { noDefaults: true });
  } catch (err) {
    console.error(`
❌ 连不上真 Chrome。请先：
   npm run chrome:debug
然后再：
   npm run login:cdp
`);
    console.error(err.message || err);
    process.exit(1);
  }

  const context = browser.contexts()[0];
  if (!context) {
    console.error("❌ CDP 已连上但没有 BrowserContext");
    process.exit(1);
  }
  let page = await getFrontPage(context);

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    console.log(`\n→ (${i + 1}/${sites.length}) [${site.label}] ${site.host}`);
    console.log(`   ${site.url}`);

    try {
      page = await getFrontPage(context);
      await page.bringToFront();
      await page.goto(site.url, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      // 再前置一次，防止焦点丢到别的标签
      await page.bringToFront();
      await page.waitForTimeout(1000);
      await acceptCookies(page);
      console.log(`   ✓ 当前地址栏应为: ${page.url()}`);
    } catch (err) {
      console.warn("   打开失败，请手动在地址栏粘贴上面的链接:", err.message || err);
    }

    const ans = await ask(
      "   看到新页面并登录后按 Enter（跳过 s / 结束 q）… "
    );
    if (ans.toLowerCase() === "q") {
      console.log("已结束登录向导。");
      break;
    }
    if (ans.toLowerCase() === "s") {
      console.log("   已跳过");
    }
  }

  console.log(`
✅ 登录阶段完成。下一步：
   npm run patrol:core
（Chrome 保持开着）
`);
}

main().catch((err) => {
  console.error("[login:cdp] failed:", err.message || err);
  process.exit(1);
});
