import { useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { PaymentBanner } from "./PaymentBanner";

const API_URL = import.meta.env.VITE_API_URL as string;

type ChatPanelProps = {
  token: string | undefined;
  isExhausted: boolean;
  onSourceClick: (articleId: string, quotedText?: string) => void;
  onMessageSent: () => void;
};

export function ChatPanel({
  token,
  isExhausted,
  onSourceClick,
  onMessageSent,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, setInput, handleSubmit, isLoading } = useChat({
    api: `${API_URL}/api/chat`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    onFinish: () => {
      onMessageSent();
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || isLoading || isExhausted) return;
    handleSubmit();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <h2 className="text-lg font-serif font-semibold text-brown mb-2">
              Bem-vindo ao Chat Constituicao
            </h2>
            <p className="text-sm text-brown-light max-w-sm">
              Faca perguntas sobre a Constituicao da Republica Portuguesa.
              As respostas incluem referencias aos artigos relevantes.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role as "user" | "assistant"}
            content={typeof msg.content === "string" ? msg.content : ""}
            onSourceClick={onSourceClick}
          />
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start mb-4">
            <div className="px-4 py-3 bg-beige rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-brown-light rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-brown-light rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-2 h-2 bg-brown-light rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {isExhausted && <PaymentBanner token={token} />}

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isLoading || isExhausted}
        placeholder={
          isExhausted
            ? "Limite de perguntas atingido"
            : "Faca uma pergunta sobre a Constituicao..."
        }
      />
    </div>
  );
}
