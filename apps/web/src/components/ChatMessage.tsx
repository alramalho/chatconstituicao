import type { SourceSnippet } from "@chatconstituicao/shared";
import { parseSourceMarkers } from "@/lib/sources";
import { SourcePill } from "./SourcePill";

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  onSourceClick: (articleId: string, quotedText?: string) => void;
};

export function ChatMessage({ role, content, onSourceClick }: ChatMessageProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] px-4 py-3 bg-orange/10 rounded-2xl rounded-br-sm text-sm">
          {content}
        </div>
      </div>
    );
  }

  const { segments } = parseSourceMarkers(content);

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] px-4 py-3 bg-beige rounded-2xl rounded-bl-sm text-sm leading-relaxed">
        {segments.map((segment, i) => {
          if (typeof segment === "string") {
            return <span key={i}>{segment}</span>;
          }

          const source = segment as SourceSnippet;
          return (
            <span key={i} className="inline mx-0.5">
              <SourcePill
                articleId={source.articleId}
                quotedText={source.quotedText}
                breadcrumb={source.breadcrumb}
                onClick={(id) => onSourceClick(id, source.quotedText)}
              />
              {source.quotedText && (
                <span className="font-serif italic text-brown-light text-xs ml-1">
                  &ldquo;{source.quotedText}&rdquo;
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
