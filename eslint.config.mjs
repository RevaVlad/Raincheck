import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      'backend/src/generated/prisma/**',
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
  },
  {
    files: ['backend/tests/**/*.ts', 'frontend/src/**/*.spec.ts', 'frontend/src/**/*.test.ts'],
    rules: {
      'max-lines-per-function': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      complexity: ['error', { max: 16, variant: 'modified' }],
    },
  },
  {
    files: ['frontend/src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../features/**', '../../../features/**', '../../../../features/**'],
              message: 'Core code cannot depend on feature code.',
            },
            {
              group: ['../../shared/**', '../../../shared/**', '../../../../shared/**'],
              message: 'Core code cannot depend on shared presentation code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['frontend/src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../features/**',
                '../../features/**',
                '../../../features/**',
                '../../../../features/**',
              ],
              message: 'Shared code cannot depend on feature code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'frontend/src/app/features/group/**/*.ts',
      'frontend/src/app/features/group-entry/**/*.ts',
      'frontend/src/app/features/workspace/**/*.ts',
      'frontend/src/app/features/results/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../create-group/**',
                '../../create-group/**',
                '../../../create-group/**',
                '../../../../create-group/**',
                '../../../../../create-group/**',
              ],
              message: 'Group-flow features cannot depend on group creation.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['frontend/src/app/features/create-group/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../group/**',
                '../group-entry/**',
                '../workspace/**',
                '../results/**',
                '../../group/**',
                '../../group-entry/**',
                '../../workspace/**',
                '../../results/**',
              ],
              message: 'Group creation cannot depend on the group flow.',
            },
          ],
        },
      ],
    },
  },
);
