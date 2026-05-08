import "dotenv/config";
import { run } from "./run.js";

const args = process.argv.slice(2);

let providers: string[] | undefined;
let limit: number | undefined;
let questionIds: string[] | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--providers" && args[i + 1]) {
    providers = args[i + 1].split(",");
    i++;
  } else if (args[i] === "--limit" && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--questions" && args[i + 1]) {
    questionIds = args[i + 1].split(",");
    i++;
  }
}

run({ providers, limit, questionIds }).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
