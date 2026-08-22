import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

let checked = 0;
let failed = 0;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.tsx?$/.test(entry.name)) {
      checked += 1;
      const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: {
          jsx: ts.JsxEmit.Preserve,
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
        },
      });
      if (result.diagnostics?.length) {
        failed += 1;
        console.error(`\n${file}`);
        for (const diagnostic of result.diagnostics) {
          console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        }
      }
    }
  }
}

walk(path.resolve("src"));
console.log(`Checked ${checked} TypeScript/TSX files; ${failed} syntax failure(s).`);
process.exit(failed ? 1 : 0);
