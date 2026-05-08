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
      <div className="flex justify-end mb-8">
        <div className="max-w-[75%] text-sm text-ink-light italic text-right">
          {content}
        </div>
      </div>
    );
  }

  const { segments } = parseSourceMarkers(content);

  return (
    <div className="mb-8">
      <div className="max-w-[85%] text-sm leading-[1.8] text-ink">
        {segments.map((segment, i) => {
          if (typeof segment === "string") {
            return <span key={i}>{segment}</span>;
          }

          const source = segment as SourceSnippet;
          return (
            <span key={i} className="inline">
              <SourcePill
                articleId={source.articleId}
                quotedText={source.quotedText}
                breadcrumb={source.breadcrumb}
                onClick={(id) => onSourceClick(id, source.quotedText)}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
