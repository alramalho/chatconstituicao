import { generateText, gateway } from "ai";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Provider } from "../types.js";

const PDF_PATH = resolve(
  import.meta.dirname,
  "../../../apps/web/public/constituicao.pdf"
);

export class RawProvider implements Provider {
  name = "raw-gpt";

  async answer(question: string): Promise<string> {
    const pdfBuffer = readFileSync(PDF_PATH);
    const pdfBase64 = pdfBuffer.toString("base64");

    const { text } = await generateText({
      model: gateway("openai/gpt-5.4-mini"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: pdfBase64,
              mediaType: "application/pdf",
            },
            {
              type: "text",
              text: `Responde à seguinte pergunta APENAS com base no documento da Constituição da República Portuguesa fornecido. NÃO uses conhecimento externo. Cita SEMPRE os artigos específicos (número do artigo e número/alínea relevante). Se a informação não estiver no documento, diz que não encontras.\n\nPergunta: ${question}`,
            },
          ],
        },
      ],
    });

    return text;
  }
}
