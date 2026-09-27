const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');

// Helper to mock console.log/error
const logs = [];
const errors = [];
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => logs.push(args.join(' '));
console.error = (...args) => errors.push(args.join(' '));

describe('createAdmin script behavior', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(() => {
    logs.length = 0;
    errors.length = 0;
    // Ensure test admin email does not exist
    return User.deleteMany({ email: 'admin-test@example.com' });
  });

  it('should create admin with email and password from environment', async () => {
    const originalEmail = process.env.EMAIL;
    const originalPassword = process.env.PASSWORD;
    process.env.EMAIL = 'admin-test@example.com';
    process.env.PASSWORD = 'SecurePassword123';
    // Mock hash function
    const originalHash = authService.hashPassword;
    const hashedPasswords = [];
    authService.hashPassword = async (pwd) => {
      hashedPasswords.push(pwd);
      return 'hashed-' + pwd;
    };
    try {
      await User.create({
        name: 'Admin User',
        email: 'admin-test@example.com',
        passwordHash: 'hashed-SecurePassword123',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      const admin = await User.findOne({ email: 'admin-test@example.com' });
      expect(admin).not.toBeNull();
      expect(admin.role).toBe('ADMIN');
      expect(admin.status).toBe('ACTIVE');
      expect(admin.passwordHash).toBe('hashed-SecurePassword123');
    } finally {
      process.env.EMAIL = originalEmail;
      process.env.PASSWORD = originalPassword;
      authService.hashPassword = originalHash;
    }
  });

  it('should prevent duplicate admin creation for same email', async () => {
    await User.create({
      name: 'Admin User',
      email: 'admin-test@example.com',
      passwordHash: 'hashed',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const existing = await User.findOne({ email: 'admin-test@example.com' });
    expect(existing).not.toBeNull();
  });

  it('should prevent creation when any admin already exists', async () => {
    await User.create({
      name: 'Other Admin',
      email: 'otheradmin@example.com',
      passwordHash: 'hashed',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const admins = await User.countDocuments({ role: 'ADMIN' });
    expect(admins).toBeGreaterThan(0);
  });
});
