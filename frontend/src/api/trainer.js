import api from './client';

// Batches (trainer view)
export const getTrainerBatches = () => api.get('/trainer/batches');
export const getTrainerBatch = (batchId) => api.get(`/trainer/batches/${batchId}`);
export const getBatchStudents = (batchId) => api.get(`/trainer/batches/${batchId}/students`);
export const getTrainerStudents = () => api.get('/trainer/students');
export const getAvailableBatchStudents = (batchId, params) => api.get(`/trainer/batches/${batchId}/students/available`, { params });
export const bulkUnenrollStudents = (batchId, studentIds) => api.delete(`/trainer/batches/${batchId}/students`, { data: { studentIds } });
export const bulkEnrollStudents = (batchId, studentIds) => api.post(`/trainer/batches/${batchId}/students`, { studentIds });
export const enrollStudent = (batchId, studentId) => api.post(`/trainer/batches/${batchId}/students`, { studentIds: Array.isArray(studentId) ? studentId : [studentId] });
export const updateStudentEnrollment = (batchId, studentId, status) => api.patch(`/trainer/batches/${batchId}/students/${studentId}`, { status });
export const deleteStudentEnrollment = (batchId, studentId) => api.delete(`/trainer/batches/${batchId}/students/${studentId}`);

// Problems
// deleteProblem is a soft delete: the server archives the problem and preserves
// submissions and completions. unarchiveProblem restores the pre-archive status.
//
// getBatchProblems accepts the full server-side filter set. Every parameter is
// optional and they are all additive:
//   { collectionId, topicId, status, difficulty, search, page, limit }
// `collectionId` and `topicId` narrow the batch to a Training / Day of the
// curriculum; the server asserts that the Training is the caller's, belongs to
// this batch, and that the Day belongs to the Training. `page` is 1-based and
// `limit` is 1..100. The response is `{ success, data, meta }` where `meta` is
// `{ total, page, limit, totalPages, hasNext, hasPrev }` counted from the same
// filtered set that produced `data`.
export const getBatchProblems = (batchId, params) => api.get(`/trainer/batches/${batchId}/problems`, { params });
export const createProblem = (batchId, data) => api.post(`/trainer/batches/${batchId}/problems`, data);
export const getProblem = (batchId, problemId) => api.get(`/trainer/batches/${batchId}/problems/${problemId}`);
export const updateProblem = (batchId, problemId, data) => api.patch(`/trainer/batches/${batchId}/problems/${problemId}`, data);
export const updateProblemStatus = (batchId, problemId, status) =>
  api.patch(`/trainer/batches/${batchId}/problems/${problemId}`, { status });
export const deleteProblem = (batchId, problemId) => api.delete(`/trainer/batches/${batchId}/problems/${problemId}`);
export const unarchiveProblem = (batchId, problemId) => api.patch(`/trainer/batches/${batchId}/problems/${problemId}/unarchive`);
export const bulkImportProblems = (batchId, data) => api.post(`/trainer/batches/${batchId}/problems/import`, data);
export const downloadProblemTemplate = (batchId) => api.get(`/trainer/batches/${batchId}/problems/template`, { responseType: 'blob' });

// Assignments (open-ended practice — no deadlines)
// Mounted at /api/trainer/batches/:batchId/assignments
export const getBatchAssignments = (batchId, params) => api.get(`/trainer/batches/${batchId}/assignments`, { params });
export const getBatchAssignment = (batchId, assignmentId) => api.get(`/trainer/batches/${batchId}/assignments/${assignmentId}`);
// Problems this trainer may assign to this batch: PUBLISHED GLOBAL problems only.
// Batch-scoped problems are excluded because they are already associated with the
// batch — adding a problem to a batch is the association, so assigning it again
// would be a duplicate representation of the same thing.
export const getAssignableProblems = (batchId) => api.get(`/trainer/batches/${batchId}/assignments/problems`);
// Payload accepts only problemId, title, availableFrom and status. There is deliberately no dueDate.
export const createAssignment = (batchId, data) => api.post(`/trainer/batches/${batchId}/assignments`, data);
export const updateAssignment = (batchId, assignmentId, data) => api.patch(`/trainer/batches/${batchId}/assignments/${assignmentId}`, data);
// Soft delete: the assignment row is retained and the unique slot is freed.
export const deleteAssignment = (batchId, assignmentId) => api.delete(`/trainer/batches/${batchId}/assignments/${assignmentId}`);

// Test cases
export const getTestCases = (problemId) => api.get(`/trainer/problems/${problemId}/test-cases`);
export const createTestCase = (problemId, data) => api.post(`/trainer/problems/${problemId}/test-cases`, data);
export const getTestCase = (problemId, testCaseId) => api.get(`/trainer/problems/${problemId}/test-cases/${testCaseId}`);
export const updateTestCase = (problemId, testCaseId, data) => api.patch(`/trainer/problems/${problemId}/test-cases/${testCaseId}`, data);
export const deleteTestCase = (problemId, testCaseId) => api.delete(`/trainer/problems/${problemId}/test-cases/${testCaseId}`);

// Performance
export const getBatchPerformance = (batchId) => api.get(`/trainer/performance/batch/${batchId}`);
export const getStudentPerformance = (studentId, batchId) => api.get(`/trainer/performance/student/${studentId}`, { params: { batchId } });
export const getProblemPerformance = (problemId) => api.get(`/trainer/performance/problem/${problemId}`);

// Collections (Training) & Topics (Days) for Trainer.
// Read access covers every training; write access is limited to trainings this
// trainer created — the server answers 403 for admin-owned or shared curriculum.
// `owned` on each record tells the UI whether it may offer edit/archive actions.
export const getTrainerCollections = (params) => api.get('/trainer/collections', { params });
export const getTrainerCollection = (collectionId) => api.get(`/trainer/collections/${collectionId}`);
export const getTrainerCollectionTopics = (collectionId, params) => api.get(`/trainer/collections/${collectionId}/topics`, { params });
export const createTrainerCollection = (data) => api.post('/trainer/collections', data);
export const updateTrainerCollection = (collectionId, data) => api.patch(`/trainer/collections/${collectionId}`, data);
export const deleteTrainerCollection = (collectionId) => api.delete(`/trainer/collections/${collectionId}`);
export const createTrainerTopic = (collectionId, data) => api.post(`/trainer/collections/${collectionId}/topics`, data);
export const updateTrainerTopic = (collectionId, topicId, data) => api.patch(`/trainer/collections/${collectionId}/topics/${topicId}`, data);
export const deleteTrainerTopic = (collectionId, topicId) => api.delete(`/trainer/collections/${collectionId}/topics/${topicId}`);

// Analytics — authoritative KPIs + leaderboard (solved = ACCEPTED submissions)
export const getTrainerAnalytics = (params) => api.get('/trainer/analytics', { params });
// Per-student detail: overall + per-Day + per-Problem progress (solved = ACCEPTED)
export const getTrainerStudentDetail = (studentId, params) => api.get(`/trainer/analytics/student/${studentId}`, { params });
