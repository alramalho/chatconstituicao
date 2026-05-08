type SourcePillProps = {
  articleId: string;
  quotedText: string;
  breadcrumb: string;
  onClick: (articleId: string) => void;
};

export function SourcePill({
  articleId,
  quotedText,
  breadcrumb,
  onClick,
}: SourcePillProps) {
  return (
    <button
      onClick={() => onClick(articleId)}
      title={quotedText}
      className="inline-flex items-center mx-0.5 text-xs italic text-accent hover:text-ink transition-colors cursor-pointer border-b border-dashed border-accent/40 hover:border-ink/40 font-serif"
    >
      {breadcrumb}
    </button>
  );
}
