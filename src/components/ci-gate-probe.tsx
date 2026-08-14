// Throwaway file for plan 32-06's merge-gate verification. Contains one
// deliberate react/no-unescaped-entities error. This branch is never merged.
export function CiGateProbe() {
  return <p>This text has a deliberate unescaped " quote.</p>;
}
