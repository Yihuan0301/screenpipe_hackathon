/**
 * 一次性登录助手 — 对齐你的真实技术栈
 *
 *   node scripts/login-setup.js
 *   node scripts/login-setup.js revenue,status
 *
 * 每个 URL 登录完回终端按 Enter。Cookie 存 ~/.launchshadow-chrome
 */

const path = require("path");
const os = require("os");
const readline = require("readline");
const { chromium } = require("playwright");
const { profileDir, modules } = require("../config/patrol-targets");

const userDataDir =
  process.env.PATROL_PROFILE || path.join(os.homedir(), profileDir);

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

async function main() {
  const filter = (process.argv[2] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const targets = Object.values(modules).filter(
    (m) => filter.length === 0 || filter.includes(m.id)
  );

  const allUrls = targets.flatMap((m) =>
    moduleUrls(m).map((url) => ({ mod: m, url }))
  );

  // 去重 host，避免同站重复登录提示太多次（保留第一个）
  const seenHost = new Set();
  const unique = allUrls.filter(({ url }) => {
    try {
      const host = new URL(url).host;
      if (seenHost.has(host)) return false;
      seenHost.add(host);
      return true;
    } catch {
      return true;
    }
  });

  console.log("════════════════════════════════════════");
  console.log(" LaunchShadow — 一次性登录");
  console.log(" profile:", userDataDir);
  console.log(" 站点:", unique.map((u) => new URL(u.url).host).join(", "));
  console.log("════════════════════════════════════════");
  console.log("每个站点打开后：登录 → 回终端按 Enter\n");

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const page = context.pages()[0] || (await context.newPage());

    for (const { mod, url } of unique) {
      console.log(`\n→ [${mod.label}] ${url}`);
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
      } catch (err) {
        console.warn("  打开失败（仍可手动导航）:", err.message || err);
      }
      await ask("  登录完成后按 Enter 继续… ");
    }

    console.log("\n✅ 登录配置已保存。下一步：");
    console.log("   npm run patrol");
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("[login-setup] failed:", err.message || err);
  process.exit(1);
});
