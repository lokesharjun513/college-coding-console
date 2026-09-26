require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');

describe('User Model', () => {
  beforeAll(async () => {
    // DB connection managed globally by setup.js
  });

  beforeEach(async () => {
    // Ensure a clean collection before each test to avoid leftover data
    await User.deleteMany({});
  });


  afterEach(async () => {
    await User.deleteMany({ email: { $regex: '@testmail\\.com$' } });
  });

  describe('Validation and defaults', () => {
    it('should create a valid user', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'testuser@testmail.com',
        passwordHash: 'hashed_password',
        role: 'STUDENT',
        status: 'ACTIVE',
      });
      expect(user._id).toBeDefined();
      expect(user.name).toBe('Test User');
      expect(user.email).toBe('testuser@testmail.com');
      expect(user.role).toBe('STUDENT');
      expect(user.status).toBe('ACTIVE');
    });

    it('should store passwordHash in DB and be selectable', async () => {
      const user = await User.create({
        name: 'Hash Test',
        email: 'hash@testmail.com',
        passwordHash: 'hash_secret',
        role: 'STUDENT',
        status: 'ACTIVE',
      });
      const found = await User.findById(user._id).select('+passwordHash');
      expect(found.passwordHash).toBe('hash_secret');
    });

    it('should normalize email to lowercase', async () => {
      const user = await User.create({
        name: 'Email Test',
        email: 'Upper@Case.COM',
        passwordHash: 'hash',
        role: 'STUDENT',
        status: 'ACTIVE',
      });
      expect(user.email).toBe('upper@case.com');
    });

    it('should trim name', async () => {
      const user = await User.create({
        name: '  Trimmed Name  ',
        email: 'trim@testmail.com',
        passwordHash: 'hash',
        role: 'STUDENT',
        status: 'ACTIVE',
      });
      expect(user.name).toBe('Trimmed Name');
    });

    it('should default role to STUDENT', async () => {
      const user = await User.create({
        name: 'Default Role',
        email: 'default-role@testmail.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
      });
      expect(user.role).toBe('STUDENT');
    });

    it('should default status to ACTIVE', async () => {
      const user = await User.create({
        name: 'Default Status',
        email: 'default-status@testmail.com',
        passwordHash: 'hash',
        role: 'STUDENT',
      });
      expect(user.status).toBe('ACTIVE');
    });
  });

  describe('passwordHash visibility', () => {
    it('should not return passwordHash by default when querying', async () => {
      const created = await User.create({
        name: 'Visibility Test',
        email: 'visibility@testmail.com',
        passwordHash: 'secret_hash',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      const found = await User.findById(created._id);
      expect(found.passwordHash).toBeUndefined();
    });
  });

  describe('Uniqueness and constraints', () => {
    it('should reject duplicate email', async () => {
      const email = 'duplicate@testmail.com';
      await User.create({
        name: 'First',
        email,
        passwordHash: 'hash',
      });
      await expect(
        User.create({
          name: 'Second',
          email,
          passwordHash: 'hash',
        })
      ).rejects.toThrow();
    });

    it('should reject invalid role', async () => {
      await expect(
        User.create({
          name: 'Bad Role',
          email: 'badrole@testmail.com',
          passwordHash: 'hash',
          role: 'INVALID',
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });

    it('should reject invalid status', async () => {
      await expect(
        User.create({
          name: 'Bad Status',
          email: 'badstatus@testmail.com',
          passwordHash: 'hash',
          role: 'STUDENT',
          status: 'INVALID',
        })
      ).rejects.toThrow();
    });

    it('should reject missing required name', async () => {
      await expect(
        User.create({
          email: 'missingname@testmail.com',
          passwordHash: 'hash',
          role: 'STUDENT',
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });

    it('should reject missing required email', async () => {
      await expect(
        User.create({
          name: 'Missing Email',
          passwordHash: 'hash',
          role: 'STUDENT',
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });
  });
});
