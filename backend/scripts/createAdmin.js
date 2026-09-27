// Secure one-time CLI script to create an ADMIN user
// Usage:
//   1. Set environment variables before running:
//      EMAIL=admin@example.com PASSWORD=StrongPassword123 npm run create-admin
//   2. Or run without EMAIL/PASSWORD and follow the interactive prompts.
// The script will:
//   - Hash the password using the project's Argon2 implementation
//   - Create a single ADMIN user (prevents duplicate admins by email)
//   - Never expose passwords, passwordHash, or database URI in output

const readline = require('readline');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const authService = require('../src/auth/authService');

async function promptUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  await connectDB();

  let email = process.env.EMAIL;
  let password = process.env.PASSWORD;

  // Fallback to interactive prompts if environment variables are not set
  if (!email) {
    email = await promptUser('Enter admin email: ');
  }
  if (!password) {
    password = await promptUser('Enter admin password: ');
  }

  // Validate inputs
  if (!email || !email.includes('@')) {
    console.error('Error: valid email is required.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('Error: password must be at least 8 characters.');
    process.exit(1);
  }

  // Check if an ADMIN user with this email already exists
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`ADMIN account with email "${email}" already exists (ID: ${existing._id}).`);
    process.exit(0);
  }

  // Check if any ADMIN user already exists (optional: enforce single admin)
  const adminCount = await User.countDocuments({ role: 'ADMIN' });
  if (adminCount > 0) {
    console.log('An ADMIN account already exists in the database.');
    console.log('To create an additional admin, delete or deactivate the existing one.');
    process.exit(0);
  }

  // Hash the password using the project's Argon2 implementation
  const passwordHash = await authService.hashPassword(password);

  // Create the admin user
  const user = await User.create({
    name: 'Admin User',
    email,
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  console.log('ADMIN account created successfully.');
  console.log(`User ID: ${user._id}`);
  console.log(`Email: ${user.email}`);
  console.log('You can now log in with the credentials provided.');
  console.log('Keep your password safe — it cannot be retrieved later.');

  await disconnectDB();
}

main().catch((err) => {
  console.error('Failed to create admin account:', err.message);
  process.exit(1);
});
