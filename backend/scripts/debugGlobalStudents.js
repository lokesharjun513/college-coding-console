// Debug script to create trainer, batch, student, enrollment and query global students endpoint
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Batch = require('../src/models/Batch');
const BatchStudent = require('../src/models/BatchStudent');
const authService = require('../src/auth/authService');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  // Cleanup
  await User.deleteMany({});
  await Batch.deleteMany({});
  await BatchStudent.deleteMany({});

  const password = 'StrongP@ssw0rd';
  const passwordHash = await authService.hashPassword(password);
  // Create trainer
  const trainer = await User.create({ name: 'Trainer', email: 'trainer@example.com', passwordHash, role: 'TRAINER', status: 'ACTIVE' });
  // Login trainer
  const loginRes = await request(app).post('/api/auth/login').send({ email: trainer.email, password });
  const token = loginRes.body.token;
  // Create batch via admin (need admin token)
  const admin = await User.create({ name: 'Admin', email: 'admin@example.com', passwordHash, role: 'ADMIN', status: 'ACTIVE' });
  const adminLogin = await request(app).post('/api/auth/login').send({ email: admin.email, password });
  const adminToken = adminLogin.body.token;
  const batchRes = await request(app)
    .post('/api/admin/batches')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Batch1', code: 'B001', trainer: trainer._id, status: 'ACTIVE' });
  const batchId = batchRes.body.data.id;
  // Create student
  const student = await User.create({ name: 'Student', email: 'student@example.com', passwordHash, role: 'STUDENT', status: 'ACTIVE' });
  // Enroll student via admin endpoint
  await request(app)
    .post(`/api/admin/batches/${batchId}/students`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ studentId: student._id });

  // Query global endpoint as trainer
  const res = await request(app)
    .get('/api/trainer/students')
    .set('Authorization', `Bearer ${token}`);
  console.log('Global students response status:', res.status);
  console.log('Body:', JSON.stringify(res.body, null, 2));
}
run().catch(err => console.error(err)).finally(() => mongoose.disconnect());
