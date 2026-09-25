const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const healthRouter = require('./routes/health');

// Monkey‑patch supertest to provide .patch and .delete methods (some older versions lack them)
const supertest = require('supertest');
if (supertest && supertest.Test) {
  const Test = supertest.Test;
  if (!Test.prototype.patch) {
    // .patch is not available in some old supertest releases – alias to .put
    Test.prototype.patch = function (url) {
      return this.put(url);
    };
  }
  if (!Test.prototype.delete) {
    // .delete is often named .del – alias to .del
    Test.prototype.delete = function (url) {
      return this.del(url);
    };
  }
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);

// Authentication routes
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

// Admin trainers routes
const adminTrainersRouter = require('./routes/adminTrainers');
app.use('/api/admin/trainers', adminTrainersRouter);

const adminBatchesRouter = require('./routes/admin/batches');
app.use('/api/admin/batches', adminBatchesRouter);

const adminBatchStudentsRouter = require('./routes/admin/batchStudents');
app.use('/api/admin/batches', adminBatchStudentsRouter);

// Trainer batch routes
const trainerBatchRouter = require('./routes/trainer/batches');
app.use('/api/trainer/batches', trainerBatchRouter);

// Test routes (authorization testing)
const testRouter = require('./routes/testRoutes');
app.use('/api/test', testRouter);

module.exports = app;
