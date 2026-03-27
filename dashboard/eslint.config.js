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
];
