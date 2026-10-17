// Trainer access to Training (Collection) / Day (Topic) endpoints.
//
// Collection ownership is enforced in the database query and on the
// per-collection reads: a trainer sees only what they created. These tests pin
// that, and keep the admin boundary (trainers are still 403 on /admin/*) and
// the exact-role checks intact.
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const authService = require('../src/auth/authService');

async function createTestUser({ name, email, password, role }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

// Trainer curriculum is BATCH scope and must name one of that trainer's batches.
async function createBatchForTrainer(adminToken, trainerId, suffix) {
  const res = await request(app)
    .post('/api/admin/batches')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Batch ${suffix}`, code: `B${suffix}`, trainer: trainerId });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

describe('Trainer access to Training (Collection) endpoints', () => {
  let trainerToken, adminToken, otherTrainerToken, ownBatchId;

  // An admin-owned ("global") training and a second trainer's private one:
  // neither may appear in, or be reachable through, the first trainer's reads.
  let adminCollectionId;
  let otherTrainerCollectionId;
  // The first trainer's own training, which must keep working exactly as before.
  let ownCollectionId;

  beforeAll(async () => {
    await User.deleteMany({});
    await Collection.deleteMany({});
    await Topic.deleteMany({});
    const stamp = Date.now();

    const trainer = await createTestUser({ name: 'T', email: `t${stamp}@x.com`, password: 'Password123!', role: 'TRAINER' });
    trainerToken = await loginAndGetToken(trainer.email, 'Password123!');

    const admin = await createTestUser({ name: 'A', email: `a${stamp}@x.com`, password: 'Password123!', role: 'ADMIN' });
    adminToken = await loginAndGetToken(admin.email, 'Password123!');

    const other = await createTestUser({ name: 'O', email: `o${stamp}@x.com`, password: 'Password123!', role: 'TRAINER' });
    otherTrainerToken = await loginAndGetToken(other.email, 'Password123!');

    // Global curriculum owned by the admin.
    const adminCol = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CT', slug: `ct${stamp}` });
    adminCollectionId = adminCol.body.data._id;
    await Topic.create({ name: 'Day 1', slug: `day1${stamp}`, collection: adminCollectionId, order: 1, createdBy: admin._id });

// Another trainer's private training.
    const otherBatch = await createBatchForTrainer(adminToken, other._id, `o${stamp}`);
    const otherCol = await request(app)
      .post('/api/trainer/collections')
      .set('Authorization', `Bearer ${otherTrainerToken}`)
      .send({ name: 'Other Private', description: 'not yours', batchId: otherBatch });
    otherTrainerCollectionId = otherCol.body.data._id;
    await Topic.create({ name: 'Other Day', slug: `otherday${stamp}`, collection: otherTrainerCollectionId, order: 1, createdBy: other._id });

    // The first trainer's own training.
    ownBatchId = await createBatchForTrainer(adminToken, trainer._id, `t${stamp}`);
    const ownCol = await request(app)
      .post('/api/trainer/collections')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ name: 'Mine', description: 'mine', batchId: ownBatchId });
    ownCollectionId = ownCol.body.data._id;
    await Topic.create({ name: 'My Day', slug: `myday${stamp}`, collection: ownCollectionId, order: 1, createdBy: trainer._id });
  });

  const listAsTrainer = () =>
    request(app).get('/api/trainer/collections').set('Authorization', `Bearer ${trainerToken}`);

  // ------------------------------------------------------- own collections

  test('TRAINER can GET /api/trainer/collections', async () => {
    const res = await listAsTrainer();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('a trainer retrieves the collections they own', async () => {
    const res = await listAsTrainer();
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.id)).toContain(ownCollectionId);
    expect(res.body.data.find((c) => c.id === ownCollectionId)).toEqual(
      expect.objectContaining({ name: 'Mine', description: 'mine', status: 'ACTIVE', owned: true })
    );
  });

  test('trainer collection response exposes expected read-safe fields', async () => {
    const res = await listAsTrainer();
    const item = res.body.data.find((c) => c.id === ownCollectionId);
    expect(item).toBeDefined();
    expect(item).toEqual(expect.objectContaining({
      name: 'Mine', topicCount: expect.any(Number), problemCount: expect.any(Number), status: 'ACTIVE',
    }));
    // The ownership field itself is never disclosed.
    expect(item.createdBy).toBeUndefined();
  });

  test('global Admin collections are excluded from the trainer list', async () => {
    const res = await listAsTrainer();
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c) => c.id);
    expect(ids).not.toContain(adminCollectionId);
    expect(res.body.data.some((c) => c.name === 'CT')).toBe(false);
    // With ownership enforced in the query, every returned row is the trainer's.
    expect(res.body.data.every((c) => c.owned === true)).toBe(true);
  });

  test("another trainer's private collections are excluded from the trainer list", async () => {
    const res = await listAsTrainer();
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.id)).not.toContain(otherTrainerCollectionId);
    expect(res.body.data.some((c) => c.name === 'Other Private')).toBe(false);
  });

  test('list scoping still applies to the search and status filters', async () => {
    const found = await request(app)
      .get('/api/trainer/collections')
      .query({ search: 'Mine' })
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(found.status).toBe(200);
    expect(found.body.data.every((c) => /Mine/i.test(c.name))).toBe(true);

    // A search that only matches the admin's training must not reveal it.
    const leaked = await request(app)
      .get('/api/trainer/collections')
      .query({ search: 'CT' })
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(leaked.status).toBe(200);
    expect(leaked.body.data).toHaveLength(0);
  });

  test('an invalid status filter is still rejected before any query runs', async () => {
    const res = await request(app)
      .get('/api/trainer/collections')
      .query({ status: 'NOPE' })
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(400);
  });

  // ------------------------------------------------- per-collection reads

  test('TRAINER can GET /api/trainer/collections/:id/topics for their own training', async () => {
    const res = await request(app)
      .get(`/api/trainer/collections/${ownCollectionId}/topics`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual(expect.objectContaining({
      name: 'My Day', order: 1, problemCount: expect.any(Number),
    }));
  });

  test('a hand-edited collection id cannot read an admin-owned training’s days', async () => {
    const res = await request(app)
      .get(`/api/trainer/collections/${adminCollectionId}/topics`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
  });

  test('a hand-edited collection id cannot read another trainer’s training or days', async () => {
    const topics = await request(app)
      .get(`/api/trainer/collections/${otherTrainerCollectionId}/topics`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(topics.status).toBe(403);

    const detail = await request(app)
      .get(`/api/trainer/collections/${otherTrainerCollectionId}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(detail.status).toBe(403);
  });

  test('malformed and unknown collection ids keep 400 / 404 on the read paths', async () => {
    expect((await request(app).get('/api/trainer/collections/not-an-id').set('Authorization', `Bearer ${trainerToken}`)).status).toBe(400);
    expect((await request(app).get('/api/trainer/collections/000000000000000000000001').set('Authorization', `Bearer ${trainerToken}`)).status).toBe(404);
    expect((await request(app).get('/api/trainer/collections/not-an-id/topics').set('Authorization', `Bearer ${trainerToken}`)).status).toBe(400);
    expect((await request(app).get('/api/trainer/collections/000000000000000000000001/topics').set('Authorization', `Bearer ${trainerToken}`)).status).toBe(404);
  });

  // ------------------------------------------------ existing write behaviour

  test('existing authorized collection operations continue to work', async () => {
const created = await request(app)
        .post('/api/trainer/collections')
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ name: `Round Trip ${Date.now()}`, batchId: ownBatchId });
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    const renamed = await request(app)
      .patch(`/api/trainer/collections/${id}`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ name: `Renamed ${Date.now()}` });
    expect(renamed.status).toBe(200);

    // A newly created training is immediately visible to its owner.
    const listed = await listAsTrainer();
    expect(listed.body.data.map((c) => c.id)).toContain(id);

    const archived = await request(app)
      .patch(`/api/trainer/collections/${id}`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ status: 'ARCHIVED' });
    expect(archived.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/trainer/collections/${id}`)
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(removed.status).toBe(200);
  });

  // ----------------------------------------------------------- authentication

  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/trainer/collections');
    expect(res.status).toBe(401);
  });

  test('unauthenticated per-collection reads are rejected', async () => {
    expect((await request(app).get(`/api/trainer/collections/${ownCollectionId}`)).status).toBe(401);
    expect((await request(app).get(`/api/trainer/collections/${ownCollectionId}/topics`)).status).toBe(401);
  });

  // Admin boundary stays intact
  test('TRAINER still gets 403 on GET /api/admin/collections', async () => {
    const res = await request(app).get('/api/admin/collections').set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  test('TRAINER still gets 403 on GET /api/admin/collections/:id/topics', async () => {
    const res = await request(app).get(`/api/admin/collections/${adminCollectionId}/topics`).set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(403);
  });

  // Trainer namespace is trainer-only
  test('ADMIN gets 403 on trainer-only endpoint (trainer role is exact)', async () => {
    const res = await request(app).get('/api/trainer/collections').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  // Student isolation
  test('STUDENT gets 403 on trainer-only endpoint', async () => {
    const stamp = Date.now();
    const student = await createTestUser({ name: 'S', email: `s${stamp}@x.com`, password: 'Password123!', role: 'STUDENT' });
    const studentToken = await loginAndGetToken(student.email, 'Password123!');
    const res = await request(app).get('/api/trainer/collections').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// Cross-role collection access isolation (Admin <-> Trainer)
// ============================================================================

describe('Collection access isolation between Admin and Trainer', () => {
  let adminToken, trainerToken, otherTrainerToken;
  let adminCollectionId, trainerCollectionId, otherTrainerCollectionId;
  let trainerBatchId;

  const as = (token, method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    await User.deleteMany({});
    await Collection.deleteMany({});
    await Topic.deleteMany({});
    const stamp = Date.now();

    const admin = await createTestUser({ name: 'A', email: `a${stamp}@x.com`, password: 'Password123!', role: 'ADMIN' });
    adminToken = await loginAndGetToken(admin.email, 'Password123!');

    const trainer = await createTestUser({ name: 'T', email: `t${stamp}@x.com`, password: 'Password123!', role: 'TRAINER' });
    trainerToken = await loginAndGetToken(trainer.email, 'Password123!');

    const other = await createTestUser({ name: 'O', email: `o${stamp}@x.com`, password: 'Password123!', role: 'TRAINER' });
    otherTrainerToken = await loginAndGetToken(other.email, 'Password123!');

adminCollectionId = (await as(adminToken, 'post', '/api/admin/collections')
      .send({ name: `Admin C ${stamp}` })).body.data._id;
    await Topic.create({ name: `Admin Day ${stamp}`, slug: `ad${stamp}`, collection: adminCollectionId, order: 1, createdBy: admin._id });

    trainerBatchId = await createBatchForTrainer(adminToken, trainer._id, `isoT${stamp}`);
    trainerCollectionId = (await as(trainerToken, 'post', '/api/trainer/collections')
      .send({ name: `Trainer C ${stamp}`, batchId: trainerBatchId })).body.data._id;

    const otherBatch = await createBatchForTrainer(adminToken, other._id, `isoO${stamp}`);
    otherTrainerCollectionId = (await as(otherTrainerToken, 'post', '/api/trainer/collections')
      .send({ name: `Other C ${stamp}`, batchId: otherBatch })).body.data._id;
  });

  // ------------------------------------------------------------------- Admin

  test('ADMIN lists and manages its own collection', async () => {
    const listed = await as(adminToken, 'get', '/api/admin/collections');
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((c) => c.id === adminCollectionId || c._id === adminCollectionId)).toBe(true);

    const detail = await as(adminToken, 'get', `/api/admin/collections/${adminCollectionId}`);
    expect(detail.status).toBe(200);
  });

  test('ADMIN retrieves topics via /api/admin/collections/:collectionId/topics', async () => {
    const res = await as(adminToken, 'get', `/api/admin/collections/${adminCollectionId}/topics`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toMatch(/^Admin Day/);
  });

test('ADMIN list excludes trainer-owned BATCH collections', async () => {
    // Admin and trainer curriculum are separate namespaces. The ADMIN role is
    // not a superset: a trainer's batch curriculum belongs to the trainer
    // assigned to that batch, so the admin Problems workspace must not list it.
    const res = await as(adminToken, 'get', '/api/admin/collections?limit=100');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c) => c.id || c._id);
    expect(ids).toContain(adminCollectionId);
    expect(ids).not.toContain(trainerCollectionId);
    expect(ids).not.toContain(otherTrainerCollectionId);
  });

  test('ADMIN cannot open, edit or delete a trainer-owned collection by id', async () => {
    for (const id of [trainerCollectionId, otherTrainerCollectionId]) {
      expect((await as(adminToken, 'get', `/api/admin/collections/${id}`)).status).toBe(403);
      expect((await as(adminToken, 'get', `/api/admin/collections/${id}/topics`)).status).toBe(403);
      const renamed = await as(adminToken, 'patch', `/api/admin/collections/${id}`).send({ name: 'Taken' });
      expect(renamed.status).toBe(403);
      expect((await as(adminToken, 'delete', `/api/admin/collections/${id}`)).status).toBe(403);
      const injected = await as(adminToken, 'post', `/api/admin/collections/${id}/topics`).send({ name: 'Injected' });
      expect(injected.status).toBe(403);
    }
  });

  test('ADMIN cannot read or mutate the topics of a trainer-owned collection', async () => {
    const created = await as(trainerToken, 'post', `/api/trainer/collections/${trainerCollectionId}/topics`)
      .send({ name: `Trainer Day ${Date.now()}` });
    expect(created.status).toBe(201);
    const topicId = created.body.data._id;

    expect((await as(adminToken, 'get', `/api/admin/topics/${topicId}`)).status).toBe(403);
    const hijacked = await as(adminToken, 'patch', `/api/admin/topics/${topicId}`).send({ name: 'Hijacked' });
    expect(hijacked.status).toBe(403);
    expect((await as(adminToken, 'delete', `/api/admin/topics/${topicId}`)).status).toBe(403);
  });

  test('ADMIN cannot reuse a trainer collection through a matching name or slug', async () => {
    // Admin import used to find-or-create a collection by slug/name with no
    // owner filter, so importing "TestCollection" would silently adopt a
    // trainer's BATCH collection.
    const adminCollection = (await as(adminToken, 'post', '/api/admin/collections')
      .send({ name: `Reuse Probe ${Date.now()}` }));
    expect(adminCollection.status).toBe(201);
    const createdAdminCollectionId = adminCollection.body.data._id;
    const trainerName = (await Collection.findById(trainerCollectionId).lean()).name;

    const res = await as(adminToken, 'post', '/api/admin/problems/import').send({
      problems: [{
        collection: trainerName,
        topic: 'Injected Day',
        problem: {
          title: `Reuse ${Date.now()}`,
          description: 'd',
          difficulty: 'EASY',
        },
      }],
    });

    expect(res.status).toBe(200);
    // The row is rejected, and no GLOBAL collection was created under that name.
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.errors[0].message).toMatch(/trainer/i);
    const collisions = await Collection.find({ name: trainerName, scope: 'GLOBAL' }).lean();
    expect(collisions).toHaveLength(0);

    // Sanity: the trainer's collection is untouched.
    const stillThere = await Collection.findById(trainerCollectionId).lean();
    expect(stillThere).not.toBeNull();
    expect(stillThere.scope).toBe('BATCH');
    expect(createdAdminCollectionId).not.toBe(trainerCollectionId);
  });

  test('invalid or missing scope/batch associations are rejected', async () => {
    // A trainer collection must name a batch...
    const noBatch = await as(trainerToken, 'post', '/api/trainer/collections')
      .send({ name: `No Batch ${Date.now()}` });
    expect(noBatch.status).toBe(400);

    // ...that belongs to them.
    const foreignBatch = await createBatchForTrainer(adminToken, (await User.findOne({ role: 'TRAINER' }))._id, `fb${Date.now()}`);
    const other = (await as(trainerToken, 'get', '/api/trainer/collections')).status;
    expect(other).toBe(200);
    const foreignTry = await request(app)
      .post('/api/trainer/collections')
      .set('Authorization', `Bearer ${otherTrainerToken}`)
      .send({ name: `Foreign Batch ${Date.now()}`, batchId: trainerBatchId });
    expect(foreignTry.status).toBe(403);
    expect(foreignBatch).toBeTruthy();
  });

  test('the model itself refuses a BATCH collection with no batch', async () => {
    await expect(
      Collection.create({ name: `Model Guard ${Date.now()}`, slug: `mg${Date.now()}`, scope: 'BATCH', createdBy: adminToken ? (await User.findOne({ role: 'ADMIN' }))._id : undefined })
    ).rejects.toThrow(/requires a batch/i);

    // ...and a GLOBAL collection can never carry one.
    const global = await Collection.create({
      name: `Global Guard ${Date.now()}`,
      slug: `gg${Date.now()}`,
      scope: 'GLOBAL',
      batch: trainerBatchId,
      createdBy: (await User.findOne({ role: 'ADMIN' }))._id,
    });
    expect(global.batch).toBeNull();
  });

  test('ADMIN may create and read a topic under its own collection', async () => {
    const created = await as(adminToken, 'post', `/api/admin/collections/${adminCollectionId}/topics`)
      .send({ name: `Admin Made ${Date.now()}` });
    expect(created.status).toBe(201);

    const listed = await as(adminToken, 'get', `/api/admin/collections/${adminCollectionId}/topics`);
    expect(listed.body.data.some((t) => t.id === created.body.data._id || t._id === created.body.data._id)).toBe(true);
  });

  // ----------------------------------------------------------------- Trainer

  test('TRAINER lists and manages its own collection', async () => {
    const listed = await as(trainerToken, 'get', '/api/trainer/collections');
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((c) => c.id)).toEqual([trainerCollectionId]);

const created = await as(trainerToken, 'post', '/api/trainer/collections')
      .send({ name: `Fresh ${Date.now()}`, batchId: trainerBatchId });
    expect(created.status).toBe(201);
  });

  test('TRAINER cannot read an admin-owned collection by a manually supplied id', async () => {
    expect((await as(trainerToken, 'get', `/api/trainer/collections/${adminCollectionId}`)).status).toBe(403);
    expect((await as(trainerToken, 'get', `/api/trainer/collections/${adminCollectionId}/topics`)).status).toBe(403);
  });

  test('TRAINER cannot read another trainer’s collection by a manually supplied id', async () => {
    expect((await as(trainerToken, 'get', `/api/trainer/collections/${otherTrainerCollectionId}`)).status).toBe(403);
    expect((await as(trainerToken, 'get', `/api/trainer/collections/${otherTrainerCollectionId}/topics`)).status).toBe(403);
  });

  test('TRAINER cannot modify an admin-owned or another trainer’s collection', async () => {
for (const id of [adminCollectionId, otherTrainerCollectionId]) {
      expect((await as(trainerToken, 'patch', `/api/trainer/collections/${id}`).send({ name: 'Hijacked' })).status).toBe(403);
      expect((await as(trainerToken, 'delete', `/api/trainer/collections/${id}`)).status).toBe(403);
      expect((await as(trainerToken, 'post', `/api/trainer/collections/${id}/topics`).send({ name: 'Injected' })).status).toBe(403);
    }
  });

  test('neither role can read the other namespace', async () => {
    expect((await as(trainerToken, 'get', '/api/admin/collections')).status).toBe(403);
    expect((await as(adminToken, 'get', '/api/trainer/collections')).status).toBe(403);
  });
});