import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

// The second vitest project. `npm test` runs it after the base one:
//   "test": "vitest run && vitest run --config vitest.rsc.config.ts"
//
// It exists so `*.rsc.test.tsx` files resolve React under the `react-server` export
// condition. Next's Flight *server* (`react-server-dom-webpack/server.edge.js`) hard
// refuses to load without it:
//   The "react" package in this environment is not configured correctly.
//   The "react-server" condition must be enabled ...
// and that serializer is the whole point - a mocked boundary cannot observe the element
// deferral that broke /admin/fields/deal (CFUI-01).
//
// The condition applies to the WHOLE project, so nothing reachable from a file here may
// import `react-dom/server` - it cannot load under react-server. Those tests belong in
// the base config (see rsc-boundary.test.tsx, deliberately not named *.rsc.test.tsx).
//
// Why a separate config file rather than a `test.projects: [...]` entry in
// vitest.config.ts: measured on vitest 4.0.18, the inline project form does not apply the
// condition to bare `react` - the serializer still throws the refusal above. Adding
// `ssr.resolve.conditions` to the inline project fixed `react/jsx-dev-runtime` but not
// `react` itself. Two config files is the form that actually works.
//
// `ssr.resolve.conditions` (not just `resolve.conditions`) is the load-bearing setting on
// this Vite version: test files are transformed in the SSR environment, so that is where
// `react` and `react/jsx-dev-runtime` get resolved.
export default defineConfig({
  test: {
    name: 'rsc',
    globals: false,
    environment: 'node',
    include: ['src/**/*.rsc.test.?(c|m)[jt]s?(x)'],
    // test.exclude REPLACES the defaults - spread them, never write a bare array.
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    conditions: ['react-server'],
  },
  ssr: {
    resolve: {
      conditions: ['react-server', 'node', 'import', 'module', 'default'],
    },
  },
})
