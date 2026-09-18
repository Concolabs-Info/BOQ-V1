import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/shared/services/bearerHeader.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { bearerHeader } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));

assert.deepEqual(bearerHeader(null), {});
assert.deepEqual(bearerHeader(undefined), {});
assert.deepEqual(bearerHeader(""), {});
assert.deepEqual(bearerHeader("sess_abc"), { Authorization: "Bearer sess_abc" });
console.log("bearerHeader tests passed");
