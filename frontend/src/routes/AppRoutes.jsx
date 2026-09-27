import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../components/Login';
import AdminDashboard from '../pages/admin/Index';
import TrainerLayout from '../pages/trainer/TrainerLayout';
import TrainerDashboard from '../pages/trainer/Index';
import BatchesList from '../pages/trainer/BatchesList';
import BatchDetails from '../pages/trainer/BatchDetails';
import BatchStudentsList from '../pages/trainer/BatchStudentsList';
import ProblemsList from '../pages/trainer/ProblemsList';
import ProblemDetails from '../pages/trainer/ProblemDetails';
import ProblemEditor from '../pages/trainer/ProblemEditor';
import BatchPerformance from '../pages/trainer/Performance/BatchPerformance';
import StudentPerformance from '../pages/trainer/Performance/StudentPerformance';
import ProblemPerformance from '../pages/trainer/Performance/ProblemPerformance';
import TestCasesList from '../pages/trainer/TestCasesList';
import StudentDashboard from '../pages/student/Dashboard';
import StudentLayout from '../pages/student/StudentLayout';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Admin area */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
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
          <Route path="batches" element={<BatchesList />} />
          <Route path="batches/:batchId/students" element={<BatchStudentsList />} />
          <Route path="batches/:batchId/students/:studentId/performance" element={<StudentPerformance />} />
          <Route path="batches/:batchId" element={<BatchDetails />} />
          <Route path="batches/:batchId/performance" element={<BatchPerformance />} />
          <Route path="batches/:batchId/problems" element={<ProblemsList />} />
          <Route path="batches/:batchId/problems/create" element={<ProblemEditor />} />
          <Route path="batches/:batchId/problems/:problemId" element={<ProblemDetails />} />
          <Route path="batches/:batchId/problems/:problemId/performance" element={<ProblemPerformance />} />
          <Route path="batches/:batchId/problems/:problemId/testcases" element={<TestCasesList />} />
          <Route path="batches/:batchId/problems/:problemId/edit" element={<ProblemEditor />} />
        </Route>
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
          {/* Additional student routes can be added here */}
        </Route>
        {/* Catch‑all redirect based on role or login */}
        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
