// 公共层：screenpipe 本地 API 访问（与平台无关）
import fetch from 'node-fetch';

export const BASE = process.env.SCREENPIPE_LOCAL_API_URL || 'http://localhost:3030';
const API_KEY = process.env.SCREENPIPE_KEY || process.env.SCREENPIPE_LOCAL_API_KEY;
export const API_HEADERS = { Authorization: `Bearer ${API_KEY}`, 'X-Screenpipe-Client': 'api' };

export async function getJson(path) {
    const res = await fetch(BASE + path, { headers: API_HEADERS });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
}

export async function getFrameJpegBase64(frameId) {
    const res = await fetch(`${BASE}/frames/${frameId}`, { headers: API_HEADERS });
    if (!res.ok) throw new Error(`frame ${frameId}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString('base64');
}

// 带重试的模型调用：空内容或请求失败时重试，最终报错（不再静默返回 null）
