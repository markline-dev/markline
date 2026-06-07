import type { AiProvider } from "../config";

/**
 * OpenAI-compatible chat transport. One code path covers OpenAI, OpenRouter,
 * Together, Groq, Fireworks and local (Ollama/LM Studio) — they differ only in
 * base URL, model string and (OpenRouter) two attribution headers. Pure (no
 * env, no Node APIs) so it runs server-side (proxy mode) or in the browser
 * (reader-BYOK mode). See _docs/AI-BYOK-DESIGN.md §1.
 */

/** OpenAI-compatible multimodal content part. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export const DEFAULT_SYSTEM_PROMPT =
  "You are the documentation assistant for an API reference built with Markline " +
  "(an open-source, self-hostable docs framework where AI runs on the operator's own key — BYOK). " +
  "Answer concretely and concisely, grounded in the provided context. Prefer short paragraphs and " +
  "fenced code blocks (```) for example requests. Use **bold** for key terms and `code` for fields, " +
  "endpoints and commands. If the context does not cover the question, say so briefly.";

export function buildMessages(
  systemPrompt: string | undefined,
  context: string | undefined,
  question: string,
  images?: string[],
): ChatMessage[] {
  const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const grounded = context ? `${system}\n\nContext:\n${context}` : system;
  const userContent: string | ContentPart[] =
    images && images.length
      ? [
          { type: "text", text: question },
          ...images.map((url): ContentPart => ({ type: "image_url", image_url: { url } })),
        ]
      : question;
  return [
    { role: "system", content: grounded },
    { role: "user", content: userContent },
  ];
}

export type ChatOptions = {
  baseUrl: string;
  model: string;
  key: string;
  messages: ChatMessage[];
  maxTokens?: number;
  provider?: AiProvider;
  /** OpenRouter attribution (optional). */
  referer?: string;
  title?: string;
  signal?: AbortSignal;
};

/** Non-streaming completion. Returns the assistant text, or throws on error. */
export async function chatComplete(opts: ChatOptions): Promise<string> {
  if (!opts.baseUrl) throw new Error("No AI base URL resolved (set provider or baseUrl).");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.key}`,
    "content-type": "application/json",
  };
  if (opts.provider === "openrouter") {
    if (opts.referer) headers["HTTP-Referer"] = opts.referer;
    if (opts.title) headers["X-Title"] = opts.title;
  }
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      max_tokens: opts.maxTokens ?? 1024,
      messages: opts.messages,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error?.message ?? JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`Provider returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Malformed provider response.");
  return text.trim();
}
