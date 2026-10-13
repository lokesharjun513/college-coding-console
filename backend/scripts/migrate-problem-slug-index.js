// Drop the legacy globally-unique `slug_1` index on the problems collection.
//
// Problem.slug is unique per batch (schema index { slug: 1, batch: 1 } and the
// route-level duplicate pre-checks are both batch scoped). Older schema versions
// declared { slug: 1 } as globally unique and Mongoose never removed that index,
// so the database kept rejecting two problems that share a title in *different*
// batches with E11000 -> HTTP 409 "Problem with this slug already exists".
//
// Only the stale index is dropped; the intended { slug: 1, batch: 1 } unique
// index is kept, so slug uniqueness inside a batch stays enforced.
// Dry run by default; pass --apply to actually drop the index.
// Run: node scripts/migrate-problem-slug-index.js [--apply]
//      NODE_ENV=test node scripts/migrate-problem-slug-index.js --apply  (test DB)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env') });
const mongoose = require('mongoose');
const Problem = require('../src/models/Problem');
const db = require('../src/config/db');

const APPLY = process.argv.includes('--apply');

const LEGACY = 'slug_1';
const KEEP = 'slug_1_batch_1';

function findIndex(indexes, name) {
  return indexes.find(i => i.name === name);
}

function isGlobalSlugUnique(index) {
  return index && index.unique === true && Object.keys(index.key).length === 1 && index.key.slug === 1;
}

function isBatchSlugUnique(index) {
  return index && index.unique === true && Object.keys(index.key).length === 2 &&
    index.key.slug === 1 && index.key.batch === 1;
}

async function main() {
  await db.connectDB();

  const indexes = await Problem.collection.indexes();
  const legacy = findIndex(indexes, LEGACY);
  const kept = findIndex(indexes, KEEP);

  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY RUN (pass --apply to drop the index)',
    database: mongoose.connection.name,
    indexes: indexes.map(i => ({ name: i.name, key: i.key, unique: i.unique === true })),
    legacyGlobalSlugIndex: legacy ? isGlobalSlugUnique(legacy) : false,
    batchScopedSlugIndexPresent: kept ? isBatchSlugUnique(kept) : false,
  }, null, 2));

  if (!legacy) {
    console.log('Nothing to do: legacy global slug index is already absent.');
    await db.disconnectDB();
    return;
  }

  if (!isGlobalSlugUnique(legacy)) {
    console.error(`Refusing to apply: index "${LEGACY}" is not the expected globally-unique slug index.`);
    await db.disconnectDB();
    process.exitCode = 1;
    return;
  }

  if (!kept) {
    console.error(`Refusing to apply: expected unique index "${KEEP}" is missing, so slug uniqueness would be lost.`);
    await db.disconnectDB();
    process.exitCode = 1;
    return;
  }

  if (APPLY) {
    await Problem.collection.dropIndex(LEGACY);
    console.log(`Dropped legacy index "${LEGACY}" from "${mongoose.connection.name}".problems.`);
  } else {
    console.log('Dry run complete. No indexes modified.');
  }

  await db.disconnectDB();
}

main().catch(async (e) => {
  console.error('Migration failed:', e.message);
  try { await require('../src/config/db').disconnectDB(); } catch {}
  process.exit(1);
});