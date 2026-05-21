import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { gateway } from "ai";

const openAIBaseUrl = process.env.BENCHMARK_OPENAI_BASE_URL;

const openAICompatible = openAIBaseUrl
  ? createOpenAICompatible({
      name: process.env.BENCHMARK_OPENAI_PROVIDER_NAME ?? "vibeproxy",
      baseURL: openAIBaseUrl,
      apiKey: process.env.BENCHMARK_OPENAI_API_KEY ?? "vibeproxy",
      supportsStructuredOutputs: process.env.BENCHMARK_OPENAI_STRUCTURED_OUTPUTS !== "false",
    })
  : undefined;

export function defaultModel(fallbackGatewayModel: string): string {
  return openAICompatible ? (process.env.BENCHMARK_VIBEPROXY_MODEL ?? "gpt-5.4-mini") : fallbackGatewayModel;
}

export function benchmarkModel(modelId: string) {
  return openAICompatible ? openAICompatible.chatModel(modelId) : gateway(modelId);
}

export function modelProviderLabel(): string {
  return openAICompatible ? `openai-compatible:${openAIBaseUrl}` : "ai-gateway";
}
