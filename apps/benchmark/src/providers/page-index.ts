import { generateObject } from "ai";
import { z } from "zod";
import { navigateLegalDocument, selectLegalDocumentCandidates } from "../../../api/src/agent/navigate.js";
import { buildAnswerSystemPrompt } from "../../../api/src/agent/prompt.js";
import { hybridSearchArticles } from "../../../api/src/agent/hybrid-search.js";
import { LEGAL_DOCUMENTS } from "../../../api/src/data/documents.js";
import { citationsToArticleIds } from "../article-utils.js";
import { benchmarkModel, defaultModel } from "../model.js";
import type { BenchmarkQuestion, Provider } from "../types.js";

const document = LEGAL_DOCUMENTS["codigo-civil"];
const navigationModel = process.env.BENCHMARK_NAVIGATION_MODEL ?? defaultModel("google/gemini-3-flash");
const answerModel = process.env.BENCHMARK_ANSWER_MODEL ?? defaultModel("openai/gpt-5.4-mini");
const useHybridSearch = process.env.BENCHMARK_HYBRID_SEARCH === "true";
const expandNeighborWindow = Number.parseInt(process.env.BENCHMARK_EXPAND_NEIGHBORS ?? "8", 10);
const useOneShotSelection = process.env.BENCHMARK_ONE_SHOT_NAVIGATION !== "false";
const useRerank = process.env.BENCHMARK_RERANK_CONTEXT !== "false";
const rerankLimit = Number.parseInt(process.env.BENCHMARK_RERANK_LIMIT ?? "12", 10);

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

type ArticleRef = { id: string; title: string; content: string };

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

export class PageIndexProvider implements Provider {
  name = "page-index";

  async answer(question: BenchmarkQuestion) {
    const seedArticles = useHybridSearch ? hybridSearchArticles(document, question.question) : [];
    const navigate = useOneShotSelection ? selectLegalDocumentCandidates : navigateLegalDocument;
    const { articleRefs } = await navigate(document, question.question, {
      model: benchmarkModel(navigationModel),
      seedArticles,
      expandNeighborWindow,
      maxExpandedArticles: 50,
    });
    const answerArticleRefs = await rerankArticleRefs(question, articleRefs);
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

Pergunta: ${question.question}`,
        },
      ],
    });

    return {
      answer: object.answer,
      citations: object.citations,
      retrievedArticles: answerArticleRefs.map((article) => article.id),
      selectedSourceArticles: citationsToArticleIds(object.citations),
    };
  }
}
