import type { Provider } from "../types.js";
import { PageIndexProvider } from "./page-index.js";
import { RawGptProvider } from "./raw-gpt.js";

const providers: Record<string, new () => Provider> = {
  "page-index": PageIndexProvider,
  "raw-gpt": RawGptProvider,
};

export function createProvider(name: string): Provider {
  const ProviderCtor = providers[name];
  if (!ProviderCtor) {
    throw new Error(`Unknown provider "${name}". Available providers: ${Object.keys(providers).join(", ")}`);
  }
  return new ProviderCtor();
}

export function getAvailableProviders(): string[] {
  return Object.keys(providers);
}
