// ESLint configuration, loaded by npm run lint.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'output/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map(config => ({ ...config, files: ['**/*.ts'] })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      // Read real TypeScript project types so lint catches unsafe values and
      // unhandled promises, rather than checking syntax/style alone.
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'eqeqeq': 'error'
    }
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      // A unit regression should arrange component state, not boot the application.
      'no-restricted-imports': ['error', { patterns: [{
        group: ['**/game', '**/game.ts', '**/tests/integration/**', '@playwright/*', 'playwright', 'playwright/*'],
        message: 'Unit-test the responsible controller directly. Application/browser wiring belongs in its separate test suite.'
      }] }]
    }
  },
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } }
];
