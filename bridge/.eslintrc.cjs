module.exports = {
  root: true,
  env: { node: true, es2023: true },
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'script' },
  ignorePatterns: ['node_modules', 'dist'],
  rules: {
    // Смягчённые правила для JS-моста
  },
};
