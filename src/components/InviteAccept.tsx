import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export const InviteAccept: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchInvite = async () => {
      if (!inviteId) return;
      try {
        const inviteDoc = await getDoc(doc(db, 'invitations', inviteId));
        if (inviteDoc.exists()) {
          setInvite({ id: inviteDoc.id, ...inviteDoc.data() });
        } else {
          setError('Invitation not found or expired.');
        }
      } catch (err) {
        setError('Failed to load invitation.');
      } finally {
        setLoading(false);
      }
    };
    fetchInvite();
  }, [inviteId]);

  const handleAccept = async () => {
    if (!user || !invite || !inviteId) return;

    if (user.email !== invite.email) {
      toast.error(`This invitation was sent to ${invite.email}. Please sign in with that account.`);
      return;
    }

    try {
      setLoading(true);
      // 1. Update invitation status
      await updateDoc(doc(db, 'invitations', inviteId), {
        status: 'accepted'
      });

      // 2. Update user profile
      const userDoc = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDoc);

      if (docSnap.exists()) {
        await updateDoc(userDoc, {
          role: invite.role,
          groupId: invite.groupId
        });
      } else {
        await setDoc(userDoc, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: invite.role,
          groupId: invite.groupId,
          createdAt: new Date().toISOString()
        });
      }

      // 3. If group_admin, update the group's adminUid
      if (invite.role === 'group_admin') {
        await updateDoc(doc(db, 'groups', invite.groupId), {
          adminUid: user.uid
        });
      }

      toast.success('Invitation accepted! Welcome to the group.');
      navigate('/');
    } catch (err) {
      toast.error('Failed to accept invitation.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Processing invitation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invitation Error</h1>
          <p className="text-slate-500 mb-6">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-100">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white mb-6">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Group Invitation</h1>
        <p className="text-slate-500 mb-8">
          You've been invited to join a group as a <span className="font-bold text-indigo-600 capitalize">{invite.role.replace('_', ' ')}</span>.
        </p>

        {!user ? (
          <div className="space-y-4">
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
              Please sign in with <strong>{invite.email}</strong> to accept this invitation.
            </p>
            <button 
              onClick={() => navigate('/login')}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
            >
              Sign in to Accept
            </button>
          </div>
        ) : user.email !== invite.email ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
              You are signed in as <strong>{user.email}</strong>, but this invitation is for <strong>{invite.email}</strong>.
            </p>
            <button 
              onClick={() => auth.signOut()}
              className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
            >
              Sign Out and Switch Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-left">
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Invited To</p>
              <p className="text-lg font-bold text-indigo-900">{invite.email}</p>
            </div>
            <button 
              onClick={handleAccept}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              Accept and Join
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
