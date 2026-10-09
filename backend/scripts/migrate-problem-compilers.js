// Repair missing/stale/incorrect compiler mappings on Problem records.
// Resolves ONLY through compilerRegistry — never invents a compiler.
// Dry run by default; pass --apply to actually update records.
// Run: node scripts/migrate-problem-compilers.js [--apply]
require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../src/models/Problem');
const { mapLegacyToCompiler } = require('../src/services/compilerRegistry');
const db = require('../src/config/db');

const APPLY = process.argv.includes('--apply');

async function main() {
  await db.connectDB();

  const problems = await Problem.find({}).lean();
  const updates = [];

  for (const p of problems) {
    const langs = Array.isArray(p.allowedLanguages) ? p.allowedLanguages : [];
    const stored = p.compilers || {};
    const next = {};
    let changed = false;
    let refuseReasons = [];

    for (const lang of langs) {
      const expected = mapLegacyToCompiler(lang);
      if (!expected) {
        refuseReasons.push(`unsupported language: ${lang}`);
        continue;
      }
      next[lang] = expected;
      if (stored[lang] !== expected) changed = true;
    }
    // Drop stale mappings for languages no longer allowed
    for (const lang of Object.keys(stored)) {
      if (!langs.includes(lang)) changed = true;
    }

    if (changed) {
      updates.push({
        id: String(p._id),
        title: p.title,
        status: p.status,
        old: stored,
        new: next,
        refuseReasons,
      });
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY RUN (pass --apply to modify records)',
    affected: updates.length,
    updates,
  }, null, 2));

  if (updates.some(u => u.refuseReasons.length > 0)) {
    console.error('Refusing to apply: some problems have unsupported languages.');
  }

  if (APPLY && updates.length > 0) {
    for (const u of updates) {
      if (u.refuseReasons.length > 0) {
        console.error(`Skipped ${u.id} (${u.title}): ${u.refuseReasons.join('; ')}`);
        continue;
      }
      await Problem.findByIdAndUpdate(u.id, { compilers: u.new });
      console.log(`Updated ${u.id} (${u.title})`);
    }
    console.log('Migration applied.');
  } else if (!APPLY) {
    console.log('Dry run complete. No records modified.');
  }

  await db.disconnectDB();
}

main().catch(async (e) => {
  console.error('Migration failed:', e.message);
  try { await require('../src/config/db').disconnectDB(); } catch {}
  process.exit(1);
});
