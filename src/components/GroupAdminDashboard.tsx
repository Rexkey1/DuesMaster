import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, where, getDocs, orderBy, limit, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Search, 
  Megaphone,
  History,
  Download,
  Filter,
  Trash2
} from 'lucide-react';
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

interface PaymentNotification {
  id: string;
  memberUid: string;
  amount: number;
  reference: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
  memberEmail?: string;
}

interface Group {
  id: string;
  name: string;
  duesTarget: number;
  announcements: { id: string; text: string; date: string }[];
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

export const GroupAdminDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [deleteMemberId, setDeleteMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.groupId) return;

    // Fetch Group
    const unsubGroup = onSnapshot(doc(db, 'groups', profile.groupId), (doc) => {
      if (doc.exists()) setGroup({ id: doc.id, ...doc.data() } as Group);
    });

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
    });

    // Fetch Notifications
    const notificationsQuery = query(
      collection(db, `groups/${profile.groupId}/notifications`), 
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentNotification)));
    });

    // Fetch Activity Logs
    const logsQuery = query(
      collection(db, `groups/${profile.groupId}/activity_logs`),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch Invitations
    const invitationsQuery = query(
      collection(db, 'invitations'),
      where('groupId', '==', profile.groupId),
      orderBy('timestamp', 'desc')
    );
    const unsubInvitations = onSnapshot(invitationsQuery, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubGroup();
      unsubMembers();
      unsubNotifications();
      unsubLogs();
      unsubInvitations();
    };
  }, [profile?.groupId]);

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.groupId || !group) return;
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
          groupName: group.name,
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
      setIsMemberModalOpen(false);
      setNewMemberEmail('');
    } catch (error) {
      console.error("Invite error:", error);
      toast.error("Failed to send invitation.");
    }
  };

  const handleApprovePayment = async (notification: PaymentNotification) => {
    if (!profile?.groupId) return;
    try {
      // 1. Create payment record
      await addDoc(collection(db, `groups/${profile.groupId}/payments`), {
        id: crypto.randomUUID(),
        memberUid: notification.memberUid,
        groupId: profile.groupId,
        amount: notification.amount,
        date: new Date().toISOString(),
        status: 'paid',
        reference: notification.reference
      });

      // 2. Update notification status
      await updateDoc(doc(db, `groups/${profile.groupId}/notifications`, notification.id), {
        status: 'approved'
      });

      // 3. Log activity
      await addDoc(collection(db, `groups/${profile.groupId}/activity_logs`), {
        adminUid: profile.uid,
        action: `Approved payment of ${formatCurrency(notification.amount)} for member ${notification.memberUid}`,
        timestamp: new Date().toISOString()
      });

      toast.success("Payment approved!");
    } catch (error) {
      toast.error("Failed to approve payment.");
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

  const handleRejectPayment = async (id: string) => {
    if (!profile?.groupId) return;
    try {
      await updateDoc(doc(db, `groups/${profile.groupId}/notifications`, id), {
        status: 'rejected'
      });
      toast.success("Payment rejected.");
    } catch (error) {
      toast.error("Failed to reject payment.");
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.groupId || !group) return;
    try {
      const newAnn = { id: crypto.randomUUID(), text: newAnnouncement, date: new Date().toISOString() };
      await updateDoc(doc(db, 'groups', profile.groupId), {
        announcements: [newAnn, ...(group.announcements || [])]
      });
      toast.success("Announcement posted!");
      setIsAnnouncementModalOpen(false);
      setNewAnnouncement('');
    } catch (error) {
      toast.error("Failed to post announcement.");
    }
  };

  const filteredMembers = members.filter(m => 
    m.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCollected = members.reduce((sum, m) => sum + m.totalPaid, 0);
  const totalTarget = (group?.duesTarget || 0) * members.length;
  const collectionRate = totalTarget > 0 ? (totalCollected / totalTarget) * 100 : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{group?.name || 'Group Dashboard'}</h1>
          <p className="text-slate-500">Manage members, dues, and payments for your group.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsAnnouncementModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Megaphone className="w-5 h-5" />
            Announcement
          </button>
          <button 
            onClick={() => setIsMemberModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
          >
            <Plus className="w-5 h-5" />
            Invite Member
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">Active</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Total Members</p>
          <p className="text-2xl font-bold text-slate-900">{members.length}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{collectionRate.toFixed(1)}%</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Total Collected</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalCollected)}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Outstanding Balance</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalTarget - totalCollected)}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Individual Target</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(group?.duesTarget || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Member Ledger */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Member Payment Ledger</h2>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search members..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all w-full sm:w-48"
                  />
                </div>
                <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-6 py-4">Member</th>
                    <th className="px-6 py-4">Paid</th>
                    <th className="px-6 py-4">Balance</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => {
                    const balance = (group?.duesTarget || 0) - member.totalPaid;
                    const isPaid = balance <= 0;
                    return (
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
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">{formatCurrency(member.totalPaid)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">{formatCurrency(Math.max(0, balance))}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            isPaid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                          )}>
                            {isPaid ? 'Fully Paid' : 'Owing'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => setDeleteMemberId(member.uid)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove from group"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
              <History className="w-5 h-5 text-slate-400" />
            </div>
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-4">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-700">{log.action}</p>
                    <p className="text-xs text-slate-400">{format(new Date(log.timestamp), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No recent activity.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Notifications & Announcements */}
        <div className="space-y-8">
          {/* Payment Notifications */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              Verification Requests
              {notifications.filter(n => n.status === 'pending').length > 0 && (
                <span className="w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
                  {notifications.filter(n => n.status === 'pending').length}
                </span>
              )}
            </h2>
            <div className="space-y-4">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(n.amount)}</p>
                      <p className="text-xs text-slate-500">Ref: {n.reference}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                      n.status === 'pending' ? "bg-amber-100 text-amber-700" :
                      n.status === 'approved' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {n.status}
                    </span>
                  </div>
                  {n.status === 'pending' && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleApprovePayment(n)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                      <button 
                        onClick={() => handleRejectPayment(n.id)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No pending requests.</p>
              )}
            </div>
          </div>

          {/* Pending Invitations */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              Pending Invitations
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

          {/* Announcements */}
          <div className="bg-indigo-900 rounded-2xl shadow-sm p-6 text-white">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-indigo-400" />
              Announcements
            </h2>
            <div className="space-y-6">
              {group?.announcements?.slice(0, 3).map((ann) => (
                <div key={ann.id} className="space-y-1">
                  <p className="text-sm text-indigo-100">{ann.text}</p>
                  <p className="text-[10px] text-indigo-400">{format(new Date(ann.date), 'MMM d, yyyy')}</p>
                </div>
              ))}
              {(!group?.announcements || group.announcements.length === 0) && (
                <p className="text-sm text-indigo-300 text-center py-4">No announcements yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {isAnnouncementModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Post Announcement</h2>
            <form onSubmit={handlePostAnnouncement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea 
                  required
                  rows={4}
                  value={newAnnouncement}
                  onChange={(e) => setNewAnnouncement(e.target.value)}
                  placeholder="Type your message to members..."
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMemberModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Invite New Member</h2>
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
                  onClick={() => setIsMemberModalOpen(false)}
                  className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Send Invitation
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
