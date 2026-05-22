export type Difficulty = "easy" | "medium" | "hard";

export type BenchmarkQuestion = {
  id: string;
  question: string;
  expectedAnswer: string;
  expectedArticles: string[];
  category: string;
  difficulty: Difficulty;
  reasoningType: "lookup" | "two_article" | "multi_article";
};

export type AnswerCitation = {
  articleId?: string;
  articleNumber: string;
  sourceQuote: string;
};

export type ProviderAnswer = {
  questionId: string;
  provider: string;
  answer: string;
  latencyMs: number;
  citations?: AnswerCitation[];
  selectedSourceArticles?: string[];
  retrievedArticles?: string[];
  retrievalDebug?: Record<string, unknown>;
};

export type JudgeResult = {
  questionId: string;
  provider: string;
  answerScore: number;
  citationScore: number;
  quoteSupportScore: number;
  overallScore: number;
  retrievalRecall?: number;
  retrievalPrecision?: number;
  retrievalF2?: number;
  explanation: string;
};

export type RunResult = {
  runId: string;
  provider: string;
  timestamp: string;
  answers: ProviderAnswer[];
  results: JudgeResult[];
  summary: {
    totalQuestions: number;
    averageOverallScore: number;
    averageAnswerScore: number;
    averageCitationScore: number;
    averageQuoteSupportScore: number;
    averageRetrievalRecall?: number;
    averageRetrievalPrecision?: number;
    averageRetrievalF2?: number;
    averageLatencyMs: number;
    byDifficulty: Record<string, { count: number; avgOverallScore: number }>;
    byReasoningType: Record<string, { count: number; avgOverallScore: number }>;
  };
};

export interface Provider {
  name: string;
  answer(question: BenchmarkQuestion): Promise<Omit<ProviderAnswer, "questionId" | "provider" | "latencyMs">>;
}
