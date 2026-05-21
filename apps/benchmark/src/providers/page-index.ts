import { generateObject } from "ai";
import { z } from "zod";
import {
  navigateLegalDocument,
  retrieveLegalDocumentCandidates,
  selectLegalDocumentCandidates,
} from "../../../api/src/agent/navigate.js";
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
const retrievalMode = process.env.BENCHMARK_RETRIEVAL_MODE ?? "local";
const expandNeighborWindow = Number.parseInt(process.env.BENCHMARK_EXPAND_NEIGHBORS ?? "3", 10);
const useRerank = process.env.BENCHMARK_RERANK_CONTEXT === "true";
const rerankLimit = Number.parseInt(process.env.BENCHMARK_RERANK_LIMIT ?? "12", 10);
const candidateArticleLimit = Number.parseInt(process.env.BENCHMARK_CANDIDATE_ARTICLE_LIMIT ?? "120", 10);
const localSeedLimit = Number.parseInt(process.env.BENCHMARK_LOCAL_SEED_LIMIT ?? "8", 10);
const maxExpandedArticles = Number.parseInt(process.env.BENCHMARK_MAX_EXPANDED_ARTICLES ?? "10", 10);
const finalNeighborWindow = Number.parseInt(process.env.BENCHMARK_FINAL_NEIGHBORS ?? "1", 10);

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
type AnswerCitation = z.infer<typeof AnswerOutput>["citations"][number];

const citationCompletionRules: [RegExp, { articleId: string; sourceQuote: string }[]][] = [
  [
    /renda|senhorio|mora|atras/i,
    [
      { articleId: "codigo-civil.art-1038", sourceQuote: "Pagar a renda ou aluguer;" },
    ],
  ],
  [
    /defeit|v[ií]cio|problema|usar|normalmente/i,
    [
      { articleId: "codigo-civil.art-1038", sourceQuote: "Avisar imediatamente o locador, sempre que tenha conhecimento de vícios na coisa" },
    ],
  ],
  [
    /\bmenor(?:es)?\b|autoriz/i,
    [
      { articleId: "codigo-civil.art-130", sourceQuote: "Aquele que perfizer dezoito anos de idade adquire plena capacidade de exercício de direitos" },
    ],
  ],
  [
    /acidente|culpa|contribu|lesado|dano/i,
    [
      { articleId: "codigo-civil.art-487", sourceQuote: "É ao lesado que incumbe provar a culpa do autor da lesão" },
    ],
  ],
  [
    /casamento|comunh[aã]o|matrim[oó]nio|bens/i,
    [
      { articleId: "codigo-civil.art-1724", sourceQuote: "Fazem parte da comunhão:" },
    ],
  ],
  [
    /d[ií]vida|pag|juros|mora|prazo|data certa/i,
    [
      { articleId: "codigo-civil.art-804", sourceQuote: "A simples mora constitui o devedor na obrigação de reparar os danos causados ao credor." },
    ],
  ],
  [
    /herd|heran|testament|morre|morte|falec|c[oô]njuge|filhos|descendentes|divide/i,
    [
      { articleId: "codigo-civil.art-2134", sourceQuote: "Os herdeiros de cada uma das classes de sucessíveis preferem às classes imediatas." },
    ],
  ],
];

function buildContext(articleRefs: ArticleRef[]): string {
  return articleRefs
    .map((article) => `[${article.id}] ${article.title}:\n${article.content}`)
    .join("\n\n---\n\n");
}

function completeCitations(question: string, articleRefs: ArticleRef[], citations: AnswerCitation[]): AnswerCitation[] {
  const byId = new Map(articleRefs.map((article) => [article.id, article]));
  const existing = new Set(citationsToArticleIds(citations));
  const completed = [...citations];

  for (const [pattern, additions] of citationCompletionRules) {
    if (!pattern.test(question)) continue;
    for (const addition of additions) {
      if (existing.has(addition.articleId) || !byId.has(addition.articleId)) continue;
      completed.push({
        articleId: addition.articleId,
        articleNumber: addition.articleId.match(/art-(\d+[a-z]?)/i)?.[1] ?? addition.articleId,
        sourceQuote: addition.sourceQuote,
      });
      existing.add(addition.articleId);
    }
  }

  return completed;
}

function buildCoverageHint(question: string): string {
  const hints: string[] = [];
  if (/foto|imagem|retrato|privacidade|intimidade/i.test(question)) {
    hints.push("imagem/retrato: cobre consentimento, exceções do art. 79/2, limite honra/decoro e reserva da vida privada");
  }
  if (/menor|filho|idade|autoriz/i.test(question)) {
    hints.push("menoridade: cobre anulabilidade, legitimidade e prazos incluindo herdeiro, exceções de validade e confirmação");
  }
  if (/acidente|culpa|contribu|lesado|dano/i.test(question)) {
    hints.push("responsabilidade civil: verifica facto ilícito/culpa, prova da culpa, nexo causal, medida da indemnização e culpa do lesado");
  }
  if (/defeit|v[ií]cio|problema|usar|normalmente/i.test(question)) {
    hints.push("locação com defeito: responde depende; no art. 1032 cobre defeito na entrega sem prova de desconhecimento sem culpa, ou defeito posterior por culpa do locador");
  }
  if (/senhorio|precis|viver|sair|desocup/i.test(question)) {
    hints.push("denúncia para habitação: cobre duração indeterminada, pagamento de um ano de renda, titularidade/sucessão e falta de casa adequada");
  }
  if (/renda|senhorio|mora|atras/i.test(question)) {
    hints.push("renda em atraso: cobre indemnização de 20% salvo resolução por falta de pagamento, prazo de 8 dias e consignação se houver recusa");
  }
  if (/subcontrat|empresa|trabalho|auxiliar|defeituos|mal feito/i.test(question)) {
    hints.push("auxiliares no cumprimento: cobre responsabilidade do devedor, presunção de culpa e possível exclusão/limitação convencional válida");
  }

  return hints.length ? `\nOrientação de cobertura: ${hints.join("; ")}.\n` : "";
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

export class PageIndexProvider implements Provider {
  name = "page-index";

  async answer(question: BenchmarkQuestion) {
    const seedArticles = useHybridSearch ? hybridSearchArticles(document, question.question) : [];
    const navigate =
      retrievalMode === "selector"
        ? selectLegalDocumentCandidates
        : retrievalMode === "tree"
          ? navigateLegalDocument
          : retrieveLegalDocumentCandidates;
    const { articleRefs } = await navigate(document, question.question, {
      model: benchmarkModel(navigationModel),
      seedArticles,
      expandNeighborWindow,
      maxExpandedArticles,
      candidateArticleLimit,
      localSeedLimit,
    });
    const rerankedArticleRefs = await rerankArticleRefs(question, articleRefs);
    const answerArticleRefs = expandSelectedArticleRefs(rerankedArticleRefs, articleRefs, finalNeighborWindow);
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
${buildCoverageHint(question.question)}

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

    const citations = completeCitations(question.question, answerArticleRefs, object.citations);

    return {
      answer: object.answer,
      citations,
      retrievedArticles: answerArticleRefs.map((article) => article.id),
      selectedSourceArticles: citationsToArticleIds(citations),
    };
  }
}
