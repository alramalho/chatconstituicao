import { useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
} from "@/components/ai-elements/message";
import { SourcePill } from "./SourcePill";
import { parseSourceMarkers } from "@/lib/sources";
import type { SourceSnippet } from "@chatconstituicao/shared";
import { documentConfig } from "@/lib/document";

const API_URL = import.meta.env.VITE_API_URL as string;

type ChatPanelProps = {
  onSourceClick: (articleId: string, quotedText?: string) => void;
};

export function ChatPanel({
  onSourceClick,
}: ChatPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const { messages, input, setInput, handleSubmit, isLoading, error } = useChat({
    api: `${API_URL}/api/chat`,
    streamProtocol: "text",
  });

  const lastMsg = messages[messages.length - 1];
  const isWaiting = isLoading && (!lastMsg || lastMsg.role === "user");

  // Derive a status for PromptInputSubmit
  const chatStatus = useMemo(() => {
    if (error) return "error" as const;
    if (isWaiting) return "submitted" as const;
    if (isLoading) return "streaming" as const;
    return "ready" as const;
  }, [isLoading, isWaiting, error]);

  function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    handleSubmit(e);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Auto-resize textarea
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1 overflow-y-hidden">
        <ConversationContent className="px-6 py-6 gap-6">
          {messages.length === 0 && !isLoading && (
            <ConversationEmptyState
              title={documentConfig.productName}
              description={documentConfig.emptyDescription}
              className="font-serif"
            />
          )}

          {messages.map((msg) => {
            const content = typeof msg.content === "string" ? msg.content : "";

            if (msg.role === "user") {
              return (
                <Message key={msg.id} from="user">
                  <MessageContent className="font-mono text-sm italic text-ink-light">
                    {content}
                  </MessageContent>
                </Message>
              );
            }

            const { segments } = parseSourceMarkers(content);

            return (
              <Message key={msg.id} from="assistant">
                <MessageContent className="font-mono text-sm leading-[1.8]">
                  <div className="whitespace-pre-wrap">
                    {segments.map((segment, i) => {
                      if (typeof segment === "string") {
                        return <span key={i}>{segment}</span>;
                      }

                      const source = segment as SourceSnippet;
                      return (
                        <SourcePill
                          key={i}
                          articleId={source.articleId}
                          quotedText={source.quotedText}
                          breadcrumb={source.breadcrumb}
                          onClick={(id) => onSourceClick(id, source.quotedText)}
                        />
                      );
                    })}
                  </div>
                </MessageContent>
              </Message>
            );
          })}

          {isWaiting && (
            <div className="flex items-end gap-[3px] h-[20px] loader-bar">
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className="w-[7px] h-full rounded-[1px] bg-ink/60"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-800/70 italic font-serif">
              Erro: {error.message || "Algo correu mal. Tente novamente."}
            </div>
          )}
        </ConversationContent>
      </Conversation>

      <form ref={formRef} onSubmit={handleSend} className="border-t border-ink/10 px-6 pb-5 pt-3">
        <div className="flex items-end gap-3">
          <textarea
            rows={1}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={documentConfig.inputPlaceholder}
            className="flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-faint/60 outline-none py-1 font-mono disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {chatStatus === "submitted" ? (
            <span className="shrink-0 text-[11px] text-ink-faint font-mono pb-1 animate-pulse">...</span>
          ) : chatStatus === "streaming" ? (
            <span className="shrink-0 w-2 h-2 bg-ink rounded-full mb-2 animate-pulse" />
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="shrink-0 text-[11px] uppercase tracking-wider text-ink-light hover:text-ink transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer font-mono pb-1"
            >
              enviar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
