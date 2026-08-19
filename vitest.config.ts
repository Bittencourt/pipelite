import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Anchored at src/ so build output under .next/ can never match.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    // test.exclude REPLACES the defaults - spread them, never write a bare array,
    // or vitest walks node_modules and executes vendored test files.
    //
    // *.rsc.test.* is excluded here because the include above matches it: those files
    // need React resolved under the `react-server` export condition and run in a
    // SECOND vitest project (vitest.rsc.config.ts, wired into the `test` script).
    // Without this exclusion they would run in both projects and fail in this one.
    //
    // *.db.test.* is excluded for the same mechanical reason and a different substantive
    // one: those files talk to a REAL PostgreSQL rather than a mock, the include above
    // matches them, and CI has neither Docker nor a database. They run in a THIRD vitest
    // project (vitest.db.config.ts) which `npm test` deliberately does NOT invoke — see
    // that file's header, and src/lib/mutations/__tests__/db-test-isolation.test.ts,
    // which asserts all three halves of that separation from inside CI.
    exclude: [
      ...configDefaults.exclude,
      '**/.next/**',
      '**/*.rsc.test.?(c|m)[jt]s?(x)',
      '**/*.db.test.?(c|m)[jt]s?(x)',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
