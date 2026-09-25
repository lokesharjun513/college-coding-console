require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const { connectDB } = require('./src/config/db');
const User = require('./src/models/User');
const authService = require('./src/auth/authService');
const jwt = require('jsonwebtoken');
(async () => {
  await connectDB();
  // Clean up any existing student user
  await User.deleteMany({ email: /student@testmail\.com$/ });
  const password = 'StrongP@ssw0rd';
  const passwordHash = await authService.hashPassword(password);
  const user = await User.create({ name: 'Student', email: 'student@testmail.com', passwordHash, role: 'STUDENT', status: 'ACTIVE' });
  console.log('Created user id:', user._id.toString());
  // Simulate login
  const token = jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' });
  console.log('Token:', token);
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  console.log('Decoded payload:', payload);
  // Try verifying via requireAuth logic
  const payload2 = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  const fetchedUser = await User.findById(payload2.sub);
  console.log('Fetched user role:', fetchedUser.role);
  await mongoose.connection.close();
})();
