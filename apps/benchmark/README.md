# ChatLegal Benchmark

This app benchmarks Código Civil answering strategies against a curated dataset.

## Dataset

`data/codigo-civil.dataset.json` contains 10 manually approved real-world scenario questions with:

- `question`: user-facing legal question.
- `expectedAnswer`: short ground-truth answer.
- `expectedArticles`: source-of-truth article ids used for verification, not wording users should be expected to ask for.
- `category`, `difficulty`, `reasoningType`: labels for slicing results.

Validate it with:

```sh
pnpm --filter @chatlegal/benchmark validate
```

Diagnose retrieval recall without running the answer/judge models:

```sh
pnpm --filter @chatlegal/benchmark diagnose:retrieval
```

## Providers

- `page-index`: imports the app's existing document navigator, retrieves article context from the Código Civil source, then asks a model to answer from those retrieved articles.
- `raw-gpt`: sends the full Código Civil PDF to a model as a file input and asks it to answer directly from the PDF.

The benchmark records answer quality, citation recall, quote support, source-selection recall, source-selection precision, source-selection F2, and latency.

Providers return structured citations:

```json
{
  "answer": "...",
  "citations": [
    {
      "articleId": "codigo-civil.art-1041",
      "articleNumber": "1041",
      "sourceQuote": "Constituindo-se o locatário em mora..."
    }
  ]
}
```

Citation recall checks whether the provider cited the expected article ids. Quote support checks whether each `sourceQuote` appears in the cited article text after normalization. Retrieval/source-selection metrics are computed from final used source articles: `selectedSourceArticles` when present, otherwise structured citations, and only then provider context articles as a fallback.

## Running

```sh
pnpm benchmark:codigo-civil -- --providers page-index,raw-gpt --limit 5
pnpm benchmark:codigo-civil -- --providers page-index --questions cc-q01,cc-q02
pnpm benchmark:codigo-civil -- --providers page-index,raw-gpt --probe raw-wins
pnpm benchmark:codigo-civil -- --providers raw-gpt --skip-judge
pnpm benchmark:codigo-civil -- --providers page-index,raw-gpt --concurrency 2 --judge-concurrency 3
pnpm --filter @chatlegal/benchmark eval:probe
```

Results are written to `data/runs/`.

## Environment

The benchmark reuses the app's model gateway configuration.

Required by default:

- `AI_GATEWAY_API_KEY`

Optional:

- `BENCHMARK_ANSWER_MODEL`, default `openai/gpt-5.4-mini`
- `BENCHMARK_NAVIGATION_MODEL`, default `google/gemini-3-flash` through AI Gateway, or `BENCHMARK_VIBEPROXY_MODEL` through VibeProxy
- `BENCHMARK_RAW_MODEL`, default `BENCHMARK_ANSWER_MODEL`
- `BENCHMARK_JUDGE_MODEL`, default `openai/gpt-5.4-mini`
- `BENCHMARK_OPENAI_BASE_URL`, routes benchmark answer/judge calls through an OpenAI-compatible endpoint such as VibeProxy instead of AI Gateway
- `BENCHMARK_OPENAI_API_KEY`, default `vibeproxy`
- `BENCHMARK_OPENAI_PROVIDER_NAME`, default `vibeproxy`
- `BENCHMARK_VIBEPROXY_MODEL`, default `gpt-5.4-mini` when `BENCHMARK_OPENAI_BASE_URL` is set
- `BENCHMARK_OPENAI_STRUCTURED_OUTPUTS`, set to `false` if the OpenAI-compatible endpoint rejects structured-output requests
- `LEGAL_EMBEDDING_BASE_URL` or `BENCHMARK_OPENAI_BASE_URL`, OpenAI-compatible embeddings endpoint for sqlite-vec semantic retrieval; defaults to Vercel AI Gateway when `AI_GATEWAY_API_KEY` is present
- `LEGAL_EMBEDDING_API_KEY`, defaults to `BENCHMARK_OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`, then `vibeproxy`
- `LEGAL_EMBEDDING_MODEL` or `BENCHMARK_EMBEDDING_MODEL`, default `openai/text-embedding-3-small` on AI Gateway, otherwise `text-embedding-3-small`
- `LEGAL_EMBEDDING_DIMENSIONS` or `BENCHMARK_EMBEDDING_DIMENSIONS`, default `1536`
- `LEGAL_EMBEDDING_BATCH_SIZE` or `BENCHMARK_EMBEDDING_BATCH_SIZE`, default `64`
- `LEGAL_SEARCH_DB_PATH`, sqlite-vec cache path; defaults to `apps/api/.data/legal-search.sqlite`
- `BENCHMARK_EXPAND_SOURCE`, default `index-hybrid`; supported values are `index`, `hybrid`, `index-hybrid`
- `BENCHMARK_EXPAND_CONTRACT`, default `true`; set to `false` to skip the LLM contraction pass
- `BENCHMARK_EXPAND_NEIGHBORS`, default `3`, includes nearby article numbers around retrieved page-index articles
- `BENCHMARK_LOCAL_SEED_LIMIT`, default `8`, controls how many local lexical seeds orient the index navigator
- `BENCHMARK_MAX_EXPANDED_ARTICLES`, default `24`, caps index-selected article context before hybrid union
- `BENCHMARK_HYBRID_CANDIDATE_LIMIT`, default `18`, controls how many BM25 + semantic candidates hybrid retrieval contributes
- `BENCHMARK_HYBRID_LAMBDA`, default `0`, minimum hybrid score threshold
- `BENCHMARK_CONTRACT_LIMIT`, default `14`, caps the LLM-selected article set before final-neighbor expansion
- `BENCHMARK_RERANK_CONTEXT`, default `false`; set to `true` to run an extra LLM context-rerank pass
- `BENCHMARK_RERANK_LIMIT`, default `12`
- `BENCHMARK_FINAL_NEIGHBORS`, default `1`, adds nearby articles back after reranking as a recall safety net
- `BENCHMARK_CONCURRENCY`, default `2`
- `BENCHMARK_JUDGE_CONCURRENCY`, default `3`

For local `.env` loading, place the variables in the repo root `.env` file.

Example with VibeProxy:

```sh
BENCHMARK_OPENAI_BASE_URL=http://127.0.0.1:8317/v1 \
pnpm benchmark:codigo-civil -- --providers raw-gpt --limit 1
```
