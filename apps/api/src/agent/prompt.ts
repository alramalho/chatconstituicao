import type { LegalDocumentNode } from "@chatconstituicao/shared";
import type { LegalDocumentConfig } from "../data/documents.js";

function describeChildren(node: LegalDocumentNode): string {
  if (!node.children?.length) return "(sem filhos — nó folha)";
  return node.children
    .map((c) => `- [${c.id}] ${c.title}${c.content ? " (artigo com texto)" : ` (${c.children?.length ?? 0} filhos)`}`)
    .join("\n");
}

export function buildNavigationPrompt(
  question: string,
  document: LegalDocumentConfig,
  currentNode: LegalDocumentNode,
  path: string[],
  collectedSoFar: string[]
): string {
  const pathStr = path.length > 0 ? path.join(" > ") : "(raiz)";
  const hasContent = currentNode.content
    ? `\n\nTexto deste nó:\n${currentNode.content}`
    : "";

  const collectedStr =
    collectedSoFar.length > 0
      ? `\n\nArtigos já recolhidos (${collectedSoFar.length}):\n${collectedSoFar.map((c) => c.slice(0, 80) + "...").join("\n")}`
      : "";

  return `Estás a navegar ${document.title} para encontrar artigos relevantes à pergunta do utilizador.

Pergunta: "${question}"

Caminho atual: ${pathStr}
Nó atual: ${currentNode.title}
${hasContent}

Filhos disponíveis:
${describeChildren(currentNode)}
${collectedStr}

Decide a próxima ação:
- "navigate": entra num filho para explorar mais fundo
- "back": volta ao nó pai (se não estás na raiz)
- "collect": recolhe artigos específicos deste nível (indica os IDs dos artigos folha)
- "search": pesquisa por regex em todos os ${document.articlePlural} (ex: "direitos.*trabalhadores", "imposto|tributo")
- "answer": já tens contexto suficiente, termina a navegação

Nota: podes recolher artigos e continuar a navegar. Usa "answer" quando tiveres artigos suficientes.`;
}

export function buildAnswerSystemPrompt(document: LegalDocumentConfig): string {
  return `És um ${document.specialistRole}. Respondes a perguntas sobre ${document.title} de forma clara, precisa e acessível.

REGRAS:
- Responde SEMPRE em português
- Baseia as tuas respostas APENAS nos artigos fornecidos como contexto
- Cita SEMPRE os artigos relevantes usando este formato exato: [[source:ID-DO-ARTIGO|"texto citado"]], onde ID-DO-ARTIGO é o identificador entre parênteses retos no início de cada artigo (ex: principios-fundamentais.art-1)
- O texto citado deve ser uma passagem relevante copiada diretamente do artigo
- Se não encontrares informação relevante nos artigos fornecidos, diz isso claramente
- Sê conciso mas completo
- Usa linguagem acessível, evita jargão jurídico desnecessário`;
}
