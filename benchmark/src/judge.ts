import { generateObject, gateway } from "ai";
import { z } from "zod";
import type { JudgeResult } from "./types.js";

const JudgeOutput = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("0 = completely wrong, 0.5 = partially correct, 1 = fully correct"),
  explanation: z.string().describe("Brief justification for the score"),
});

export async function judge(
  questionId: string,
  provider: string,
  question: string,
  expectedAnswer: string,
  hypothesis: string
): Promise<JudgeResult> {
  const { object } = await generateObject({
    model: gateway("openai/gpt-5.4-mini"),
    schema: JudgeOutput,
    prompt: `You are evaluating an answer about the Portuguese Constitution (Constituição da República Portuguesa).

Question: "${question}"

Expected answer (ground truth):
${expectedAnswer}

Model answer (hypothesis):
${hypothesis}

Score the hypothesis from 0 to 1. Both factual correctness AND explicit article citations are required:
- 1.0: Correct answer with the right specific article references (number + paragraph/alínea when relevant)
- 0.75: Correct substance but missing specific article number or citing wrong article
- 0.5: Partially correct content, or correct content but NO article citations at all
- 0.25: Mostly incorrect but has some relevant information
- 0.0: Completely wrong, irrelevant, or appears to use knowledge not grounded in the Constitution

IMPORTANT: An answer that is factually correct but fails to cite the specific article numbers should score no higher than 0.5. An answer that cites articles not present in the Constitution (hallucinated) should be penalized heavily.`,
  });

  return {
    questionId,
    provider,
    score: object.score,
    explanation: object.explanation,
  };
}
