import api from '../api.js';

export const createSubmission = (data) => api.post('/student/submissions', data);
export const getSubmissions = () => api.get('/student/submissions');
export const getStudentSubmissions = () => api.get('/student/submissions');
export const getSubmission = (id) => api.get(`/student/submissions/${id}`);
export const getStudentDashboard = () => api.get('/student/dashboard');
export const getStudentPerformance = (params) => api.get('/student/performance', { params });
export const getStudentLeaderboard = (params) => api.get('/student/leaderboard', { params });
export const getStudentProblems = () => api.get('/student/problems');
/**
 * Trainer-assigned problems for the batches this student is actively enrolled
 * in. Scoped and paginated server-side; `batchId` is validated against the
 * student's own memberships by the backend rather than trusted from here.
 */
export const getStudentAssignedProblems = (params = {}) =>
  api.get('/student/problems', { params: { scope: 'BATCH', ...params } });
/**
 * The global problem library behind /student/practice: problems published with
 * `scope: 'GLOBAL'`. Batch-scoped trainer assignments are excluded server-side
 * by the query itself, so no batch membership is needed and nothing from a
 * trainer's curriculum can appear here.
 *
 * Supported query: `search`, `difficulty` (EASY|MEDIUM|HARD), `status`
 * (NOT_STARTED|ATTEMPTED|SOLVED), `topic`, `page`, `pageSize`. All filters are
 * applied before pagination; the response is
 * `{ success, data, meta: { scope, counts, completionPercentage, difficulties, topics, pagination } }`.
 */
export const getStudentGlobalProblems = (params = {}) =>
  api.get('/student/problems', { params: { scope: 'GLOBAL', ...params } });
/**
 * The whole Practice tree — Collection → Topic → Problems — in one request.
 *
 * Replaces the previous chain of `/student/collections` →
 * `/student/collections/:id/topics` → `/student/topics/:id/problems`, which was
 * one request per collection and per topic, listed the student's own BATCH
 * curriculum, and could not search across the tree at all.
 *
 * Only ACTIVE GLOBAL curriculum and PUBLISHED GLOBAL problems are returned; the
 * scope is applied server-side, so a trainer's batch assignment cannot appear
 * here. Supported query: `search`, `difficulty`, `status`, `topic`. The response
 * is
 * `{ success, data: [{ id, name, topicCount, problemCount, topics: [{ id, name, problemCount, problems: [...] }] }],
 *    meta: { scope, filtering, counts: { collections, topics, problems, solved, attempted, notStarted },
 *            completionPercentage, difficulties, topics } }`.
 *
 * Counts describe exactly what `data` displays, so rows and header cannot
 * disagree; a problem linked to several topics appears in each of them but is
 * counted once per collection and once overall.
 */
export const getStudentPracticeLibrary = (params = {}) =>
  api.get('/student/practice/library', { params });
export const getStudentProblem = (id) => api.get(`/student/problems/${id}`);
export const runStudentProblem = (id, data) => api.post(`/student/problems/${id}/run`, data);
export const runStudentTests = (id, data) => api.post(`/student/problems/${id}/run-tests`, data);
export const runFreeConsoleCode = (data) => api.post('/student/console/run', data);
/**
 * The languages the free console will actually run, served by the console route
 * itself. Requested instead of hardcoded so the selector can never offer a
 * language POST /student/console/run would reject with a 400.
 */
export const getStudentConsoleLanguages = () => api.get('/student/console/languages');
export const getStudentCollections = (params) => api.get('/student/collections', { params });
export const getStudentTraining = () => api.get('/student/collections/training');
export const getStudentCollectionTopics = (collectionId, params) => api.get(`/student/collections/${collectionId}/topics`, { params });
export const getStudentTopic = (topicId) => api.get(`/student/topics/${topicId}`);
export const getStudentTopicProblems = (topicId, params) => api.get(`/student/topics/${topicId}/problems`, { params });
export const getStudentNextPracticeProblem = (params) => api.get('/student/practice/next', { params });

// Assignments (open-ended practice — no deadlines)
// Only ACTIVE, non-deleted, already-available assignments in batches where the
// student holds an ACTIVE enrollment are returned. `completed` comes from
// AssignmentCompletion for this student, never from global submission history.
export const getStudentAssignments = () => api.get('/student/assignments');
export const getStudentAssignment = (id) => api.get(`/student/assignments/${id}`);
