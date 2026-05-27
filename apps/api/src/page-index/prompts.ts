import dedent from "dedent";
import type { LegalDocumentConfig } from "../data/documents.js";
import { buildAnswerSystemPrompt } from "../agent/prompt.js";
import { buildArticleContext } from "./articles.js";
import type { PageIndexArticleRef } from "./types.js";

export function buildRerankPrompt(args: {
  question: string;
  candidates: PageIndexArticleRef[];
  limit: number;
}): string {
  return dedent`
    Seleciona os artigos do Código Civil necessários para responder à pergunta.

    Pergunta:
    ${args.question}

    Artigos candidatos completos:
    ${buildArticleContext(args.candidates)}

    Devolve até ${args.limit} selectedArticleIds.
    Mantém todos os artigos necessários para regra principal, exceções, prazos, ónus de prova, imputabilidade, consequências e reconciliação entre normas.
    Remove artigos claramente laterais.
    Usa apenas IDs presentes acima.
  `;
}

export function buildAnswerSystemWithContext(args: {
  document: LegalDocumentConfig;
  context: string;
}): string {
  return dedent`
    ${buildAnswerSystemPrompt(args.document)}

    ARTIGOS RELEVANTES DE ${args.document.title.toUpperCase()}:

    ${args.context || "Nenhum artigo relevante encontrado."}
  `;
}

export function buildAnswerUserPrompt(question: string): string {
  return dedent`
    Responde à pergunta de forma prática e fundamentada.

    Devolve também citações estruturadas. Cada citação deve apontar para um artigo efetivamente usado na resposta e incluir:
    - articleId, se estiver visível no contexto;
    - se não conseguires identificar o articleId, usa string vazia;
    - articleNumber;
    - sourceQuote: uma frase curta copiada literalmente do artigo citado.

    O sourceQuote tem de ser uma passagem contínua e literal do artigo: não uses reticências, não juntes excertos separados com ponto e vírgula, e não alteres aspas ou pontuação.
    Inclui uma citação para cada artigo que dê uma regra, requisito, exceção, prazo, ónus de prova ou consequência necessária para responder ao caso.
    Não pares no primeiro artigo útil quando os artigos seguintes completam a solução.
    Antes de concluir, verifica se a resposta cobriu: regra principal, exceções ou requisitos, prazos/procedimento, ónus/imputabilidade e consequência prática, quando esses pontos aparecerem nos artigos fornecidos.

    Pergunta: ${question}
  `;
}
