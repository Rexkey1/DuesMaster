import React, { useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ShieldCheck, LogIn } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && profile) {
      navigate('/', { replace: true });
    }
  }, [user, profile, loading, navigate]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userDoc = doc(db, 'users', user.uid);
      let docSnap;
      try {
        docSnap = await getDoc(userDoc);
      } catch (error: any) {
        if (error.message?.includes('insufficient permissions')) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
        throw error;
      }
      
      if (!docSnap.exists()) {
        // Create initial user profile as member
        // Super admin will be handled by the default email check in rules
        const isDefaultAdmin = user.email === "rexkey@gmail.com";
        try {
          await setDoc(userDoc, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: isDefaultAdmin ? 'super_admin' : 'member',
            createdAt: new Date().toISOString()
          });
        } catch (error: any) {
          if (error.message?.includes('insufficient permissions')) {
            handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
          }
          throw error;
        }
        toast.success(`Welcome to DuesMaster, ${user.displayName}!`);
      } else {
        toast.success(`Welcome back, ${user.displayName}!`);
      }
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        return; // Ignore user cancellations
      }
      console.error("Login error:", error);
      toast.error("Failed to login. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white mb-6">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">DuesMaster</h1>
        <p className="text-slate-500 mb-8">Secure multi-tenant dues management for organized groups.</p>
        
        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-200"
        >
          <LogIn className="w-5 h-5" />
          Sign in with Google
        </button>
        
        <p className="mt-8 text-xs text-slate-400">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
