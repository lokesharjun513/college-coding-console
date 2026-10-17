// READ-ONLY audit of ProblemTopic associations.
//
//   node scripts/audit-problemtopic.js
//
// This script NEVER writes. It only uses find/aggregate/count/distinct and
// disconnects when finished. It exists to inventory association inconsistencies
// that predate the trainer collection-authorization fix, so a cleanup can be
// planned before anything is changed.
//
// It prints record ids and counts only. No credentials and no student data are
// read or emitted; the User collection is touched solely to resolve role.
require('dotenv').config({ path: '.env', quiet: true });
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const mongoose = require('mongoose');
const ProblemTopic = require('../src/models/ProblemTopic');
const Problem = require('../src/models/Problem');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const User = require('../src/models/User');

const roleOf = new Map(); // userId -> role

const line = (s = '') => console.log(s);
const head = (n, s) => {
  line();
  line('='.repeat(72));
  line(`${n}. ${s}`);
  line('='.repeat(72));
};
const short = (id) => (id ? String(id) : '(null)');
const show = (rows, label, keyFn = (r) => r._id) => {
  if (!rows.length) {
    line(`  none — ${label}`);
    return;
  }
  line(`  ${rows.length} — ${label}`);
  for (const r of rows.slice(0, 40)) line(`    ${keyFn(r)}`);
  if (rows.length > 40) line(`    ... and ${rows.length - 40} more`);
};

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI not set');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  line(`Connected (read-only audit). DB = ${mongoose.connection.name}`);

  const [linkCount, problemCount, collectionCount, topicCount] = await Promise.all([
    ProblemTopic.countDocuments({}),
    Problem.countDocuments({}),
    Collection.countDocuments({}),
    Topic.countDocuments({}),
  ]);
  line(`ProblemTopic=${linkCount}  Problem=${problemCount}  Collection=${collectionCount}  Topic=${topicCount}`);

  // Roles, so "admin-owned" can be judged by the creator's role, not by guessing.
  const users = await User.find({}, { _id: 1, role: 1 }).lean();
  users.forEach((u) => roleOf.set(String(u._id), u.role));

  const links = await ProblemTopic.find({}).lean();
  const problems = await Problem.find({}).lean();
  const collections = new Map((await Collection.find({}).lean()).map((c) => [String(c._id), c]));
  const topics = new Map((await Topic.find({}).lean()).map((t) => [String(t._id), t]));

  const ownerRole = (collectionId) => roleOf.get(String(collections.get(String(collectionId))?.createdBy)) || 'UNKNOWN';
  const ownerId = (collectionId) => String(collections.get(String(collectionId))?.createdBy || '');
  const problemOf = (id) => problems.find((p) => String(p._id) === String(id));

  /* ---------------------------------------------------------------- 1 & 2 */
  head(1, 'Trainer-owned problems linked to a collection the trainer does not own');
  const find1 = links.filter((l) => {
    const p = problemOf(l.problem);
    if (!p || p.scope !== 'BATCH') return false; // GLOBAL problems have no owning trainer
    const role = ownerRole(l.collection);
    return role !== 'TRAINER';
  });
  const byAdmin = find1.filter((l) => ownerRole(l.collection) === 'ADMIN');
  const byUnknown = find1.filter((l) => !['TRAINER', 'ADMIN'].includes(ownerRole(l.collection)));
  show(byAdmin, 'collection owned by an ADMIN', (l) => `link=${l._id} problem=${l.problem} collection=${l.collection} topic=${l.topic}`);
  show(byUnknown, 'collection owner role unknown', (l) => `link=${l._id} problem=${l.problem} collection=${l.collection}`);
  if (!find1.length) line('  none — no BATCH problem points at a non-trainer collection');

  head(2, 'BATCH problems linked to a collection owned by a DIFFERENT trainer');
  const find2 = links.filter((l) => {
    const p = problemOf(l.problem);
    if (!p || p.scope !== 'BATCH') return false;
    const role = ownerRole(l.collection);
    if (role !== 'TRAINER') return false;
    return ownerId(l.collection) !== String(p.createdBy || '');
  });
  show(find2, 'cross-trainer link', (l) => {
    const p = problemOf(l.problem);
    return `link=${l._id} problem=${l.problem} (owner ${short(p?.createdBy)}) -> collection=${l.collection} (owner ${ownerId(l.collection)})`;
  });
  if (!find2.length) line('  none — every BATCH problem sits in a collection it owns');

  /* ------------------------------------------------------------------- 3 */
  head(3, 'Batch mismatch between problem and collection');
  const colHasBatch = collections.size
    ? Object.keys(collections.values().next().value || {}).includes('batch')
    : false;
  line(`  Collection model exposes a batch field: ${colHasBatch}`);
  line('  Collections have no batch reference, so there is no collection-batch to compare.');
  line('  Collection membership is owner-based (createdBy), not batch-based — see report.');

  /* ------------------------------------------------------------------- 4 */
  head(4, 'GLOBAL problems linked to curriculum topics');
  const find4 = links.filter((l) => {
    const p = problemOf(l.problem);
    return p && p.scope === 'GLOBAL';
  });
  show(find4, 'GLOBAL problem in a Collection/Topic', (l) => `link=${l._id} problem=${l.problem} collection=${l.collection} topic=${l.topic}`);
  if (!find4.length) line('  none');

  if (find4.length) {
    line();
    line('  Collections holding GLOBAL problems (owner vs. problem creators):');
    const byCollection = new Map();
    for (const l of find4) {
      const k = String(l.collection);
      if (!byCollection.has(k)) byCollection.set(k, []);
      byCollection.get(k).push(l);
    }
    for (const [cid, ls] of byCollection) {
      const cOwner = ownerId(cid);
      const cRole = ownerRole(cid);
      const topicIds = [...new Set(ls.map((l) => String(l.topic)))];
      const creators = new Map();
      for (const l of ls) {
        const p = problemOf(l.problem);
        const by = String(p?.createdBy || '(none)');
        creators.set(by, (creators.get(by) || 0) + 1);
      }
      line(`    collection=${cid}`);
      line(`      collection owner = ${cOwner} (role=${cRole})`);
      line(`      topics = ${topicIds.join(', ')}`);
      line(`      links = ${ls.length}`);
      for (const [by, n] of creators) {
        line(`      problem creator = ${by} (role=${roleOf.get(by) || 'UNKNOWN'}) -> ${n} link(s)`);
      }
      // Flag when the curriculum owner and the problem creators differ.
      for (const [by] of creators) {
        if (by !== '(none)' && by !== cOwner) {
          line(`      CROSS-OWNER: problems by ${by} sit inside a collection owned by ${cOwner}`);
        }
      }
    }
  }

  line();
  line('  Scope breakdown of all links:');
  const scopeCounts = {};
  for (const l of links) {
    const p = problemOf(l.problem);
    const k = p ? p.scope : 'PROBLEM_MISSING';
    scopeCounts[k] = (scopeCounts[k] || 0) + 1;
  }
  Object.entries(scopeCounts).forEach(([k, v]) => line(`    ${k}: ${v}`));

  const batchNoBatch = links.filter((l) => {
    const p = problemOf(l.problem);
    return p && p.scope === 'BATCH' && !p.batch;
  });
  show(batchNoBatch, 'BATCH problem with no batch set', (l) => `link=${l._id} problem=${l.problem}`);

  /* ------------------------------------------------------------------- 5 */
  head(5, 'Orphaned links / broken references');
  const missingProblem = links.filter((l) => !problemOf(l.problem));
  const missingCollection = links.filter((l) => !collections.has(String(l.collection)));
  const missingTopic = links.filter((l) => !topics.has(String(l.topic)));
  show(missingProblem, 'link points at a non-existent Problem', (l) => `link=${l._id} problem=${l.problem}`);
  show(missingCollection, 'link points at a non-existent Collection', (l) => `link=${l._id} collection=${l.collection}`);
  show(missingTopic, 'link points at a non-existent Topic', (l) => `link=${l._id} topic=${l.topic}`);

  const mismatch = links.filter((l) => {
    const t = topics.get(String(l.topic));
    return t && String(t.collection) !== String(l.collection);
  });
  show(mismatch, 'link.collection disagrees with topic.collection', (l) => {
    const t = topics.get(String(l.topic));
    return `link=${l._id} collection=${l.collection} but topic=${l.topic}.collection=${t?.collection}`;
  });

  const noLinkOwner = links.filter((l) => !l.createdBy);
  show(noLinkOwner, 'link has no createdBy', (l) => `link=${l._id} problem=${l.problem}`);

  const crossActor = links.filter((l) => {
    const p = problemOf(l.problem);
    const colOwner = ownerId(l.collection);
    return l.createdBy && p && String(l.createdBy) !== String(p.createdBy || '') && colOwner !== String(l.createdBy);
  });
  show(crossActor, 'link created by someone other than the problem owner and collection owner', (l) => {
    const p = problemOf(l.problem);
    return `link=${l._id} link.by=${l.createdBy} problem.by=${p?.createdBy} collection.by=${ownerId(l.collection)}`;
  });

  /* ------------------------------------------------------------------- 6 */
  head(6, 'Unlinked curriculum (informational)');
  const orphanTopics = [...topics.values()].filter((t) => !links.some((l) => String(l.topic) === String(t._id)));
  show(orphanTopics, 'Topic with no linked problems', (t) => `topic=${t._id} collection=${t.collection}`);
  const orphanCollections = [...collections.values()].filter((c) => !links.some((l) => String(l.collection) === String(c._id)));
  show(orphanCollections, 'Collection with no linked problems', (c) => {
    const role = roleOf.get(String(c.createdBy)) || 'UNKNOWN';
    return `collection=${c._id} owner=${c.createdBy} (role=${role}) status=${c.status}`;
  });

  const dupes = links.length - new Set(links.map((l) => `${l.problem}|${l.topic}`)).size;
  line(`  duplicate (problem,topic) pairs: ${dupes}`);

  await mongoose.disconnect();
  line();
  line('Disconnected. No records were modified.');
}

main().catch(async (e) => {
  console.error('Audit failed:', e.message);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});