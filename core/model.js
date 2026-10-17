// 公共层：视觉模型调用（经 screenpipe 的 /v1/chat/completions）
import fetch from 'node-fetch';
import { BASE, API_HEADERS } from './screenpipe.js';

export const MODEL = process.env.LAUNCHSHADOW_MODEL || 'claude-sonnet-5';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的模型调用：空内容或请求失败时重试，最终报错（不静默返回 null）
export async function callModel(messages, { maxTokens = 2048, json = false, retries = 2 } = {}) {
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
