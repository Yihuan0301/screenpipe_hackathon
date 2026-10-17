// 公共层：回复关系（线程）计算 + 多帧滚动合并（与平台无关）
export function linkReplies(items, platformLabel) {
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
export function sameItem(a, b) {
    const userSim = (a.user || '') === (b.user || '') ? 1 : similarity(a.user, b.user);
    if (userSim < 0.6) return false; // 用户名允许 OCR/模型的 1 个字差异（如 羽/狂）
    return similarity(a.text, b.text) >= 0.8;
}

export const GAP = { __gap: true }; // 断层 / 缺帧分隔符

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
export function mergeFrameItems(frames) {
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

