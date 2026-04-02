import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { GroupAdminDashboard } from './GroupAdminDashboard';
import { MemberDashboard } from './MemberDashboard';

export const Dashboard: React.FC = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
        <p className="text-slate-500 font-medium">Setting up your profile...</p>
      </div>
    );
  }

  switch (profile.role) {
    case 'super_admin':
      return <SuperAdminDashboard />;
    case 'group_admin':
      return <GroupAdminDashboard />;
    case 'member':
      return <MemberDashboard />;
    default:
      return <Navigate to="/login" replace />;
  }
};
