import { z } from "zod";

export const NavigationDecision = z.object({
  action: z.enum(["navigate", "back", "collect", "search", "answer"]),
  childId: z.string().describe("For navigate, the id of the child node to navigate into. Otherwise empty."),
  articleIds: z
    .array(z.string())
    .describe("For collect, IDs of leaf articles to collect from current node's subtree. Otherwise empty."),
  query: z.string().describe("For search, regex pattern to search across all article texts. Otherwise empty."),
  reasoning: z.string(),
});

export type NavigationDecision = z.infer<typeof NavigationDecision>;
