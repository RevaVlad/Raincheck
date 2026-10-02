/** @type {import('prettier').Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  endOfLine: 'lf',
  plugins: ['prettier-plugin-sql'],
  overrides: [
    {
      files: '*.html',
      options: {
        parser: 'angular',
      },
    },
    {
      files: '*.sql',
      options: {
        language: 'postgresql',
      },
    },
  ],
};
