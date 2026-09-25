require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');

// Increase Jest timeout to allow DB connection and CRUD operations
jest.setTimeout(30000);

describe('User CRUD', () => {
  const testEmail = 'crudtest@testmail.com';

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await User.deleteMany({ email: testEmail });
  });

  it('should CREATE, READ, UPDATE, DELETE a user', async () => {
    // CREATE
    const created = await User.create({
      name: 'Crud User',
      email: testEmail,
      passwordHash: 'crud_hash',
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    expect(created._id).toBeDefined();

    // READ
    const read = await User.findById(created._id);
    expect(read).not.toBeNull();
    expect(read.email).toBe(testEmail);

    // UPDATE
    const updated = await User.findByIdAndUpdate(
      created._id,
      { name: 'Updated Name' },
      { new: true }
    );
    expect(updated.name).toBe('Updated Name');

    // DELETE
    const delResult = await User.deleteOne({ _id: created._id });
    expect(delResult.deletedCount).toBe(1);
    const afterDelete = await User.findById(created._id);
    expect(afterDelete).toBeNull();
  });
});
