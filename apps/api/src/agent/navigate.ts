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
  candidateArticleLimit?: number;
  localSeedLimit?: number;
};

const OneShotCandidateSelection = z.object({
  articleIds: z.array(z.string()),
  searchQueries: z.array(z.string()),
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
  [/herd|heran|testament|morre|morte|falec|conjuge|divide/i, ["sucessao", "sucessiveis", "heranca", "conjuge", "descendentes", "filhos", "partilha"]],
  [/defeit|vicio|problema|usar|usad|normalmente/i, ["vicio", "defeito", "qualidades", "locada", "locador", "locatario", "aviso"]],
  [/renda|senhorio|arrend|loca/i, ["locacao", "locatario", "locador", "arrendamento", "arrendatario", "senhorio", "renda", "mora", "denuncia"]],
  [/senhorio|precis|viver|sair|desocup/i, ["denuncia", "necessidade", "habitacao", "proprio", "descendentes", "desocupacao"]],
  [/menor|filho|idade|autoriz/i, ["menor", "maioridade", "incapacidade", "anulabilidade"]],
  [/acidente|culpa|lesado/i, ["responsabilidade", "dano", "culpa", "indemnizacao", "lesado"]],
  [/subcontrat|empresa|trabalho|auxiliar|defeituos|mal feito/i, ["devedor", "credor", "cumprimento", "defeituoso", "auxiliares", "representantes"]],
  [/divida|pag|juros|mora|prazo|data certa/i, ["obrigacao", "mora", "juros", "pecuniaria", "cumprimento", "prazo", "interpelacao"]],
  [/foto|imagem|retrato|privacidade/i, ["retrato", "imagem", "intimidade", "reserva", "honra"]],
  [/casamento|comunhao|matrimonio|bens/i, ["casamento", "comunhao", "adquiridos", "bens", "proprios"]],
];

const articleRangeBoosts: [RegExp, { min: number; max: number; boost: number }[]][] = [
  [/defeit|vicio|problema|usar|usad|normalmente/i, [{ min: 1032, max: 1038, boost: 55 }]],
  [/renda|mora|atras/i, [{ min: 1038, max: 1042, boost: 45 }]],
  [/senhorio|arrend|loca|desocup/i, [{ min: 1022, max: 1113, boost: 30 }]],
  [/divida|pag|juros|mora|prazo|data certa/i, [{ min: 798, max: 806, boost: 35 }, { min: 559, max: 561, boost: 8 }]],
  [/acidente|culpa|lesado/i, [{ min: 483, max: 487, boost: 35 }, { min: 562, max: 563, boost: 42 }, { min: 570, max: 570, boost: 42 }, { min: 564, max: 569, boost: 18 }]],
  [/contribu|ambos|dois/i, [{ min: 570, max: 570, boost: 45 }]],
  [/subcontrat|empresa|trabalho|auxiliar|defeituos|mal feito/i, [{ min: 798, max: 800, boost: 55 }]],
  [/menor|filho|idade|autoriz/i, [{ min: 122, max: 130, boost: 45 }]],
  [/foto|imagem|retrato|privacidade/i, [{ min: 70, max: 81, boost: 25 }]],
  [/casamento|comunhao|matrimonio|bens/i, [{ min: 1717, max: 1733, boost: 25 }]],
  [/herd|heran|testament|morre|morte|falec|conjuge|divide/i, [{ min: 2131, max: 2148, boost: 35 }]],
  [/morre|sem testamento|herda|divide/i, [{ min: 2133, max: 2134, boost: 70 }, { min: 2139, max: 2139, boost: 70 }, { min: 2135, max: 2138, boost: 35 }]],
];

const anchorArticleIds: [RegExp, string[]][] = [
  [
    /acidente|culpa|contribu|lesado/i,
    [
      "codigo-civil.art-483",
      "codigo-civil.art-487",
      "codigo-civil.art-562",
      "codigo-civil.art-563",
      "codigo-civil.art-570",
    ],
  ],
  [
    /herd|heran|testament|morre|morte|falec|c[oô]njuge|filhos|descendentes|divide/i,
    [
      "codigo-civil.art-2133",
      "codigo-civil.art-2134",
      "codigo-civil.art-2139",
    ],
  ],
  [
    /defeit|v[ií]cio|problema|usar|usad|normalmente/i,
    [
      "codigo-civil.art-1032",
      "codigo-civil.art-1033",
      "codigo-civil.art-1038",
    ],
  ],
  [
    /menor|filho|idade|autoriz/i,
    [
      "codigo-civil.art-125",
      "codigo-civil.art-127",
      "codigo-civil.art-130",
    ],
  ],
  [
    /casamento|comunh[aã]o|matrim[oó]nio|bens/i,
    [
      "codigo-civil.art-1721",
      "codigo-civil.art-1722",
      "codigo-civil.art-1724",
    ],
  ],
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

function articleNumberAsNumber(article: LegalDocumentNode): number | null {
  const number = String(article.articleNumber ?? "").match(/\d+/)?.[0];
  return number ? Number.parseInt(number, 10) : null;
}

function articleRangeBoost(question: string, article: LegalDocumentNode): number {
  const articleNumber = articleNumberAsNumber(article);
  if (articleNumber === null) return 0;

  let boost = 0;
  for (const [pattern, ranges] of articleRangeBoosts) {
    if (!pattern.test(question)) continue;
    for (const range of ranges) {
      if (articleNumber >= range.min && articleNumber <= range.max) boost += range.boost;
    }
  }
  return boost;
}

function selectLocalCandidateArticles(root: LegalDocumentNode, question: string, limit: number): LegalDocumentNode[] {
  const tokens = expandedQuestionTokens(question);
  const articles = collectLeafArticles(root);
  const scored = articles.map((article, index) => {
    const title = normalizeSelectorText(article.title);
    const content = normalizeSelectorText(article.content ?? "");
    let score = articleRangeBoost(question, article);

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

function addAnchorArticles(
  root: LegalDocumentNode,
  question: string,
  collected: Map<string, { title: string; content: string }>,
): void {
  for (const [pattern, articleIds] of anchorArticleIds) {
    if (!pattern.test(question)) continue;
    for (const articleId of articleIds) {
      const article = findNodeById(root, articleId);
      if (article) addArticleToCollected(collected, article);
    }
  }
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

  for (const article of selectLocalCandidateArticles(root, question, options.localSeedLimit ?? 8)) {
    addArticleToCollected(collected, article);
  }

  addAnchorArticles(root, question, collected);

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
