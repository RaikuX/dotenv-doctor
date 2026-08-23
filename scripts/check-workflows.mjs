import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";

const files = readdirSync(".github/workflows")
  .map((f) => join(".github/workflows", f))
  .concat(["action.yml"]);

let failed = false;
for (const f of files) {
  try {
    loadYaml(readFileSync(f, "utf8"));
    console.log(`OK    ${f}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL  ${f} -> ${e.message.split("\n")[0]}`);
  }
}
process.exit(failed ? 1 : 0);
