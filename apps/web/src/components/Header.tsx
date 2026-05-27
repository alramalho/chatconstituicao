import { documentConfig } from "@/lib/document";

export function Header() {
  return (
    <div className="inline-flex items-center gap-6 px-6 py-2 border-[2px] border-ink bg-parchment">
      <h1 className="text-sm font-title tracking-[0.2em] uppercase text-ink whitespace-nowrap">
        {documentConfig.productName}
      </h1>
    </div>
  );
}
