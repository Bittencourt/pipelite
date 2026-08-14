import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent git worktrees contain a full second copy of src/, which otherwise
    // doubles the reported problem count and — worse — lets a transient copy
    // fail the repo's lint gate for reasons unrelated to the real tree.
    ".claude/**",
  ]),
]);

export default eslintConfig;
