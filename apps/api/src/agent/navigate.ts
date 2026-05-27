import { generateObject } from "ai";
import { gateway } from "ai";
import type { LegalDocumentNode } from "@chatconstituicao/shared";
import type { LegalDocumentConfig } from "../data/documents.js";
import codigoCivilStructure from "../data/codigo-civil.structure.json" with { type: "json" };
import { NavigationDecision } from "./schemas.js";
import { buildNavigationPrompt } from "./prompt.js";
import { z } from "zod";

const MAX_STEPS = 7;
const defaultModel = gateway("google/gemini-3-flash");
type NavigationModel = Parameters<typeof generateObject>[0]["model"];

export type NavigationResult = {
  context: string;
  articleRefs: { id: string; title: string; content: string }[];
};

export type NavigationOptions = {
  model?: NavigationModel;
  seedArticles?: LegalDocumentNode[];
  expandNeighborWindow?: number;
  maxExpandedArticles?: number;
  candidateArticleLimit?: number;
  localSeedLimit?: number;
};

const OneShotCandidateSelection = z.object({
  articleIds: z.array(z.string()),
  searchQueries: z.array(z.string()),
  reasoning: z.string(),
});

const IndexSectionSelection = z.object({
  sectionIds: z.array(z.string()),
  reasoning: z.string(),
});

const selectorStopwords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "eu",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "se",
  "sem",
  "um",
  "uma",
]);

const queryExpansions: [RegExp, string[]][] = [
];

function findNodeById(
  root: LegalDocumentNode,
  id: string
): LegalDocumentNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function getNodeByPath(
  root: LegalDocumentNode,
  path: string[]
): LegalDocumentNode {
  let node = root;
  for (const id of path) {
    const child = node.children?.find((c) => c.id === id);
    if (!child) break;
    node = child;
  }
  return node;
}

function collectLeafArticles(node: LegalDocumentNode): LegalDocumentNode[] {
  if (node.content && node.articleNumber) return [node];
  const articles: LegalDocumentNode[] = [];
  for (const child of node.children ?? []) {
    articles.push(...collectLeafArticles(child));
  }
  return articles;
}

function normalizeSelectorText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectorTokens(value: string): string[] {
  return normalizeSelectorText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !selectorStopwords.has(token));
}

function expandedQuestionTokens(question: string): string[] {
  const tokens = selectorTokens(question);
  for (const [pattern, expansions] of queryExpansions) {
    if (pattern.test(question)) tokens.push(...expansions);
  }
  return [...new Set(tokens)];
}

function selectLocalCandidateArticles(root: LegalDocumentNode, question: string, limit: number): LegalDocumentNode[] {
  const tokens = expandedQuestionTokens(question);
  const articles = collectLeafArticles(root);
  const sectionScores = scoreIndexSections(root, tokens);
  const articleSectionBoosts = new Map<string, number>();

  for (const [section, sectionScore] of sectionScores.slice(0, Math.max(4, Math.ceil(limit / 2)))) {
    for (const articleId of section.articleIds) {
      articleSectionBoosts.set(articleId, (articleSectionBoosts.get(articleId) ?? 0) + sectionScore);
    }
  }

  const scored = articles.map((article, index) => {
    const title = normalizeSelectorText(article.title);
    const content = normalizeSelectorText(article.content ?? "");
    let score = articleSectionBoosts.get(article.id) ?? 0;

    for (const token of tokens) {
      if (title.includes(token)) score += 12;
      if (content.includes(token)) score += token.length > 5 ? 2 : 1;
    }

    if (article.articleNumber && new RegExp(`\\b${article.articleNumber}\\b`).test(question)) score += 50;
    return { article, index, score };
  });

  const seeds = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(10, Math.floor(limit * 0.7)));

  const selected = new Map<string, LegalDocumentNode>();
  for (const seed of seeds) {
    for (let offset = -3; offset <= 3; offset++) {
      const article = articles[seed.index + offset];
      if (article?.id) selected.set(article.id, article);
      if (selected.size >= limit) break;
    }
    if (selected.size >= limit) break;
  }

  if (selected.size === 0) {
    for (const article of articles.slice(0, limit)) selected.set(article.id, article);
  }

  return [...selected.values()].slice(0, limit);
}

type CodigoCivilStructureNode = (typeof codigoCivilStructure.nodes)[number];

const structureNodeByShortId = new Map<string, CodigoCivilStructureNode>(
  codigoCivilStructure.nodes.map((section, index) => [`s${index + 1}`, section] as const),
);
const shortIdByStructureNodeId = new Map<string, string>(
  codigoCivilStructure.nodes.map((section, index) => [section.id, `s${index + 1}`] as const),
);

function buildIndexPrompt(question: string, sections: CodigoCivilStructureNode[]): string {
  const sectionLines = sections
    .map((section) => {
      const shortId = shortIdByStructureNodeId.get(section.id) ?? section.id;
      const depth = Math.max(0, section.path.length - 1);
      return `${"  ".repeat(depth)}${shortId} ${section.title} (${section.firstArticleNumber}-${section.lastArticleNumber})`;
    })
    .join("\n");

  return `Seleciona as secções do índice do Código Civil mais prováveis para responder à pergunta.

Pergunta:
${question}

Índice compacto. A indentação indica hierarquia; os números entre parênteses são intervalos de artigos:
${sectionLines}

Escolhe até 6 sectionIds, usando ids como s123. Privilegia recall: se a pergunta puder depender de regras próximas, inclui secções vizinhas ou complementares. Devolve apenas ids existentes no índice.`;
}

function scoreIndexSections(root: LegalDocumentNode, tokens: string[]): [CodigoCivilStructureNode, number][] {
  if (root.id !== "codigo-civil" || tokens.length === 0) return [];

  return codigoCivilStructure.nodes
    .map((section) => {
      const title = normalizeSelectorText(section.title);
      const text = normalizeSelectorText(section.path.join(" "));
      let score = 0;

      for (const token of tokens) {
        if (title.includes(token)) score += 8;
        if (text.includes(token)) score += token.length > 5 ? 3 : 1;
      }

      return [section, score] as [CodigoCivilStructureNode, number];
    })
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
}

async function selectIndexedCandidateArticles(
  root: LegalDocumentNode,
  question: string,
  model: NavigationModel,
  limit: number,
): Promise<LegalDocumentNode[]> {
  if (root.id !== "codigo-civil") return selectLocalCandidateArticles(root, question, limit);

  const tokens = expandedQuestionTokens(question);
  const articles = collectLeafArticles(root);
  const byId = new Map(articles.map((article) => [article.id, article]));
  const selectedSectionScores = new Map<string, number>();
  const candidateSections = [...codigoCivilStructure.nodes];

  try {
    const { object } = await generateObject({
      model,
      schema: IndexSectionSelection,
      prompt: buildIndexPrompt(question, candidateSections),
    });

    object.sectionIds.slice(0, 8).forEach((sectionId, index) => {
      const section = structureNodeByShortId.get(sectionId) ?? codigoCivilStructure.nodes.find((node) => node.id === sectionId);
      if (section) selectedSectionScores.set(section.id, 80 - index * 8);
    });
  } catch {
    // If section selection fails, fall back to deterministic index scoring.
  }

  if (selectedSectionScores.size === 0) {
    for (const [section, score] of scoreIndexSections(root, tokens).slice(0, 6)) {
      selectedSectionScores.set(section.id, score);
    }
  }

  const articleSectionBoosts = new Map<string, number>();
  for (const section of codigoCivilStructure.nodes) {
    const sectionScore = selectedSectionScores.get(section.id);
    if (!sectionScore) continue;
    for (const articleId of section.articleIds) {
      articleSectionBoosts.set(articleId, (articleSectionBoosts.get(articleId) ?? 0) + sectionScore);
    }
  }

  const scored = [...articleSectionBoosts.entries()]
    .map(([articleId, sectionScore]) => {
      const article = byId.get(articleId);
      if (!article) return null;
      const title = normalizeSelectorText(article.title);
      const content = normalizeSelectorText(article.content ?? "");
      let score = sectionScore;

      for (const token of tokens) {
        if (title.includes(token)) score += 12;
        if (content.includes(token)) score += token.length > 5 ? 2 : 1;
      }

      if (article.articleNumber && new RegExp(`\\b${article.articleNumber}\\b`).test(question)) score += 50;
      return { article, score };
    })
    .filter((item): item is { article: LegalDocumentNode; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  const selected = new Map<string, LegalDocumentNode>();
  for (const seed of scored.slice(0, Math.max(10, Math.floor(limit * 0.7)))) {
    selected.set(seed.article.id, seed.article);
  }

  if (selected.size === 0) return selectLocalCandidateArticles(root, question, limit);
  return [...selected.values()].slice(0, limit);
}

function addArticleToCollected(
  collected: Map<string, { title: string; content: string }>,
  article: LegalDocumentNode,
): void {
  if (!article.content) return;
  collected.set(article.id, {
    title: article.title,
    content: article.content,
  });
}

function buildFlatArticleIndex(articles: LegalDocumentNode[]): string {
  return articles
    .map((article) => {
      const excerpt = (article.content ?? "").replace(/\s+/g, " ").slice(0, 260);
      return `[${article.id}] ${article.title}${excerpt ? `\n${excerpt}` : ""}`;
    })
    .join("\n\n");
}

function searchArticles(root: LegalDocumentNode, query: string, limit = 8): LegalDocumentNode[] {
  const allArticles = collectLeafArticles(root);
  let re: RegExp;
  try {
    re = new RegExp(query, "i");
  } catch {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  return allArticles.filter((a) => re.test(a.content ?? "") || re.test(a.title)).slice(0, limit);
}

function expandCollectedArticles(
  root: LegalDocumentNode,
  collected: Map<string, { title: string; content: string }>,
  window: number,
  maxArticles: number,
): void {
  if (window <= 0 || collected.size >= maxArticles) return;

  const articles = collectLeafArticles(root);
  const indexById = new Map(articles.map((article, index) => [article.id, index]));
  const originalIds = [...collected.keys()];

  for (const id of originalIds) {
    const index = indexById.get(id);
    if (index === undefined) continue;

    for (let offset = -window; offset <= window; offset++) {
      if (offset === 0) continue;
      const neighbor = articles[index + offset];
      if (!neighbor?.content || collected.has(neighbor.id)) continue;

      collected.set(neighbor.id, {
        title: neighbor.title,
        content: neighbor.content,
      });

      if (collected.size >= maxArticles) return;
    }
  }
}

function buildNavigationResultFromCollected(collected: Map<string, { title: string; content: string }>): NavigationResult {
  const articleRefs = [...collected.entries()].map(([id, { title, content }]) => ({
    id,
    title,
    content,
  }));

  const context = articleRefs
    .map((article) => `[${article.id}] ${article.title}:\n${article.content}`)
    .join("\n\n---\n\n");

  return { context, articleRefs };
}

export async function retrieveLegalDocumentCandidates(
  document: LegalDocumentConfig,
  question: string,
  options: NavigationOptions = {},
): Promise<NavigationResult> {
  const root = document.root;
  const collected: Map<string, { title: string; content: string }> = new Map();

  for (const article of options.seedArticles ?? []) {
    addArticleToCollected(collected, article);
  }

  for (const article of await selectIndexedCandidateArticles(
    root,
    question,
    options.model ?? defaultModel,
    options.localSeedLimit ?? 8,
  )) {
    addArticleToCollected(collected, article);
  }

  expandCollectedArticles(
    root,
    collected,
    options.expandNeighborWindow ?? 0,
    options.maxExpandedArticles ?? 24,
  );

  return buildNavigationResultFromCollected(collected);
}

export async function navigateLegalDocument(
  document: LegalDocumentConfig,
  question: string,
  options: NavigationOptions = {}
): Promise<NavigationResult> {
  const root = document.root;
  const model = options.model ?? defaultModel;
  let currentNode = root;
  const path: string[] = [];
  const collected: Map<string, { title: string; content: string }> = new Map();

  for (const article of options.seedArticles ?? []) {
    if (article.content) {
      collected.set(article.id, {
        title: article.title,
        content: article.content,
      });
    }
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const prompt = buildNavigationPrompt(
      question,
      document,
      currentNode,
      path,
      [...collected.values()].map((c) => c.title)
    );

    const { object: decision } = await generateObject({
      model,
      schema: NavigationDecision,
      prompt,
    });

    if (decision.action === "navigate") {
      const child = currentNode.children?.find(
        (c) => c.id === decision.childId
      );
      if (!child) break;
      currentNode = child;
      path.push(child.id);

      if (child.content) {
        collected.set(child.id, {
          title: child.title,
          content: child.content,
        });
      }
    } else if (decision.action === "back") {
      if (path.length === 0) continue;
      path.pop();
      currentNode = getNodeByPath(root, path);
    } else if (decision.action === "collect") {
      for (const artId of decision.articleIds) {
        // Try to find in current node's subtree first, then globally
        let node = findNodeById(currentNode, artId);
        if (!node) node = findNodeById(root, artId);
        if (node?.content) {
          collected.set(node.id, {
            title: node.title,
            content: node.content,
          });
        }
      }
    } else if (decision.action === "search") {
      const results = searchArticles(root, decision.query);
      for (const node of results) {
        if (node.content) {
          collected.set(node.id, {
            title: node.title,
            content: node.content,
          });
        }
      }
    } else if (decision.action === "answer") {
      break;
    }
  }

  // If nothing was collected but we're at a node with articles, grab them
  if (collected.size === 0 && currentNode.children) {
    const leaves = collectLeafArticles(currentNode).slice(0, 5);
    for (const leaf of leaves) {
      if (leaf.content) {
        collected.set(leaf.id, { title: leaf.title, content: leaf.content });
      }
    }
  }

  expandCollectedArticles(
    root,
    collected,
    options.expandNeighborWindow ?? 0,
    options.maxExpandedArticles ?? 50,
  );

  return buildNavigationResultFromCollected(collected);
}

export async function selectLegalDocumentCandidates(
  document: LegalDocumentConfig,
  question: string,
  options: NavigationOptions = {}
): Promise<NavigationResult> {
  const root = document.root;
  const model = options.model ?? defaultModel;
  const collected: Map<string, { title: string; content: string }> = new Map();
  const candidateArticles = selectLocalCandidateArticles(root, question, options.candidateArticleLimit ?? 120);

  for (const article of options.seedArticles ?? []) {
    if (article.content) {
      collected.set(article.id, {
        title: article.title,
        content: article.content,
      });
    }
  }

  const { object: selection } = await generateObject({
    model,
    schema: OneShotCandidateSelection,
    prompt: `Estás a selecionar artigos relevantes de ${document.title} para responder a uma pergunta jurídica.

Pergunta: "${question}"

Artigos candidatos pré-selecionados por pesquisa lexical local:
${buildFlatArticleIndex(candidateArticles)}

Seleciona até 12 articleIds que possam ser relevantes. Privilegia recall: inclui artigos próximos quando uma regra depende de vários artigos consecutivos.
Se a pergunta usar linguagem comum, mapeia para os institutos jurídicos prováveis.
Também podes devolver até 4 searchQueries curtas para procurar texto nos artigos quando o índice não for suficiente.

Devolve apenas IDs existentes no índice.`,
  });

  for (const articleId of selection.articleIds.slice(0, 20)) {
    const node = findNodeById(root, articleId);
    if (node?.content) {
      collected.set(node.id, {
        title: node.title,
        content: node.content,
      });
    }
  }

  for (const query of selection.searchQueries.slice(0, 4)) {
    const results = searchArticles(root, query, 5);
    for (const node of results) {
      if (node.content) {
        collected.set(node.id, {
          title: node.title,
          content: node.content,
        });
      }
    }
  }

  expandCollectedArticles(
    root,
    collected,
    options.expandNeighborWindow ?? 0,
    options.maxExpandedArticles ?? 50,
  );

  return buildNavigationResultFromCollected(collected);
}
