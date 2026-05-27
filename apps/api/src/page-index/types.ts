import { generateObject } from "ai";
import type { Logger } from "pino";
import type { LegalDocumentConfig } from "../data/documents.js";

export type PageIndexModel = Parameters<typeof generateObject>[0]["model"];

export type PageIndexArticleRef = {
  id: string;
  title: string;
  content: string;
};

export type PageIndexCitation = {
  articleId: string;
  articleNumber: string;
  sourceQuote: string;
};

export type PageIndexModels = {
  index: PageIndexModel;
  rerank: PageIndexModel;
  answer: PageIndexModel;
};

export type PageIndexSettings = {
  expandNeighborWindow: number;
  localSeedLimit: number;
  maxExpandedArticles: number;
  finalNeighborWindow: number;
  expandSource: "index" | "hybrid" | "index-hybrid";
  hybridCandidateLimit: number;
  hybridLambda: number;
  rerankLimit: number;
  indexTimeoutMs: number;
};

export type PageIndexLogger = Logger;

export type PageIndexInput = {
  document: LegalDocumentConfig;
  question: string;
  models: PageIndexModels;
  settings?: Partial<PageIndexSettings>;
  logger?: PageIndexLogger;
};

export type PageIndexFetchResult = {
  candidates: PageIndexArticleRef[];
  indexCandidates: PageIndexArticleRef[];
  hybridCandidates: PageIndexArticleRef[];
  indexTimedOut: boolean;
  indexError?: string;
};

export type PageIndexContextResult = {
  context: string;
  answerArticleRefs: PageIndexArticleRef[];
  fetched: PageIndexFetchResult;
  rerankedArticleRefs: PageIndexArticleRef[];
  timings: Record<string, number>;
};

export type PageIndexAnswer = {
  answer: string;
  citations: PageIndexCitation[];
  retrievedArticles: string[];
  selectedSourceArticles: string[];
  retrievalDebug: Record<string, unknown>;
};
