/**
 * Ambient types for the React Flight server that Next ships pre-compiled.
 *
 * `next/dist/compiled/react-server-dom-webpack/*` is a vendored bundle with no `.d.ts`
 * alongside it, so importing it directly is a TS7016 implicit-any error. The CFUI-01
 * regression gate (`field-dialog-boundary.rsc.test.tsx`) imports it on purpose: it is the
 * exact serializer production uses, so a test driving it can never disagree with what the
 * app actually emits across the RSC boundary.
 *
 * Only the surface the gate uses is declared. This is intentionally NOT a full typing of
 * the module - anything else should be added here explicitly rather than widened to `any`.
 *
 * Requires the `react-server` export condition at runtime; see vitest.rsc.config.ts.
 */
declare module 'next/dist/compiled/react-server-dom-webpack/server.edge.js' {
  export function renderToReadableStream(
    model: unknown,
    clientManifest: Record<string, unknown>,
    options?: Record<string, unknown>
  ): ReadableStream<Uint8Array>
}
