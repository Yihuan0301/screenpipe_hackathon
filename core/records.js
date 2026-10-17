// 公共层：把合并结果转换为输出记录（只整理原始字段，不做主观分类）
export function toRecords(rows) {
    return rows.map(r => ({
        platform: r.platform,
        user: r.user,
        level: r.level,               // 0 母评论 / 1 子评论 / null 未知
        isAuthor: r.isAuthor ?? null, // 是否笔记作者本人（未知为 null）
        id: r.id ?? null,
        parentId: r.parentId ?? null,
        replyToUser: r.replyToUser ?? null,
        replyToId: r.replyToId ?? null,
        hasAuthorReply: r.hasAuthorReply ?? null, // true / false / null（无法确定）
        collapsedReplies: r.expandCount ?? null,  // 母评论显示的总回复数
        hiddenReplies: r.hiddenReplies ?? null,   // 线程内未展开、未抓到的回复数
        content: r.text,
        noteId: r.noteId ?? null,       // 所属笔记（推文/视频）id
        sourceUrl: r.sourceUrl ?? null, // 所属笔记 URL
        firstSeen: r.firstSeen ?? null,
        lastSeen: r.lastSeen ?? null,
        source: r.source,
    }));
}
