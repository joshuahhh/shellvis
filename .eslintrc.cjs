/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    "react-app"
  ],
  settings: {
    'import/resolver': {
      typescript: true
    }
  },
  ignorePatterns: [
    "dist",
    "lib",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        args: "none",
        ignoreRestSiblings: true,
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }
    ],
  }
}
