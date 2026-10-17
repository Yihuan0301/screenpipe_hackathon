// 只读检测：从 screenpipe 的 OCR 帧（search?content_type=ocr）找出最近看过的小红书笔记。
// 每条帧同时带 browser_url（含笔记 id）和 window_name（含标题），不需要时间 JOIN。
// 不写入任何数据。
import 'dotenv/config';

const BASE = process.env.SCREENPIPE_LOCAL_API_URL || 'http://localhost:3030';
const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;

// 笔记 id 从 URL 取：https://www.xiaohongshu.com/explore/<id>
const NOTE_RE = /xiaohongshu\.com\/explore\/([0-9a-f]+)/i;

// 窗口标题形如 "<页面标题> - 小红书[ – Audio playing] - Google Chrome – <用户>"
const TITLE_RE = /^(.*?)\s+-\s+小红书(?:\s+–[^-]*)?\s+-\s+Google Chrome/;

// 已知用户名：这些标题是用户主页，不是笔记（从之前抓取到的评论作者里整理）
const KNOWN_USERS = ['椰子酱'];

export function classifyFrame(browserUrl, windowName) {
  const url = browserUrl || '';
  const note = url.match(NOTE_RE);
  if (note) return { kind: 'note', noteId: note[1] };
  if (/xiaohongshu\.com\/user\/profile\//.test(url)) return { kind: 'profile' };
  if (/xiaohongshu\.com/.test(url)) return { kind: 'other' };
  return null; // 不是小红书
}

export async function detectXiaohongshu({ hours = 24, limit = 500 } = {}) {
  const start = new Date(Date.now() - hours * 3600_000).toISOString();
  const url = `${BASE}/search?content_type=ocr&limit=${limit}&q=&start_time=${encodeURIComponent(start)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  const data = (await res.json()).data || [];

  // 按笔记 id 汇总；profile/other 单独计数，不当作笔记
  const notes = new Map();
  for (const item of data) {
    const c = item.content || {};
    const cls = classifyFrame(c.browser_url, c.window_name);
    if (!cls || cls.kind !== 'note') continue;
    const e = notes.get(cls.noteId) || {
      noteId: cls.noteId, url: c.browser_url, title: null, frames: 0, first: c.timestamp, last: c.timestamp,
    };
    e.frames += 1;
    const m = (c.window_name || '').match(TITLE_RE);
    if (m && !e.title && !KNOWN_USERS.includes(m[1].trim())) e.title = m[1].trim();
    if (c.timestamp < e.first) e.first = c.timestamp;
    if (c.timestamp > e.last) e.last = c.timestamp;
    notes.set(cls.noteId, e);
  }
  return [...notes.values()].sort((a, b) => b.last.localeCompare(a.last));
}

// 直接运行时打印结果
if (import.meta.url === `file://${process.argv[1]}`) {
  const notes = await detectXiaohongshu({ hours: 24 });
  console.log(`最近 24 小时：${notes.length} 篇笔记（按笔记 id 去重）`);
  for (const n of notes) {
    console.log(`${n.last}  ${n.noteId}  ${n.frames} 帧  ${n.title ?? '(无标题)'}`);
  }
}
