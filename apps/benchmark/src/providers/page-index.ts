import { answerWithPageIndex, pageIndexSettingsFromEnv } from "../../../api/src/page-index/algorithm.js";
import { LEGAL_DOCUMENTS } from "../../../api/src/data/documents.js";
import { benchmarkModel, defaultModel } from "../model.js";
import type { BenchmarkQuestion, Provider } from "../types.js";

const document = LEGAL_DOCUMENTS["codigo-civil"];
const navigationModel = process.env.BENCHMARK_NAVIGATION_MODEL ?? defaultModel("google/gemini-3-flash");
const answerModel = process.env.BENCHMARK_ANSWER_MODEL ?? defaultModel("openai/gpt-5.4-mini");

export class PageIndexProvider implements Provider {
  name = "page-index";

  async answer(question: BenchmarkQuestion) {
    return answerWithPageIndex({
      document,
      question: question.question,
      models: {
        index: benchmarkModel(navigationModel),
        rerank: benchmarkModel(navigationModel),
        answer: benchmarkModel(answerModel),
      },
      settings: pageIndexSettingsFromEnv(),
    });
  }
}
