import type { PageIndexSettings } from "./types.js";

export function pageIndexSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): PageIndexSettings {
  return {
    expandNeighborWindow: Number.parseInt(env.PAGE_INDEX_EXPAND_NEIGHBORS ?? env.BENCHMARK_EXPAND_NEIGHBORS ?? "3", 10),
    localSeedLimit: Number.parseInt(env.PAGE_INDEX_LOCAL_SEED_LIMIT ?? env.BENCHMARK_LOCAL_SEED_LIMIT ?? "8", 10),
    maxExpandedArticles: Number.parseInt(
      env.PAGE_INDEX_MAX_EXPANDED_ARTICLES ?? env.BENCHMARK_MAX_EXPANDED_ARTICLES ?? "24",
      10,
    ),
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

export function resolvePageIndexSettings(settings?: Partial<PageIndexSettings>): PageIndexSettings {
  return { ...pageIndexSettingsFromEnv(), ...settings };
}
