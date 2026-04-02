import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDocs, where, setDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Building2, Users, CreditCard, Plus, Trash2, UserPlus, Search, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatCurrency, cn } from '../lib/utils';
import { format } from 'date-fns';

interface Group {
  id: string;
  name: string;
  adminUid: string;
  duesTarget: number;
  adminEmail?: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const SuperAdminDashboard: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [duesTarget, setDuesTarget] = useState(100);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'groups'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setGroups(groupsData);
      setLoading(false);
    });

    // Fetch Invitations
    const invQ = query(collection(db, 'invitations'), where('role', '==', 'group_admin'), orderBy('timestamp', 'desc'));
    const unsubInv = onSnapshot(invQ, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribe();
      unsubInv();
    };
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Create group (initially without adminUid if not found, or just create it)
      let groupRef;
      try {
        groupRef = await addDoc(collection(db, 'groups'), {
          name: newGroupName,
          adminUid: 'pending', // Will be updated when invite is accepted
          duesTarget,
          currency: 'GH₵',
          announcements: [],
          createdAt: new Date().toISOString()
        });
      } catch (error: any) {
        if (error.message?.includes('insufficient permissions')) {
          handleFirestoreError(error, OperationType.CREATE, 'groups');
        }
        throw error;
      }

      // 2. Create invitation
      const inviteId = crypto.randomUUID();
      const inviteLink = `${window.location.origin}/invite/${inviteId}`;

      try {
        await setDoc(doc(db, 'invitations', inviteId), {
          id: inviteId,
          email: adminEmail,
          groupId: groupRef.id,
          role: 'group_admin',
          status: 'pending',
          invitedBy: 'Super Admin',
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        if (error.message?.includes('insufficient permissions')) {
          handleFirestoreError(error, OperationType.WRITE, `invitations/${inviteId}`);
        }
        throw error;
      }

      // 3. Send automated email via API
      const response = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          groupName: newGroupName,
          role: 'group_admin',
          invitedBy: 'Super Admin',
          inviteLink
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Email API error:", errorData);
        throw new Error(errorData.error?.message || errorData.error || 'Failed to send email');
      }

      const result = await response.json();
      if (result.fallback) {
        toast.success(`Group created! (Email logged to console due to Resend restrictions)`);
      } else {
        toast.success(`Group created and invitation sent to ${adminEmail}!`);
      }
      setIsModalOpen(false);
      setNewGroupName('');
      setAdminEmail('');
    } catch (error) {
      console.error("Error creating group:", error);
      toast.error("Failed to create group.");
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'groups', id));
      toast.success("Group deleted.");
      setDeleteConfirmId(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete group.");
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Super Admin Dashboard</h1>
          <p className="text-slate-500">Manage groups and system-wide settings.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
        >
          <Plus className="w-5 h-5" />
          Create New Group
        </button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Groups</p>
            <p className="text-2xl font-bold text-slate-900">{groups.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Pending Admin Invites</p>
            <p className="text-2xl font-bold text-slate-900">{invitations.filter(i => i.status === 'pending').length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Groups List */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Active Groups</h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search groups..." 
                className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all w-64"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-4">Group Name</th>
                  <th className="px-6 py-4">Admin UID</th>
                  <th className="px-6 py-4">Dues Target</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map((group) => (
                  <tr key={group.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{group.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {group.adminUid === 'pending' ? (
                        <span className="text-amber-600 font-medium italic">Pending Invite</span>
                      ) : group.adminUid}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 font-semibold">{formatCurrency(group.duesTarget)}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setDeleteConfirmId(group.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {groups.length === 0 && !loading && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No groups found. Create your first group to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invitations Sidebar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            Admin Invitations
            {invitations.filter(i => i.status === 'pending').length > 0 && (
              <span className="w-5 h-5 bg-indigo-500 text-white text-[10px] flex items-center justify-center rounded-full">
                {invitations.filter(i => i.status === 'pending').length}
              </span>
            )}
          </h2>
          <div className="space-y-4">
            {invitations.map((invite) => (
              <div key={invite.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{invite.email}</p>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                    invite.status === 'pending' ? "bg-amber-100 text-amber-700" :
                    invite.status === 'accepted' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}>
                    {invite.status}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Sent: {format(new Date(invite.timestamp), 'MMM d, h:mm a')}</p>
              </div>
            ))}
            {invitations.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">No invitations sent yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Create New Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Group Name</label>
                <input 
                  type="text" 
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. St. Peters Alumni"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Admin Email</label>
                <input 
                  type="email" 
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">An invitation email will be sent to this address.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dues Target (GH₵)</label>
                <input 
                  type="number" 
                  required
                  value={duesTarget}
                  onChange={(e) => setDuesTarget(Number(e.target.value))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Group?</h2>
            <p className="text-slate-500 mb-8 text-sm">
              This action cannot be undone. All group data will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDeleteGroup(deleteConfirmId)}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
