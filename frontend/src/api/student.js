import api from './client';

export const createSubmission = (data) => api.post('/student/submissions', data);
export const getSubmissions = () => api.get('/student/submissions');
export const getSubmission = (id) => api.get(`/student/submissions/${id}`);
