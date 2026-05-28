import { generateObject } from "ai";
import { gateway } from "ai";
import type { LegalDocumentConfig } from "../data/documents.js";
import type { LegalArticle } from "../data/types.js";
import type {
  LegalDocumentIndex,
  LegalIndexArticleRange,
  LegalIndexSection,
} from "../data/types.js";
import { z } from "zod";

const defaultModel = gateway("google/gemini-3-flash");
type NavigationModel = Parameters<typeof generateObject>[0]["model"];

export type NavigationResult = {
  context: string;
  articleRefs: { id: string; title: string; content: string }[];
};

export type NavigationOptions = {
  model?: NavigationModel;
  seedArticles?: LegalArticle[];
  expandNeighborWindow?: number;
  maxExpandedArticles?: number;
  localSeedLimit?: number;
};

const IndexSectionSelection = z.object({
  sectionIds: z.array(z.string()),
  reasoning: z.string(),
});

type ResolvedIndexSection = {
  id: string;
  shortId: string;
  title: string;
  number?: string;
  description?: string;
  path: string[];
  depth: number;
  articles: LegalIndexArticleRange[];
};

const selectorStopwords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "eu",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "se",
  "sem",
  "um",
  "uma",
]);

function normalizeSelectorText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectorTokens(value: string): string[] {
  return normalizeSelectorText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !selectorStopwords.has(token));
}

function expandedQuestionTokens(question: string): string[] {
  return [...new Set(selectorTokens(question))];
}

function collectSectionArticleRanges(section: LegalIndexSection): LegalIndexArticleRange[] {
  if (section.articles?.length) return section.articles;
  return (section.subsections ?? []).flatMap(collectSectionArticleRanges);
}

function flattenLegalIndex(index: LegalDocumentIndex): ResolvedIndexSection[] {
  const sections: ResolvedIndexSection[] = [];

  function visit(section: LegalIndexSection, path: string[], depth: number): void {
    const nextPath = [...path, section.title];
    const shortId = `s${sections.length + 1}`;
    sections.push({
      id: nextPath.map(normalizeSelectorText).filter(Boolean).join("."),
      shortId,
      title: section.title,
      number: section.number,
      description: section.description,
      path: nextPath,
      depth,
      articles: collectSectionArticleRanges(section),
    });

    for (const child of section.subsections ?? []) {
      visit(child, nextPath, depth + 1);
    }
  }

  for (const section of index.sections) visit(section, [], 0);
  return sections;
}

function rangeLabel(ranges: LegalIndexArticleRange[]): string {
  return ranges
    .map((range) => (range.from === range.to ? `${range.from}` : `${range.from}-${range.to}`))
    .join(", ");
}

function buildUniversalIndexPrompt(
  document: LegalDocumentConfig,
  question: string,
  sections: ResolvedIndexSection[],
): string {
  const sectionLines = sections
    .map((section) => {
      const number = section.number ? `${section.number} ` : "";
      const articles = section.articles.length ? ` (artigos ${rangeLabel(section.articles)})` : "";
      const description = section.description ? ` — ${section.description}` : "";
      return `${"  ".repeat(section.depth)}${section.shortId} ${number}${section.title}${articles}${description}`;
    })
    .join("\n");

  return `Seleciona as secções do índice de ${document.title} mais prováveis para responder à pergunta.

Pergunta:
${question}

Índice compacto. A indentação indica hierarquia; os números entre parênteses são intervalos de artigos:
${sectionLines}

Escolhe até 6 sectionIds, usando ids como s1, s2, s3.
Privilegia recall: se a pergunta puder depender de regras próximas, inclui secções vizinhas ou complementares.
Devolve apenas ids existentes no índice.`;
}

function resolveIndexSectionId(sectionId: string, sections: ResolvedIndexSection[]): ResolvedIndexSection | undefined {
  return sections.find((section) => section.shortId === sectionId || section.id === sectionId);
}

function articleInRanges(article: LegalArticle, ranges: LegalIndexArticleRange[]): boolean {
  return ranges.some((range) => article.articleNumber >= range.from && article.articleNumber <= range.to);
}

function mentionedArticleNumbers(question: string): number[] {
  return [...question.matchAll(/\b(\d{1,4})\s*(?:\.?\s*º|o)?\b/g)].map((match) => Number(match[1]));
}

function scoreIndexSections(index: LegalDocumentIndex, tokens: string[]): [ResolvedIndexSection, number][] {
  if (tokens.length === 0) return [];

  return flattenLegalIndex(index)
    .map((section) => {
      const title = normalizeSelectorText(section.title);
      const description = normalizeSelectorText(section.description ?? "");
      const path = normalizeSelectorText(section.path.join(" "));
      let score = 0;

      for (const token of tokens) {
        if (title.includes(token)) score += 10;
        if (description.includes(token)) score += token.length > 5 ? 5 : 2;
        if (path.includes(token)) score += token.length > 5 ? 3 : 1;
      }

      return [section, score] as [ResolvedIndexSection, number];
    })
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
}

function applySectionBoosts(
  articleSectionBoosts: Map<string, number>,
  articles: LegalArticle[],
  section: ResolvedIndexSection,
  score: number,
): void {
  for (const article of articles) {
    if (articleInRanges(article, section.articles)) {
      articleSectionBoosts.set(article.id, (articleSectionBoosts.get(article.id) ?? 0) + score);
    }
  }
}

function selectLocalCandidateArticles(
  articles: LegalArticle[],
  question: string,
  limit: number,
  index?: LegalDocumentIndex,
): LegalArticle[] {
  const tokens = expandedQuestionTokens(question);
  const articleSectionBoosts = new Map<string, number>();

  if (index) {
    for (const [section, sectionScore] of scoreIndexSections(index, tokens).slice(0, Math.max(4, Math.ceil(limit / 2)))) {
      applySectionBoosts(articleSectionBoosts, articles, section, sectionScore);
    }
  }

  const articleNumberMatches = mentionedArticleNumbers(question);
  const scored = articles.map((article, index) => {
    const title = normalizeSelectorText(article.title);
    const content = normalizeSelectorText(article.content ?? "");
    let score = articleSectionBoosts.get(article.id) ?? 0;

    for (const token of tokens) {
      if (title.includes(token)) score += 12;
      if (content.includes(token)) score += token.length > 5 ? 2 : 1;
    }

    if (article.articleNumber && articleNumberMatches.includes(article.articleNumber)) score += 50;
    return { article, index, score };
  });

  const seeds = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(10, Math.floor(limit * 0.7)));

  const selected = new Map<string, LegalArticle>();
  for (const seed of seeds) {
    for (let offset = -3; offset <= 3; offset++) {
      const article = articles[seed.index + offset];
      if (article?.id) selected.set(article.id, article);
      if (selected.size >= limit) break;
    }
    if (selected.size >= limit) break;
  }

  if (selected.size === 0) {
    for (const article of articles.slice(0, limit)) selected.set(article.id, article);
  }

  return [...selected.values()].slice(0, limit);
}

async function selectIndexedCandidateArticles(
  document: LegalDocumentConfig,
  question: string,
  model: NavigationModel,
  limit: number,
): Promise<LegalArticle[]> {
  const { index } = document;
  const articles = document.document.articles;
  if (!index) return selectLocalCandidateArticles(articles, question, limit);

  const tokens = expandedQuestionTokens(question);
  const byId = new Map(articles.map((article) => [article.id, article]));
  const selectedSectionScores = new Map<string, number>();
  const candidateSections = flattenLegalIndex(index);

  try {
    const { object } = await generateObject({
      model,
      schema: IndexSectionSelection,
      prompt: buildUniversalIndexPrompt(document, question, candidateSections),
    });

    object.sectionIds.slice(0, 8).forEach((sectionId, index) => {
      const section = resolveIndexSectionId(sectionId, candidateSections);
      if (section) selectedSectionScores.set(section.id, 80 - index * 8);
    });
  } catch {
    // If section selection fails, fall back to deterministic index scoring.
  }

  if (selectedSectionScores.size === 0) {
    for (const [section, score] of scoreIndexSections(index, tokens).slice(0, 6)) {
      selectedSectionScores.set(section.id, score);
    }
  }

  const articleSectionBoosts = new Map<string, number>();
  for (const section of candidateSections) {
    const sectionScore = selectedSectionScores.get(section.id);
    if (!sectionScore) continue;
    applySectionBoosts(articleSectionBoosts, articles, section, sectionScore);
  }

  const articleNumberMatches = mentionedArticleNumbers(question);
  if (articleNumberMatches.length) {
    for (const article of articles) {
      if (article.articleNumber && articleNumberMatches.includes(article.articleNumber)) {
        articleSectionBoosts.set(article.id, (articleSectionBoosts.get(article.id) ?? 0) + 120);
      }
    }
  }

  const scored = [...articleSectionBoosts.entries()]
    .map(([articleId, sectionScore]) => {
      const article = byId.get(articleId);
      if (!article) return null;
      const title = normalizeSelectorText(article.title);
      const content = normalizeSelectorText(article.content ?? "");
      let score = sectionScore;

      for (const token of tokens) {
        if (title.includes(token)) score += 12;
        if (content.includes(token)) score += token.length > 5 ? 2 : 1;
      }

      if (article.articleNumber && articleNumberMatches.includes(article.articleNumber)) score += 50;
      return { article, score };
    })
    .filter((item): item is { article: LegalArticle; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  const selected = new Map<string, LegalArticle>();
  for (const seed of scored.slice(0, Math.max(10, Math.floor(limit * 0.7)))) {
    selected.set(seed.article.id, seed.article);
  }

  if (selected.size === 0) return selectLocalCandidateArticles(articles, question, limit, index);
  return [...selected.values()].slice(0, limit);
}

function addArticleToCollected(
  collected: Map<string, { title: string; content: string }>,
  article: LegalArticle,
): void {
  collected.set(article.id, {
    title: article.title,
    content: article.content,
  });
}

function expandCollectedArticles(
  articles: LegalArticle[],
  collected: Map<string, { title: string; content: string }>,
  window: number,
  maxArticles: number,
): void {
  if (window <= 0 || collected.size >= maxArticles) return;

  const indexById = new Map(articles.map((article, index) => [article.id, index]));
  const originalIds = [...collected.keys()];

  for (const id of originalIds) {
    const index = indexById.get(id);
    if (index === undefined) continue;

    for (let offset = -window; offset <= window; offset++) {
      if (offset === 0) continue;
      const neighbor = articles[index + offset];
      if (!neighbor || collected.has(neighbor.id)) continue;

      collected.set(neighbor.id, {
        title: neighbor.title,
        content: neighbor.content,
      });

      if (collected.size >= maxArticles) return;
    }
  }
}

function buildNavigationResultFromCollected(collected: Map<string, { title: string; content: string }>): NavigationResult {
  const articleRefs = [...collected.entries()].map(([id, { title, content }]) => ({
    id,
    title,
    content,
  }));

  const context = articleRefs
    .map((article) => `[${article.id}] ${article.title}:\n${article.content}`)
    .join("\n\n---\n\n");

  return { context, articleRefs };
}

export async function retrieveLegalDocumentCandidates(
  document: LegalDocumentConfig,
  question: string,
  options: NavigationOptions = {},
): Promise<NavigationResult> {
  const articles = document.document.articles;
  const collected: Map<string, { title: string; content: string }> = new Map();

  for (const article of options.seedArticles ?? []) {
    addArticleToCollected(collected, article);
  }

  for (const article of await selectIndexedCandidateArticles(document, question, options.model ?? defaultModel, options.localSeedLimit ?? 8)) {
    addArticleToCollected(collected, article);
  }

  expandCollectedArticles(
    articles,
    collected,
    options.expandNeighborWindow ?? 0,
    options.maxExpandedArticles ?? 24,
  );

  return buildNavigationResultFromCollected(collected);
}
