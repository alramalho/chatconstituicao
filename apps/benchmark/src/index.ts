import "dotenv/config";
import { run } from "./run.js";

const args = process.argv.slice(2);

let providers: string[] | undefined;
let limit: number | undefined;
let questionIds: string[] | undefined;
let skipJudge = false;
let concurrency: number | undefined;
let judgeConcurrency: number | undefined;

const probeQuestions: Record<string, string[]> = {
  hard: [
    "cc-q02-senhorio-precisa-da-casa",
    "cc-q03-casa-arrendada-com-defeito",
  ],
  "raw-wins": [
    "cc-q10-heranca-conjuge-e-filhos",
    "cc-q03-casa-arrendada-com-defeito",
  ],
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--providers" && args[i + 1]) {
    providers = args[i + 1].split(",").map((provider) => provider.trim()).filter(Boolean);
    i++;
  } else if (args[i] === "--limit" && args[i + 1]) {
    limit = Number.parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--questions" && args[i + 1]) {
    questionIds = args[i + 1].split(",").map((question) => question.trim()).filter(Boolean);
    i++;
  } else if (args[i] === "--probe" && args[i + 1]) {
    const probeName = args[i + 1];
    questionIds = probeQuestions[probeName];
    if (!questionIds) {
      console.error(`Unknown probe "${probeName}". Available probes: ${Object.keys(probeQuestions).join(", ")}`);
      process.exit(1);
    }
    i++;
  } else if (args[i] === "--skip-judge") {
    skipJudge = true;
  } else if (args[i] === "--concurrency" && args[i + 1]) {
    concurrency = Number.parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--judge-concurrency" && args[i + 1]) {
    judgeConcurrency = Number.parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--help") {
    console.log(`Usage: pnpm --filter @chatlegal/benchmark eval -- [options]

Options:
  --providers raw-gpt,page-index  Providers to run
  --limit 5                       Run the first N questions
  --questions cc-q01,cc-q02       Run specific question IDs
  --probe hard                    Run a named probe: ${Object.keys(probeQuestions).join(", ")}
  --skip-judge                    Skip LLM judging; compute deterministic citation/retrieval metrics only
  --concurrency 2                 Answer-generation concurrency
  --judge-concurrency 3           Judge concurrency
`);
    process.exit(0);
  }
}

run({ providers, limit, questionIds, skipJudge, concurrency, judgeConcurrency }).catch((err) => {
  console.error(err);
  process.exit(1);
});
