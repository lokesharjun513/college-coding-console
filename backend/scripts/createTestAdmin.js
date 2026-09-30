const path = require('path');
const fs = require('fs');

// Try loading .env from backend/.env or root .env
const envPathBackend = path.join(__dirname, '..', '.env');
const envPathRoot = path.join(__dirname, '..', '..', '.env');

if (fs.existsSync(envPathBackend)) {
  require('dotenv').config({ path: envPathBackend });
} else if (fs.existsSync(envPathRoot)) {
  require('dotenv').config({ path: envPathRoot });
} else {
  require('dotenv').config();
}

const mongoose = require('mongoose');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Error: MONGO_URI is not set in environment or .env file');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const email = 'testadmin@gmail.com';
  const password = 'testadmin';
  const name = 'Test Admin';

  const passwordHash = await authService.hashPassword(password);

  let user = await User.findOne({ email });
  if (user) {
    user.passwordHash = passwordHash;
    user.role = 'ADMIN';
    user.status = 'ACTIVE';
    user.name = name;
    await user.save();
    console.log(`Successfully updated admin user: ${email}`);
  } else {
    user = await User.create({
      name,
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    console.log(`Successfully created new admin user: ${email}`);
  }

  await mongoose.disconnect();
  console.log('MongoDB connection closed.');
}

run().catch(err => {
  console.error('Failed to create admin user:', err);
  process.exit(1);
});
