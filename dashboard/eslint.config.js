/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      "coverage/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "NewExpression[callee.name='CustomEvent'] > Literal[value=/^dashboard:/]",
          message: "Use DashboardEvent constants instead of raw dashboard:* strings.",
        },
      ],
    },
  },
];
