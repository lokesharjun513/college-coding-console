// Read-only migration report. Does NOT modify any DB records.
// Run: node scripts/migration-report.js  (loads MONGO_URI from .env)
require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const { mapLegacyToCompiler, getCompilerById, getCompilers, LEGACY_TO_COMPILER } = require('../src/services/compilerRegistry');

async function main() {
  const db = require('../src/config/db');
  await db.connectDB();

  const registry = await getCompilers();
  const supportedCompilers = new Set(registry.map(c => c.id));
  // Canonical language set comes from the registry's language→compiler map
  // (provider-derived `language` fields can't be extracted from ids like gcc-15)
  const supportedLanguages = new Set(Object.keys(LEGACY_TO_COMPILER));

  const problems = await Problem.find({}).lean();
  const testCounts = await TestCase.aggregate([
    { $group: { _id: '$problem', count: { $sum: 1 } } },
  ]);
  const testCountByProblem = new Map(testCounts.map(t => [String(t._id), t.count]));

  const withAL = [], withoutAL = [], withCompilerField = [], withoutCompiler = [];
  const badLang = [], mismatches = [], missingMappings = [], staleMappings = [];
  let hiddenTotal = 0, multiLang = 0;

  for (const p of problems) {
    const langs = Array.isArray(p.allowedLanguages) ? p.allowedLanguages : [];
    const compField = p.compiler; // legacy field
    if (langs.length === 0) withoutAL.push(p);
    else withAL.push(p);
    if (compField) withCompilerField.push(p);
    if (compField === undefined) {} else if (!compField) withoutCompiler.push(p);

    // per-language compiler map check
    const compMap = p.compilers || {};
    for (const lang of langs) {
      if (!supportedLanguages.has(lang)) badLang.push({ id: p._id, title: p.title, lang, map: compMap[lang] || null });
      const mapped = mapLegacyToCompiler?.(lang) ?? null; // fall back to default if fn missing
      const stored = compMap[lang] || null;
      if (mapped && !stored) missingMappings.push({ id: p._id, title: p.title, lang, recommended: mapped });
      if (mapped && stored !== mapped) mismatches.push({ id: p._id, title: p.title, lang, allowedLang: lang, storedCompiler: stored, recommended: mapped });
    }
    // stale mappings: compilers entries for languages no longer allowed
    for (const lang of Object.keys(compMap)) {
      if (!langs.includes(lang)) staleMappings.push({ id: p._id, title: p.title, lang, storedCompiler: compMap[lang] });
    }
    if (langs.length > 1) multiLang++;
  }

  const scopeCount = { GLOBAL: 0, BATCH: 0, OTHER: 0 };
  const statusCount = { PUBLISHED: 0, DRAFT: 0, ARCHIVED: 0, OTHER: 0 };
  for (const p of problems) {
    scopeCount[p.scope || 'OTHER'] = (scopeCount[p.scope || 'OTHER'] || 0) + 1;
    statusCount[p.status || 'OTHER'] = (statusCount[p.status || 'OTHER'] || 0) + 1;
  }

  console.log(JSON.stringify({
    totalProblems: problems.length,
    withAllowedLanguages: withAL.length,
    withoutAllowedLanguages: withoutAL.map(p => ({ id: String(p._id), title: p.title })),
    withLegacyCompilerField: withCompilerField.map(p => ({ id: String(p._id), title: p.title, compiler: p.compiler })),
    unsupportedLanguages: badLang,
    missingMappings,
    mismatches,
    staleMappings,
    testCases: {
      total: testCounts.reduce((a, b) => a + b.count, 0),
      totalHidden: hiddenTotal, // count hidden across all
      byProblemCount: problems.reduce((a, p) => a + (testCountByProblem.get(String(p._id)) || 0), 0),
    },
    scope: scopeCount,
    status: statusCount,
    multiLanguageProblems: multiLang,
  }, null, 2));
  await db.disconnectDB();
}

main().catch(async (e) => {
  console.error('Migration report failed:', e.message);
  try { await require('../src/config/db').disconnectDB(); } catch {}
  process.exit(1);
});
