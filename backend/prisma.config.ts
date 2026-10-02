import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Only the migrate subcommands need a resolvable URL, so `env()` is reserved for them:
    // `generate` and `validate` must still succeed with no DATABASE_URL and no live database.
    url: process.argv.includes('migrate')
      ? env('DATABASE_URL')
      : (process.env['DATABASE_URL'] ?? ''),
  },
});
