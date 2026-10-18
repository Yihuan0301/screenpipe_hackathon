/**
 * Write data/comments-structured.md from patrol-cache comments snapshots.
 */
import { writeFile } from "fs/promises";
import path from "path";
import { parseCommentsFeed, type CommentsViz } from "./comments-feed.ts";
import { cacheToItems, readPatrolCache } from "./patrol-cache.ts";

const MD_PATH = path.join(process.cwd(), "data", "comments-structured.md");

function escCell(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\|/g, "/");
}

export function commentsFeedToMarkdown(feed: CommentsViz): string {
  const rows = feed.comments.map((cm, i) => ({
    i: i + 1,
    platform: cm.platform === "xiaohongshu" ? "Rednote" : "ASC",
    author: escCell((cm.author || "—").slice(0, 40)),
    rating: cm.rating ?? "—",
    body: escCell((cm.body || "").slice(0, 220)),
  }));

  return [
    "# Structured comments",
    "",
    `Parsed rows: **${rows.length}** · Rednote: ${feed.xhsCount} · ASC: ${feed.ascCount}`,
    "",
    "Source: `data/patrol-cache.json` → `parseCommentsFeed` (UI chrome / usernames / creator replies filtered)",
    "",
    "## User reviews",
    "",
    "| # | Channel | Author | Rating | Body |",
    "|---|---------|--------|--------|------|",
    ...rows.map(
      (r) =>
        `| ${r.i} | ${r.platform} | ${r.author} | ${r.rating} | ${r.body} |`
    ),
    "",
  ].join("\n");
}

/** Rebuild comments-structured.md from current patrol cache. Returns row count. */
export async function writeCommentsStructuredMd(): Promise<number> {
  const cache = await readPatrolCache();
  const items = cacheToItems(cache?.modules?.comments);
  const feed = parseCommentsFeed(items);
  await writeFile(MD_PATH, commentsFeedToMarkdown(feed), "utf8");
  return feed.comments.length;
}
