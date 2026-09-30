import api from '../api.js';

export const createSubmission = (data) => api.post('/student/submissions', data);
export const getSubmissions = () => api.get('/student/submissions');
export const getStudentSubmissions = () => api.get('/student/submissions');
export const getSubmission = (id) => api.get(`/student/submissions/${id}`);
export const getStudentDashboard = () => api.get('/student/dashboard');
export const getStudentProblems = () => api.get('/student/problems');
export const getStudentProblem = (id) => api.get(`/student/problems/${id}`);
export const runStudentProblem = (id, data) => api.post(`/student/problems/${id}/run`, data);
export const runFreeConsoleCode = (data) => api.post('/student/console/run', data);
export const getCompilers = () => api.get('/student/compilers');
export const getStudentCollections = (params) => api.get('/student/collections', { params });
export const getStudentCollectionTopics = (collectionId, params) => api.get(`/student/collections/${collectionId}/topics`, { params });
export const getStudentTopic = (topicId) => api.get(`/student/topics/${topicId}`);
export const getStudentTopicProblems = (topicId, params) => api.get(`/student/topics/${topicId}/problems`, { params });
