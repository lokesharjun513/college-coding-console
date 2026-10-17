// Guards the properties of the TEST database that the rest of the suite depends
// on but that no application test states directly.
//
// Both of these regressed at some point and were both reported as dozens of
// unrelated application failures:
//
//   1. The driver could not connect at all. The MongoDB driver resolves its `os`
//      adapter with a dynamic `import('os')`, which Jest's CommonJS sandbox
//      refuses without `--experimental-vm-modules`. The driver squashes that
//      failure and sends `"client": {}` in its handshake, so every suite failed
//      with "Missing required sub-document 'driver' in the client metadata
//      document". test/setup.js now passes `runtimeAdapters: { os }`.
//
//   2. The server was a standalone mongod, but several routes write inside
//      `session.withTransaction(...)` - PATCH /api/admin/collections/:id, the
//      admin collection archive cascade, the trainer bulk import. A standalone
//      answers those with "Transaction numbers are only allowed on a replica set
//      member or mongos", which the handlers surface as HTTP 500. test/setup.js
//      now starts a single-node replica set.

const mongoose = require('mongoose');

describe('test database environment', () => {
  test('the suite is connected to an ephemeral loopback database, never .env or .env.test', () => {
    const uri = mongoose.connection.client.s.url || mongoose.connection.client.s.host;

    expect(mongoose.connection.readyState).toBe(1);
    expect(String(uri)).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])/);

    // `.env.test` points at a real shared Atlas cluster. Connecting to it from a
    // test run would read - and with any write route, destroy - real data, so a
    // non-local target has to fail loudly rather than be used.
    expect(String(uri)).not.toMatch(/mongodb\+srv:/);
  });

  test('the server supports multi-document transactions', async () => {
    // Asserted by actually running one. Reading `setName` off the topology would
    // pass on a server that was started with --replSet but never initiated.
    const db = mongoose.connection.db;
    const marker = `txn-probe-${process.pid}`;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('__transaction_probe__').insertOne({ marker }, { session });
        await db.collection('__transaction_probe__').updateOne(
          { marker },
          { $set: { committed: true } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    const stored = await db.collection('__transaction_probe__').findOne({ marker });
    expect(stored).not.toBeNull();
    expect(stored.committed).toBe(true);

    await db.collection('__transaction_probe__').deleteMany({ marker });
  });
});
