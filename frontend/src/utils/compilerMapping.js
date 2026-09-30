// frontend/src/utils/compilerMapping.js
// Mapping between legacy language keys and compiler IDs for starter code resolution.
// This mirrors the backend LEGACY_TO_COMPILER mapping.

export const LEGACY_TO_COMPILER = {
  c: 'gcc-15',
  cpp: 'g++-15',
  java: 'openjdk-25',
  python: 'python-3.14',
  javascript: 'typescript-deno',
  php: 'php-8.5',
  ruby: 'ruby-4.0',
  haskell: 'haskell-9.12',
  go: 'go-1.26',
  rust: 'rust-1.93',
  csharp: 'dotnet-csharp-9',
  fsharp: 'dotnet-fsharp-9',
  typescript: 'typescript-deno'
};

// Resolve starter code for a problem given a compilerId.
export function resolveStarterCode(problem, compilerId) {
  // Find the legacy language that maps to this compilerId.
  const legacyLang = Object.keys(LEGACY_TO_COMPILER).find(key => LEGACY_TO_COMPILER[key] === compilerId);
  if (!legacyLang) return '';
  return (problem.starterCode && problem.starterCode[legacyLang]) || '';
}
