/** Shared OpenAI-compatible chat (DeepSeek / OpenAI). */

export async function callLlm(
  prompt: string,
  system = "Return only compact JSON."
): Promise<string | null> {
  const key =
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.LLM_API_KEY;
  if (!key) return null;

  const base = (
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    (process.env.DEEPSEEK_API_KEY
      ? "https://api.deepseek.com"
      : "https://api.openai.com/v1")
  ).replace(/\/$/, "");

  const model =
    process.env.LLM_MODEL ||
    (process.env.DEEPSEEK_API_KEY ? "deepseek-chat" : "gpt-4o-mini");

  const url = base.includes("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.warn("[llm] http", res.status, err.slice(0, 200));
    return null;
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? null;
}
