import { Router } from "express";
import { streamText, gateway } from "ai";
import { authMiddleware } from "../middleware/auth.js";
import { checkQuota, decrementQuota } from "../services/quota.js";
import { navigateConstitution } from "../agent/navigate.js";
import { ANSWER_SYSTEM_PROMPT } from "../agent/prompt.js";

const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  const { messages } = req.body;
  const ip = req.ip ?? "unknown";
  const userId = req.user?.id ?? null;

  const quota = await checkQuota(userId, ip);
  if (quota.questionsUsed >= quota.questionsLimit) {
    res.status(429).json({ error: "Quota exceeded" });
    return;
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === "user");
  if (!lastUserMessage) {
    res.status(400).json({ error: "No user message" });
    return;
  }

  const { context, articleRefs } = await navigateConstitution(
    lastUserMessage.content
  );

  const systemWithContext = `${ANSWER_SYSTEM_PROMPT}

ARTIGOS RELEVANTES DA CONSTITUIÇÃO:

${context || "Nenhum artigo relevante encontrado."}`;

  await decrementQuota(userId, ip);

  const result = streamText({
    model: gateway("google/gemini-3-flash"),
    system: systemWithContext,
    messages,
  });

  result.pipeTextStreamToResponse(res);
});

export default router;
