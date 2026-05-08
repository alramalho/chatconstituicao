export interface Question {
  id: string;
  question: string;
  expected_answer: string;
  expected_articles: string[];
  category: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface ProviderAnswer {
  questionId: string;
  answer: string;
  provider: string;
  latencyMs: number;
}

export interface JudgeResult {
  questionId: string;
  provider: string;
  score: number;
  explanation: string;
}

export interface RunResult {
  runId: string;
  provider: string;
  timestamp: string;
  results: JudgeResult[];
  summary: {
    totalQuestions: number;
    averageScore: number;
    averageLatencyMs: number;
    byCategory: Record<string, { count: number; avgScore: number }>;
    byDifficulty: Record<string, { count: number; avgScore: number }>;
  };
}

export interface Provider {
  name: string;
  answer(question: string): Promise<string>;
}
