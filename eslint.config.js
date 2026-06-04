/**
 * ESLint flat config for Neuron OS.
 * Uses @typescript-eslint parser + plugin for TypeScript strictness.
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 */

// @ts-check
import tseslint from "typescript-eslint"

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "dist/",
      "node_modules/",
      "dashboard/dist/",
      "*.config.*",
      "bun.lock",
    ],
  },

  // Apply to all TS files
  ...tseslint.configs.recommended,

  // Custom rules
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // Test files — allow more flexibility
  {
    files: ["**/test-*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
)
