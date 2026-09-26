const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const adminTrainersRouter = require('./routes/adminTrainers');
const adminBatchesRouter = require('./routes/admin/batches');
const adminBatchStudentsRouter = require('./routes/admin/batchStudents');
const trainerBatchRouter = require('./routes/trainer/batches');
const trainerProblemRouter = require('./routes/trainer/problems');
const trainerTestCaseRouter = require('./routes/trainer/testCases');
const testRouter = require('./routes/testRoutes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);

app.use('/api/auth', authRouter);

app.use('/api/admin/trainers', adminTrainersRouter);

app.use('/api/admin/batches', adminBatchesRouter);

app.use(
  '/api/admin/batches/:batchId',
  adminBatchStudentsRouter
);

app.use(
  '/api/trainer/batches',
  trainerBatchRouter
);

app.use(
  '/api/trainer/batches/:batchId/problems',
  trainerProblemRouter
);

app.use(
  '/api/trainer/problems/:problemId/test-cases',
  trainerTestCaseRouter
);

app.use('/api/test', testRouter);

module.exports = app;