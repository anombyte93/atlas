const MCP_BASE_URL = process.env.MCP_CLI_URL;
const MCP_ANALYZE_PATH = process.env.MCP_CLI_ANALYZE_PATH || "/analyze";
const MCP_CHAT_PATH = process.env.MCP_CLI_CHAT_PATH || "/chat";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export type AnalyzePayload = {
  image_url?: string;
  barcode_text?: string;
};

export type AnalyzeResult = {
  analysis: string;
  chemicals: string[];
  rating: string;
  source: string;
};

export async function callMcpAnalyze(
  payload: AnalyzePayload,
  signal?: AbortSignal
): Promise<AnalyzeResult | null> {
  if (!MCP_BASE_URL) return null;
  try {
    const url = new URL(MCP_ANALYZE_PATH, MCP_BASE_URL).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return normalizeAnalyzeResult(data, "mcp");
    }
    const text = await res.text();
    return {
      analysis: text || "No analysis returned.",
      chemicals: [],
      rating: "unknown",
      source: "mcp",
    };
  } catch {
    return null;
  }
}

export async function callOpenAIAnalyze(
  payload: AnalyzePayload,
  signal?: AbortSignal
): Promise<AnalyzeResult | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You analyze food items. Return JSON with keys: analysis (string), chemicals (string[]), rating (string).",
          },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return normalizeAnalyzeResult(content, "openai");
  } catch {
    return null;
  }
}

export async function callOpenAIChat(
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function callMcpChatStream(
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal
): Promise<Response | null> {
  if (!MCP_BASE_URL) return null;
  try {
    const url = new URL(MCP_CHAT_PATH, MCP_BASE_URL).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ messages }),
      signal,
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

function normalizeAnalyzeResult(
  input: any,
  source: string
): AnalyzeResult {
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return normalizeAnalyzeResult(parsed, source);
    } catch {
      return {
        analysis: input,
        chemicals: [],
        rating: "unknown",
        source,
      };
    }
  }

  const analysis =
    input?.analysis || input?.summary || input?.text || "No analysis returned.";
  const chemicals = Array.isArray(input?.chemicals)
    ? input.chemicals.map((c: unknown) => String(c))
    : [];
  const rating = input?.rating || input?.score || "unknown";

  return {
    analysis: String(analysis),
    chemicals,
    rating: String(rating),
    source,
  };
}
