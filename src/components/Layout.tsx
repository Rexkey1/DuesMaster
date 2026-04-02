import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Bell, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  ShieldCheck,
  Building2,
  History
} from 'lucide-react';
import { auth } from '../firebase';
import { cn } from '../lib/utils';

export const Layout: React.FC = () => {
  const { profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['super_admin', 'group_admin', 'member'] },
    { name: 'Groups', href: '/groups', icon: Building2, roles: ['super_admin'] },
    { name: 'Members', href: '/members', icon: Users, roles: ['group_admin'] },
    { name: 'Payments', href: '/payments', icon: CreditCard, roles: ['group_admin', 'member'] },
    { name: 'Notifications', href: '/notifications', icon: Bell, roles: ['group_admin', 'member'] },
    { name: 'Activity Log', href: '/activity', icon: History, roles: ['super_admin', 'group_admin'] },
  ];

  const filteredNavigation = navigation.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  const handleLogout = () => auth.signOut();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar for Desktop */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-indigo-900 text-white transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-400" />
            <span className="text-xl font-bold tracking-tight">DuesMaster</span>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {filteredNavigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === item.href 
                    ? "bg-indigo-800 text-white" 
                    : "text-indigo-200 hover:bg-indigo-800 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </a>
            ))}
          </nav>

          <div className="p-4 border-t border-indigo-800">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold">
                {profile?.displayName?.[0] || profile?.email?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.displayName || profile?.email}</p>
                <p className="text-xs text-indigo-400 truncate capitalize">{profile?.role.replace('_', ' ')}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-indigo-200 hover:bg-indigo-800 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header for Mobile */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <span className="font-bold text-slate-900">DuesMaster</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
          >
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};
