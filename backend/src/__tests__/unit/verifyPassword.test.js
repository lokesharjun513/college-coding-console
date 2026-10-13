// Unit test for verifyPassword middleware - No database setup required

// Mock User model before importing verifyPassword
jest.mock('../../models/User', () => {
  const mockFindById = jest.fn();
  return {
    findById: mockFindById,
    __mockFindById: mockFindById
  };
});

// Mock bcrypt before importing verifyPassword
jest.mock('bcryptjs', () => ({
  compare: jest.fn()
}));

const User = require('../../models/User');
const bcrypt = require('bcryptjs');

// Import middleware after mocks are set up
const verifyAdminPassword = require('../../middleware/verifyPassword');

describe('verifyAdminPassword middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects requests without adminPassword in body', () => {
    const req = {
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyAdminPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Admin password required',
      code: 'INVALID_INPUT'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects requests with null adminPassword', () => {
    const req = {
      body: { adminPassword: null }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyAdminPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects requests with empty string adminPassword', () => {
    const req = {
      body: { adminPassword: '' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyAdminPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('fetches user with passwordHash from database', async () => {
    const mockUser = {
      passwordHash: '$2b$10$mockhash'
    };
    
    User.__mockFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser)
    });
    
    bcrypt.compare.mockResolvedValue(true);
    
    const req = {
      body: { adminPassword: 'testpassword' },
      user: { id: 'test-user-id' }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const next = jest.fn();
    
    await verifyAdminPassword(req, res, next);
    
    expect(User.__mockFindById).toHaveBeenCalledWith('test-user-id');
    expect(next).toHaveBeenCalled();
  });

  test('passes when password verification succeeds', async () => {
    const mockUser = {
      passwordHash: '$2b$10$mockhash'
    };
    
    User.__mockFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser)
    });
    
    bcrypt.compare.mockResolvedValue(true);
    
    const req = {
      body: { adminPassword: 'correctpassword' },
      user: { id: 'test-user-id' }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const next = jest.fn();
    
    await verifyAdminPassword(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  test('rejects when password verification fails', async () => {
    const mockUser = {
      passwordHash: '$2b$10$mockhash'
    };
    
    User.__mockFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser)
    });
    
    bcrypt.compare.mockResolvedValue(false);
    
    const req = {
      body: { adminPassword: 'wrongpassword' },
      user: { id: 'test-user-id' }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const next = jest.fn();
    
    await verifyAdminPassword(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid admin password',
      code: 'INVALID_PASSWORD'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects when user not found', async () => {
    User.__mockFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null)
    });
    
    const req = {
      body: { adminPassword: 'testpassword' },
      user: { id: 'test-user-id' }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const next = jest.fn();
    
    await verifyAdminPassword(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication failed',
      code: 'AUTHENTICATION_REQUIRED'
    });
  });
});
