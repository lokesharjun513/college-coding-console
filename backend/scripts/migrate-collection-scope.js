// Collection scope/batch migration — SAFE / DRY-RUN BY DEFAULT.
//
//   node scripts/migrate-collection-scope.js            # dry run, changes nothing
//   node scripts/migrate-collection-scope.js --apply     # writes (see rules below)
//
// Collection gained `scope` ('GLOBAL' | 'BATCH') and `batch`.
//
// Rules this script will NOT break:
//
//   1. Nothing is ever deleted.
//   2. A collection whose creator is an ADMIN becomes scope: 'GLOBAL', batch:
//      null. This is a backfill of the field's default and is reversible.
//   3. A collection whose creator is a TRAINER is NOT converted automatically.
//      We cannot know which batch it was meant for — the model never recorded
//      one — and guessing would silently attach curriculum to the wrong batch.
//      Those are reported for a human to decide, then applied with
//      --batch-owner=<userId>.
//
// Read the dry-run report before using --apply.
'use strict';

require('dotenv').config({ path: '.env', quiet: true });

const mongoose = require('mongoose');
const Collection = require('../src/models/Collection');
const User = require('../src/models/User');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const batchOwnerArg = (args.find((a) => a.startsWith('--batch-owner=')) || '').split('=')[1];

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI not set');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`DB: ${mongoose.connection.name}   mode: ${apply ? 'APPLY' : 'DRY RUN (no writes)'}`);

  const users = await User.find({}, { _id: 1, role: 1 }).lean();
  const roleById = new Map(users.map((u) => [String(u._id), u.role]));

  // Read the RAW documents, not through the model: Mongoose applies schema
  // defaults on read, so `Collection.find().lean()` would report every
  // un-migrated document as scope:'GLOBAL' and this script would wrongly
  // conclude there was nothing to backfill.
  const raw = mongoose.connection.db.collection('collections');
  const collections = await raw.find({}).toArray();
  console.log(`collections: ${collections.length}\n`);

  const toGlobal = [];
  const needsDecision = [];
  const alreadyScoped = [];

  for (const c of collections) {
    const role = roleById.get(String(c.createdBy)) || 'UNKNOWN';
    if (c.scope === 'BATCH' && !c.batch) needsDecision.push({ c, role, why: 'BATCH without batch' });
    else if (c.scope) alreadyScoped.push({ c, role });
    else if (role === 'ADMIN') toGlobal.push({ c, role });
    else if (role === 'TRAINER') needsDecision.push({ c, role, why: 'trainer-owned, batch unknown' });
    else needsDecision.push({ c, role, why: `unknown creator role (${role})` });
  }

  console.log('--- ALREADY SCOPED (no action) ---');
  alreadyScoped.forEach(({ c, role }) =>
    console.log(`  ${c._id}  scope=${c.scope}  batch=${c.batch || '-'}  ownerRole=${role}  "${c.name}"`));

  console.log('\n--- BACKFILL TO GLOBAL (admin-owned; reversible) ---');
  if (!toGlobal.length) console.log('  none');
  toGlobal.forEach(({ c, role }) => console.log(`  ${c._id}  -> scope=GLOBAL batch=null  "${c.name}"`));

  console.log('\n--- NEEDS A HUMAN DECISION (never auto-converted) ---');
  if (!needsDecision.length) console.log('  none');
  needsDecision.forEach(({ c, role, why }) =>
    console.log(`  ${c._id}  role=${role}  ${why}  "${c.name}"`));

  if (!apply) {
    console.log('\nDry run complete. Nothing was written.');
    console.log('To apply the GLOBAL backfill only:  node scripts/migrate-collection-scope.js --apply');
    if (needsDecision.length) {
      console.log(`\n${needsDecision.length} collection(s) still need a batch decision.`);
      console.log('Once you have chosen the owning trainer, run:');
      console.log('  node scripts/migrate-collection-scope.js --apply --batch-owner=<trainerUserId>');
      console.log('That marks those BATCH and points them at that trainer\'s batch.');
    }
    await mongoose.disconnect();
    return;
  }

  if (toGlobal.length) {
    const ids = toGlobal.map(({ c }) => c._id);
    const res = await Collection.updateMany(
      { _id: { $in: ids } },
      { $set: { scope: 'GLOBAL', batch: null } },
      { new: true }
    );
    console.log(`\nAPPLIED: ${res.modifiedCount} admin collection(s) backfilled to GLOBAL.`);
  }

  if (batchOwnerArg) {
    const pending = needsDecision.filter((x) => x.role === 'TRAINER');
    if (!pending.length) {
      console.log('No trainer-owned collections pending conversion.');
    } else {
      const Batch = require('../src/models/Batch');
      const batch = await Batch.findOne({ trainer: batchOwnerArg });
      if (!batch) {
        console.log(`Refusing: no batch found for trainer ${batchOwnerArg}. Nothing converted.`);
      } else {
        const ids = pending.map(({ c }) => c._id);
        const res = await Collection.updateMany(
          { _id: { $in: ids } },
          { $set: { scope: 'BATCH', batch: batch._id } },
          { new: true }
        );
        console.log(`APPLIED: ${res.modifiedCount} trainer collection(s) -> BATCH, batch=${batch._id}`);
      }
    }
  } else if (needsDecision.length) {
    console.log(`${needsDecision.length} collection(s) left untouched: no --batch-owner given.`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(async (e) => {
  console.error('Migration failed:', e.message);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});