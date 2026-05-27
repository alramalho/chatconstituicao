import { Router } from "express";
import { streamText, gateway } from "ai";
import { buildAnswerSystemPrompt } from "../agent/prompt.js";
import { getDocumentForHost } from "../data/documents.js";
import { logger } from "../lib/logger.js";
import { pageIndexSettingsFromEnv, preparePageIndexContext } from "../page-index/algorithm.js";
import dedent from "dedent";

const router = Router();

router.post("/", async (req, res) => {
  const { messages } = req.body;
  const document = getDocumentForHost(req.headers.host);

  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === "user");
  if (!lastUserMessage) {
    res.status(400).json({ error: "No user message" });
    return;
  }

  const model = gateway("x-ai/grok-4.3");
  const pageIndexContext = await preparePageIndexContext({
    document,
    question: lastUserMessage.content,
    models: {
      index: model,
      rerank: model,
      answer: model,
    },
    settings: pageIndexSettingsFromEnv(),
    logger: logger.child({ component: "page-index", documentId: document.id }),
  });

  const systemWithContext = dedent(`
    ${buildAnswerSystemPrompt(document)}

    ARTIGOS RELEVANTES DE ${document.title.toUpperCase()}:

    ${pageIndexContext.context || "Nenhum artigo relevante encontrado."}
  `);

  const result = streamText({
    model,
    system: systemWithContext,
    messages,
  });

  result.pipeTextStreamToResponse(res);
});

export default router;
