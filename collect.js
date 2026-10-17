// 收集入口：找出最近看过的小红书笔记，抓取评论，合并写入 data/xiaohongshu-comments.json
// 看板页面会读取这个文件。
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectXiaohongshu } from './platforms/xiaohongshu/detect.js';
import { getPlatformFrames, collectNoteThread } from './platforms/xiaohongshu/index.js';
import { xiaohongshu } from './platforms/xiaohongshu/config.js';
import { toRecords } from './core/records.js';

const here = dirname(fileURLToPath(import.meta.url));
// 输出到看板仓库的 data/，网站直接读取。可用 DASHBOARD_DATA_DIR 覆盖。
const DEFAULT_DIR = resolve(here, '../launch-shadow-dashboard/data');
const OUT = resolve(process.env.DASHBOARD_DATA_DIR || DEFAULT_DIR, 'xiaohongshu-comments.json');

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return { updatedAt: null, records: [] };
  }
}

async function main() {
  const notes = await detectXiaohongshu({ hours: 24 });
  console.log(`检测到 ${notes.length} 篇笔记`);

  const freshByNote = new Map();
  const allFrames = await getPlatformFrames(xiaohongshu, { limit: 200, since: '24h ago', focusedOnly: false });
  for (const note of notes) {
    const mine = allFrames.filter(f => f.noteId === note.noteId);
    const records = toRecords(await collectNoteThread(xiaohongshu, note.noteId, mine));
    freshByNote.set(note.noteId, records);
    console.log(`笔记 ${note.noteId}：${records.length} 条`);
  }

  // 合并：本次抓取到的笔记整体替换，其余保留
  const prev = await readExisting();
  const kept = prev.records.filter(r => !freshByNote.has(r.noteId));
  const records = [...kept, ...[...freshByNote.values()].flat()];

  // 同时输出统一格式（kind=review），让概览和数据库页能统计用户评价
  const unified = records.map(r => ({
    kind: 'review',
    source: 'xiaohongshu',
    date: (r.firstSeen || '').slice(0, 10),
    title: `${r.user}：${(r.content || '').slice(0, 30)}`,
    detail: r.content ?? null,
    ref: r.id ?? null,
    url: r.sourceUrl ?? null,
  }));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), records: unified, comments: records }, null, 2));
  console.log(`已写入 ${OUT}（共 ${records.length} 条）`);
}

main().catch(err => {
  console.error('收集失败:', err.message);
  process.exitCode = 1;
});
