import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config({
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.angular/**',
    '.worktrees/**',
    'output/**',
  ],
  files: ['backend/{src,tests}/**/*.ts', 'frontend/src/**/*.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: [
        './backend/tsconfig.test.json',
        './frontend/tsconfig.app.json',
        './frontend/tsconfig.spec.json',
      ],
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@stylistic': stylistic,
    '@typescript-eslint': tseslint.plugin,
  },
  rules: {
    '@stylistic/max-len': ['error', { code: 100, ignoreUrls: true }],
    'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
    'max-depth': ['error', 2],
    complexity: ['error', { max: 6, variant: 'modified' }],
    'no-nested-ternary': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
  },
});
