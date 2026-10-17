// 只读检测：从 ui_events 找出最近看过的小红书页面（按窗口标题汇总）
// 不写入任何数据，只输出汇总结果，用于确认"哪些笔记被触发过"。
import 'dotenv/config';

const BASE = process.env.SCREENPIPE_LOCAL_API_URL || 'http://localhost:3030';
const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;

// 窗口标题形如 "<页面标题> - 小红书 - Google Chrome – <用户>"，
// 可能带 " – Audio playing" 之类的后缀
const TITLE_RE = /^(.*?)\s+-\s+小红书(?:\s+–[^-]*)?\s+-\s+Google Chrome/;

// 已知非笔记页面（首页、通知、个人页）；名字在这里列出，不靠长度猜
const NON_NOTE = new Set(['通知', '我']);

// 已知用户名：来自之前抽取的评论作者，用于区分主页和笔记
const KNOWN_USERS = ["椰子酱"];

// 分类：home（首页）、nonnote（通知/个人页）、profile（用户主页，标题是用户名）、
// note（笔记页，需人工确认）、unknown（无法识别）
export function classify(title, knownUsers = []) {
  if (/你的生活兴趣社区/.test(title)) return 'home';
  const m = title.match(TITLE_RE);
  if (!m) return 'unknown';
  const name = m[1].trim();
  if (NON_NOTE.has(name)) return 'nonnote';
  if (knownUsers.includes(name)) return 'profile';
  return 'note';
}

export async function detectXiaohongshu({ hours = 24 } = {}) {
  const query = `SELECT substr(timestamp,1,16) AS minute, window_title
    FROM ui_events
    WHERE timestamp > strftime('%Y-%m-%dT%H:%M:%f+00:00','now','-${Number(hours)} hours')
      AND window_title LIKE '%小红书%'
    ORDER BY timestamp DESC LIMIT 2000`;
  const res = await fetch(`${BASE}/raw_sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`raw_sql HTTP ${res.status}`);
  const rows = await res.json();

  // 按标题汇总：出现分钟数、首次和最后一次时间
  const byTitle = new Map();
  for (const r of rows) {
    const t = r.window_title;
    const e = byTitle.get(t) || { title: t, minutes: 0, first: r.minute, last: r.minute };
    e.minutes += 1;
    if (r.minute < e.first) e.first = r.minute;
    if (r.minute > e.last) e.last = r.minute;
    byTitle.set(t, e);
  }
  return [...byTitle.values()]
    .map(e => ({ ...e, kind: classify(e.title, KNOWN_USERS) }))
    .sort((a, b) => b.last.localeCompare(a.last));
}

// 直接运行时打印结果
if (import.meta.url === `file://${process.argv[1]}`) {
  const items = await detectXiaohongshu({ hours: 24 });
  console.log(`最近 24 小时：${items.length} 个小红书页面标题`);
  for (const it of items) {
    console.log(`[${it.kind}] ${it.last}  活跃 ${it.minutes} 分钟  ${it.title}`);
  }
}
