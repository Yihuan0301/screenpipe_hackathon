/**
 * Rebuild data/comments-structured.md from patrol-cache.json
 *   node scripts/write-comments-structured.js
 *   npm run comments:structured
 */
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const entry = path.join(__dirname, "write-comments-structured.ts");

try {
  execFileSync(process.execPath, ["--experimental-strip-types", entry], {
    cwd: root,
    stdio: "inherit",
    timeout: 30000,
  });
} catch (err) {
  console.error(
    "[comments-structured] failed:",
    err instanceof Error ? err.message : err
  );
  process.exitCode = 1;
}
