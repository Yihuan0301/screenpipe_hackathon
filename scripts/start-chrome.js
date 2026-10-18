/**
 * 启动「真 Chrome」（非 Playwright 拉起），避免 Cloudflare 等灰层。
 *
 * 用法：
 *   1) 先关掉占用 ~/.launchshadow-chrome 的窗口
 *   2) npm run chrome:debug
 *   3) 在窗口里登录需要的站
 *   4) 另开终端：npm run patrol:core
 *
 * 默认关闭扩展，避免 Language Reactor / Auto Refresh 等乱开标签。
 * 若要开扩展：CHROME_EXTENSIONS=1 npm run chrome:debug
 */

const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { profileDir } = require("../config/patrol-targets");

const PORT = process.env.CDP_PORT || "9222";
const userDataDir =
  process.env.PATROL_PROFILE || path.join(os.homedir(), profileDir);
const allowExtensions = process.env.CHROME_EXTENSIONS === "1";
const startUrl = process.env.CHROME_START_URL || "https://app.netlify.com/";

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const chromePath =
  process.env.CHROME_PATH ||
  chromeCandidates.find((p) => fs.existsSync(p));

if (!chromePath) {
  console.error("找不到 Google Chrome，请设置 CHROME_PATH");
  process.exit(1);
}

fs.mkdirSync(userDataDir, { recursive: true });

// 清掉「Chrome didn't shut down correctly / Restore pages?」崩溃标记
// （上次 Playwright 或强杀进程会导致每次都弹）
function patchChromeExitFlags() {
  const prefPath = path.join(userDataDir, "Default", "Preferences");
  if (!fs.existsSync(prefPath)) return;

  const pref = JSON.parse(fs.readFileSync(prefPath, "utf8"));
  pref.profile = pref.profile || {};
  pref.profile.exit_type = "Normal";
  pref.profile.exited_cleanly = true;

  pref.session = pref.session || {};
  pref.session.restore_on_startup = 5; // 新标签，不恢复旧会话

  pref.browser = pref.browser || {};
  pref.browser.has_seen_welcome_page = true;
  pref.browser.exit_type = "Normal";

  fs.writeFileSync(prefPath, JSON.stringify(pref));
}

try {
  patchChromeExitFlags();
  console.log("已清除崩溃恢复标记（避免 Restore pages? 弹窗）");
} catch (err) {
  console.warn("无法写入 Preferences:", err.message || err);
}

const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-session-crashed-bubble",
  "--hide-crash-restore-bubble",
  "--disable-blink-features=AutomationControlled",
  "--new-window",
];

if (!allowExtensions) {
  args.push("--disable-extensions");
}

args.push(startUrl);

console.log("════════════════════════════════════════");
console.log(" LaunchShadow — 真 Chrome（CDP）");
console.log(" Chrome  :", chromePath);
console.log(" Profile :", userDataDir);
console.log(" CDP     : http://127.0.0.1:" + PORT);
console.log(" Start   :", startUrl);
console.log(" Exts    :", allowExtensions ? "ON" : "OFF（默认关，防乱开标签）");
console.log("════════════════════════════════════════");
console.log(`
正确流程（三步）：
  ① 本命令只负责打开真 Chrome（你现在看到的起始页）
  ② 另开终端跑登录向导（会按 Enter 切下一个站）：
       npm run login:cdp
  ③ 全部登录完后再巡逻：
       npm run patrol:core
`);

const child = spawn(chromePath, args, {
  detached: true,
  stdio: "ignore",
});

child.unref();
console.log(`已启动 Chrome (pid≈${child.pid})。只应看到 1 个起始页。`);
