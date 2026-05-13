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
      className="inline-flex align-baseline items-baseline mx-1 px-1.5 py-[2px] max-w-full text-[0.9em] leading-none italic text-ink bg-accent/35 hover:bg-accent/50 transition-colors cursor-pointer border-b border-accent/70 hover:border-ink/60 font-serif"
    >
      {breadcrumb}
    </button>
  );
}
