// backend/src/services/compilerRegistry.js
// Central registry for available compilers fetched from external provider.
// Provides caching and normalization.

const logger = require('../config/logger');

// Environment variables
const PROVIDER_BASE_URL = process.env.ONLINE_COMPILER_URL || 'https://api.onlinecompiler.io';
const CACHE_TTL_MS = parseInt(process.env.COMPILER_CACHE_TTL_MS) || 10 * 60 * 1000; // 10 minutes

let cachedCompilers = null;
let cacheTimestamp = 0;

// Fallback list of compilers when provider is unreachable
const FALLBACK_COMPILERS = [
  { id: 'python-3.14', name: 'Python 3.14', language: 'python', editorLanguage: 'python', extension: 'py' },
  { id: 'gcc-15', name: 'GCC 15', language: 'c', editorLanguage: 'c', extension: 'c' },
  { id: 'g++-15', name: 'G++ 15', language: 'cpp', editorLanguage: 'cpp', extension: 'cpp' },
  { id: 'openjdk-25', name: 'OpenJDK 25', language: 'java', editorLanguage: 'java', extension: 'java' },
  { id: 'dotnet-csharp-9', name: '.NET SDK 9 (C#)', language: 'csharp', editorLanguage: 'csharp', extension: 'cs' },
  { id: 'php-8.5', name: 'PHP 8.5', language: 'php', editorLanguage: 'php', extension: 'php' },
  { id: 'ruby-4.0', name: 'Ruby 4.0', language: 'ruby', editorLanguage: 'ruby', extension: 'rb' },
  { id: 'haskell-9.12', name: 'Haskell GHC 9.12', language: 'haskell', editorLanguage: 'haskell', extension: 'hs' },
  { id: 'go-1.26', name: 'Go 1.26', language: 'go', editorLanguage: 'go', extension: 'go' },
  { id: 'rust-1.93', name: 'Rust 1.93', language: 'rust', editorLanguage: 'rust', extension: 'rs' },
  { id: 'typescript-deno', name: 'TypeScript (Deno)', language: 'typescript', editorLanguage: 'typescript', extension: 'ts' },
  { id: 'nodejs-20', name: 'Node.js 20', language: 'javascript', editorLanguage: 'javascript', extension: 'js' },
];

/**
 * Fetch raw compiler list from provider.
 * @returns {Promise<Array>} Raw compiler objects.
 */
async function fetchFromProvider() {
  const url = `${PROVIDER_BASE_URL.replace(/\/+$/, '')}/api/compilers/`;
  logger.info('Fetching compiler list from provider', { url });
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch compilers: ${response.status} ${text}`);
  }
  const data = await response.json();
  return data; // assume array
}

/**
 * Normalize provider response to a stable shape.
 * Expected output fields: id, name, language, editorLanguage, extension.
 */
function normalize(rawList) {
  // Provider may already include id and name. We'll derive missing fields.
  return rawList.map(item => {
    const id = item.id || item.compiler || '';
    const name = item.name || item.displayName || id;
    const language = item.language || '';
    const editorLanguage = language; // for now same
    const extensionMap = {
      python: 'py',
      c: 'c',
      cpp: 'cpp',
      java: 'java',
      javascript: 'js',
      php: 'php',
      ruby: 'rb',
      haskell: 'hs',
      go: 'go',
      rust: 'rs',
      typescript: 'ts',
      csharp: 'cs',
      fsharp: 'fs'
    };
    const extension = extensionMap[language] || '';
    return {
      id,
      name,
      language,
      editorLanguage,
      extension
    };
  });
}

/**
 * Get the list of compilers, using cache if fresh.
 */
async function getCompilers() {
  const now = Date.now();
  if (cachedCompilers && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedCompilers;
  }
  try {
    const raw = await fetchFromProvider();
    const normalized = normalize(raw);
    cachedCompilers = normalized;
    cacheTimestamp = now;
    logger.info('Compiler list cached', { count: normalized.length });
    return normalized;
  } catch (err) {
    logger.error('Failed to fetch compiler list', { error: err.message });
    // If we have old cache, return it as fallback.
    if (cachedCompilers) {
      logger.warn('Using stale compiler list due to fetch error');
      return cachedCompilers;
    }
    // Use built‑in fallback list when provider is unreachable.
    logger.warn('Using built‑in fallback compiler list');
    cachedCompilers = FALLBACK_COMPILERS;
    cacheTimestamp = now;
    return FALLBACK_COMPILERS;
  }
}

/**
 * Find compiler entry by its id.
 */
async function getCompilerById(id) {
  const list = await getCompilers();
  return list.find(c => c.id === id);
}

/**
 * Map legacy language keys to default compiler id.
 * This mapping is used for starter code resolution.
 */
const LEGACY_TO_COMPILER = {
  c: 'gcc-15',
  cpp: 'g++-15',
  java: 'openjdk-25',
  python: 'python-3.14',
  javascript: 'typescript-deno', // using Deno for JS/TS
  // Add other mappings
  php: 'php-8.5',
  ruby: 'ruby-4.0',
  haskell: 'haskell-9.12',
  go: 'go-1.26',
  rust: 'rust-1.93',
  csharp: 'dotnet-csharp-9',
  fsharp: 'dotnet-fsharp-9',
  typescript: 'typescript-deno'
};

function mapLegacyToCompiler(lang) {
  return LEGACY_TO_COMPILER[lang] || null;
}

module.exports = {
  getCompilers,
  getCompilerById,
  mapLegacyToCompiler,
  LEGACY_TO_COMPILER
};
