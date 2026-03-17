import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import type { ConstitutionNode } from "@chatconstituicao/shared";
import { CONSTITUICAO } from "../data/constituicao.js";
import { NavigationDecision } from "./schemas.js";
import { buildNavigationPrompt } from "./prompt.js";

const MAX_STEPS = 7;
const model = google("gemini-2.5-flash-preview-04-17");

export type NavigationResult = {
  context: string;
  articleRefs: { id: string; title: string; content: string }[];
};

function findNodeById(
  root: ConstitutionNode,
  id: string
): ConstitutionNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function getNodeByPath(
  root: ConstitutionNode,
  path: string[]
): ConstitutionNode {
  let node = root;
  for (const id of path) {
    const child = node.children?.find((c) => c.id === id);
    if (!child) break;
    node = child;
  }
  return node;
}

function collectLeafArticles(node: ConstitutionNode): ConstitutionNode[] {
  if (node.content && node.articleNumber) return [node];
  const articles: ConstitutionNode[] = [];
  for (const child of node.children ?? []) {
    articles.push(...collectLeafArticles(child));
  }
  return articles;
}

export async function navigateConstitution(
  question: string
): Promise<NavigationResult> {
  let currentNode = CONSTITUICAO;
  const path: string[] = [];
  const collected: Map<string, { title: string; content: string }> = new Map();

  for (let step = 0; step < MAX_STEPS; step++) {
    const prompt = buildNavigationPrompt(
      question,
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
      currentNode = getNodeByPath(CONSTITUICAO, path);
    } else if (decision.action === "collect") {
      for (const artId of decision.articleIds) {
        // Try to find in current node's subtree first, then globally
        let node = findNodeById(currentNode, artId);
        if (!node) node = findNodeById(CONSTITUICAO, artId);
        if (node?.content) {
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
    .map((a) => `${a.title}:\n${a.content}`)
    .join("\n\n---\n\n");

  return { context, articleRefs };
}
