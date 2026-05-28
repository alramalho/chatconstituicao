import type { LegalArticle, LegalDocument } from "../data/types.js";
import type { PageIndexArticleRef } from "./types.js";

export function collectArticleRefs(document: LegalDocument): PageIndexArticleRef[] {
  return document.articles.map(articleToRef);
}

export function articleToRef(article: LegalArticle): PageIndexArticleRef {
  return { id: article.id, title: article.title, content: article.content };
}

export function mergeArticleRefs(
  ...groups: (PageIndexArticleRef[] | { id: string; title: string; content?: string }[])[]
): PageIndexArticleRef[] {
  const merged = new Map<string, PageIndexArticleRef>();
  for (const group of groups) {
    for (const article of group) {
      if (!article.content) continue;
      merged.set(article.id, {
        id: article.id,
        title: article.title,
        content: article.content,
      });
    }
  }
  return [...merged.values()];
}

export function buildArticleContext(articleRefs: PageIndexArticleRef[]): string {
  return articleRefs.map((article) => `[${article.id}] ${article.title}:\n${article.content}`).join("\n\n---\n\n");
}

export function sortByDocumentOrder(
  articleRefs: PageIndexArticleRef[],
  allArticles: PageIndexArticleRef[],
): PageIndexArticleRef[] {
  const indexById = new Map(allArticles.map((article, index) => [article.id, index]));
  return articleRefs
    .slice()
    .sort((a, b) => (indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export function expandWithDocumentNeighbors(
  selected: PageIndexArticleRef[],
  allArticles: PageIndexArticleRef[],
  window: number,
): PageIndexArticleRef[] {
  if (window <= 0) return sortByDocumentOrder(selected, allArticles);

  const indexById = new Map(allArticles.map((article, index) => [article.id, index]));
  const expanded = new Map(selected.map((article) => [article.id, article]));

  for (const article of selected) {
    const index = indexById.get(article.id);
    if (index === undefined) continue;
    for (let offset = -window; offset <= window; offset++) {
      const neighbor = allArticles[index + offset];
      if (neighbor) expanded.set(neighbor.id, neighbor);
    }
  }

  return sortByDocumentOrder([...expanded.values()], allArticles);
}
