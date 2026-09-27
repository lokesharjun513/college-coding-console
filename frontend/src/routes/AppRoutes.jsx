import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../components/Login';
import AdminDashboard from '../pages/admin/Index';
import TrainerDashboard from '../pages/trainer/Index';
import StudentDashboard from '../pages/student/Index';
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
                <TrainerDashboard />
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
                <StudentDashboard />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        {/* Catch‑all redirect based on role or login */}
        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
