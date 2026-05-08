import type { Provider } from "../types.js";
import { RawProvider } from "./raw.js";
import { PageIndexProvider } from "./page-index.js";

const providers: Record<string, new () => Provider> = {
  raw: RawProvider,
  "page-index": PageIndexProvider,
};

export function createProvider(name: string): Provider {
  const Ctor = providers[name];
  if (!Ctor) {
    throw new Error(
      `Unknown provider: ${name}. Available: ${Object.keys(providers).join(", ")}`
    );
  }
  return new Ctor();
}

export function getAvailableProviders(): string[] {
  return Object.keys(providers);
}
