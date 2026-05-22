import { generateObject } from "ai";
import { z } from "zod";
import { retrieveLegalDocumentCandidates } from "../../../api/src/agent/navigate.js";
import { buildAnswerSystemPrompt } from "../../../api/src/agent/prompt.js";
import { hybridSearchArticleCandidates } from "../../../api/src/agent/hybrid-search.js";
import { LEGAL_DOCUMENTS } from "../../../api/src/data/documents.js";
import { benchmarkModel, defaultModel } from "../model.js";
import type { BenchmarkQuestion, Provider } from "../types.js";

const document = LEGAL_DOCUMENTS["codigo-civil"];
const navigationModel = process.env.BENCHMARK_NAVIGATION_MODEL ?? defaultModel("google/gemini-3-flash");
const answerModel = process.env.BENCHMARK_ANSWER_MODEL ?? defaultModel("openai/gpt-5.4-mini");
const expandNeighborWindow = Number.parseInt(process.env.BENCHMARK_EXPAND_NEIGHBORS ?? "3", 10);
const useRerank = process.env.BENCHMARK_RERANK_CONTEXT === "true";
const rerankLimit = Number.parseInt(process.env.BENCHMARK_RERANK_LIMIT ?? "12", 10);
const localSeedLimit = Number.parseInt(process.env.BENCHMARK_LOCAL_SEED_LIMIT ?? "8", 10);
const maxExpandedArticles = Number.parseInt(process.env.BENCHMARK_MAX_EXPANDED_ARTICLES ?? "24", 10);
const finalNeighborWindow = Number.parseInt(process.env.BENCHMARK_FINAL_NEIGHBORS ?? "1", 10);
const useExpandContract = process.env.BENCHMARK_EXPAND_CONTRACT !== "false";
const expandSource = process.env.BENCHMARK_EXPAND_SOURCE ?? "index-hybrid";
const hybridCandidateLimit = Number.parseInt(process.env.BENCHMARK_HYBRID_CANDIDATE_LIMIT ?? "18", 10);
const hybridLambda = Number.parseFloat(process.env.BENCHMARK_HYBRID_LAMBDA ?? "0");
const contractLimit = Number.parseInt(process.env.BENCHMARK_CONTRACT_LIMIT ?? "14", 10);

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
  articleIds: z.array(z.string()),
  reasoning: z.string(),
});

const ContractOutput = z.object({
  selectedArticleIds: z.array(z.string()),
  rejectedArticleIds: z.array(z.string()),
  reasoning: z.string(),
});

type ArticleRef = { id: string; title: string; content: string };
type ExpandResult = {
  articleRefs: ArticleRef[];
  indexArticleRefs: ArticleRef[];
  hybridArticleRefs: ArticleRef[];
};

function buildContext(articleRefs: ArticleRef[]): string {
  return articleRefs
    .map((article) => `[${article.id}] ${article.title}:\n${article.content}`)
    .join("\n\n---\n\n");
}

async function rerankArticleRefs(question: BenchmarkQuestion, articleRefs: ArticleRef[]): Promise<ArticleRef[]> {
  if (!useRerank || articleRefs.length <= rerankLimit) return articleRefs;

  const { object } = await generateObject({
    model: benchmarkModel(answerModel),
    schema: RerankOutput,
    prompt: `Seleciona os artigos mais relevantes para responder à pergunta com rigor jurídico.

Pergunta:
${question.question}

Artigos candidatos:
${articleRefs
  .map((article) => {
    const excerpt = article.content.replace(/\s+/g, " ").slice(0, 700);
    return `[${article.id}] ${article.title}\n${excerpt}`;
  })
  .join("\n\n")}

Escolhe até ${rerankLimit} articleIds. Mantém artigos complementares quando a resposta exigir reconciliar regras próximas. Remove artigos claramente laterais.`,
  });

  const byId = new Map(articleRefs.map((article) => [article.id, article]));
  const selected = object.articleIds
    .map((id) => byId.get(id))
    .filter((article): article is ArticleRef => Boolean(article));

  return selected.length ? selected : articleRefs.slice(0, rerankLimit);
}

async function contractArticleRefs(question: BenchmarkQuestion, articleRefs: ArticleRef[]): Promise<ArticleRef[]> {
  if (!useExpandContract || articleRefs.length <= contractLimit) return articleRefs;

  const { object } = await generateObject({
    model: benchmarkModel(navigationModel),
    schema: ContractOutput,
    prompt: `Seleciona os artigos do Código Civil necessários para responder à pergunta.

Pergunta:
${question.question}

Artigos candidatos completos:
${articleRefs
  .map((article) => `[${article.id}] ${article.title}\n${article.content}`)
  .join("\n\n---\n\n")}

Devolve até ${contractLimit} selectedArticleIds. Mantém todos os artigos necessários para regra principal, exceções, prazos, ónus de prova, imputabilidade, consequências e reconciliação entre normas. Remove artigos claramente laterais. Usa apenas IDs presentes acima.`,
  });

  const byId = new Map(articleRefs.map((article) => [article.id, article]));
  const selected = object.selectedArticleIds
    .map((id) => byId.get(id))
    .filter((article): article is ArticleRef => Boolean(article));

  return selected.length ? selected : articleRefs.slice(0, contractLimit);
}

function expandSelectedArticleRefs(selected: ArticleRef[], candidates: ArticleRef[], window: number): ArticleRef[] {
  if (window <= 0) return selected;

  const candidateIndex = new Map(candidates.map((article, index) => [article.id, index]));
  const expanded = new Map(selected.map((article) => [article.id, article]));

  for (const article of selected) {
    const index = candidateIndex.get(article.id);
    if (index === undefined) continue;
    for (let offset = -window; offset <= window; offset++) {
      const neighbor = candidates[index + offset];
      if (neighbor) expanded.set(neighbor.id, neighbor);
    }
  }

  return [...expanded.values()];
}

async function expandArticleRefs(question: BenchmarkQuestion): Promise<ExpandResult> {
  const indexEnabled = expandSource === "index" || expandSource === "index-hybrid";
  const hybridEnabled = expandSource === "hybrid" || expandSource === "index-hybrid";

  const indexArticleRefs = indexEnabled
    ? (await retrieveLegalDocumentCandidates(document, question.question, {
        model: benchmarkModel(navigationModel),
        expandNeighborWindow,
        maxExpandedArticles,
        localSeedLimit,
      })).articleRefs
    : [];
  const hybridArticleRefs = hybridEnabled
    ? hybridSearchArticleCandidates(document, question.question, {
        limit: hybridCandidateLimit,
        minScore: hybridLambda,
      }).map((candidate) => candidate.article)
    : [];

  return {
    articleRefs: mergeArticleRefs(indexArticleRefs, hybridArticleRefs),
    indexArticleRefs,
    hybridArticleRefs: mergeArticleRefs(hybridArticleRefs),
  };
}

export class PageIndexProvider implements Provider {
  name = "page-index";

  async answer(question: BenchmarkQuestion) {
    const expanded = await expandArticleRefs(question);
    const expandedArticleRefs = expanded.articleRefs;
    const contractedArticleRefs = await contractArticleRefs(question, expandedArticleRefs);
    const rerankedArticleRefs = await rerankArticleRefs(question, contractedArticleRefs);
    const answerArticleRefs = expandSelectedArticleRefs(rerankedArticleRefs, expandedArticleRefs, finalNeighborWindow);
    const context = buildContext(answerArticleRefs);

    const { object } = await generateObject({
      model: benchmarkModel(answerModel),
      schema: AnswerOutput,
      system: `${buildAnswerSystemPrompt(document)}

ARTIGOS RELEVANTES DE ${document.title.toUpperCase()}:

${context || "Nenhum artigo relevante encontrado."}`,
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

Pergunta: ${question.question}`,
        },
      ],
    });

    return {
      answer: object.answer,
      citations: object.citations,
      retrievedArticles: answerArticleRefs.map((article) => article.id),
      selectedSourceArticles: object.citations.map((citation) => citation.articleId).filter(Boolean),
      retrievalDebug: {
        expand: {
          source: expandSource,
          indexCount: expanded.indexArticleRefs.length,
          hybridCount: expanded.hybridArticleRefs.length,
          unionCount: expandedArticleRefs.length,
          contractedCount: contractedArticleRefs.length,
          finalCount: answerArticleRefs.length,
          indexArticleIds: expanded.indexArticleRefs.map((article) => article.id),
          hybridArticleIds: expanded.hybridArticleRefs.map((article) => article.id),
          contractedArticleIds: contractedArticleRefs.map((article) => article.id),
        },
      },
    };
  }
}

function mergeArticleRefs(...groups: (ArticleRef[] | { id: string; title: string; content?: string }[])[]): ArticleRef[] {
  const merged = new Map<string, ArticleRef>();
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
