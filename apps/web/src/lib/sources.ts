import type { SourceSnippet } from "@chatconstituicao/shared";

const SOURCE_REGEX = /\[\[(?:source:)?([\w.\-]+)\|"([^"]+)"\]\]/g;

const PART_NAMES: Record<string, string> = {
  "principios-fundamentais": "Princípios Fundamentais",
  "parte-i": "Parte I",
  "parte-ii": "Parte II",
  "parte-iii": "Parte III",
  "parte-iv": "Parte IV",
  "disposicoes-finais": "Disp. Finais",
};

export function getBreadcrumb(articleId: string): string {
  const parts = articleId.split(".");
  const segments: string[] = [];

  for (const part of parts) {
    if (PART_NAMES[part]) {
      segments.push(PART_NAMES[part]);
    } else if (part.startsWith("titulo-")) {
      segments.push(`Tít. ${part.replace("titulo-", "").toUpperCase()}`);
    } else if (part.startsWith("cap-")) {
      segments.push(`Cap. ${part.replace("cap-", "").toUpperCase()}`);
    } else if (part.startsWith("art-")) {
      segments.push(`Art. ${part.replace("art-", "")}.º`);
    }
  }

  return segments.length > 0 ? segments.join(" › ") : articleId;
}

export function parseSourceMarkers(
  text: string,
): { segments: (string | SourceSnippet)[] } {
  const segments: (string | SourceSnippet)[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(SOURCE_REGEX)) {
    const fullMatch = match[0];
    const articleId = match[1];
    const quotedText = match[2];
    const matchIndex = match.index!;

    if (matchIndex > lastIndex) {
      segments.push(text.slice(lastIndex, matchIndex));
    }

    segments.push({
      articleId,
      quotedText,
      articleTitle: getBreadcrumb(articleId),
      breadcrumb: getBreadcrumb(articleId),
    });

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return { segments };
}
