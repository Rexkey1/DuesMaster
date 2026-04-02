import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, where, orderBy, limit, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Megaphone,
  Plus,
  History,
  Send
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatCurrency, cn } from '../lib/utils';
import { format } from 'date-fns';
import { motion } from 'motion/react';

interface Payment {
  id: string;
  amount: number;
  date: string;
  reference: string;
}

interface PaymentNotification {
  id: string;
  amount: number;
  reference: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

interface Group {
  id: string;
  name: string;
  duesTarget: number;
  announcements: { id: string; text: string; date: string }[];
}

export const MemberDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (!profile?.groupId) return;

    // Fetch Group
    const unsubGroup = onSnapshot(doc(db, 'groups', profile.groupId), (doc) => {
      if (doc.exists()) setGroup({ id: doc.id, ...doc.data() } as Group);
    });

    // Fetch Payments
    const paymentsQuery = query(
      collection(db, `groups/${profile.groupId}/payments`), 
      where('memberUid', '==', profile.uid),
      orderBy('date', 'desc')
    );
    const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
    });

    // Fetch Notifications
    const notificationsQuery = query(
      collection(db, `groups/${profile.groupId}/notifications`), 
      where('memberUid', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentNotification)));
    });

    return () => {
      unsubGroup();
      unsubPayments();
      unsubNotifications();
    };
  }, [profile?.groupId, profile?.uid]);

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.groupId) return;
    try {
      await addDoc(collection(db, `groups/${profile.groupId}/notifications`), {
        id: crypto.randomUUID(),
        memberUid: profile.uid,
        groupId: profile.groupId,
        amount: Number(amount),
        reference,
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      toast.success("Payment verification request sent to admin!");
      setIsModalOpen(false);
      setAmount('');
      setReference('');
    } catch (error) {
      toast.error("Failed to send request.");
    }
  };

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const duesTarget = group?.duesTarget || 0;
  const balance = Math.max(0, duesTarget - totalPaid);
  const progress = duesTarget > 0 ? (totalPaid / duesTarget) * 100 : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Welcome, {profile?.displayName || 'Member'}</h1>
          <p className="text-slate-500">Track your dues and payment history for {group?.name}.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          Confirm Payment
        </button>
      </header>

      {/* Progress Card */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-8">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Payment Journey</p>
            <h2 className="text-4xl font-black text-slate-900">{progress.toFixed(0)}% <span className="text-xl font-bold text-slate-400">Completed</span></h2>
          </div>
          <div className="flex gap-8">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">Total Paid</p>
              <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">Balance Owed</p>
              <p className="text-2xl font-black text-amber-600">{formatCurrency(balance)}</p>
            </div>
          </div>
        </div>
        <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress)}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              progress >= 100 ? "bg-emerald-500" : "bg-indigo-600"
            )}
          />
        </div>
        <div className="mt-4 flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
          <span>Start</span>
          <span>Target: {formatCurrency(duesTarget)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Payment History */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Payment History</h2>
              <History className="w-5 h-5 text-slate-400" />
            </div>
            <div className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <div key={payment.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(payment.amount)}</p>
                      <p className="text-xs text-slate-500">{format(new Date(payment.date), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-400">Ref: {payment.reference}</p>
                    <span className="text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Verified</span>
                  </div>
                </div>
              ))}
              {payments.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  No payments recorded yet.
                </div>
              )}
            </div>
          </div>

          {/* Announcements */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Group Announcements</h2>
              <Megaphone className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="space-y-6">
              {group?.announcements?.map((ann) => (
                <div key={ann.id} className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                  <p className="text-sm text-indigo-900 mb-2">{ann.text}</p>
                  <p className="text-xs text-indigo-400 font-medium">{format(new Date(ann.date), 'MMM d, yyyy')}</p>
                </div>
              ))}
              {(!group?.announcements || group.announcements.length === 0) && (
                <p className="text-sm text-slate-500 text-center py-4">No announcements from your admin.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Status & Verification Requests */}
        <div className="space-y-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-200">
              <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-1">Current Due</p>
              <p className="text-3xl font-black">{formatCurrency(duesTarget)}</p>
            </div>
          </div>

          {/* Verification Requests */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              Pending Verifications
              <Clock className="w-5 h-5 text-amber-500" />
            </h2>
            <div className="space-y-4">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(n.amount)}</p>
                      <p className="text-[10px] text-slate-500">Ref: {n.reference}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                      n.status === 'pending' ? "bg-amber-100 text-amber-700" :
                      n.status === 'approved' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {n.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">{format(new Date(n.timestamp), 'MMM d, h:mm a')}</p>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No pending requests.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-black text-slate-900 mb-2">Confirm Payment</h2>
            <p className="text-slate-500 mb-8 text-sm">Send a verification request to your group admin.</p>
            
            <form onSubmit={handleConfirmPayment} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Amount Paid (GH₵)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">GH₵</span>
                  <input 
                    type="number" 
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-16 pr-4 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Reference / Transaction ID</label>
                <input 
                  type="text" 
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. MOMO-123456"
                  className="w-full px-4 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                />
              </div>
              
              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  <Send className="w-4 h-4" />
                  Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
