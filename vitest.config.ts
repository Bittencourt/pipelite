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
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
