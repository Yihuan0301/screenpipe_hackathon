import fetch from 'node-fetch';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import notifier from 'node-notifier';
dotenv.config();

const openai = new OpenAI({
    baseURL: 'http://localhost:3030/v1', 
    apiKey: process.env.SCREENPIPE_KEY,  
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 模型：走 screenpipe 内部 /v1/chat/completions（会员额度，无需外部 key）
const MODEL = process.env.LAUNCHSHADOW_MODEL || 'claude-sonnet-5';

// 平台适配器：每个平台定义 窗口匹配规则 + 评论区坐标。
// 目前只启用小红书；X / Reddit / Discord 等后续在这里追加即可（enabled: true 即生效）。
const PLATFORMS = {
    xiaohongshu: {
        label: '小红书',
        app: 'Google Chrome',
        windowMatch: '小红书',
        urlHost: 'xiaohongshu.com',
        commentArea: { minTop: 0.15, maxTop: 0.88, minLeft: 0.15, maxLeft: 0.95 },
        enabled: true,
    },
    // x: { label: 'X', app: 'Google Chrome', windowMatch: 'X', urlHost: 'x.com', commentArea: {...}, enabled: false },
};

const BASE = process.env.SCREENPIPE_LOCAL_API_URL || 'http://localhost:3030';
const API_KEY = process.env.SCREENPIPE_KEY || process.env.SCREENPIPE_LOCAL_API_KEY;
const API_HEADERS = { Authorization: `Bearer ${API_KEY}`, 'X-Screenpipe-Client': 'api' };

const ACTIVE_PLATFORMS = Object.values(PLATFORMS).filter(p => p.enabled);

async function getJson(path) {
    const res = await fetch(BASE + path, { headers: API_HEADERS });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
}

// 1) 找某平台最近的 OCR 帧
async function getPlatformFrames(platform, { limit = 10, since = '10m ago', focusedOnly = true } = {}) {
    const qs = new URLSearchParams({
        content_type: 'ocr',
        app_name: platform.app,
        window_name: platform.windowMatch,
        start_time: since,
        limit: String(limit),
        fields: 'content.frame_id,content.browser_url,content.timestamp',
    });
    if (focusedOnly) qs.set('focused', 'true');
    const d = await getJson(`/search?${qs}`);
    // 客户端再次按站点过滤，避免只依赖窗口标题
    const host = platform.urlHost;
    return (d.data || [])
        .filter(r => !host || (r['content.browser_url'] || '').includes(host))
        .map(r => ({
            frameId: r['content.frame_id'],
            noteId: noteIdFromUrl(r['content.browser_url']),
            sourceUrl: r['content.browser_url'] || null,
            timestamp: r['content.timestamp'],
        }));
}

// 从小红书 URL 取笔记 id（同一篇笔记的帧用它归组）
function noteIdFromUrl(url) {
    const m = (url || '').match(/explore\/([0-9a-f]+)/i);
    return m ? m[1] : null;
}

// 2) 只取评论区内的文字块，按阅读顺序排列
async function getCommentLines(frameId, platform) {
    const d = await getJson(`/elements?frame_id=${frameId}&source=ocr&limit=500`);
    const { minTop, maxTop, minLeft, maxLeft } = platform.commentArea;
    const blocks = (d.data || [])
        .filter(e => e.text && e.text.trim().length >= 2)
        .filter(e => {
            const b = e.bounds;
            return b.top >= minTop && b.top <= maxTop
                && b.left >= minLeft && b.left + b.width <= maxLeft;
        })
        .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);

    // 同一行（top 相差很小）的词合并成一行
    const rows = [];
    for (const e of blocks) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last.top - e.bounds.top) < 0.012) {
            last.words.push(e.text.trim());
        } else {
            rows.push({ top: e.bounds.top, words: [e.text.trim()] });
        }
    }
    // 过滤乱码：至少含 2 个字母/汉字，且字母占比足够高
    return rows
        .map(r => r.words.join(' '))
        .filter(line => {
            const letters = (line.match(/[\p{L}]/gu) || []).length;
            return letters >= 2 && letters / line.replace(/\s/g, '').length >= 0.6;
        });
}

// 3) 组合：只对当前焦点所在的平台取数据（不在小红书笔记页时不触发）
// 返回结构化记录 {platform, user, level, text, source}，并按平台+用户+文本去重
// 同一篇笔记的多帧：逐帧提取 -> 按时间排序合并 -> 在合并后的列表上算线程关系
async function collectNoteThread(platform, noteId, frames) {
    const ordered = [...frames].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const perFrame = [];
    for (const f of ordered) {
        try {
            perFrame.push(await extractRawItems(f.frameId, platform, f.timestamp));
        } catch (error) {
            console.error(`${platform.label} 帧 ${f.frameId} 提取失败，记为缺帧: ${error.message}`);
            perFrame.push(null); // 缺帧：合并时插入断层，不静默跳过
        }
    }
    const { items, gaps } = mergeFrameItems(perFrame);
    // 断层分隔符已在 items 中，linkReplies 会在断层处切断线程
    const records = linkReplies(items, platform.label);
    // 时间：按序列中的原始条目回填 firstSeen / lastSeen（来自 mergeFrameItems）
    // 来源：这一组帧属于同一篇笔记（推文/视频），取第一帧的 URL 作为该笔记的地址
    const sourceUrl = ordered.find(f => f.sourceUrl)?.sourceUrl ?? null;
    return records.map(r => ({
        ...r,
        noteId,
        sourceUrl,
        frames: ordered.length,
        gapCount: gaps.length,
        firstSeen: r.firstSeen ?? null,
        lastSeen: r.lastSeen ?? null,
    }));
}

async function getScreenContextWithFallback() {
    const out = [];
    for (const platform of ACTIVE_PLATFORMS) {
        let frames = [];
        try {
            // 焦点帧：取较多的最近帧，再按笔记 id 分组
            frames = await getPlatformFrames(platform, { limit: 200, since: '30m ago' });
        } catch (error) {
            console.error(`${platform.label} 帧查询失败:`, error.message);
            continue;
        }
        if (!frames.length) continue; // 焦点不在该平台，跳过
        // 最近一篇笔记：在所有帧中找最新的、带笔记 id 的帧（跳过主页等非笔记页）
        const withNote = frames.find(f => f.noteId);
        if (!withNote) continue; // 窗口内没有笔记页帧，跳过
        const latestNote = withNote.noteId;
        const sameNote = frames.filter(f => f.noteId === latestNote);
        try {
            out.push(...await collectNoteThread(platform, latestNote, sameNote));
        } catch (error) {
            console.error(`${platform.label} 笔记合并失败:`, error.message);
        }
    }
    const seen = new Set();
    const unique = out.filter(r => {
        const k = `${r.platform}|${r.user}|${r.text}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    return unique.length ? unique : null;
}

// 截图回退：文字层读不到评论时，直接把帧图片交给模型识别（已验证可读出中文和 emoji）
async function getFrameJpegBase64(frameId) {
    const res = await fetch(`${BASE}/frames/${frameId}`, { headers: API_HEADERS });
    if (!res.ok) throw new Error(`frame ${frameId}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString('base64');
}

// 带重试的模型调用：空内容或请求失败时重试，最终报错（不再静默返回 null）
async function callModel(messages, { maxTokens = 2048, json = false, retries = 2 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            const body = { model: MODEL, max_tokens: maxTokens, messages };
            if (json) body.response_format = { type: 'json_object' };
            const res = await fetch(`${BASE}/v1/chat/completions`, {
                method: 'POST',
                headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(90_000), // 90 秒超时，超时即重试
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const content = data?.choices?.[0]?.message?.content;
            if (!content || !content.trim()) throw new Error('empty content');
            return content;
        } catch (error) {
            lastError = error;
            console.error(`模型调用第 ${attempt} 次失败: ${error.message}`);
            if (attempt <= retries) await sleep(1500 * attempt);
        }
    }
    throw new Error(`No response from model: ${lastError?.message}`);
}

// 截图提取：只输出原始事实，不判断类型。level: 0 = 母评论，1 = 子评论（展开的回复）
// 截图提取：只输出原始事实，不判断类型。level: 0 = 母评论，1 = 子评论（展开的回复）
// 回复关系（小红书规则）：
// - 母评论下的第一条子回复没有“回复 X :”前缀 -> 回复母评论
// - 之后的子回复有“回复 X :”前缀 -> 回复同线程里的用户 X
// 输出每条记录的 replyToUser（被回复的人）、parentId、hasAuthorReply
function linkReplies(items, platformLabel) {
    const records = items.filter(i => i && !i.__gap && i.text).map((i, idx) => ({
        id: `${platformLabel}-${idx}`,
        platform: platformLabel,
        user: i.user || null,
        level: i.level === 1 ? 1 : 0,
        text: i.text,
        isAuthor: !!i.isAuthor,
        replyTarget: i.replyTarget || null,
        expandCount: Number.isInteger(i.expandCount) ? i.expandCount : 0,
        parentId: null,
        parentUser: null,
        replyToUser: null,
        replyToId: null,
        firstSeen: i.firstSeen ?? null,
        lastSeen: i.lastSeen ?? null,
        frameId: i.frameId ?? null,
        source: 'screenshot',
    }));

    // 线程：母评论 + 其后的子评论（直到下一条母评论或断层）
    // 断层（GAP）之后，前面的母评论不再接收子评论
    const gapBefore = new Set();
    let seenItems = 0;
    for (const i of items) {
        if (i && i.__gap) { gapBefore.add(seenItems); continue; }
        if (i && i.text) seenItems++;
    }
    let root = null;
    let firstChildSeen = false;
    for (let idx = 0; idx < records.length; idx++) {
        const r = records[idx];
        if (gapBefore.has(idx)) { root = null; firstChildSeen = false; }
        if (r.level === 0) {
            root = r;
            firstChildSeen = false;
            continue;
        }
        if (!root) continue; // 没有母评论的孤立子评论，不归属
        r.parentId = root.id;
        r.parentUser = root.user;
        if (!firstChildSeen && !r.replyTarget) {
            // 首条回复无前缀 -> 回复母评论
            r.replyToUser = root.user;
            r.replyToId = root.id;
        } else if (r.replyTarget) {
            // 有前缀 -> 回复前缀中的用户（在线程内查找对应记录）
            const target = [root, ...records.filter(x => x.parentId === root.id)]
                .find(x => x !== r && x.user === r.replyTarget);
            r.replyToUser = r.replyTarget;
            r.replyToId = target ? target.id : null;
        } else {
            // 无前缀但不是首条：按规则应有前缀，标记未知，不猜
            r.replyToUser = null;
            r.replyToId = null;
        }
        firstChildSeen = true;
    }

    // 每条评论是否有作者回复（严格规则）：
    // - true：截图里明确看到作者回复了它（可见即确定）
    // - false：线程内没有未展开的回复，且没有目标不明的作者回复
    // - null：线程里还有未展开的回复，或作者回复的目标不明，无法确定
    for (const r of records) {
        const root2 = r.level === 0 ? r : records.find(x => x.id === r.parentId);
        if (!root2) { r.hasAuthorReply = null; r.hiddenReplies = null; continue; }
        const children = records.filter(c => c.level === 1 && c.parentId === root2.id);
        const hidden = Math.max(0, (root2.expandCount || 0) - children.length); // 线程内未展开的回复数
        r.hiddenReplies = hidden;
        const authorReplies = children.filter(c => c.isAuthor);
        if (authorReplies.some(c => c.replyToId === r.id)) { r.hasAuthorReply = true; continue; }
        if (hidden > 0) { r.hasAuthorReply = null; continue; }
        if (authorReplies.some(c => c.replyToId === null)) { r.hasAuthorReply = null; continue; }
        r.hasAuthorReply = false;
    }
    return records;
}

// ---- 多帧合并（滚动截图拼接，模糊匹配） ----
// 文本归一化：去掉 emoji、标点、空白，转小写，供模糊比较
const normalize = (s) => String(s || '')
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D/gu, '')
    .replace(/[\p{P}\p{S}\s]/gu, '')
    .toLowerCase();

// 字符二元组 Dice 相似度（0~1），对中文和短句稳定
function similarity(a, b) {
    const x = normalize(a), y = normalize(b);
    if (!x && !y) return 1;
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.length < 2 || y.length < 2) return x.includes(y) || y.includes(x) ? 0.8 : 0;
    const grams = (s) => {
        const m = new Map();
        for (let i = 0; i < s.length - 1; i++) {
            const g = s.slice(i, i + 2);
            m.set(g, (m.get(g) || 0) + 1);
        }
        return m;
    };
    const gx = grams(x), gy = grams(y);
    let overlap = 0;
    for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) || 0);
    return (2 * overlap) / (x.length - 1 + y.length - 1);
}

// 同一条评论判定：用户名相近 + 文本相近（允许 OCR/模型的表情、标点、个别字差异）
function sameItem(a, b) {
    const userSim = (a.user || '') === (b.user || '') ? 1 : similarity(a.user, b.user);
    if (userSim < 0.6) return false; // 用户名允许 OCR/模型的 1 个字差异（如 羽/狂）
    return similarity(a.text, b.text) >= 0.8;
}

const GAP = { __gap: true }; // 断层 / 缺帧分隔符

// 把按时间排序的若干帧拼成一条序列：
// - 找序列末尾与新帧开头的最长模糊重叠，重叠只保留一份
// - 无重叠 -> 断层（插入 GAP），线程不跨断层归属
// - 缺帧（提取失败，frame 为 null）-> 同样插入 GAP
// - 与序列尾部近期条目近似重复的条目不再追加
// 单条重叠的最大允许时间间隔（秒）：超过则视为不同发言
const SINGLE_OVERLAP_MAX_SECONDS = 60;

function secondsBetween(a, b) {
    const ta = Date.parse(a), tb = Date.parse(b);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return Infinity;
    return Math.abs(ta - tb) / 1000;
}

// 合并规则（最佳方案）：
// 1. 多条连续一致（>=2）的重叠：直接视为同一段内容，合并。
// 2. 单条重叠：必须同时满足 (a) 该条正是紧邻上一帧里出现的那条（帧连续）
//    (b) 时间间隔 <= SINGLE_OVERLAP_MAX_SECONDS (c) 用户+文本完全一致。
//    否则视为不同发言，保留两条。
// 3. 缺帧（null）或无重叠：插入断层标记，断层两侧不合并。
function mergeFrameItems(frames) {
    let seq = [];
    const gaps = [];
    let pendingGap = false;
    let prevFrameId = null;     // 上一个有效帧的 id（用于判断帧连续）
    let prevFrameTime = null;   // 上一个有效帧的时间

    const stamp = (item) => ({
        ...item,
        firstSeen: item.frameTime ?? null,
        lastSeen: item.frameTime ?? null,
        lastSeenFrameId: item.frameId ?? null,
    });

    for (const frame of frames) {
        if (frame === null) { pendingGap = true; continue; } // 缺帧：不清空 prevFrameId，连续性由时间阈值兜底
        if (!frame.length) continue;

        const real = seq.filter(x => !x.__gap);
        const pendingWasGap = pendingGap;
        if (pendingGap && seq.length && !seq[seq.length - 1].__gap) {
            gaps.push(seq.length); seq.push(GAP);
        }
        pendingGap = false;

        const frameId = frame[0].frameId ?? null;
        const frameTime = frame[0].frameTime ?? null;

        // 寻找重叠：对序列中每个起点，计算与新帧开头连续一致的长度
        let bestStart = -1, bestLen = 0;
        for (let st = 0; st < real.length; st++) {
            let len = 0;
            while (st + len < real.length && len < frame.length && sameItem(real[st + len], frame[len])) len++;
            if (len === 0 || len < bestLen) continue;

            let accept = false;
            if (len >= 2) {
                accept = true; // 规则 1
            } else {
                // 规则 2：单条，检查帧连续 + 时间间隔 + 完全一致
                const existing = real[st];
                // 连续：该条最近出现的帧就是上一有效帧；或中间只隔了缺帧（由时间阈值约束）
                const frameContiguous = prevFrameId !== null && (existing.lastSeenFrameId === prevFrameId || pendingWasGap);
                const withinTime = secondsBetween(existing.lastSeen, frameTime) <= SINGLE_OVERLAP_MAX_SECONDS;
                const exact = (existing.user || '') === (frame[0].user || '')
                    && normalize(existing.text) === normalize(frame[0].text);
                accept = frameContiguous && withinTime && exact;
            }
            if (accept && len > bestLen) { bestStart = st; bestLen = len; }
        }

        if (bestLen > 0) {
            // 重叠条目：沿用已有条目，更新末次出现时间与帧
            for (let j = 0; j < bestLen; j++) {
                const existing = real[bestStart + j];
                existing.lastSeen = frame[j].frameTime ?? existing.lastSeen;
                existing.lastSeenFrameId = frame[j].frameId ?? existing.lastSeenFrameId;
            }
            for (const item of frame.slice(bestLen)) seq.push(stamp(item));
        } else {
            // 无可信重叠：断层
            if (seq.length) { gaps.push(seq.length); seq.push(GAP); }
            for (const item of frame) seq.push(stamp(item));
        }
        prevFrameId = frameId;
        prevFrameTime = frameTime;
    }
    return { items: seq, gaps };
}

// 截图提取的提示词（两种等价写法）：模型偶尔对同一张图返回空内容，换写法再试
const SHOT_PROMPTS = [
    (label) => `这是 ${label} 笔记页截图。只提取右侧评论区里的评论，输出 JSON 数组，每项 {"user":"","text":"","isAuthor":false,"level":0,"replyTarget":null,"expandCount":0}。
- isAuthor：用户名旁带“作者”标签为 true。
- level：只能是 0 或 1。母评论为 0；所有子回复为 1。
- replyTarget：子评论开头有“回复 某人 :”时填该人名，并从 text 去掉前缀；没有则为 null。母评论下的第一条回复没有前缀。
- expandCount：母评论下显示“展开 N 条回复”时填 N，否则 0。“展开”按钮行本身不要输出为记录。
- 看不清的写 null，不要编造。只输出 JSON。`,
    (label) => `${label} 笔记页截图里，右侧评论区的每条评论输出为 JSON 数组中的一项：{"user":"","text":"","isAuthor":false,"level":0,"replyTarget":null,"expandCount":0}。
字段规则：isAuthor 为作者标签；level 0=母评论，1=子回复；replyTarget 取子评论前缀“回复 某人 :”里的人名；expandCount 取母评论下的“展开 N 条回复”的 N。只输出 JSON。`,
];

async function extractRawItems(frameId, platform, frameTime = null) {
    const img = await getFrameJpegBase64(frameId);
    let content = null;
    for (const buildPrompt of SHOT_PROMPTS) {
        try {
            content = await callModel([{ role: 'user', content: [
                { type: 'text', text: buildPrompt(platform.label) },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } },
            ] }], { maxTokens: 1500, retries: 1 });
            break;
        } catch (error) {
            console.error(`截图提取写法失败，换下一种: ${error.message}`);
        }
    }
    if (!content) throw new Error('截图提取：所有写法均无返回');
    // 模型偶尔在 JSON 前后加说明文字：截取第一个 [ 到最后一个 ] 之间的内容再解析
    const cleanedText = content.replace(/```json|```/g, '').trim();
    const start = cleanedText.indexOf('[');
    const end = cleanedText.lastIndexOf(']');
    if (start < 0 || end <= start) throw new Error('模型未返回 JSON 数组');
    const items = JSON.parse(cleanedText.slice(start, end + 1));
    // 清洗：去掉“展开N条回复”按钮行（把 N 归到上方母评论），level 只保留 0/1
    const cleaned = [];
    let lastRoot = null;
    for (const i of items) {
        if (!i) continue;
        const text = (i.text || '').trim();
        const isButton = /展开\s*\d+\s*条回复/.test(i.user || '') || /展开\s*\d+\s*条回复/.test(text);
        if (isButton) {
            const n = parseInt((`${i.user} ${text}`.match(/展开\s*(\d+)/) || [])[1] || '0', 10);
            if (lastRoot && n > 0) lastRoot.expandCount = n;
            continue;
        }
        if (!text) continue;
        const level = i.level === 0 ? 0 : 1; // 2 及以上都视为子回复
        const rec = { ...i, level, text, frameId, frameTime };
        if (level === 0) lastRoot = rec;
        cleaned.push(rec);
    }
    return cleaned;
}


// 只整理原始字段，不让模型主观分类（类型标签已去掉）
function toRecords(rows) {
    return rows.map(r => ({
        platform: r.platform,
        user: r.user,
        level: r.level,        // 0 母评论 / 1 子评论 / null 未知（OCR 路径）
        isAuthor: r.isAuthor ?? null, // 是否笔记作者本人（OCR 路径未知时为 null）
        id: r.id ?? null,
        parentId: r.parentId ?? null,
        replyToUser: r.replyToUser ?? null, // 这条评论回复的是谁（母评论或线程内的人）
        replyToId: r.replyToId ?? null,     // 被回复评论的 id
        hasAuthorReply: r.hasAuthorReply ?? null, // true 有 / false 无 / null 无法从截图确定
        collapsedReplies: r.expandCount ?? null,  // 母评论显示的总回复数
        hiddenReplies: r.hiddenReplies ?? null,   // 线程内未展开、未抓到的回复数
        content: r.text,
        noteId: r.noteId ?? null,      // 这条评论所属的笔记（推文/视频）id
        sourceUrl: r.sourceUrl ?? null, // 这条评论所属的笔记 URL
        firstSeen: r.firstSeen ?? null,
        lastSeen: r.lastSeen ?? null,
        source: r.source,
    }));
}


async function runHackathonDemo() {
    console.log("🚀 启动 LaunchShadow...");
    console.log("⏳ 请切到小红书笔记页（只有焦点在小红书时才会抓取）...");
    await sleep(6000);

    console.log("📸 正在读取当前焦点平台的评论...");
    const rows = await getScreenContextWithFallback();
    if (!rows) {
        console.log("⚠️ 当前焦点不在已启用平台，或没有读到评论。");
        return;
    }

    const records = toRecords(rows);
    console.log(`\n✅ 共 ${records.length} 条原始记录（level: 0=母评论, 1=子评论, null=未知）:`);
    console.log(JSON.stringify(records, null, 2));
}

runHackathonDemo();
