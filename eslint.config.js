import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'dist/**',
      'build/**',
      'ios/**',
      'android/**',
      'node_modules/**',
      'screenshot-generator/**',
      'generated_imgs/**',
      '.asset-archive/**',
      '.splash-backup-*/**',
      '.vercel/**',
      '.playwright-mcp/**',
      '.claude/**',
      '.codex/**',
      '.agents/**',
      'docs/**',
      'scripts/**',
      'public/**',
      'design_handoff_onboarding_redesign/**',
    ],
  },
  {
    files: ['src/**/*.{js,jsx}', 'api/**/*.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        __APP_VERSION__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/**/*.jsx'],
    rules: {
      // Core no-unused-vars does not count JSX tag usage without eslint-plugin-react.
      'no-unused-vars': 'off',
    },
  },
];
