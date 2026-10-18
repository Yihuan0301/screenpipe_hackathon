/**
 * CLI: rebuild data/comments-structured.md from patrol-cache.json
 *   node --experimental-strip-types scripts/write-comments-structured.ts
 */
import { writeCommentsStructuredMd } from "../lib/write-comments-structured.ts";

writeCommentsStructuredMd()
  .then((n) => {
    console.log(`[comments-structured] wrote ${n} reviews → data/comments-structured.md`);
  })
  .catch((err) => {
    console.error("[comments-structured] failed:", err?.message || err);
    process.exitCode = 1;
  });
