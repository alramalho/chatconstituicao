import { Router } from "express";
import { streamText, gateway } from "ai";
import { authMiddleware } from "../middleware/auth.js";
import { checkQuota, decrementQuota } from "../services/quota.js";
import { navigateLegalDocument } from "../agent/navigate.js";
import { buildAnswerSystemPrompt } from "../agent/prompt.js";
import { getDocumentForHost } from "../data/documents.js";

const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  const { messages } = req.body;
  const ip = req.ip ?? "unknown";
  const userId = req.user?.id ?? null;
  const document = getDocumentForHost(req.headers.host);

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

  const { context, articleRefs } = await navigateLegalDocument(
    document,
    lastUserMessage.content
  );

  const systemWithContext = `${buildAnswerSystemPrompt(document)}

ARTIGOS RELEVANTES DE ${document.title.toUpperCase()}:

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
