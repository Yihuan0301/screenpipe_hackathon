// 入口：遍历已启用平台，取当前焦点笔记的评论线程，输出结构化记录
import 'dotenv/config'; // 必须最先加载：core/screenpipe.js 在导入时读取 .env
import { ACTIVE_PLATFORMS } from './platforms/index.js';
import { getPlatformFrames, collectNoteThread } from './platforms/xiaohongshu/index.js';
import { toRecords } from './core/records.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getScreenContextWithFallback() {
    const out = [];
    for (const platform of ACTIVE_PLATFORMS) {
        let frames = [];
        try {
            frames = await getPlatformFrames(platform, { limit: 200, since: '30m ago' });
        } catch (error) {
            console.error(`${platform.label} 帧查询失败:`, error.message);
            continue;
        }
        if (!frames.length) continue; // 焦点不在该平台，跳过
        // 最近一篇笔记：在所有帧中找最新的、带笔记 id 的帧（跳过主页等非笔记页）
        const withNote = frames.find(f => f.noteId);
        if (!withNote) continue;
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

async function main() {
    console.log('🚀 启动 LaunchShadow...');
    console.log('⏳ 请切到小红书笔记页（只有焦点在小红书时才会抓取）...');
    await sleep(6000);

    console.log('📸 正在读取当前焦点平台的评论...');
    const rows = await getScreenContextWithFallback();
    if (!rows) {
        console.log('⚠️ 当前焦点不在已启用平台，或没有读到评论。');
        return;
    }
    const records = toRecords(rows);
    console.log(`\n✅ 共 ${records.length} 条原始记录（level: 0=母评论, 1=子评论, null=未知）:`);
    console.log(JSON.stringify(records, null, 2));
}

main();
