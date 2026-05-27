import { generateObject } from "ai";
import { z } from "zod";
import type { LegalDocumentNode } from "@chatconstituicao/shared";
import { hybridSearchArticleCandidates } from "../agent/hybrid-search.js";
import { retrieveLegalDocumentCandidates } from "../agent/navigate.js";
import { buildAnswerSystemPrompt } from "../agent/prompt.js";
import type {
  PageIndexAnswer,
  PageIndexArticleRef,
  PageIndexContextResult,
  PageIndexFetchResult,
  PageIndexInput,
  PageIndexSettings,
} from "./types.js";

const AnswerOutput = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      articleId: z.string(),
      articleNumber: z.string(),
      sourceQuote: z.string(),
    }),
  ),
});

const RerankOutput = z.object({
  selectedArticleIds: z.array(z.string()),
  rejectedArticleIds: z.array(z.string()),
  reasoning: z.string(),
});

export function pageIndexSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): PageIndexSettings {
  return {
    expandNeighborWindow: Number.parseInt(env.PAGE_INDEX_EXPAND_NEIGHBORS ?? env.BENCHMARK_EXPAND_NEIGHBORS ?? "3", 10),
    localSeedLimit: Number.parseInt(env.PAGE_INDEX_LOCAL_SEED_LIMIT ?? env.BENCHMARK_LOCAL_SEED_LIMIT ?? "8", 10),
    maxExpandedArticles: Number.parseInt(env.PAGE_INDEX_MAX_EXPANDED_ARTICLES ?? env.BENCHMARK_MAX_EXPANDED_ARTICLES ?? "24", 10),
    finalNeighborWindow: Number.parseInt(env.PAGE_INDEX_FINAL_NEIGHBORS ?? env.BENCHMARK_FINAL_NEIGHBORS ?? "1", 10),
    expandSource: (env.PAGE_INDEX_EXPAND_SOURCE ?? env.BENCHMARK_EXPAND_SOURCE ?? "index-hybrid") as PageIndexSettings["expandSource"],
    hybridCandidateLimit: Number.parseInt(
      env.PAGE_INDEX_HYBRID_CANDIDATE_LIMIT ?? env.BENCHMARK_HYBRID_CANDIDATE_LIMIT ?? "18",
      10,
    ),
    hybridLambda: Number.parseFloat(env.PAGE_INDEX_HYBRID_LAMBDA ?? env.BENCHMARK_HYBRID_LAMBDA ?? "0"),
    rerankLimit: Number.parseInt(env.PAGE_INDEX_RERANK_LIMIT ?? env.BENCHMARK_CONTRACT_LIMIT ?? "14", 10),
    indexTimeoutMs: Number.parseInt(env.PAGE_INDEX_INDEX_TIMEOUT_MS ?? env.BENCHMARK_INDEX_TIMEOUT_MS ?? "12000", 10),
  };
}

function mergeSettings(settings?: Partial<PageIndexSettings>): PageIndexSettings {
  return { ...pageIndexSettingsFromEnv(), ...settings };
}

function collectArticleRefs(node: LegalDocumentNode): PageIndexArticleRef[] {
  if (node.content) return [{ id: node.id, title: node.title, content: node.content }];
  return (node.children ?? []).flatMap((child) => collectArticleRefs(child));
}

function mergeArticleRefs(
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

function buildContext(articleRefs: PageIndexArticleRef[]): string {
  return articleRefs.map((article) => `[${article.id}] ${article.title}:\n${article.content}`).join("\n\n---\n\n");
}

async function timeStage<T>(timings: Record<string, number>, name: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    timings[name] = Date.now() - startedAt;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (timeoutMs <= 0) return promise;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sortByDocumentOrder(articleRefs: PageIndexArticleRef[], allArticles: PageIndexArticleRef[]): PageIndexArticleRef[] {
  const indexById = new Map(allArticles.map((article, index) => [article.id, index]));
  return articleRefs
    .slice()
    .sort((a, b) => (indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function expandWithDocumentNeighbors(
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

export async function fetchCandidates(input: PageIndexInput): Promise<PageIndexFetchResult> {
  const settings = mergeSettings(input.settings);
  const indexEnabled = settings.expandSource === "index" || settings.expandSource === "index-hybrid";
  const hybridEnabled = settings.expandSource === "hybrid" || settings.expandSource === "index-hybrid";
  let indexTimedOut = false;
  let indexError: string | undefined;

  input.logger?.({ stage: "fetch", message: "starting candidate fetch", data: { expandSource: settings.expandSource } });

  const indexPromise = indexEnabled
    ? withTimeout(
        retrieveLegalDocumentCandidates(input.document, input.question, {
          model: input.models.index,
          expandNeighborWindow: settings.expandNeighborWindow,
          maxExpandedArticles: settings.maxExpandedArticles,
          localSeedLimit: settings.localSeedLimit,
        }),
        settings.indexTimeoutMs,
        "index expansion",
      )
    : undefined;
  const hybridPromise = hybridEnabled
    ? hybridSearchArticleCandidates(input.document, input.question, {
        limit: settings.hybridCandidateLimit,
        minScore: settings.hybridLambda,
      })
    : undefined;

  const [indexResult, hybridResult] = await Promise.allSettled([indexPromise, hybridPromise]);
  const indexCandidates = indexResult.status === "fulfilled" && indexResult.value ? indexResult.value.articleRefs : [];
  if (indexResult.status === "rejected") {
    indexError = indexResult.reason instanceof Error ? indexResult.reason.message : String(indexResult.reason);
    indexTimedOut = indexError.includes("timed out");
  }

  const hybridCandidates =
    hybridResult.status === "fulfilled" && hybridResult.value
      ? hybridResult.value.map((candidate) => candidate.article)
      : [];
  if (hybridResult.status === "rejected") throw hybridResult.reason;

  const candidates = mergeArticleRefs(indexCandidates, hybridCandidates);
  input.logger?.({
    stage: "fetch",
    message: "finished candidate fetch",
    data: {
      indexCount: indexCandidates.length,
      hybridCount: hybridCandidates.length,
      unionCount: candidates.length,
      indexTimedOut,
      indexError,
    },
  });

  return {
    candidates,
    indexCandidates,
    hybridCandidates: mergeArticleRefs(hybridCandidates),
    indexTimedOut,
    indexError,
  };
}

export async function rerankCandidates(
  input: PageIndexInput,
  candidates: PageIndexArticleRef[],
): Promise<PageIndexArticleRef[]> {
  const settings = mergeSettings(input.settings);
  if (candidates.length <= settings.rerankLimit) return candidates;

  input.logger?.({ stage: "rerank", message: "starting candidate rerank", data: { candidateCount: candidates.length } });
  const { object } = await generateObject({
    model: input.models.rerank,
    schema: RerankOutput,
    prompt: `Seleciona os artigos do Código Civil necessários para responder à pergunta.

Pergunta:
${input.question}

Artigos candidatos completos:
${buildContext(candidates)}

Devolve até ${settings.rerankLimit} selectedArticleIds. Mantém todos os artigos necessários para regra principal, exceções, prazos, ónus de prova, imputabilidade, consequências e reconciliação entre normas. Remove artigos claramente laterais. Usa apenas IDs presentes acima.`,
  });

  const byId = new Map(candidates.map((article) => [article.id, article]));
  const selected = object.selectedArticleIds
    .map((id) => byId.get(id))
    .filter((article): article is PageIndexArticleRef => Boolean(article));

  const result = selected.length ? selected : candidates.slice(0, settings.rerankLimit);
  input.logger?.({ stage: "rerank", message: "finished candidate rerank", data: { selectedCount: result.length } });
  return result;
}

export function injectCandidates(input: PageIndexInput, reranked: PageIndexArticleRef[]): PageIndexArticleRef[] {
  const settings = mergeSettings(input.settings);
  const allArticles = collectArticleRefs(input.document.root);
  const answerArticleRefs = expandWithDocumentNeighbors(reranked, allArticles, settings.finalNeighborWindow);
  input.logger?.({ stage: "inject", message: "prepared answer context", data: { finalCount: answerArticleRefs.length } });
  return answerArticleRefs;
}

export async function preparePageIndexContext(input: PageIndexInput): Promise<PageIndexContextResult> {
  const timings: Record<string, number> = {};
  const fetched = await timeStage(timings, "fetchMs", () => fetchCandidates(input));
  const rerankedArticleRefs = await timeStage(timings, "rerankMs", () => rerankCandidates(input, fetched.candidates));
  const answerArticleRefs = await timeStage(timings, "injectMs", async () => injectCandidates(input, rerankedArticleRefs));
  const context = buildContext(answerArticleRefs);

  return {
    context,
    answerArticleRefs,
    fetched,
    rerankedArticleRefs,
    timings,
  };
}

export async function answerWithPageIndex(input: PageIndexInput): Promise<PageIndexAnswer> {
  const contextResult = await preparePageIndexContext(input);

  const { object } = await timeStage(contextResult.timings, "answerMs", () =>
    generateObject({
      model: input.models.answer,
      schema: AnswerOutput,
      system: `${buildAnswerSystemPrompt(input.document)}

ARTIGOS RELEVANTES DE ${input.document.title.toUpperCase()}:

${contextResult.context || "Nenhum artigo relevante encontrado."}`,
      messages: [
        {
          role: "user",
          content: `Responde à pergunta de forma prática e fundamentada.

Devolve também citações estruturadas. Cada citação deve apontar para um artigo efetivamente usado na resposta e incluir:
- articleId, se estiver visível no contexto;
- se não conseguires identificar o articleId, usa string vazia;
- articleNumber;
- sourceQuote: uma frase curta copiada literalmente do artigo citado.
O sourceQuote tem de ser uma passagem contínua e literal do artigo: não uses reticências, não juntes excertos separados com ponto e vírgula, e não alteres aspas ou pontuação.
Inclui uma citação para cada artigo que dê uma regra, requisito, exceção, prazo, ónus de prova ou consequência necessária para responder ao caso. Não pares no primeiro artigo útil quando os artigos seguintes completam a solução.
Antes de concluir, verifica se a resposta cobriu: regra principal, exceções ou requisitos, prazos/procedimento, ónus/imputabilidade e consequência prática, quando esses pontos aparecerem nos artigos fornecidos.

Pergunta: ${input.question}`,
        },
      ],
    }),
  );

  return {
    answer: object.answer,
    citations: object.citations,
    retrievedArticles: contextResult.answerArticleRefs.map((article) => article.id),
    selectedSourceArticles: object.citations.map((citation) => citation.articleId).filter(Boolean),
    retrievalDebug: {
      expand: {
        source: mergeSettings(input.settings).expandSource,
        indexCount: contextResult.fetched.indexCandidates.length,
        hybridCount: contextResult.fetched.hybridCandidates.length,
        unionCount: contextResult.fetched.candidates.length,
        contractedCount: contextResult.rerankedArticleRefs.length,
        finalCount: contextResult.answerArticleRefs.length,
        indexArticleIds: contextResult.fetched.indexCandidates.map((article) => article.id),
        hybridArticleIds: contextResult.fetched.hybridCandidates.map((article) => article.id),
        contractedArticleIds: contextResult.rerankedArticleRefs.map((article) => article.id),
        finalArticleIds: contextResult.answerArticleRefs.map((article) => article.id),
        indexTimedOut: contextResult.fetched.indexTimedOut,
        indexError: contextResult.fetched.indexError,
      },
      timings: contextResult.timings,
    },
  };
}
