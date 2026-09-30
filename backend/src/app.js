const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const logger = require('./config/logger');
const requestIdMiddleware = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const { globalLimiter } = require('./middleware/rateLimiter');
const adminTrainersRouter = require('./routes/adminTrainers');
const adminBatchesRouter = require('./routes/admin/batches');
const adminBatchStudentsRouter = require('./routes/admin/batchStudents');
const adminUsersRouter = require('./routes/admin/users');
const adminProblemsRouter = require('./routes/admin/problems');
const adminCollectionsRouter = require('./routes/admin/collections');
const adminTopicsRouter = require('./routes/admin/topics');
const adminTestCasesRouter = require('./routes/admin/testCases');
const adminReportsRouter = require('./routes/admin/reports');
const adminSubmissionsRouter = require('./routes/admin/submissions');
const adminSettingsRouter = require('./routes/admin/settings');
const adminSystemRouter = require('./routes/admin/system');
const adminStudentsRouter = require('./routes/admin/students');
const trainerBatchRouter = require('./routes/trainer/batches');
const trainerStudentsRouter = require('./routes/trainer/students');
const trainerProblemRouter = require('./routes/trainer/problems');
const trainerTestCaseRouter = require('./routes/trainer/testCases');
const testRouter = require('./routes/testRoutes');
const studentRouter = require('./routes/student/submissions');
const studentProblemsRouter = require('./routes/student/problems');
const studentCollectionsRouter = require('./routes/student/collections');
const studentTopicsRouter = require('./routes/student/topics');
const studentDashboardRouter = require('./routes/student/dashboard');
const studentConsoleRouter = require('./routes/student/console');

const app = express();

// Trust proxy for proper IP detection behind proxies (Render/Railway/etc.)
app.set('trust proxy', 1);

const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'https://college-coding-console.vercel.app'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));


app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);
app.use(requestLogger);

app.use('/api', healthRouter);

// Global API rate limiter – protects all /api routes; health check is internally skipped
app.use('/api', globalLimiter);

app.use('/api/auth', authRouter);

app.use('/api/admin/trainers', adminTrainersRouter);

app.use('/api/admin/batches', adminBatchesRouter);

app.use(
  '/api/admin/batches/:batchId',
  adminBatchStudentsRouter
);

// Admin Users routes
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/students', adminStudentsRouter);
// Admin Problems routes
app.use('/api/admin/problems', adminProblemsRouter);
app.use('/api/admin/collections', adminCollectionsRouter);
app.use('/api/admin/topics', adminTopicsRouter);
// Admin Test Cases routes (nested under problem)
app.use('/api/admin/problems/:problemId/test-cases', adminTestCasesRouter);
app.use('/api/admin/reports', adminReportsRouter);
app.use('/api/admin/submissions', adminSubmissionsRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/admin/system', adminSystemRouter);
app.use('/api/admin/students', adminStudentsRouter);

app.use(
  '/api/trainer/batches',
  trainerBatchRouter
);

app.use(
  '/api/trainer/students',
  trainerStudentsRouter
);

app.use(
  '/api/trainer/batches/:batchId/problems',
  trainerProblemRouter
);

// Trainer performance endpoints
app.use('/api/trainer/performance', require('./routes/trainer/performance'));

app.use(
  '/api/trainer/problems/:problemId/test-cases',
  trainerTestCaseRouter
);

app.use('/api/test', testRouter);
app.use('/api/student/submissions', studentRouter);
app.use('/api/student/problems', studentProblemsRouter);
app.use('/api/student/collections', studentCollectionsRouter);
app.use('/api/student/topics', studentTopicsRouter);
app.use('/api/student/dashboard', studentDashboardRouter);
app.use('/api/student/console', studentConsoleRouter);
app.use('/api/student/compilers', require('./routes/student/compiler'));

// Centralized error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  logger.error('Unhandled application error', {
    event: 'error.unhandled',
    requestId: req.requestId,
    statusCode,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

module.exports = app;