import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

let checked = 0;
let failed = 0;

function selectorCreatesUnstableSnapshot(sourceFile) {
  const problems = [];
  function visit(node) {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "useDemoStore"
      && node.arguments.length) {
      const selector = node.arguments[0];
      if (ts.isArrowFunction(selector) && !ts.isBlock(selector.body)) {
        let body = selector.body;
        while (ts.isParenthesizedExpression(body)) body = body.expression;
        const collectionCall = ts.isCallExpression(body)
          && ts.isPropertyAccessExpression(body.expression)
          && ["filter", "map", "slice", "concat"].includes(body.expression.name.text);
        if (ts.isArrayLiteralExpression(body) || ts.isObjectLiteralExpression(body) || collectionCall) {
          const location = sourceFile.getLineAndCharacterOfPosition(selector.getStart(sourceFile));
          problems.push(`Unstable useDemoStore selector at ${location.line + 1}:${location.character + 1}. Select the stored reference first, then derive arrays/objects outside the selector (or use a shallow comparator).`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return problems;
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.tsx?$/.test(entry.name)) {
      checked += 1;
      const source = fs.readFileSync(file, "utf8");
      const result = ts.transpileModule(source, {
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
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, entry.name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const selectorProblems = selectorCreatesUnstableSnapshot(sourceFile);
      if (selectorProblems.length) {
        failed += selectorProblems.length;
        console.error(`\n${file}`);
        selectorProblems.forEach((problem) => console.error(problem));
      }
    }
  }
}

walk(path.resolve("src"));
console.log(`Checked ${checked} TypeScript/TSX files; ${failed} syntax failure(s).`);
process.exit(failed ? 1 : 0);
