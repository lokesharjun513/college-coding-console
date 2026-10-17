// Load test environment variables first (before any other imports)
require('dotenv').config({ path: '.env.test', quiet: true });

// Disable mongodb-memory-server MD5 check if binary mismatch occurs on Windows
process.env.MONGOMS_MD5_CHECK = '0';

// Set test environment variables (override if needed)
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'testencryptionkey01234567890123';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.NODE_ENV = 'test';

// Suppress SMTP verification errors in test environment
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.SMTP_PORT = process.env.SMTP_PORT || '587';
process.env.SMTP_USER = process.env.SMTP_USER || 'test';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test';
process.env.SMTP_FROM = process.env.SMTP_FROM || 'test@example.com';

// Connect to MongoDB before any tests run
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { connectDB, disconnectDB } = require('../src/config/db');
const os = require('os');
const path = require('path');
const fs = require('fs');

let mongoServer;
let tempDbPath;

beforeAll(async () => {
  // A unique directory per Jest process, under the OS temp directory.
  //
  // This used to be a single fixed path (`backend/.tmp/mongo`) plus a fixed port
  // 27017. Two consequences, both observed here:
  //
  //   - Every Jest process shared one data directory and one port, so a second
  //     process could not start: `DBPathInUse: Unable to create/open the lock
  //     file: ...\.tmp\mongo\mongod.lock`.
  //   - A run that failed before `afterAll` left its mongod holding that
  //     directory, so the NEXT run failed with the same DBPathInUse even though
  //     nothing else was running. The stale lock was a symptom; the shared
  //     directory was the cause.
  //
  // An ephemeral directory cannot outlive the process that made it, and no port
  // is pinned so MongoDB Memory Server picks a free one instead of racing a
  // second process (or a local development server) for 27017.
  tempDbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'btech-mongo-test-'));

  // No server version is pinned here on purpose.
  //
  // The previous `binary.version: '4.4.12'` selected
  // mongodb-windows-x86_64-4.4.12.zip from the local binary cache, and that
  // archive is corrupt: ~1.08 GB cached against 286,554,855 bytes published.
  // The integrity check therefore failed and MongoServer never started.
  //
  // Leaving the version unset uses the version this installed
  // mongodb-memory-server ships and verifies. Set MONGOMS_VERSION to pin a
  // specific server version instead.
  //
  // The server is a SINGLE-NODE REPLICA SET, not a standalone.
  //
  // Several routes write inside `session.withTransaction(...)` - for example
  // PATCH /api/admin/collections/:id and the trainer bulk-import path. A
  // standalone mongod answers those with
  //   MongoServerError: Transaction numbers are only allowed on a replica set
  //   member or mongos
  // which the handlers surface as HTTP 500, so the suites exercising them failed
  // even though the code is correct. Development and production both run against
  // a replica set (Atlas), so that is also the honest thing to test against; the
  // alternative - stripping the transactions out of the handlers - would give up
  // the atomicity they exist to provide.
  //
  // `MongoMemoryReplSet` is used rather than `MongoMemoryServer({ replSet })`:
  // passing `replSet` to MongoMemoryServer is silently ignored, and the resulting
  // mongod reports `hello.setName === undefined` and "not running with
  // --replSet". MongoMemoryReplSet starts it correctly and its getUri() carries
  // the `?replicaSet=` parameter the driver needs to negotiate the topology.
  // `instanceOpts` is a list, one entry per member, so a single-node set takes a
  // one-element array (passing a bare object makes MongoMemoryReplSet fail with
  // "this._instanceOpts.forEach is not a function").
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', name: 'testset' },
    instanceOpts: [{ dbName: 'test', dbPath: tempDbPath }],
  });

  const uri = mongoServer.getUri();

  // `.env.test` may point at a real shared cluster. Tests must never fall back
  // to it: if the memory server did not start, fail loudly here rather than let
  // the suite read or write anyone's real database.
  const isLocal = /^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(uri);
  if (!isLocal) {
    throw new Error(`Refusing to run tests against a non-local MongoDB URI: ${uri.split('@').pop()}`);
  }

  process.env.MONGO_URI = uri;

  // `runtimeAdapters.os` is required here, and is the fix for the failure that
  // made every suite report itself broken.
  //
  // The MongoDB driver resolves its `os` adapter with a dynamic `import('os')`
  // (node_modules/mongodb/lib/runtime_adapters.js). Jest runs CommonJS test
  // files in a vm context, and a dynamic import there fails with
  // "A dynamic import callback was invoked without --experimental-vm-modules".
  // The driver's handshake code catches that failure, squashes it, and sends
  // `"client": {}` with no `driver` sub-document. mongod then refuses the
  // connection:
  //
  //   MongooseServerSelectionError: Missing required sub-document 'driver'
  //   in the client metadata document
  //
  // which surfaced as every test in every suite failing even though the code
  // under test was fine. Supplying the adapter explicitly keeps the suite
  // working on a plain `npx jest`, with no node flag.
  await connectDB({ runtimeAdapters: { os } });
});

// Disconnect from MongoDB after all tests complete
afterAll(async () => {
  await disconnectDB();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = undefined;
  }
  // Only now that the owning mongod has stopped is it safe to remove the
  // directory. `force` keeps teardown quiet if the server already cleaned up.
  if (tempDbPath) {
    fs.rmSync(tempDbPath, { recursive: true, force: true });
    tempDbPath = undefined;
  }
});

let originalConsoleError;

// Suppress console.error during tests
beforeAll(async () => {
  originalConsoleError = console.error;
  console.error = function (...args) {
    // Suppress error logs in test environment
    return;
  };
});

afterAll(async () => {
  if (originalConsoleError) {
    console.error = originalConsoleError;
  }
});
