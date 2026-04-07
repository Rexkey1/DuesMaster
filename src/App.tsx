import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { InviteAccept } from './components/InviteAccept';
import { Members } from './components/Members';

// Placeholder components for other routes
const Groups = () => <div className="p-8"><h1 className="text-2xl font-bold">Groups Management</h1><p className="text-slate-500">Super Admin only view.</p></div>;
const Payments = () => <div className="p-8"><h1 className="text-2xl font-bold">Payments History</h1><p className="text-slate-500">View all payment records.</p></div>;
const Notifications = () => <div className="p-8"><h1 className="text-2xl font-bold">Notifications</h1><p className="text-slate-500">View payment verification requests.</p></div>;
const Activity = () => <div className="p-8"><h1 className="text-2xl font-bold">Activity Log</h1><p className="text-slate-500">System activity tracking.</p></div>;

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite/:inviteId" element={<InviteAccept />} />
          
          <Route element={<AuthGuard><Layout /></AuthGuard>}>
            <Route path="/" element={<Dashboard />} />
            
            <Route path="/groups" element={
              <AuthGuard allowedRoles={['super_admin']}>
                <Groups />
              </AuthGuard>
            } />
            
            <Route path="/members" element={
              <AuthGuard allowedRoles={['group_admin']}>
                <Members />
              </AuthGuard>
            } />
            
            <Route path="/payments" element={
              <AuthGuard allowedRoles={['group_admin', 'member']}>
                <Payments />
              </AuthGuard>
            } />
            
            <Route path="/notifications" element={
              <AuthGuard allowedRoles={['group_admin', 'member']}>
                <Notifications />
              </AuthGuard>
            } />
            
            <Route path="/activity" element={
              <AuthGuard allowedRoles={['super_admin', 'group_admin']}>
                <Activity />
              </AuthGuard>
            } />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      <Toaster position="top-right" />
    </AuthProvider>
  );
}
