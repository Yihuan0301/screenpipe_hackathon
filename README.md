# launch-shadow

读取 screenpipe 录屏里当前焦点的小红书笔记页评论，用视觉模型（经 screenpipe 本地接口）把评论结构化，并尽量还原"谁回复了谁、作者是否回复过"。

目前只启用了小红书（Chrome 中的笔记页）。代码里预留了 `PLATFORMS` 适配器，后续可加 X、Reddit 等平台。

## 工作原理

1. 从 screenpipe 本地 API（`http://localhost:3030`）查询最近 30 分钟内、焦点在 Chrome 且 URL 为小红书笔记页（`/explore/<id>`）的 OCR 帧。
2. 按笔记 id 分组，取最近一篇笔记的所有帧，按时间排序。
3. 每一帧截图（`/frames/<id>`）发给视觉模型（`/v1/chat/completions`），提取评论列表：用户名、正文、是否作者、层级（0=母评论，1=子回复）、`回复 X :` 前缀、"展开 N 条回复"数量。
4. 相邻帧按模糊匹配做重叠对齐，拼成一条连续序列；无法对齐处记为断层，断层两侧不做线程归属。
5. 根据"首条子回复无前缀默认回复母评论，之后的子回复带 `回复 X :` 前缀"的规则，计算每条评论的 `replyToUser`、`parentId`，以及 `hasAuthorReply`（`true` / `false` / `null`=无法确定）。
6. 当前版本只把结果打印成 JSON 到控制台，没有写库或发通知。

## 环境要求

- macOS（代码中的窗口匹配和 `node-notifier` 依赖桌面环境）
- Node.js 18 以上（开发环境为 v25.2.1）
- 已安装并运行 [screenpipe](https://screenpi.pe)，且屏幕录制、窗口/URL 采集已开启
- Google Chrome，用它打开小红书笔记页

## 安装

```bash
git clone git@github.com:Yihuan0301/screenpipe_hackathon.git launch-shadow
cd launch-shadow
npm install
```

## 配置

在项目根目录新建 `.env`（**不要提交到 Git**，`.gitignore` 已忽略它）：

```env
SCREENPIPE_KEY=你的_screenpipe_本地_API_key
# 可选：视觉模型名，默认 claude-sonnet-5
# LAUNCHSHADOW_MODEL=claude-sonnet-5
# 可选：screenpipe 本地 API 地址，默认 http://localhost:3030
# SCREENPIPE_LOCAL_API_URL=http://localhost:3030
```

- `SCREENPIPE_KEY`：screenpipe 本地 API 的 Bearer token，从 screenpipe 设置中获取。代码也接受 `SCREENPIPE_LOCAL_API_KEY` 作为替代变量名。
- 没有 key 时请求会返回 401，所有模型调用都会失败。

## 运行

```bash
node index.js
```

启动后有约 6 秒等待时间，请在这段时间内把 Chrome 切到一篇小红书笔记页并停在评论区。之后程序会抓取最近 30 分钟内的笔记帧，并把结构化结果打印出来。

如果输出 `当前焦点不在已启用平台，或没有读到评论`，通常是：

- 焦点不在小红书笔记页（用户主页、首页等不会被当作笔记处理）；
- 最近 30 分钟内没有焦点在笔记页的帧；
- 窗口标题或 URL 没有被 screenpipe 采集到（`browser_url` 为空）。

## 输出字段

| 字段 | 含义 |
|---|---|
| `id` | 本次运行中的记录编号，如 `小红书-0` |
| `user` / `text` | 评论者名称与正文 |
| `isAuthor` | 是否为笔记作者 |
| `level` | `0` 母评论，`1` 子回复 |
| `replyToUser` / `replyToId` | 这条评论回复的是谁，以及被回复评论的 id |
| `parentId` / `parentUser` | 所属母评论 |
| `hasAuthorReply` | 作者是否回复过这条评论：`true` 已回复，`false` 确认未回复，`null` 无法确定（例如仍有未展开的回复，或断层导致无法归属） |
| `hiddenReplies` | 线程内未展开、未抓到的回复数 |
| `collapsedReplies` | 母评论上显示的总回复数 |
| `firstSeen` / `lastSeen` | 该条评论首次与最后一次出现在哪一帧的时间 |

## 已知限制

- **依赖视觉模型**：同一张图每次输出的用户名或表情可能略有差异；模型偶尔返回空内容或非 JSON，会被记为"缺帧"并造成断层。
- **只能看到滚动过的内容**：没滚动到的评论不会出现；列表顶部的母评论如果从未出现在任何一帧里，其子回复的归属会是 `null`。
- **断层**：相邻帧之间需要有重叠内容。滚动过快会导致断层，断层处不做线程归属，宁可标 `null` 也不猜。
- **去重规则**：只有"紧邻帧、时间间隔 60 秒内、用户名与正文一致"的单条重叠才会合并；同一人在不同时间说了相同的话会被保留为两条。
- **未经充分验证**：合并与线程逻辑仍在调试中。最近一次真实运行因焦点不在笔记页而返回空结果，尚未在完整笔记上做端到端验证。
- **仅 macOS**：窗口匹配依赖 Chrome 的窗口标题与 screenpipe 的 OCR 帧。

## 目录

```
index.js          主程序（抓取、模型提取、合并、线程计算）
package.json      依赖声明
package-lock.json 依赖锁定
.gitignore        忽略 node_modules、.env 等
```
