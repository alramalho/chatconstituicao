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
      className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-orange/15 text-orange-dark border border-orange/30 rounded-full text-xs font-medium hover:bg-orange/25 transition-colors cursor-pointer"
    >
      <svg
        className="w-3 h-3 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
      {breadcrumb}
    </button>
  );
}
