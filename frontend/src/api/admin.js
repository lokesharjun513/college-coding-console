import api from './client';

// Trainers
export const getTrainers = () => api.get('/admin/trainers');
export const createTrainer = (data) => api.post('/admin/trainers', data);
export const getTrainer = (id) => api.get(`/admin/trainers/${id}`);
export const updateTrainer = (id, data) => api.patch(`/admin/trainers/${id}`, data);
export const deleteTrainer = (id) => api.delete(`/admin/trainers/${id}`);

// Batches
export const getBatches = () => api.get('/admin/batches');
export const createBatch = (data) => api.post('/admin/batches', data);
export const getBatch = (id) => api.get(`/admin/batches/${id}`);
export const updateBatch = (id, data) => api.patch(`/admin/batches/${id}`, data);
export const deleteBatch = (id) => api.delete(`/admin/batches/${id}`);
