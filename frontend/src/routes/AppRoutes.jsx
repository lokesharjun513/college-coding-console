import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../components/Login';
import AdminDashboard from '../pages/admin/Index';
import Trainers from '../pages/admin/Trainers';
import TrainerDetails from '../pages/admin/TrainerDetails';
import Students from '../pages/admin/Students';
import Batches from '../pages/admin/Batches';
import AdminBatchDetails from '../pages/admin/BatchDetails';
import AdminBatchStudentsList from '../pages/admin/BatchStudentsList';
import Users from '../pages/admin/Users';
import AdminProblemsList from '../pages/admin/ProblemsList';
import AdminProblemEditor from '../pages/admin/ProblemEditor';
import AdminTestCasesList from '../pages/admin/TestCasesList';
import TrainerLayout from '../pages/trainer/TrainerLayout';
import TrainerDashboard from '../pages/trainer/Index';
import TrainerBatchesList from '../pages/trainer/BatchesList';
import TrainerBatchDetails from '../pages/trainer/BatchDetails';
import TrainerBatchStudentsList from '../pages/trainer/BatchStudentsList';
import TrainerStudents from '../pages/trainer/Students';
import TrainerProblemsList from '../pages/trainer/ProblemsList';
import TrainerProblemDetails from '../pages/trainer/ProblemDetails';
import TrainerProblemEditor from '../pages/trainer/ProblemEditor';
import TrainerBatchPerformance from '../pages/trainer/Performance/BatchPerformance';
import TrainerStudentPerformance from '../pages/trainer/Performance/StudentPerformance';
import TrainerProblemPerformance from '../pages/trainer/Performance/ProblemPerformance';
import TrainerTestCasesList from '../pages/trainer/TestCasesList';
import TrainerEnrollmentDetails from '../pages/trainer/EnrollmentDetails';
import TrainerProfile from '../pages/trainer/TrainerProfile';
import Practice from '../pages/student/Practice';
import FreeConsole from '../pages/student/FreeConsole';
import Performance from '../pages/student/Performance';
import StudentDashboard from '../pages/student/StudentDashboard';
import StudentProblems from '../pages/student/Problems';
import StudentProblemDetail from '../pages/student/ProblemDetail';
import StudentLayout from '../pages/student/StudentLayout';
import Profile from '../pages/Profile';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';
import Reports from '../pages/admin/Reports';
import SubmissionsList from '../pages/admin/SubmissionsList';
import SubmissionDetail from '../pages/admin/SubmissionDetail';
import AdminSettings from '../pages/admin/Settings';
import SystemHealth from '../pages/admin/SystemHealth';
import AdminLayout from '../pages/admin/AdminLayout';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Admin area */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['ADMIN']}>
                <AdminLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="trainers" element={<Trainers />} />
          <Route path="trainers/:id" element={<TrainerDetails />} />
          <Route path="students" element={<Students />} />
          <Route path="batches" element={<Batches />} />
          <Route path="batches/:batchId" element={<AdminBatchDetails />} />
          <Route path="batches/:batchId/students" element={<AdminBatchStudentsList />} />
          <Route path="users" element={<Users />} />
          <Route path="problems/*" element={<AdminProblemsList />} />
          <Route path="problems/create" element={<AdminProblemEditor />} />
          <Route path="problems/:problemId" element={<AdminProblemEditor />} />
          <Route path="problems/:problemId/edit" element={<AdminProblemEditor />} />
          <Route path="problems/:problemId/testcases" element={<AdminTestCasesList />} />
          <Route path="reports" element={<Reports />} />
          <Route path="submissions" element={<SubmissionsList />} />
          <Route path="submissions/:id" element={<SubmissionDetail />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="system-health" element={<SystemHealth />} />
        </Route>

        {/* Trainer area */}
        <Route
          path="/trainer/*"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['TRAINER']}>
                <TrainerLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<TrainerDashboard />} />
          <Route path="batches" element={<TrainerBatchesList />} />
          <Route path="students" element={<TrainerStudents />} />
          <Route path="batches/:batchId/students" element={<TrainerBatchStudentsList />} />
          <Route path="batches/:batchId/students/:studentId/performance" element={<TrainerStudentPerformance />} />
          <Route path="batches/:batchId" element={<TrainerBatchDetails />} />
          <Route path="batches/:batchId/performance" element={<TrainerBatchPerformance />} />
          <Route path="batches/:batchId/problems" element={<TrainerProblemsList />} />
          <Route path="batches/:batchId/problems/create" element={<TrainerProblemEditor />} />
          <Route path="batches/:batchId/problems/:problemId" element={<TrainerProblemDetails />} />
          <Route path="batches/:batchId/problems/:problemId/performance" element={<TrainerProblemPerformance />} />
          <Route path="batches/:batchId/problems/:problemId/testcases" element={<TrainerTestCasesList />} />
          <Route path="batches/:batchId/problems/:problemId/edit" element={<TrainerProblemEditor />} />
          <Route path="batches/:batchId/students/:studentId" element={<TrainerEnrollmentDetails />} />
        </Route>

        {/* Trainer Profile (shared with general profile route) */}
        <Route
          path="/trainer/profile"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['TRAINER']}>
                <TrainerProfile />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        {/* Student area */}
        <Route
          path="/student/*"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT']}>
                <StudentLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<StudentDashboard />} />
          <Route path="practice" element={<Practice />} />
          <Route path="freeconsole" element={<FreeConsole />} />
          <Route path="performance" element={<Performance />} />
          <Route path="problems" element={<StudentProblems />} />
          <Route path="problems/:id" element={<StudentProblemDetail />} />
        </Route>

        {/* Profile page (accessible to any authenticated user) */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Catch‑all redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
