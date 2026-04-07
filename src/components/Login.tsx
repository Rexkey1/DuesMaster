import React, { useEffect, useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ShieldCheck, LogIn, Mail, Lock } from 'lucide-react';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (!loading && user && profile) {
      navigate('/', { replace: true });
    }
  }, [user, profile, loading, navigate]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    setIsLoggingIn(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await handlePostLogin(result.user, password);
    } catch (error: any) {
      if (error.code === 'auth/operation-not-allowed') {
        toast.error("ACTION REQUIRED: You must enable 'Email/Password' sign-in in your Firebase Console (Authentication > Sign-in method) for this to work.", { duration: 10000 });
        setIsLoggingIn(false);
        return;
      }
      
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials') {
        try {
          // If user doesn't exist, try to create the account (lazy creation for pre-approved admins)
          const createResult = await createUserWithEmailAndPassword(auth, email, password);
          await handlePostLogin(createResult.user, password);
          return;
        } catch (createError: any) {
          if (createError.code === 'auth/email-already-in-use') {
            toast.error("Invalid email or password.");
          } else if (createError.code === 'auth/operation-not-allowed') {
            toast.error("ACTION REQUIRED: You must enable 'Email/Password' sign-in in your Firebase Console (Authentication > Sign-in method) for this to work.", { duration: 10000 });
          } else {
            toast.error(`Login failed: ${createError.message}`);
          }
          setIsLoggingIn(false);
          return;
        }
      }
      console.error("Email login error:", error);
      toast.error(`Login failed: ${error.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handlePostLogin(result.user);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        return; // Ignore user cancellations
      }
      console.error("Login error:", error);
      const errorMessage = error.code === 'auth/unauthorized-domain' 
        ? "This domain is not authorized in Firebase Console. Please add it to Authentication > Settings > Authorized domains."
        : `Failed to login: ${error.code || error.message}`;
      toast.error(errorMessage, { duration: 6000 });
    }
  };

  const handlePostLogin = async (user: any, enteredPassword?: string) => {
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
      // Check if pre-approved
      let preApprovedRole = 'member';
      let preApprovedGroupId = null;
      
      try {
        const normalizedEmail = user.email!.toLowerCase().trim();
        const roleDoc = await getDoc(doc(db, 'user_roles', normalizedEmail));
        if (roleDoc.exists()) {
          const data = roleDoc.data();
          
          // Security check: If a tempPassword was set by Super Admin, enforce it!
          if (data.tempPassword && enteredPassword !== undefined) {
            if (enteredPassword !== data.tempPassword) {
              // Hijack attempt or wrong initial password!
              // Delete the unauthorized auth account so the real admin can still claim it later
              await deleteUser(user);
              toast.error("Invalid initial password. Please use the password provided by the Super Admin.");
              return; // Stop login process
            }
            
            // Password matched! Clear it so it can't be used again
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'user_roles', normalizedEmail), { tempPassword: '' });
          }

          preApprovedRole = data.role;
          preApprovedGroupId = data.groupId;
        }
      } catch (e) {
        console.error("Error checking pre-approved roles", e);
      }

      // Create initial user profile
      // Super admin will be handled by the default email check in rules
      const isDefaultAdmin = user.email === "rexkey@gmail.com";
      const finalRole = isDefaultAdmin ? 'super_admin' : preApprovedRole;
      
      try {
        const userData: any = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          role: finalRole,
          createdAt: new Date().toISOString()
        };
        
        if (preApprovedGroupId) {
          userData.groupId = preApprovedGroupId;
        }
        
        await setDoc(userDoc, userData);
        
        // If they were pre-approved as group_admin, update the group's adminUid
        if (finalRole === 'group_admin' && preApprovedGroupId) {
          try {
             // Update the group to set this user as the admin
             const { updateDoc } = await import('firebase/firestore');
             await updateDoc(doc(db, 'groups', preApprovedGroupId), {
               adminUid: user.uid
             });
             
             // Also mark any pending invitations for this email as accepted
             const { collection, query, where, getDocs } = await import('firebase/firestore');
             const invQ = query(collection(db, 'invitations'), where('email', '==', user.email), where('status', '==', 'pending'));
             const invSnap = await getDocs(invQ);
             invSnap.forEach(async (invDoc) => {
               await updateDoc(doc(db, 'invitations', invDoc.id), { status: 'accepted' });
             });
          } catch (e) {
             console.error("Error updating group adminUid or invitations:", e);
          }
        }
      } catch (error: any) {
        if (error.message?.includes('insufficient permissions')) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
        }
        throw error;
      }
      toast.success(`Welcome to DuesMaster, ${user.displayName || user.email}!`);
    } else {
      toast.success(`Welcome back, ${user.displayName || user.email}!`);
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
        
        <form onSubmit={handleEmailLogin} className="space-y-4 mb-6 text-left">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <button 
            type="submit"
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? 'Signing in...' : 'Sign In with Email'}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-slate-500">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-all shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
        
        <p className="mt-8 text-xs text-slate-400">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
