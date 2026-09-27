import api from './client';

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
