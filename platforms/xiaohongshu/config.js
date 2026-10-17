// 小红书平台配置（队友负责这里）：窗口匹配规则 + 评论区坐标
export const xiaohongshu = {
    label: '小红书',
    app: 'Google Chrome',
    windowMatch: '小红书',
    urlHost: 'xiaohongshu.com',
    noteUrlPattern: /explore\/([0-9a-f]+)/i, // 笔记 id 从 URL 中取
    commentArea: { minTop: 0.15, maxTop: 0.88, minLeft: 0.15, maxLeft: 0.95 },
    enabled: true,
};
