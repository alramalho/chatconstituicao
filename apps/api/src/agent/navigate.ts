import { generateObject } from "ai";
import { gateway } from "ai";
import type { LegalDocumentNode } from "@chatconstituicao/shared";
import type { LegalDocumentConfig } from "../data/documents.js";
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
};

const OneShotCandidateSelection = z.object({
  articleIds: z.array(z.string()),
  searchQueries: z.array(z.string()),
  reasoning: z.string(),
});

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

function buildFlatArticleIndex(root: LegalDocumentNode): string {
  return collectLeafArticles(root)
    .map((article) => `[${article.id}] ${article.title}`)
    .join("\n");
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

  const articleRefs = [...collected.entries()].map(([id, { title, content }]) => ({
    id,
    title,
    content,
  }));

  const context = articleRefs
    .map((a) => `[${a.id}] ${a.title}:\n${a.content}`)
    .join("\n\n---\n\n");

  return { context, articleRefs };
}

export async function selectLegalDocumentCandidates(
  document: LegalDocumentConfig,
  question: string,
  options: NavigationOptions = {}
): Promise<NavigationResult> {
  const root = document.root;
  const model = options.model ?? defaultModel;
  const collected: Map<string, { title: string; content: string }> = new Map();

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

Índice completo de artigos:
${buildFlatArticleIndex(root)}

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
