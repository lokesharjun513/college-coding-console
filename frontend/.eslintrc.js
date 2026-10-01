module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: [
    'react',
    'react-hooks',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // Turn off rules that cause noisy errors in this project
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    // Reduce unused‑var errors to warnings so they don't block CI
    "no-unused-vars": "warn",
  },
};