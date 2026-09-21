import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/features/auth/sign-up-email-start.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { canContinuePendingSignUp, emailsMatch } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);

assert.equal(emailsMatch("Pat@Firm.com", "pat@firm.com"), true);
assert.equal(emailsMatch("  pat@firm.com  ", "pat@firm.com"), true);
assert.equal(emailsMatch("other@firm.com", "pat@firm.com"), false);
assert.equal(emailsMatch(null, "pat@firm.com"), false);
assert.equal(emailsMatch("", "pat@firm.com"), false);

assert.equal(
  canContinuePendingSignUp({ status: "missing_requirements", emailAddress: "pat@firm.com" }, "pat@firm.com"),
  true,
  "resubmitting the in-progress email should continue, not look like an existing account",
);
assert.equal(
  canContinuePendingSignUp({ status: "missing_requirements", emailAddress: "Pat@Firm.com" }, "pat@firm.com"),
  true,
);
assert.equal(
  canContinuePendingSignUp({ status: "missing_requirements", emailAddress: "old@firm.com" }, "new@firm.com"),
  false,
  "a different email must start a new attempt",
);
assert.equal(canContinuePendingSignUp({ status: null, emailAddress: "pat@firm.com" }, "pat@firm.com"), false);
assert.equal(canContinuePendingSignUp({ status: "complete", emailAddress: "pat@firm.com" }, "pat@firm.com"), false);
assert.equal(canContinuePendingSignUp({ status: "abandoned", emailAddress: "pat@firm.com" }, "pat@firm.com"), false);
assert.equal(canContinuePendingSignUp({}, "pat@firm.com"), false);

console.log("sign-up email start tests passed");
