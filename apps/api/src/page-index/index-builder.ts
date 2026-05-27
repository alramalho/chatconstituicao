import codigoCivilStructure from "../data/codigo-civil.structure.json" with { type: "json" };
import dedent from "dedent";

export type CodigoCivilStructureNode = (typeof codigoCivilStructure.nodes)[number];

const structureNodeByShortId = new Map<string, CodigoCivilStructureNode>(
  codigoCivilStructure.nodes.map((section, index) => [`s${index + 1}`, section] as const),
);
const shortIdByStructureNodeId = new Map<string, string>(
  codigoCivilStructure.nodes.map((section, index) => [section.id, `s${index + 1}`] as const),
);

export function getCodigoCivilStructureNodes(): CodigoCivilStructureNode[] {
  return [...codigoCivilStructure.nodes];
}

export function resolveCodigoCivilSectionId(sectionId: string): string | undefined {
  return structureNodeByShortId.get(sectionId)?.id ?? codigoCivilStructure.nodes.find((node) => node.id === sectionId)?.id;
}

export function buildCompactCodigoCivilIndex(question: string, sections = codigoCivilStructure.nodes): string {
  const sectionLines = sections
    .map((section) => {
      const shortId = shortIdByStructureNodeId.get(section.id) ?? section.id;
      const depth = Math.max(0, section.path.length - 1);
      return `${"  ".repeat(depth)}${shortId} ${section.title} (${section.firstArticleNumber}-${section.lastArticleNumber})`;
    })
    .join("\n");

  return dedent`
    Seleciona as secções do índice do Código Civil mais prováveis para responder à pergunta.

    Pergunta:
    ${question}

    Índice compacto. A indentação indica hierarquia; os números entre parênteses são intervalos de artigos:
    ${sectionLines}

    Escolhe até 6 sectionIds, usando ids como s123.
    Privilegia recall: se a pergunta puder depender de regras próximas, inclui secções vizinhas ou complementares.
    Devolve apenas ids existentes no índice.
  `;
}
