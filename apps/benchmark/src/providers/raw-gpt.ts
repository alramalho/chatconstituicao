import { generateObject } from "ai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { citationsToArticleIds } from "../article-utils.js";
import { benchmarkModel, defaultModel } from "../model.js";
import type { BenchmarkQuestion, Provider } from "../types.js";

const pdfPath = resolve(import.meta.dirname, "../../../web/public/codigo-civil.pdf");
const answerModel =
  process.env.BENCHMARK_RAW_MODEL ?? process.env.BENCHMARK_ANSWER_MODEL ?? defaultModel("openai/gpt-5.4-mini");

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

export class RawGptProvider implements Provider {
  name = "raw-gpt";

  async answer(question: BenchmarkQuestion) {
    const pdfBase64 = readFileSync(pdfPath).toString("base64");

    const { object } = await generateObject({
      model: benchmarkModel(answerModel),
      schema: AnswerOutput,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: pdfBase64,
              mediaType: "application/pdf",
            },
            {
              type: "text",
              text: `Responde à pergunta APENAS com base no Código Civil Português fornecido em PDF.
Não uses conhecimento externo.
Devolve uma resposta prática, não uma lista abstrata de artigos.
Devolve também uma lista estruturada "citations" com TODOS os artigos que usaste como fontes para a resposta. Cada citação deve incluir:
- articleNumber;
- articleId: string vazia, salvo se conseguires identificar o id interno;
- sourceQuote: uma frase curta copiada literalmente do artigo citado.
Não incluas artigos que não tenhas usado como fonte.
Se a resposta não puder ser encontrada no documento, diz isso claramente.

Pergunta: ${question.question}`,
            },
          ],
        },
      ],
    });

    return {
      answer: object.answer,
      citations: object.citations,
      retrievedArticles: citationsToArticleIds(object.citations),
    };
  }
}
