import type { ConstitutionNode } from "@chatconstituicao/shared";

function describeChildren(node: ConstitutionNode): string {
  if (!node.children?.length) return "(sem filhos — nó folha)";
  return node.children
    .map((c) => `- [${c.id}] ${c.title}${c.content ? " (artigo com texto)" : ` (${c.children?.length ?? 0} filhos)`}`)
    .join("\n");
}

export function buildNavigationPrompt(
  question: string,
  currentNode: ConstitutionNode,
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

  return `Estás a navegar a Constituição da República Portuguesa para encontrar artigos relevantes à pergunta do utilizador.

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
- "answer": já tens contexto suficiente, termina a navegação

Nota: podes recolher artigos e continuar a navegar. Usa "answer" quando tiveres artigos suficientes.`;
}

export const ANSWER_SYSTEM_PROMPT = `Ès um especialista em direito constitucional português. Respondes a perguntas sobre a Constituição da República Portuguesa de forma clara, precisa e acessível.

REGRAS:
- Responde SEMPRE em português
- Baseia as tuas respostas APENAS nos artigos fornecidos como contexto
- Cita SEMPRE os artigos relevantes usando este formato exato: [[source:ID-DO-ARTIGO|"texto citado"]]
- O texto citado deve ser uma passagem relevante copiada diretamente do artigo
- Se não encontrares informação relevante nos artigos fornecidos, diz isso claramente
- Sê conciso mas completo
- Usa linguagem acessível, evita jargão jurídico desnecessário`;
