// Debug script to test login and token verification
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../src/models/User');
const authService = require('../src/auth/authService');
const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB } = require('../src/config/db');

async function main() {
  await connectDB();
  // Clean up any existing test user
  await User.deleteMany({ email: /debug_user@/ });
  const password = 'Test123!';
  const passwordHash = await authService.hashPassword(password);
  const user = await User.create({ name: 'Debug User', email: 'debug_user@example.com', passwordHash, role: 'ADMIN', status: 'ACTIVE' });
  // Simulate login
  const token = jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_ACCESS_SECRET || 'testsecret', { expiresIn: '15m' });
  console.log('Generated token:', token);
  // Verify token
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'testsecret');
    console.log('Verified payload:', payload);
  } catch (e) {
    console.error('Verification error:', e);
  }
  await disconnectDB();
}

main().catch(err => { console.error(err); process.exit(1); });
