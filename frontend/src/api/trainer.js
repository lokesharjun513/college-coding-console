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
export const getBatchProblems = (batchId) => api.get(`/trainer/batches/${batchId}/problems`);
export const createProblem = (batchId, data) => api.post(`/trainer/batches/${batchId}/problems`, data);
export const getProblem = (batchId, problemId) => api.get(`/trainer/batches/${batchId}/problems/${problemId}`);
export const updateProblem = (batchId, problemId, data) => api.patch(`/trainer/batches/${batchId}/problems/${problemId}`, data);
export const deleteProblem = (batchId, problemId) => api.delete(`/trainer/batches/${batchId}/problems/${problemId}`);

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

