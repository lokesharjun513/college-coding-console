// backend/src/services/compilerRegistry.js
// Dynamic compiler registry sourced from OnlineCompiler provider.

const logger = require('../config/logger');

const PROVIDER_BASE_URL = process.env.ONLINE_COMPILER_URL || 'https://api.onlinecompiler.io';
const CACHE_TTL_MS = parseInt(process.env.COMPILER_CACHE_TTL_MS) || 10 * 60 * 1000; // 10 minutes

let cachedCompilers = null;
let cacheTimestamp = 0;
let cacheError = null;

/**
 * Language to compiler display name mapping.
 * Provider returns only id and name; we derive language and display name.
 */
const LANGUAGE_NAMES = {
  python: 'Python',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  csharp: 'C#',
  fsharp: 'F#',
  php: 'PHP',
  ruby: 'Ruby',
  haskell: 'Haskell',
  go: 'Go',
  rust: 'Rust',
  typescript: 'TypeScript',
};

const VERSION_PATTERN = /(\d+(?:\.\d+)*)$/;
const LANGUAGE_PATTERN = /^(python|c|cpp|java|csharp|fsharp|php|ruby|haskell|go|rust|typescript)/i;

function normalizeCompilerResponse(rawResponse) {
  // Provider returns: { compilers: [{ id: "...", name: "..." }] }
  const array = Array.isArray(rawResponse) ? rawResponse : (rawResponse?.compilers || []);

  return array.map(item => {
    const id = item.id || item.compiler || '';
    const name = item.name || item.displayName || id;

    // Extract language from compiler id
    const langMatch = id.match(LANGUAGE_PATTERN);
    const language = langMatch ? langMatch[1].toLowerCase() : 'unknown';

    // Extract version from name or id
    const versionMatch = name.match(VERSION_PATTERN) || id.match(VERSION_PATTERN);
    const version = versionMatch ? versionMatch[1] : '';

    // Build display name
    const langName = LANGUAGE_NAMES[language] || language;
    const displayName = version ? `${langName} ${version}` : langName;

    return {
      id,
      name,
      displayName,
      language,
      version,
      // Compiler names follow pattern: language-version
      compiler: id,
    };
  });
}

async function fetchFromProvider() {
  const url = `${PROVIDER_BASE_URL.replace(/\/+$/, '')}/api/compilers/`;
  logger.info('Fetching compiler list from provider', { url });

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch compilers: ${response.status} ${text}`);
  }

  const data = await response.json();
  return normalizeCompilerResponse(data);
}

async function getCompilers({ skipCache = false } = {}) {
  const now = Date.now();
  if (!skipCache && cachedCompilers && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedCompilers;
  }

  try {
    const compilers = await fetchFromProvider();
    cachedCompilers = compilers;
    cacheTimestamp = now;
    cacheError = null;
    logger.info('Compiler list cached', { count: compilers.length });
    return compilers;
  } catch (err) {
    logger.error('Failed to fetch compiler list', { error: err.message });

    if (cachedCompilers) {
      logger.warn('Using cached compiler list due to fetch error');
      cacheError = err;
      return cachedCompilers;
    }

    throw new Error('COMPILER_REGISTRY_UNAVAILABLE');
  }
}

async function getCompilerById(id) {
  const list = await getCompilers();
  return list.find(c => c.id === id);
}

function isSupportedCompiler(id) {
  return cachedCompilers?.some(c => c.id === id) === true;
}

function getLanguageByCompiler(id) {
  return cachedCompilers?.find(c => c.id === id)?.language || null;
}

const LEGACY_TO_COMPILER = {
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
  typescript: 'typescript-deno',
};

function mapLegacyToCompiler(lang) {
  return LEGACY_TO_COMPILER[lang] || null;
}

module.exports = {
  getCompilers,
  getCompilerById,
  isSupportedCompiler,
  getLanguageByCompiler,
  mapLegacyToCompiler,
  normalizeCompilerResponse,
  LEGACY_TO_COMPILER,
};
