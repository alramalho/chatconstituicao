import type { LegalDocumentNode } from "@chatconstituicao/shared";
import { LEGAL_DOCUMENTS } from "../../api/src/data/documents.js";
import type { AnswerCitation } from "./types.js";

const codigoCivil = LEGAL_DOCUMENTS["codigo-civil"].root;

function collectArticles(node: LegalDocumentNode, out: LegalDocumentNode[] = []): LegalDocumentNode[] {
  if (node.articleNumber && node.content) out.push(node);
  for (const child of node.children ?? []) collectArticles(child, out);
  return out;
}

const articles = collectArticles(codigoCivil);
const articleById = new Map(articles.map((article) => [article.id, article]));
const articleByNumber = new Map(articles.map((article) => [String(article.articleNumber), article]));

export function getArticle(id: string): LegalDocumentNode {
  const article = articleById.get(id);
  if (!article) throw new Error(`Unknown article id in benchmark dataset: ${id}`);
  return article;
}

export function articleNumberFromId(id: string): string {
  return id.match(/art-(\d+[a-z]?)/i)?.[1] ?? id;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.º°]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function citationToArticleId(citation: AnswerCitation): string | undefined {
  if (citation.articleId && articleById.has(citation.articleId)) return citation.articleId;
  const rawNumber = citation.articleNumber.replace(/[^\dA-Za-z]/g, "");
  return articleByNumber.get(rawNumber)?.id;
}

export function citationsToArticleIds(citations: AnswerCitation[] | undefined): string[] {
  if (!citations?.length) return [];
  return [
    ...new Set(
      citations
        .map(citationToArticleId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function buildExpectedSources(ids: string[]): string {
  return ids
    .map((id) => {
      const article = getArticle(id);
      return `[${id}] ${article.title}\n${article.content}`;
    })
    .join("\n\n---\n\n");
}

export function citationRecall(citations: AnswerCitation[] | undefined, expectedArticles: string[]): number {
  if (!citations?.length) return 0;
  const citedIds = new Set(citations.map(citationToArticleId).filter((id): id is string => Boolean(id)));
  const hits = expectedArticles.filter((id) => citedIds.has(id));

  return hits.length / expectedArticles.length;
}

export function quoteSupport(citations: AnswerCitation[] | undefined): number {
  if (!citations?.length) return 0;

  const supported = citations.filter((citation) => {
    const articleId = citationToArticleId(citation);
    if (!articleId) return false;
    const article = getArticle(articleId);
    return normalize(article.content ?? "").includes(normalize(citation.sourceQuote));
  });

  return supported.length / citations.length;
}

export function retrievalRecall(
  retrievedArticles: string[] | undefined,
  expectedArticles: string[],
): number | undefined {
  if (!retrievedArticles) return undefined;
  const retrieved = new Set(retrievedArticles);
  const hits = expectedArticles.filter((id) => retrieved.has(id));
  return hits.length / expectedArticles.length;
}

export function retrievalPrecision(
  retrievedArticles: string[] | undefined,
  expectedArticles: string[],
): number | undefined {
  if (!retrievedArticles) return undefined;
  if (retrievedArticles.length === 0) return 0;
  const expected = new Set(expectedArticles);
  const hits = new Set(retrievedArticles.filter((id) => expected.has(id)));
  return hits.size / new Set(retrievedArticles).size;
}

export function retrievalF2(
  retrievedArticles: string[] | undefined,
  expectedArticles: string[],
): number | undefined {
  const precision = retrievalPrecision(retrievedArticles, expectedArticles);
  const recall = retrievalRecall(retrievedArticles, expectedArticles);
  if (precision === undefined || recall === undefined) return undefined;
  if (precision === 0 && recall === 0) return 0;
  return (5 * precision * recall) / (4 * precision + recall);
}
