import api from './client';

// Students
export const getStudents = () => api.get('/admin/students');
export const createStudent = (data) => api.post('/admin/students', data);
export const updateStudent = (id, data) => api.patch(`/admin/students/${id}`, data);
export const deleteStudent = (id) => api.delete(`/admin/students/${id}`);
export const bulkUploadStudents = (data) => api.post('/admin/students/bulk', data);
export const downloadStudentTemplate = () => api.get('/admin/students/template', { responseType: 'blob' });

// Trainers
export const getTrainers = (params) => api.get('/admin/trainers', { params });
export const createTrainer = (data) => api.post('/admin/trainers', data);
export const getTrainer = (id) => api.get(`/admin/trainers/${id}`);
export const updateTrainer = (id, data) => api.patch(`/admin/trainers/${id}`, data);
export const deleteTrainer = (id) => api.delete(`/admin/trainers/${id}`);
export const deleteTrainerForce = (id) => api.delete(`/admin/trainers/${id}/force`);
export const getTrainerAssignments = (id) => api.get(`/admin/trainers/${id}/assignments`);
export const removeTrainerFromBatch = (batchId) => api.patch(`/admin/batches/${batchId}`, { trainer: null });
export const bulkUploadTrainers = (data) => api.post('/admin/trainers/bulk', data);
export const downloadTrainerTemplate = () => api.get('/admin/trainers/template', { responseType: 'blob' });

// Batches
export const getBatches = () => api.get('/admin/batches');
export const createBatch = (data) => api.post('/admin/batches', data);
export const getBatch = (id) => api.get(`/admin/batches/${id}`);
export const updateBatch = (id, data) => api.patch(`/admin/batches/${id}`, data);
export const deleteBatch = (id) => api.delete(`/admin/batches/${id}`);

// Batch Students (Enrollment)
export const getBatchStudents = (batchId) => api.get(`/admin/batches/${batchId}/students`);
export const enrollStudent = (batchId, studentId) => api.post(`/admin/batches/${batchId}/students`, { studentId });
export const updateStudentEnrollment = (batchId, studentId, status) => api.patch(`/admin/batches/${batchId}/students/${studentId}`, { status });
export const deleteStudentEnrollment = (batchId, studentId) => api.delete(`/admin/batches/${batchId}/students/${studentId}`);

// Problems
export const getAdminProblems = (params) => api.get('/admin/problems', { params });
export const getAdminProblem = (id) => api.get(`/admin/problems/${id}`);
export const createAdminProblem = (data) => api.post('/admin/problems', data);
export const updateAdminProblem = (id, data) => api.patch(`/admin/problems/${id}`, data);
export const deleteAdminProblem = (id) => api.delete(`/admin/problems/${id}`);
export const bulkImportProblems = (data) => api.post('/admin/problems/import', data);
export const importPreviewProblems = (data) => api.post('/admin/problems/import/preview', data);
export const updateProblemConflict = (id, data) => api.patch(`/admin/problems/${id}`, data);
export const downloadProblemTemplate = () => api.get('/admin/problems/template', { responseType: 'blob' });
// Collections
export const getAdminCollections = (params) => api.get('/admin/collections', { params });
export const getAdminCollection = (id) => api.get(`/admin/collections/${id}`);
export const createAdminCollection = (data) => api.post('/admin/collections', data);
export const updateAdminCollection = (id, data) => api.patch(`/admin/collections/${id}`, data);
export const deleteAdminCollection = (id) => api.delete(`/admin/collections/${id}`);
// Topics
export const getAdminTopics = (collectionId, params) => api.get(`/admin/collections/${collectionId}/topics`, { params });
export const getAdminTopic = (topicId) => api.get(`/admin/topics/${topicId}`);
export const createAdminTopic = (collectionId, data) => api.post(`/admin/collections/${collectionId}/topics`, data);
export const updateAdminTopic = (topicId, data) => api.patch(`/admin/topics/${topicId}`, data);
export const deleteAdminTopic = (topicId) => api.delete(`/admin/topics/${topicId}`);
// Topic Problems
export const getAdminTopicProblems = (topicId, params) => api.get(`/admin/topics/${topicId}/problems`, { params });
export const linkAdminTopicProblems = (topicId, data) => api.put(`/admin/topics/${topicId}/problems`, data);


// Test Cases (admin)
export const getAdminTestCases = (problemId) => api.get(`/admin/problems/${problemId}/test-cases`);
export const getAdminTestCase = (problemId, testCaseId) => api.get(`/admin/problems/${problemId}/test-cases/${testCaseId}`);
export const createAdminTestCase = (problemId, data) => api.post(`/admin/problems/${problemId}/test-cases`, data);
export const updateAdminTestCase = (problemId, testCaseId, data) => api.patch(`/admin/problems/${problemId}/test-cases/${testCaseId}`, data);
export const deleteAdminTestCase = (problemId, testCaseId) => api.delete(`/admin/problems/${problemId}/test-cases/${testCaseId}`);
// Users
export const getUsers = (params) => api.get('/admin/users', { params });
export const getUser = (id) => api.get(`/admin/users/${id}`);
export const createUser = (data) => api.post('/admin/users', data);
export const updateUser = (id, data) => api.patch(`/admin/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/admin/users/${id}`);

// Submissions (admin)
export const getAdminSubmissions = (params) => api.get('/admin/submissions', { params });
export const getAdminSubmission = (id) => api.get(`/admin/submissions/${id}`);
export const deleteAdminSubmission = (id) => api.delete(`/admin/submissions/${id}`);

// Settings (admin)
export const getAdminSettings = () => api.get('/admin/settings');
export const updateAdminSettings = (data) => api.patch('/admin/settings', data);

// Reports
export const getAdminReportsOverview = () => api.get('/admin/reports/overview');
export const getAdminSubmissionReports = (params) => api.get('/admin/reports/submissions', { params });
export const getAdminBatchReports = (params) => api.get('/admin/reports/batches', { params });
export const getAdminStudentReports = (params) => api.get('/admin/reports/students', { params });
export const getAdminProblemReports = (params) => api.get('/admin/reports/problems', { params });

// Platform Activity
export const getAdminPlatformActivity = (range) => api.get(`/admin/platform-activity?range=${range}`);

// Recent Activity
export const getAdminRecentActivity = (limit) => api.get(`/admin/recent-activity?limit=${limit}`);

// System Health
export const getAdminSystemHealth = () => api.get('/admin/system/health');
export const getAdminSystemMetrics = () => api.get('/admin/system/metrics');
