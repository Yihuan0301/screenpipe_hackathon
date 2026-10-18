import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODULES = new Set(["revenue", "costs", "status", "comments", "core"]);

const LOCK_PATH = path.join(process.cwd(), "data", ".patrol.lock");
const STATUS_PATH = path.join(process.cwd(), "data", "patrol-status.json");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function liveLockPid(): number | null {
  try {
    if (!fs.existsSync(LOCK_PATH)) return null;
    const prev = Number(fs.readFileSync(LOCK_PATH, "utf8").trim());
    if (!prev) return null;
    process.kill(prev, 0);
    return prev;
  } catch {
    return null;
  }
}

function processAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function clearLockFile() {
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

function readStatus(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(STATUS_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

/**
 * Stop any running scripts/patrol.js so Sync can take over.
 */
async function stopPreviousPatrol(): Promise<number | null> {
  const lockPid = liveLockPid();

  if (lockPid) {
    try {
      process.kill(lockPid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }

  try {
    execSync('pkill -f "node scripts/patrol.js" || true', {
      stdio: "ignore",
      timeout: 3000,
    });
  } catch {
    /* none running */
  }

  for (let i = 0; i < 12; i++) {
    await sleep(200);
    if (!liveLockPid()) break;
  }

  const still = liveLockPid();
  if (still) {
    try {
      process.kill(still, "SIGKILL");
    } catch {
      /* ignore */
    }
    await sleep(200);
  }

  clearLockFile();
  await sleep(250);
  return lockPid;
}

function readLogTail(logPath: string, n = 8): string {
  try {
    const raw = fs.readFileSync(logPath, "utf8");
    return raw.trim().split(/\n+/).slice(-n).join("\n");
  } catch {
    return "";
  }
}

/** Poll Sync progress (phase / login wait / done) */
export async function GET() {
  const status = readStatus();
  const busy = liveLockPid();
  return NextResponse.json({
    ok: true,
    busy: Boolean(busy),
    pid: busy,
    status: status || null,
  });
}

/**
 * Sync: stop previous patrol → start this module.
 * Patrol itself auto-opens Chrome if needed and waits for login in-window.
 */
export async function POST(req: Request) {
  let body: { module?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const mod = (body.module || "status").trim();
  if (!MODULES.has(mod)) {
    return NextResponse.json(
      { ok: false, error: `Unknown module: ${mod}` },
      { status: 400 }
    );
  }

  const stoppedPid = await stopPreviousPatrol();

  const script = path.join(process.cwd(), "scripts", "patrol.js");
  const startedAt = new Date().toISOString();
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const logPath = path.join(dataDir, `patrol-ui-${mod}.log`);
  const logFd = fs.openSync(logPath, "a");
  fs.writeSync(
    logFd,
    `\n--- ${startedAt} module=${mod}${
      stoppedPid ? ` (stopped previous pid ${stoppedPid})` : ""
    } ---\n`
  );

  fs.writeFileSync(
    STATUS_PATH,
    JSON.stringify(
      {
        phase: "starting",
        module: mod,
        message: stoppedPid
          ? "Stopped previous patrol · starting Sync…"
          : "Starting Sync…",
        updatedAt: startedAt,
      },
      null,
      2
    )
  );

  const child = spawn(process.execPath, [script, mod], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      // Do NOT set PATROL_AUTO_SKIP — Sync should wait for login in Chrome
      PATROL_FROM_UI: "1",
    },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });

  fs.closeSync(logFd);
  child.unref();

  // Child may exit immediately — don't lie to UI
  await sleep(1800);
  if (!processAlive(child.pid)) {
    const tail = readLogTail(logPath);
    const hint =
      /Could not start Chrome|找不到 Google Chrome/i.test(tail)
        ? "Could not open Chrome — is Google Chrome installed?"
        : /已有巡逻在跑/.test(tail)
          ? "Could not take over the previous patrol — try Sync once more."
          : tail.slice(-240) || "Patrol exited immediately — check the log.";
    return NextResponse.json(
      {
        ok: false,
        started: false,
        module: mod,
        error: hint,
        logPath,
        logTail: tail,
        stoppedPid,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    started: true,
    module: mod,
    startedAt,
    pid: child.pid,
    stoppedPid,
    mode: "browser-patrol",
    hint: "Sync started — Chrome opens if needed; sign in there if prompted.",
    logPath,
  });
}
