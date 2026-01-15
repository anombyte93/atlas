"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const starterMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Upload a label or barcode. I will summarize additives, allergens, and risk factors.",
  },
];

const STREAM_CHUNK_MS = 26;

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const pendingTextRef = useRef<string>("");
  const intervalRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputId = useId();

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const streamAssistantReply = (fullText: string, messageId: string) => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    pendingTextRef.current = fullText;
    setIsStreaming(true);

    intervalRef.current = window.setInterval(() => {
      setMessages((prev) => {
        const next = [...prev];
        const targetIndex = next.findIndex((msg) => msg.id === messageId);
        if (targetIndex === -1) return prev;

        const current = next[targetIndex];
        const nextChar = pendingTextRef.current.slice(0, 1);
        if (!nextChar) {
          window.clearInterval(intervalRef.current ?? undefined);
          intervalRef.current = null;
          setIsStreaming(false);
          return prev;
        }

        pendingTextRef.current = pendingTextRef.current.slice(1);
        next[targetIndex] = {
          ...current,
          content: `${current.content}${nextChar}`,
        };
        return next;
      });
    }, STREAM_CHUNK_MS);
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user" as const,
      content: input.trim(),
    };
    const assistantMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant" as const,
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");

    streamAssistantReply(
      "Got it. I'm scanning the ingredients now. I will highlight additives, allergens, and give a quick rating once the analysis finishes.",
      assistantMessage.id,
    );
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-lg">Ask Molly</CardTitle>
          <p className="text-xs text-muted-foreground">
            AI responses stream in real time.
          </p>
        </div>
        <Badge variant={isStreaming ? "secondary" : "outline"}>
          {isStreaming ? "Streaming" : "Ready"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-xl border bg-muted/40 p-4"
          aria-live="polite"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-sm ${
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-background text-foreground"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] opacity-70">
                {msg.role}
              </p>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                {msg.content || (msg.role === "assistant" ? "…" : "")}
              </p>
            </div>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Ask about ingredients
          </label>
          <Input
            id={inputId}
            placeholder="Ask about ingredients, allergens, or ratings"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isStreaming}
          />
          <Button type="submit" disabled={isStreaming || !input.trim()}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
