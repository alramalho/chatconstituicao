import { z } from "zod";

export const NavigationDecision = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("navigate"),
    childId: z.string().describe("The id of the child node to navigate into"),
    reasoning: z.string(),
  }),
  z.object({
    action: z.literal("back"),
    reasoning: z.string(),
  }),
  z.object({
    action: z.literal("collect"),
    articleIds: z
      .array(z.string())
      .describe("IDs of leaf articles to collect from current node's subtree"),
    reasoning: z.string(),
  }),
  z.object({
    action: z.literal("search"),
    query: z.string().describe("Regex pattern to search across all article texts (case-insensitive)"),
    reasoning: z.string(),
  }),
  z.object({
    action: z.literal("answer"),
    reasoning: z.string(),
  }),
]);

export type NavigationDecision = z.infer<typeof NavigationDecision>;
