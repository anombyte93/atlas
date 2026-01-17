import { callMcpChatStream, callOpenAIChat } from "../_lib/mcp";
import { readDb, writeDb } from "../_lib/storage";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function enqueueText(controller: ReadableStreamDefaultController, text: string) {
  if (!text) return;
  controller.enqueue(encoder.encode(text));
}

async function streamPlainText(
  controller: ReadableStreamDefaultController,
  text: string
) {
  const chunkSize = 24;
  for (let i = 0; i < text.length; i += chunkSize) {
    enqueueText(controller, text.slice(i, i + chunkSize));
  }
}

async function streamFromSse(
  body: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController,
  onChunk: (text: string) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const packet = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of packet.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        let text = data;
        try {
          const parsed = JSON.parse(data);
          text =
            parsed?.text ||
            parsed?.delta ||
            parsed?.content ||
            parsed?.message?.content ||
            data;
        } catch {
          // keep raw data
        }

        onChunk(text);
        enqueueText(controller, text);
      }

      idx = buffer.indexOf("\n\n");
    }
  }
}

export async function POST(req: Request) {
  let assistantText = "";
  let messages: Array<{ role: string; content: string }> = [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await req.json();
        const message =
          typeof body?.message === "string" ? body.message.trim() : "";
        const history = Array.isArray(body?.history) ? body.history : [];
        const scanId = typeof body?.scanId === "string" ? body.scanId : null;

        if (!message) {
          enqueueText(controller, "Message is required.");
          controller.close();
          return;
        }

        let contextInjection = "";
        if (scanId) {
            const db = await readDb();
            const scan = db.images.find(img => img.id === scanId);
            if (scan && scan.analysisResult) {
                contextInjection = `
[CONTEXT: User is viewing a scan of "${scan.analysisResult.name || 'Unknown Food'}"]
Summary: ${scan.analysisResult.summary || 'N/A'}
Rating: ${scan.analysisResult.rating || 'N/A'}
Chemicals: ${(scan.analysisResult.chemicals || []).map(c => `${c.name} (${c.risk})`).join(', ')}
[End of Context]

`;
            }
        }

        messages = [
          ...history.map((item: any) => ({
            role: String(item?.role || "user"),
            content: String(item?.content || ""),
          })),
          { role: "user", content: contextInjection + message },
        ];

        const mcpResponse = await callMcpChatStream(messages);
        if (mcpResponse?.body) {
          const contentType = mcpResponse.headers.get("content-type") || "";
          if (contentType.includes("text/event-stream")) {
            await streamFromSse(mcpResponse.body, controller, (text) => {
              assistantText += text;
            });
            controller.close();
            return;
          }

          if (contentType.includes("application/json")) {
            const data = await mcpResponse.json();
            const text =
              data?.text ||
              data?.message ||
              data?.response ||
              JSON.stringify(data);
            assistantText += text;
            await streamPlainText(controller, text);
            controller.close();
            return;
          }

          const text = await mcpResponse.text();
          assistantText += text;
          await streamPlainText(controller, text);
          controller.close();
          return;
        }

        const aiText = await callOpenAIChat(messages);
        const fallback =
          aiText ||
          "I could not reach the AI service. Please try again in a moment.";

        assistantText += fallback;
        await streamPlainText(controller, fallback);
        controller.close();
      } catch {
        enqueueText(controller, "Failed to process chat request.");
        controller.close();
      } finally {
        if (messages.length && assistantText) {
          const db = await readDb();
          db.chats.unshift({
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            messages: [...messages, { role: "assistant", content: assistantText }],
          });
          try {
            await writeDb(db);
          } catch (dbError) {
            console.error('Database write failed:', dbError);
            // Note: In a stream, we can't easily send an error response after streaming has started
            // The error is logged but not sent to client
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
