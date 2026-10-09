const request = require('supertest');
const app = require('../src/app');

// Increase timeout for long-running import tests
jest.setTimeout(180000);
const User = require('../src/models/User');
const Collection = require('../src/models/Collection');
const Topic = require('../src/models/Topic');
const Problem = require('../src/models/Problem');
const TestCase = require('../src/models/TestCase');
const authService = require('../src/auth/authService');

async function createUser({ name, email, password, role = 'STUDENT', status = 'ACTIVE' }) {
  const passwordHash = await authService.hashPassword(password);
  return await User.create({ name, email, passwordHash, role, status });
}

async function loginAndGetToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('Regression Test: Empty Expected Output Validation', () => {
  let adminToken;

  beforeAll(async () => {
    const adminEmail = 'admin_empty_output_test@test.com';
    const password = 'StrongP@ssw0rd';
    await User.deleteMany({ email: adminEmail });
    await createUser({ name: 'Admin', email: adminEmail, password, role: 'ADMIN' });
    adminToken = await loginAndGetToken(adminEmail, password);
  });

  afterAll(async () => {
    await Problem.deleteMany({});
    await Collection.deleteMany({});
    await Topic.deleteMany({});
    await TestCase.deleteMany({});
  });

  test('Should accept test case with empty string expectedOutput', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Test Collection',
          topic: 'Test Topic',
          problem: {
            title: 'Empty Output Test',
            description: 'Test case with empty expected output',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
            testCases: [
              {
                input: '1',
                expectedOutput: '', // Empty string - should be valid
                order: 0
              }
            ]
          }
        }]
      });

    console.log('Test 1 response:', res.body);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(1);

    // Verify the test case was created with empty string
    const problem = await Problem.findOne({ title: 'Empty Output Test' });
    expect(problem).not.toBeNull();

    const testCases = await TestCase.find({ problem: problem._id });
    expect(testCases.length).toBe(1);
    expect(testCases[0].expectedOutput).toBe('');
  });

  test('Should reject test case with missing expectedOutput', async () => {
    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        problems: [{
          collection: 'Test Collection',
          topic: 'Test Topic',
          problem: {
            title: 'Missing Output Test',
            description: 'Test case with missing expected output',
            difficulty: 'EASY',
            scope: 'GLOBAL',
            status: 'PUBLISHED',
            testCases: [
              {
                input: '1',
                // expectedOutput is missing - should fail
                order: 0
              }
            ]
          }
        }]
      });

    expect(res.body.success).toBe(true); // Import succeeds but with failures
    expect(res.body.summary.created).toBe(0);
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.errors.length).toBe(1);
    expect(res.body.errors[0].message).toContain('requires input and expectedOutput');
  });

  test('Should handle the 50/51 problem import with empty expected outputs', async () => {
    // Create a test payload similar to the user's JSON but with known empty expectedOutput
    const problems = [
      {
        collection: 'FINAL YEAR BASIC IMPORTANT LOGICAL QUESTIONS (50)',
        topic: 'Basic',
        problem: {
          title: 'Calculate Total Bill',
          description: 'Calculate the total bill amount',
          difficulty: 'EASY',
          scope: 'GLOBAL',
          status: 'PUBLISHED',
          testCases: [
            { input: '100 5', expectedOutput: '105', order: 0 },
            { input: '200 10', expectedOutput: '210', order: 1 },
            { input: '0 0', expectedOutput: '0', order: 2 },
            { input: '50 25', expectedOutput: '75', order: 3 },
            { input: '1', expectedOutput: '', order: 4 } // Intentionally empty output
          ]
        }
      }
    ];

    // Add 49 more simple problems to make 50 total
    for (let i = 1; i <= 49; i++) {
      problems.push({
        collection: `Collection ${i}`,
        topic: `Topic ${i}`,
        problem: {
          title: `Problem ${i}`,
          description: `Description ${i}`,
          difficulty: 'EASY',
          scope: 'GLOBAL',
          status: 'PUBLISHED'
        }
      });
    }

    const res = await request(app)
      .post('/api/admin/problems/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ problems });

    console.log('50 problem import response:', JSON.stringify(res.body, null, 2));
    // Should succeed - the empty expectedOutput should be valid
    expect(res.body.success).toBe(true);
    expect(res.body.summary.created).toBe(50); // All 50 problems created
    expect(res.body.summary.failed).toBe(0);

    // Verify the first problem's test cases were preserved correctly
    console.log('Searching for problem with title: Calculate Total Bill');
    const firstProblem = await Problem.findOne({ title: 'Calculate Total Bill' });
    console.log('Found problem:', firstProblem);
    expect(firstProblem).not.toBeNull();

    const testCases = await TestCase.find({ problem: firstProblem._id }).sort({ order: 1 });
    console.log('Found test cases:', testCases);
    expect(testCases.length).toBe(5);
    expect(testCases[0].expectedOutput).toBe('105');
    expect(testCases[1].expectedOutput).toBe('210');
    expect(testCases[2].expectedOutput).toBe('0');
    expect(testCases[3].expectedOutput).toBe('75');
    expect(testCases[4].expectedOutput).toBe(''); // Empty string preserved
  });
});