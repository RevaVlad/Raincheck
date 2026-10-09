import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

const sharedEntryBoundary = {
  regex: '^@shared/(?!api$|lib/dates$|ui/(?:error-state|loading-state)$).+',
  message: 'Shared imports must use a public entry point.',
};

const pageBoundary = [
  {
    regex: '^@app(?:/|$)',
    message: 'Page slices cannot depend on the app layer.',
  },
  {
    regex: '^@pages(?:/|$)',
    message: 'Page slices use relative imports internally and cannot depend on other pages.',
  },
  {
    regex: '^@features/(?!respond-to-poll$).+',
    message: 'Pages can import features only through their public entries.',
  },
  sharedEntryBoundary,
];

const layerBoundaries = {
  app: [
    {
      regex: '^@app(?:/|$)',
      message: 'App internals use relative imports.',
    },
    {
      regex: '^@pages/(?!group$|create-group$).+',
      message: 'App code can import pages only through their public entries.',
    },
    {
      regex: '^@features/(?!respond-to-poll$).+',
      message: 'App code can import features only through their public entries.',
    },
    sharedEntryBoundary,
  ],
  pages: pageBoundary,
  features: [
    {
      regex: '^@app(?:/|$)|^@pages(?:/|$)|^@features(?:/|$)',
      message: 'Features cannot depend on app or page slices and use relative imports internally.',
    },
    sharedEntryBoundary,
  ],
  shared: [
    {
      regex: '^@app(?:/|$)|^@pages(?:/|$)|^@features(?:/|$)|^@shared(?:/|$)',
      message: 'Shared code cannot depend on higher layers or import itself by alias.',
    },
  ],
};

const relativeEscape = (layer, levels) => ({
  regex: String.raw`^(?:\./)?(?:\.\./){${levels}}`,
  message: `Relative imports cannot leave the ${layer} boundary.`,
});

const nonCanonicalRelativeEscape = (layer) => ({
  regex: String.raw`^(?:\./)?(?:\.\./)*[^./][^/]*/(?:[^/]+/)*\.\.(?:/|$)`,
  message: `Relative imports cannot leave the ${layer} boundary.`,
});

const boundaryRules = (layer, levels) => {
  const patterns = [...layerBoundaries[layer]];
  const selectors = patterns.map(({ regex, message }) => ({
    selector: `ImportExpression[source.value=/${regex.replaceAll('/', '\\/')}/]`,
    message,
  }));
  if (levels) {
    const pattern = relativeEscape(layer, levels);
    const nonCanonicalPattern = nonCanonicalRelativeEscape(layer);
    patterns.push(pattern);
    patterns.push(nonCanonicalPattern);
    selectors.push({
      selector: `ImportExpression[source.value=/${pattern.regex.replaceAll('/', '\\/')}/]`,
      message: pattern.message,
    });
    selectors.push({
      selector: `ImportExpression[source.value=/${nonCanonicalPattern.regex.replaceAll('/', '\\/')}/]`,
      message: nonCanonicalPattern.message,
    });
  }

  return {
    'no-restricted-imports': ['error', { patterns }],
    'no-restricted-syntax': ['error', ...selectors],
  };
};

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
      '@stylistic/max-len': [
        'error',
        { code: 100, ignoreUrls: true, ignorePattern: '^\\s*(import|export)\\b' },
      ],
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
    files: ['frontend/src/app/**/*.ts'],
    rules: boundaryRules('app'),
  },
  {
    files: ['frontend/src/app/*.ts'],
    rules: boundaryRules('app', 1),
  },
  {
    files: ['frontend/src/app/*/*.ts'],
    rules: boundaryRules('app', 2),
  },
  {
    files: ['frontend/src/app/*/*/*.ts'],
    rules: boundaryRules('app', 3),
  },
  {
    files: ['frontend/src/pages/**/*.ts'],
    rules: boundaryRules('pages'),
  },
  {
    files: ['frontend/src/pages/*/index.ts'],
    rules: boundaryRules('pages', 1),
  },
  {
    files: ['frontend/src/pages/*/*/*.ts'],
    rules: boundaryRules('pages', 2),
  },
  {
    files: ['frontend/src/pages/*/*/*/*.ts'],
    rules: boundaryRules('pages', 3),
  },
  {
    files: ['frontend/src/features/**/*.ts'],
    rules: boundaryRules('features'),
  },
  {
    files: ['frontend/src/features/*/index.ts'],
    rules: boundaryRules('features', 1),
  },
  {
    files: ['frontend/src/features/*/*/*.ts'],
    rules: boundaryRules('features', 2),
  },
  {
    files: ['frontend/src/features/*/*/*/*.ts'],
    rules: boundaryRules('features', 3),
  },
  {
    files: ['frontend/src/shared/**/*.ts'],
    rules: boundaryRules('shared'),
  },
  {
    files: ['frontend/src/shared/*/*.ts'],
    rules: boundaryRules('shared', 2),
  },
  {
    files: ['frontend/src/shared/*/*/*.ts'],
    rules: boundaryRules('shared', 3),
  },
  {
    files: ['frontend/src/shared/*/*/*/*.ts'],
    rules: boundaryRules('shared', 4),
  },
);
