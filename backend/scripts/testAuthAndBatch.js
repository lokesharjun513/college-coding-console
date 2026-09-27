// Script to test login and admin batch creation
const request = require('supertest');
const app = require('../src/app');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connectDB, disconnectDB } = require('../src/config/db');

async function main() {
  await connectDB();
  // Create admin user directly via model
  const User = require('../src/models/User');
  const authService = require('../src/auth/authService');
  const password = 'StrongP@ssw0rd';
  const passwordHash = await authService.hashPassword(password);
  // Ensure clean state
  await User.deleteMany({ email: /admin@test/ });
  const admin = await User.create({ name: 'Admin', email: 'admin@test.com', passwordHash, role: 'ADMIN', status: 'ACTIVE' });
  // Login
  const loginRes = await request(app).post('/api/auth/login').send({ email: admin.email, password });
  console.log('Login status:', loginRes.status);
  console.log('Login body:', loginRes.body);
  const token = loginRes.body.token;
  // Create trainer user
  const trainer = await User.create({ name: 'Trainer', email: 'trainer@test.com', passwordHash, role: 'TRAINER', status: 'ACTIVE' });
  // Create batch via admin endpoint
  const batchRes = await request(app)
    .post('/api/admin/batches')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Batch Name', code: 'CODE123', description: 'desc', trainer: trainer._id, status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-12-31' });
  console.log('Batch create status:', batchRes.status);
  console.log('Batch create body:', batchRes.body);
  await disconnectDB();
}

main().catch(err => { console.error(err); process.exit(1); });
