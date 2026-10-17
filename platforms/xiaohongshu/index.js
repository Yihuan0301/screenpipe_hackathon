// 小红书平台模块（队友负责）：帧查询、评论区 OCR、截图提取、单篇笔记线程收集
import { getJson, getFrameJpegBase64 } from '../../core/screenpipe.js';
import { callModel } from '../../core/model.js';
import { linkReplies, mergeFrameItems } from '../../core/threads.js';

// 1) 找某平台最近的 OCR 帧
export async function getPlatformFrames(platform, { limit = 10, since = '10m ago', focusedOnly = true } = {}) {
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
export async function collectNoteThread(platform, noteId, frames) {
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


