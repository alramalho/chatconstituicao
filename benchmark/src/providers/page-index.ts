import type { Provider } from "../types.js";

const API_URL = process.env.API_URL ?? "http://localhost:3088";

export class PageIndexProvider implements Provider {
  name = "page-index";

  async answer(question: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!res.ok) {
      const err: any = new Error(`API returned ${res.status}`);
      err.status = res.status;
      throw err;
    }

    // The endpoint streams text, so we collect it
    const text = await res.text();
    return text;
  }
}
