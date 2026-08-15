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
    exclude: [
      ...configDefaults.exclude,
      '**/.next/**',
      '**/*.rsc.test.?(c|m)[jt]s?(x)',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
