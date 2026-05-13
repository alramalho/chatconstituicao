import { generateObject } from "ai";
import { gateway } from "ai";
import type { LegalDocumentNode } from "@chatconstituicao/shared";
import type { LegalDocumentConfig } from "../data/documents.js";
import { NavigationDecision } from "./schemas.js";
import { buildNavigationPrompt } from "./prompt.js";

const MAX_STEPS = 7;
const model = gateway("google/gemini-3-flash");

export type NavigationResult = {
  context: string;
  articleRefs: { id: string; title: string; content: string }[];
};

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

export async function navigateLegalDocument(
  document: LegalDocumentConfig,
  question: string
): Promise<NavigationResult> {
  const root = document.root;
  let currentNode = root;
  const path: string[] = [];
  const collected: Map<string, { title: string; content: string }> = new Map();

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
