import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, where, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, Trash2, Search, Mail, KeyRound } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatCurrency, cn } from '../lib/utils';
import { format } from 'date-fns';

interface Member {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  totalPaid: number;
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

export const Members: React.FC = () => {
  const { profile } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isManualAddModalOpen, setIsManualAddModalOpen] = useState(false);
  
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  const [deleteMemberId, setDeleteMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.groupId) return;

    // Fetch Members
    const membersQuery = query(collection(db, 'users'), where('groupId', '==', profile.groupId));
    const unsubMembers = onSnapshot(membersQuery, async (snapshot) => {
      const membersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Member));
      
      // For each member, fetch their total paid
      const membersWithPayments = await Promise.all(membersData.map(async (m) => {
        const paymentsQuery = query(collection(db, `groups/${profile.groupId}/payments`), where('memberUid', '==', m.uid));
        const paymentsSnap = await getDocs(paymentsQuery);
        const totalPaid = paymentsSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        return { ...m, totalPaid };
      }));
      
      setMembers(membersWithPayments);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Fetch Invitations
    const invitationsQuery = query(
      collection(db, 'invitations'),
      where('groupId', '==', profile.groupId)
    );
    const unsubInvitations = onSnapshot(invitationsQuery, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubMembers();
      unsubInvitations();
    };
  }, [profile?.groupId]);

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.groupId) return;
    setIsCreating(true);
    try {
      const inviteId = crypto.randomUUID();
      const inviteLink = `${window.location.origin}/invite/${inviteId}`;

      // 1. Create invitation in Firestore
      try {
        await setDoc(doc(db, 'invitations', inviteId), {
          id: inviteId,
          email: newMemberEmail,
          groupId: profile.groupId,
          role: 'member',
          status: 'pending',
          invitedBy: profile.displayName || profile.email,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        if (error.message?.includes('insufficient permissions')) {
          handleFirestoreError(error, OperationType.WRITE, `invitations/${inviteId}`);
        }
        throw error;
      }

      // 2. Send automated email via API
      const response = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newMemberEmail,
          groupName: 'Your Group',
          role: 'member',
          invitedBy: profile.displayName || profile.email,
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
        toast.success("Invitation created! (Check console for link due to Resend restrictions)");
      } else {
        toast.success("Invitation sent successfully!");
      }
      setIsInviteModalOpen(false);
      setNewMemberEmail('');
    } catch (error) {
      console.error("Invite error:", error);
      toast.error("Failed to send invitation.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleManualAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.groupId) return;
    if (newMemberPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }
    
    setIsCreating(true);
    try {
      const normalizedEmail = newMemberEmail.toLowerCase().trim();
      
      // Create user_roles entry to pre-approve the member and save temporary password
      await setDoc(doc(db, 'user_roles', normalizedEmail), {
        email: normalizedEmail,
        role: 'member',
        groupId: profile.groupId,
        tempPassword: newMemberPassword, // Save password for lazy account creation
        createdAt: new Date().toISOString()
      });

      toast.success(`Member added! They can now log in with the provided credentials.`);
      setIsManualAddModalOpen(false);
      setNewMemberEmail('');
      setNewMemberPassword('');
    } catch (error: any) {
      console.error("Error adding member manually:", error);
      if (error.message?.includes('insufficient permissions')) {
        handleFirestoreError(error, OperationType.WRITE, `user_roles/${newMemberEmail}`);
      }
      toast.error("Failed to add member.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (!profile?.groupId) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        groupId: null,
        role: 'member' // Reset to basic member role
      });
      toast.success("Member removed from group.");
      setDeleteMemberId(null);
    } catch (error) {
      console.error("Remove member error:", error);
      toast.error("Failed to remove member.");
    }
  };

  const filteredMembers = members.filter(m => 
    m.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Members Management</h1>
          <p className="text-slate-500">View and manage all members in your group.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Mail className="w-5 h-5" />
            Email Invite
          </button>
          <button 
            onClick={() => setIsManualAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
          >
            <Plus className="w-5 h-5" />
            Add Member Manually
          </button>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">All Members</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search members..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all w-full sm:w-64"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Total Paid</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMembers.map((member) => (
                <tr key={member.uid} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                        {member.displayName?.[0] || member.email?.[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{member.displayName || member.email}</p>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 capitalize">
                      {member.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                    {formatCurrency(member.totalPaid)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {member.uid !== profile?.uid && (
                      <button 
                        onClick={() => setDeleteMemberId(member.uid)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove from group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations Section */}
      {invitations.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Pending Invitations</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((invite) => (
                  <tr key={invite.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{invite.email}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        invite.status === 'pending' ? "bg-amber-100 text-amber-800" :
                        invite.status === 'accepted' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      )}>
                        {invite.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {format(new Date(invite.timestamp), 'MMM d, yyyy h:mm a')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Email Invitation</h2>
            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Member Email</label>
                <input 
                  type="email" 
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">An invitation email will be sent to this address.</p>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isCreating ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {isManualAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Add Member Manually</h2>
            <form onSubmit={handleManualAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Member Email</label>
                <input 
                  type="email" 
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password</label>
                <input 
                  type="password" 
                  required
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">The member will use this to log in for the first time.</p>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsManualAddModalOpen(false)}
                  className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isCreating ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation */}
      {deleteMemberId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Remove Member?</h2>
            <p className="text-slate-500 mb-8 text-sm">
              This will remove the member from this group. Their payment history will be preserved but they will no longer have access to this group's dashboard.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteMemberId(null)}
                className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleRemoveMember(deleteMemberId)}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-100"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
