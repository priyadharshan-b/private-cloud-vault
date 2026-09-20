import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  Cloud,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  HardDrive,
  KeyRound,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  getGetAuthSessionQueryKey,
  getGetFileDownloadQueryKey,
  getGetStorageSummaryQueryKey,
  getListFilesQueryKey,
  getListFoldersQueryKey,
  getHealthCheckQueryKey,
  useBeginGoogleLogin,
  useCreateFile,
  useCreateFolder,
  useCreatePasscode,
  useDeleteFile,
  useDeleteFolder,
  useGetAuthSession,
  useGetFileDownload,
  useGetStorageSummary,
  useHealthCheck,
  useListFiles,
  useListFolders,
  useLockVault,
  useLoginWithEmail,
  useLogout,
  useRequestUploadUrl,
  useUnlockVault,
  useUpdateFile,
  useUpdateFolder,
} from '@workspace/api-client-react';
import { type ReactNode, type FormEvent } from 'react';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

type ModalState =
  | { type: 'folder' }
  | { type: 'rename-file'; id: string; name: string }
  | { type: 'rename-folder'; id: string; name: string }
  | { type: 'move'; id: string; name: string; folderId: string | null }
  | { type: 'delete-file'; id: string; name: string }
  | { type: 'delete-folder'; id: string; name: string }
  | null;

const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'error' in error) return String((error as { error: unknown }).error);
  if (error instanceof Error) return error.message;
  return 'Something went quiet. Try again.';
};

const iconForMime = (mime: string) => {
  if (mime.startsWith('image/')) return FileImage;
  if (mime.startsWith('video/')) return FileVideo;
  if (mime.startsWith('audio/')) return FileAudio;
  if (mime.includes('pdf') || mime.includes('text')) return FileText;
  if (mime.includes('zip') || mime.includes('archive')) return FileArchive;
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('code')) return FileCode2;
  return File;
};

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'animate-drift-in'}`} data-testid="brand-private-cloud">
      <div className="relative grid size-10 place-items-center rounded-[14px] bg-[hsl(var(--accent))] text-[hsl(var(--sidebar))] shadow-[0_8px_20px_hsl(var(--accent)/.24)]">
        <Cloud size={20} strokeWidth={2.5} />
        <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[hsl(var(--destructive))]" />
      </div>
      {!compact && (
        <div>
          <div className="font-serif text-[21px] font-bold leading-none tracking-[-.04em]">Private Cloud</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[.22em] text-[hsl(var(--sidebar-foreground)/.56)]">your quiet place</div>
        </div>
      )}
    </div>
  );
}

function AccessBackdrop() {
  return (
    <div className="paper-grid pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-28 -top-32 size-[460px] rounded-full bg-[hsl(var(--primary)/.13)] blur-3xl" />
      <div className="absolute -bottom-44 -right-24 size-[520px] rounded-full bg-[hsl(var(--accent)/.18)] blur-3xl" />
      <div className="absolute left-[13%] top-[22%] size-2 rounded-full bg-[hsl(var(--accent))] shadow-[0_0_0_10px_hsl(var(--accent)/.08)]" />
      <div className="absolute right-[18%] top-[17%] size-1.5 rounded-full bg-[hsl(var(--destructive))]" />
    </div>
  );
}

function AccessShell({ children }: { children: ReactNode }) {
  return (
    <main className="noise relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[hsl(var(--background))] px-5 py-10 text-[hsl(var(--foreground))]">
      <AccessBackdrop />
      <div className="relative z-10 w-full max-w-[1080px]">
        <div className="mb-8 flex items-center justify-between lg:mb-12">
          <BrandMark />
          <div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.62)] px-3 py-2 text-[11px] font-medium text-[hsl(var(--muted-foreground))] shadow-[var(--shadow-2xs)] sm:flex">
            <ShieldCheck size={14} className="text-[hsl(var(--primary))]" />
            Private by default
          </div>
        </div>
        {children}
        <div className="mt-10 flex items-center justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
          <span>Encrypted at rest · Built for one</span>
          <span className="font-mono tracking-[.12em]">PC / 01</span>
        </div>
      </div>
    </main>
  );
}

function AccessLoading() {
  return (
    <AccessShell>
      <div className="mx-auto max-w-[540px] rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.78)] p-8 shadow-[var(--shadow-lg)] sm:p-12">
        <div className="animate-breathe space-y-5">
          <div className="h-3 w-20 rounded-full bg-[hsl(var(--muted))]" />
          <div className="h-12 w-4/5 rounded-2xl bg-[hsl(var(--muted))]" />
          <div className="h-4 w-3/5 rounded-full bg-[hsl(var(--muted))]" />
          <div className="mt-10 h-12 rounded-xl bg-[hsl(var(--muted))]" />
          <div className="h-12 rounded-xl bg-[hsl(var(--muted))]" />
        </div>
      </div>
    </AccessShell>
  );
}

function AccessError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <AccessShell>
      <div className="mx-auto max-w-[540px] rounded-[28px] border border-[hsl(var(--destructive)/.34)] bg-[hsl(var(--card)/.82)] p-8 shadow-[var(--shadow-lg)] sm:p-12">
        <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]"><X size={22} /></div>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--destructive))]">Connection interrupted</p>
        <h1 className="mt-4 font-serif text-4xl font-bold tracking-[-.04em]">Your vault is still here.</h1>
        <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{getErrorMessage(error)}</p>
        <button className="focus-ring mt-8 flex h-12 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5" onClick={retry} data-testid="button-retry-session">
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    </AccessShell>
  );
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) {
    let message = 'Something went quiet. Try again.';
    try {
      const body = await response.json();
      if (body?.error) message = String(body.error);
    } catch {
      // keep default
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function LoginCard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = useLoginWithEmail();
  const google = useBeginGoogleLogin();
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const applySession = (session: { authenticated?: boolean; vaultUnlocked?: boolean }) => {
    queryClient.setQueryData(getGetAuthSessionQueryKey(), session);
    if (session.vaultUnlocked) setLocation('/dashboard');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    if (mode === 'magic') {
      setBusy(true);
      try {
        await apiRequest('/api/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
        setNotice('Check your email for a sign-in link.');
      } catch (error) {
        setNotice(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === 'signup') {
      setBusy(true);
      try {
        const session = await apiRequest<{ authenticated?: boolean; vaultUnlocked?: boolean; error?: string }>('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        if (session.error) setNotice(session.error);
        else applySession(session);
      } catch (error) {
        setNotice(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
      return;
    }
    login.mutate({ data: { email, password } }, {
      onSuccess: applySession,
      onError: (error) => setNotice(getErrorMessage(error)),
    });
  };

  const signInWithGoogle = () => {
    setNotice('');
    google.mutate({ data: { redirectTo: window.location.href } }, {
      onSuccess: (result) => { window.location.href = result.url; },
      onError: (error) => setNotice(getErrorMessage(error)),
    });
  };

  return (
    <AccessShell>
      <div className="grid overflow-hidden rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.78)] shadow-[var(--shadow-lg)] lg:grid-cols-[.93fr_1.07fr]">
        <div className="relative hidden overflow-hidden bg-[hsl(var(--sidebar))] p-10 text-[hsl(var(--sidebar-foreground))] lg:block xl:p-14">
          <div className="absolute -right-24 -top-20 size-80 rounded-full border border-[hsl(var(--accent)/.25)]" />
          <div className="absolute -right-11 top-[-31px] size-56 rounded-full border border-[hsl(var(--accent)/.16)]" />
          <div className="absolute bottom-10 left-10 right-10 h-px bg-[hsl(var(--sidebar-foreground)/.12)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="mb-16 flex size-16 items-center justify-center rounded-[22px] border border-[hsl(var(--accent)/.36)] bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><Lock size={27} /></div>
              <p className="font-mono text-[10px] uppercase tracking-[.25em] text-[hsl(var(--accent))]">A softer kind of storage</p>
              <h1 className="mt-5 max-w-[330px] font-serif text-[48px] font-bold leading-[.98] tracking-[-.055em]">Keep what matters close.</h1>
              <p className="mt-6 max-w-[290px] text-sm leading-6 text-[hsl(var(--sidebar-foreground)/.63)]">A private room for your files, without the noise of a shared drive.</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-[hsl(var(--sidebar-foreground)/.64)]"><span className="size-2 rounded-full bg-[hsl(var(--accent))]" />Your files, your rhythm.</div>
          </div>
        </div>
        <div className="p-7 sm:p-12 lg:p-14">
          <div className="mb-10 lg:hidden"><BrandMark compact /></div>
          <p className="animate-rise-in font-mono text-[10px] uppercase tracking-[.22em] text-[hsl(var(--primary))]">Private access</p>
          <h2 className="animate-rise-in delay-1 mt-4 font-serif text-[42px] font-bold leading-[.98] tracking-[-.055em]">{mode === 'signup' ? 'Create your room.' : 'Welcome back.'}</h2>
          <p className="animate-rise-in delay-2 mt-4 max-w-[350px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">Sign in to return to the quiet side of your cloud.</p>
          <div className="mt-6 flex gap-2 text-xs font-semibold">
            <button type="button" onClick={() => setMode('signin')} className={`rounded-full px-3 py-1.5 ${mode === 'signin' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))]'}`}>Sign in</button>
            <button type="button" onClick={() => setMode('signup')} className={`rounded-full px-3 py-1.5 ${mode === 'signup' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))]'}`}>Create account</button>
            <button type="button" onClick={() => setMode('magic')} className={`rounded-full px-3 py-1.5 ${mode === 'magic' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))]'}`}>Email link</button>
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs font-semibold text-[hsl(var(--foreground))]">Email address
              <input className="focus-ring mt-2 h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-4 text-sm outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.65)] focus:border-[hsl(var(--accent))]" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-email" />
            </label>
            {mode !== 'magic' && (
              <label className="block text-xs font-semibold text-[hsl(var(--foreground))]">Password
                <span className="relative mt-2 block">
                  <input className="focus-ring h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-4 pr-12 text-sm outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.65)] focus:border-[hsl(var(--accent))]" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your account password'} data-testid="input-password" />
                  <button type="button" className="absolute right-3 top-3 text-[hsl(var(--muted-foreground))]" onClick={() => setShowPassword((value) => !value)} data-testid="button-toggle-password">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </span>
              </label>
            )}
            {notice && <p className="rounded-xl bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs leading-5 text-[hsl(var(--destructive))]" data-testid="status-login-error">{notice}</p>}
            <button className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_8px_18px_hsl(var(--primary)/.18)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_hsl(var(--primary)/.24)] disabled:cursor-wait disabled:opacity-60" disabled={login.isPending || busy} data-testid="button-login">
              {(login.isPending || busy) ? <><RefreshCw size={16} className="animate-spin" /> Checking</> : <>{mode === 'magic' ? 'Send sign-in link' : mode === 'signup' ? 'Create account' : 'Enter your cloud'} <ChevronRight size={16} /></>}
            </button>
          </form>
          <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground)/.65)]"><span className="h-px flex-1 bg-[hsl(var(--border))]" />or<span className="h-px flex-1 bg-[hsl(var(--border))]" /></div>
          <button onClick={signInWithGoogle} disabled={google.isPending} className="focus-ring flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-transparent text-sm font-semibold transition-all hover:-translate-y-0.5 hover:bg-[hsl(var(--secondary)/.5)] disabled:opacity-60" data-testid="button-google-login">
            <span className="grid size-6 place-items-center rounded-full bg-[hsl(var(--foreground))] text-xs font-bold text-[hsl(var(--card))]">G</span>
            {google.isPending ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <p className="mt-7 text-center text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Private Cloud is designed for one person. There are no shared links, feeds, or distractions.</p>
        </div>
      </div>
    </AccessShell>
  );
}

function PasscodeCard({ sessionEmail, resetting = false }: { sessionEmail?: string; resetting?: boolean }) {
  const queryClient = useQueryClient();
  const createPasscode = useCreatePasscode();
  const logout = useLogout();
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState('');
  const [, setLocation] = useLocation();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (passcode.length !== 6 || passcode !== confirm) {
      setNotice(passcode !== confirm ? 'The two passcodes need to match.' : 'Use six numbers for your passcode.');
      return;
    }
    setNotice('');
    createPasscode.mutate({ data: { passcode } }, {
      onSuccess: (session) => {
        queryClient.setQueryData(getGetAuthSessionQueryKey(), session);
        setLocation('/dashboard');
      },
      onError: (error) => setNotice(getErrorMessage(error)),
    });
  };

  const signOut = () => logout.mutate(undefined, { onSuccess: () => { queryClient.removeQueries({ queryKey: getGetAuthSessionQueryKey() }); setLocation('/'); } });

  return (
    <AccessShell>
      <div className="mx-auto max-w-[540px] animate-rise-in rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.82)] p-8 shadow-[var(--shadow-lg)] sm:p-12">
        <div className="mb-9 flex size-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/.11)] text-[hsl(var(--primary))]"><KeyRound size={26} /></div>
        <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[hsl(var(--primary))]">One more private layer</p>
        <h1 className="mt-4 font-serif text-[42px] font-bold leading-[.98] tracking-[-.055em]">{resetting ? 'Choose a new passcode.' : 'Make this space yours.'}</h1>
        <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Set a six-digit passcode for {sessionEmail || 'your account'}. You’ll use it each time you return.</p>
        <form className="mt-9 space-y-4" onSubmit={submit}>
          <label className="block text-xs font-semibold">New passcode
            <span className="relative mt-2 block">
              <input inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required autoFocus className="focus-ring h-14 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-4 pr-12 font-mono text-xl tracking-[.45em] outline-none focus:border-[hsl(var(--accent))]" type={show ? 'text' : 'password'} value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))} data-testid="input-create-passcode" />
              <button type="button" className="absolute right-3 top-4 text-[hsl(var(--muted-foreground))]" onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>
          <label className="block text-xs font-semibold">Confirm passcode
            <input inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required className="focus-ring mt-2 h-14 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-4 font-mono text-xl tracking-[.45em] outline-none focus:border-[hsl(var(--accent))]" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))} data-testid="input-confirm-passcode" />
          </label>
          {notice && <p className="rounded-xl bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs text-[hsl(var(--destructive))]" data-testid="status-passcode-error">{notice}</p>}
          <button className="focus-ring mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60" disabled={createPasscode.isPending} data-testid="button-create-passcode">
            {createPasscode.isPending ? <><RefreshCw size={16} className="animate-spin" /> Securing your space</> : <>Create passcode <ArrowDownToLine size={16} className="rotate-[-45deg]" /></>}
          </button>
        </form>
        <button onClick={signOut} className="focus-ring mx-auto mt-6 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" data-testid="button-logout-setup"><LogOut size={14} /> Sign out</button>
      </div>
    </AccessShell>
  );
}

function UnlockCard({ sessionEmail, onForgot }: { sessionEmail?: string; onForgot: () => void }) {
  const queryClient = useQueryClient();
  const unlock = useUnlockVault();
  const logout = useLogout();
  const [passcode, setPasscode] = useState('');
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState('');
  const [, setLocation] = useLocation();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    unlock.mutate({ data: { passcode } }, {
      onSuccess: (session) => { queryClient.setQueryData(getGetAuthSessionQueryKey(), session); setLocation('/dashboard'); },
      onError: (error) => { setPasscode(''); setNotice(getErrorMessage(error)); },
    });
  };
  const signOut = () => logout.mutate(undefined, { onSuccess: () => { queryClient.removeQueries({ queryKey: getGetAuthSessionQueryKey() }); setLocation('/'); } });

  return (
    <AccessShell>
      <div className="mx-auto max-w-[540px] animate-rise-in rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.82)] p-8 shadow-[var(--shadow-lg)] sm:p-12">
        <div className="relative mb-9 flex size-14 items-center justify-center rounded-2xl bg-[hsl(var(--accent)/.2)] text-[hsl(var(--primary))]"><span className="absolute inset-0 animate-[pulse-ring_1.8s_ease-out_infinite] rounded-2xl border border-[hsl(var(--accent)/.6)]" /><Lock size={25} /></div>
        <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[hsl(var(--primary))]">Vault locked</p>
        <h1 className="mt-4 font-serif text-[42px] font-bold leading-[.98] tracking-[-.055em]">A quiet minute.</h1>
        <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Enter your passcode to open the private room for {sessionEmail || 'your files'}.</p>
        <form className="mt-9" onSubmit={submit}>
          <span className="relative block">
            <input inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required autoFocus className="focus-ring h-16 w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-4 pr-12 text-center font-mono text-2xl tracking-[.55em] outline-none focus:border-[hsl(var(--accent))]" type={show ? 'text' : 'password'} value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="······" data-testid="input-unlock-passcode" />
            <button type="button" className="absolute right-4 top-5 text-[hsl(var(--muted-foreground))]" onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </span>
          {notice && <p className="mt-3 rounded-xl bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs text-[hsl(var(--destructive))]" data-testid="status-unlock-error">{notice}</p>}
          <button className="focus-ring mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60" disabled={unlock.isPending} data-testid="button-unlock">
            {unlock.isPending ? <><RefreshCw size={16} className="animate-spin" /> Opening vault</> : <>Unlock vault <ChevronRight size={16} /></>}
          </button>
        </form>
        <button onClick={onForgot} className="focus-ring mx-auto mt-5 block text-xs font-semibold text-[hsl(var(--primary))]" data-testid="button-forgot-passcode">Forgot passcode?</button>
        <button onClick={signOut} className="focus-ring mx-auto mt-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" data-testid="button-logout-unlock"><LogOut size={14} /> Sign out</button>
      </div>
    </AccessShell>
  );
}

function VerifyResetCard({ sessionEmail, onVerified }: { sessionEmail?: string; onVerified: () => void }) {
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setLocation] = useLocation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      await apiRequest('/api/vault/verify-account', { method: 'POST', body: JSON.stringify({ password }) });
      onVerified();
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessShell>
      <div className="mx-auto max-w-[540px] animate-rise-in rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.82)] p-8 shadow-[var(--shadow-lg)] sm:p-12">
        <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[hsl(var(--primary))]">Passcode recovery</p>
        <h1 className="mt-4 font-serif text-[38px] font-bold leading-[.98] tracking-[-.055em]">Prove this is your account.</h1>
        <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">We will not reset a passcode from an email address alone. Re-enter the password for {sessionEmail || 'this account'}, or sign in with Google again.</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <label className="block text-xs font-semibold">Account password
            <input className="focus-ring mt-2 h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.72)] px-4 text-sm outline-none" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-reset-password" />
          </label>
          {notice && <p className="rounded-xl bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs text-[hsl(var(--destructive))]">{notice}</p>}
          <button className="focus-ring flex h-12 w-full items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]" disabled={busy}>{busy ? 'Checking…' : 'Verify and reset passcode'}</button>
        </form>
        <button onClick={async () => {
          try {
            const result = await apiRequest<{ url: string }>('/api/auth/google', { method: 'POST', body: JSON.stringify({ reset: true }) });
            window.location.href = result.url;
          } catch (error) {
            setNotice(getErrorMessage(error));
          }
        }} className="focus-ring mt-4 flex h-12 w-full items-center justify-center rounded-xl border border-[hsl(var(--border))] text-sm font-semibold">Continue with Google to verify</button>
        <button onClick={() => logout.mutate(undefined, { onSuccess: () => { queryClient.removeQueries({ queryKey: getGetAuthSessionQueryKey() }); setLocation('/'); } })} className="mx-auto mt-6 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]"><LogOut size={14} /> Sign out</button>
      </div>
    </AccessShell>
  );
}

function PrivateAccess() {
  const [, setLocation] = useLocation();
  const sessionQuery = useGetAuthSession({ query: { queryKey: getGetAuthSessionQueryKey() } });
  const session = sessionQuery.data;
  const [resetting, setResetting] = useState(() => new URLSearchParams(window.location.search).get('reset') === '1');
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (session?.authenticated && session.vaultUnlocked) setLocation('/dashboard');
  }, [session, setLocation]);

  if (sessionQuery.isLoading) return <AccessLoading />;
  if (sessionQuery.isError) return <AccessError error={sessionQuery.error} retry={() => sessionQuery.refetch()} />;
  if (!session?.authenticated) return <LoginCard />;
  if (forgot && session.hasPasscode && !resetting) return <VerifyResetCard sessionEmail={session.user?.email} onVerified={() => setResetting(true)} />;
  if (!session.hasPasscode || resetting) return <PasscodeCard sessionEmail={session.user?.email} resetting={resetting || !session.hasPasscode} />;
  return <UnlockCard sessionEmail={session.user?.email} onForgot={() => setForgot(true)} />;
}

function SkeletonRows() {
  return <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="animate-breathe flex items-center gap-4 rounded-xl border border-[hsl(var(--border)/.55)] p-4"><div className="size-10 rounded-xl bg-[hsl(var(--muted))]" /><div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded-full bg-[hsl(var(--muted))]" /><div className="h-2 w-1/5 rounded-full bg-[hsl(var(--muted))]" /></div><div className="h-3 w-16 rounded-full bg-[hsl(var(--muted))]" /></div>)}</div>;
}

function EmptyFiles({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex min-h-[330px] flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6 grid size-20 place-items-center rounded-[28px] border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.15)] text-[hsl(var(--primary))]"><span className="absolute inset-2 rounded-[20px] border border-dashed border-[hsl(var(--accent)/.6)]" /><UploadCloud size={28} /></div>
      <h3 className="font-serif text-2xl font-bold tracking-[-.03em]">This room is still empty.</h3>
      <p className="mt-2 max-w-[320px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">Bring in a file when you’re ready. Nothing gets shared unless you choose it.</p>
      <button onClick={onUpload} className="focus-ring mt-6 flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5" data-testid="button-empty-upload"><UploadCloud size={16} /> Add your first file</button>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[hsl(var(--sidebar)/.58)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="animate-rise-in w-full max-w-[430px] rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-xl)] sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="font-serif text-2xl font-bold tracking-[-.03em]">{title}</h2></div><button onClick={onClose} className="focus-ring rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-modal"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function WorkspaceHeader({ user, search, setSearch, onUpload, onNewFolder, onLock, onLogout, onToggleSidebar }: { user: { email: string; fullName: string | null; avatarUrl: string | null } | null; search: string; setSearch: (value: string) => void; onUpload: () => void; onNewFolder: () => void; onLock: () => void; onLogout: () => void; onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-3 border-b border-[hsl(var(--border)/.72)] bg-[hsl(var(--background)/.88)] px-5 backdrop-blur-xl sm:px-8 lg:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onToggleSidebar} className="focus-ring rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] lg:hidden" data-testid="button-toggle-sidebar"><LayoutGrid size={18} /></button>
        <div className="relative hidden min-w-[180px] max-w-[310px] flex-1 sm:block">
          <Search size={16} className="absolute left-3.5 top-3.5 text-[hsl(var(--muted-foreground))]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="focus-ring h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] pl-10 pr-4 text-sm outline-none placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--accent))]" placeholder="Search your files" data-testid="input-search-files" />
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button onClick={onNewFolder} className="focus-ring hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] md:flex" data-testid="button-new-folder"><FolderPlus size={16} /> New folder</button>
        <button onClick={onUpload} className="focus-ring flex h-10 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_5px_14px_hsl(var(--primary)/.16)] transition-transform hover:-translate-y-0.5" data-testid="button-upload"><Plus size={17} /> <span className="hidden sm:inline">Add file</span></button>
        <div className="mx-1 h-7 w-px bg-[hsl(var(--border))]" />
        <div className="group relative">
          <button className="focus-ring flex items-center gap-2 rounded-xl p-1.5 pr-2 transition-colors hover:bg-[hsl(var(--muted))]" data-testid="button-user-menu">
            {user?.avatarUrl ? <img src={user.avatarUrl} className="size-8 rounded-[10px] object-cover" alt="" /> : <span className="grid size-8 place-items-center rounded-[10px] bg-[hsl(var(--accent))] text-xs font-bold text-[hsl(var(--sidebar))]">{(user?.fullName || user?.email || 'P').slice(0, 1).toUpperCase()}</span>}
            <span className="hidden max-w-[120px] truncate text-xs font-semibold lg:block">{user?.fullName || user?.email}</span>
          </button>
          <div className="invisible absolute right-0 top-12 w-48 translate-y-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 opacity-0 shadow-[var(--shadow-md)] transition-all group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <button onClick={onLock} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]" data-testid="button-lock-vault"><Lock size={15} /> Lock vault</button>
            <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)]" data-testid="button-logout"><LogOut size={15} /> Sign out</button>
          </div>
        </div>
      </div>
    </header>
  );
}

function WorkspaceSidebar({ activeFolderId, folders, storage, onSelectFolder, onNewFolder, onClose }: { activeFolderId: string | null; folders: any[]; storage: any; onSelectFolder: (id: string | null) => void; onNewFolder: () => void; onClose: () => void }) {
  const percent = storage?.quotaBytes ? Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100) : 0;
  return (
    <aside className="flex w-[270px] shrink-0 flex-col bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] lg:flex" data-testid="workspace-sidebar">
      <div className="flex items-center justify-between"><BrandMark /><button onClick={onClose} className="rounded-lg p-1 text-[hsl(var(--sidebar-foreground)/.55)] hover:bg-[hsl(var(--sidebar-accent))] lg:hidden" data-testid="button-close-sidebar"><X size={17} /></button></div>
      <div className="mt-12">
        <p className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[.22em] text-[hsl(var(--sidebar-foreground)/.45)]">Your rooms</p>
        <button onClick={() => { onSelectFolder(null); onClose(); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${activeFolderId === null ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.72)] hover:bg-[hsl(var(--sidebar-accent)/.7)]'}`} data-testid="button-folder-all"><HardDrive size={17} className={activeFolderId === null ? 'text-[hsl(var(--accent))]' : ''} /> All files <span className="ml-auto font-mono text-[10px] opacity-55">{storage?.fileCount ?? '—'}</span></button>
        <div className="mt-1 max-h-[36vh] space-y-1 overflow-auto scrollbar-thin">
          {folders.map((folder) => (
            <div key={folder.id} className="group flex items-center gap-1" style={{ paddingLeft: folder.parentFolderId ? 14 : 0 }}>
              <button onClick={() => { onSelectFolder(folder.id); onClose(); }} className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${activeFolderId === folder.id ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.68)] hover:bg-[hsl(var(--sidebar-accent)/.7)]'}`} data-testid={`button-folder-${folder.id}`}>
                <Folder size={17} className="shrink-0 text-[hsl(var(--accent)/.82)]" />
                <span className="truncate">{folder.name}</span>
              </button>
            </div>
          ))}
        </div>
        <button onClick={onNewFolder} className="mt-3 flex items-center gap-2 px-3 text-xs font-semibold text-[hsl(var(--sidebar-foreground)/.5)] transition-colors hover:text-[hsl(var(--accent))]" data-testid="button-sidebar-new-folder"><Plus size={14} /> Add a room</button>
      </div>
      <div className="mt-auto rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.55)] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold">Private space</span><Sparkles size={14} className="text-[hsl(var(--accent))]" /></div>
        <div className="mb-2 flex items-end justify-between"><span className="font-mono text-[11px] text-[hsl(var(--sidebar-foreground)/.56)]">{formatBytes(storage?.usedBytes)} used</span><span className="font-mono text-[10px] text-[hsl(var(--sidebar-foreground)/.45)]">{formatBytes(storage?.quotaBytes)}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--sidebar-foreground)/.1)]"><div className="h-full rounded-full bg-[hsl(var(--accent))] transition-all duration-500" style={{ width: `${percent}%` }} /></div>
        <p className="mt-3 text-[10px] leading-4 text-[hsl(var(--sidebar-foreground)/.5)]">A little room to keep life close.</p>
      </div>
    </aside>
  );
}

function FileRow({ file, onRename, onMove, onDelete, onDownload, onPreview }: { file: any; folders?: any[]; onRename: () => void; onMove: () => void; onDelete: () => void; onDownload: () => void; onPreview: () => void }) {
  const Icon = iconForMime(file.mimeType);
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_110px_120px_40px] items-center gap-3 border-b border-[hsl(var(--border)/.7)] px-4 py-3.5 transition-colors hover:bg-[hsl(var(--secondary)/.38)] sm:px-5" data-testid={`row-file-${file.id}`}>
      <div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Icon size={18} strokeWidth={1.8} /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{file.name}</p><p className="mt-0.5 truncate text-[11px] text-[hsl(var(--muted-foreground))]">{file.folderPath || 'All files'} · {file.originalName}</p></div></div>
      <span className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:block">{formatBytes(file.fileSize)}</span>
      <span className="hidden text-xs text-[hsl(var(--muted-foreground))] md:block">{formatDate(file.updatedAt)}</span>
      <div className="relative flex justify-end"><button className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-70 transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] group-hover:opacity-100" data-testid={`button-file-menu-${file.id}`}><MoreHorizontal size={17} /></button><div className="invisible absolute right-0 top-10 z-10 w-40 translate-y-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 opacity-0 shadow-[var(--shadow-md)] transition-all group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"><button onClick={onPreview} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))]"><Eye size={14} /> Open / preview</button><button onClick={onDownload} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))]" data-testid={`button-download-${file.id}`}><ArrowDownToLine size={14} /> Download</button><button onClick={onRename} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))]" data-testid={`button-rename-${file.id}`}><Pencil size={14} /> Rename</button><button onClick={onMove} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))]" data-testid={`button-move-${file.id}`}><Folder size={14} /> Move to folder</button><button onClick={onDelete} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)]" data-testid={`button-delete-${file.id}`}><Trash2 size={14} /> Delete</button></div></div>
    </div>
  );
}

function Dashboard() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const sessionQuery = useGetAuthSession({ query: { queryKey: getGetAuthSessionQueryKey() } });
  const session = sessionQuery.data;
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const [search, setSearch] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [notice, setNotice] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [preview, setPreview] = useState<{ name: string; mime: string; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploadAbort = useRef<XMLHttpRequest | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [editName, setEditName] = useState('');
  const [moveFolderId, setMoveFolderId] = useState('');
  const uploadInput = useRef<HTMLInputElement>(null);
  const fileParams = useMemo(() => ({ search: search || undefined, folderId: activeFolderId || undefined, limit: 100 }), [search, activeFolderId]);
  const filesQuery = useListFiles(fileParams, { query: { queryKey: getListFilesQueryKey(fileParams) } });
  const foldersQuery = useListFolders({ query: { queryKey: getListFoldersQueryKey() } });
  const storageQuery = useGetStorageSummary({ query: { queryKey: getGetStorageSummaryQueryKey() } });
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const updateFile = useUpdateFile();
  const deleteFile = useDeleteFile();
  const requestUploadUrl = useRequestUploadUrl();
  const createFile = useCreateFile();
  const lock = useLockVault();
  const logout = useLogout();
  const downloadQuery = useGetFileDownload(downloadTarget || '', { query: { enabled: Boolean(downloadTarget), queryKey: getGetFileDownloadQueryKey(downloadTarget || '') } });
  const files = filesQuery.data || [];
  const folders = foldersQuery.data || [];

  useEffect(() => {
    if (!sessionQuery.isLoading && (!session?.authenticated || !session.vaultUnlocked)) setLocation('/');
  }, [session, sessionQuery.isLoading, setLocation]);
  useEffect(() => {
    if (downloadQuery.data?.url) {
      window.open(downloadQuery.data.url, '_blank', 'noopener,noreferrer');
      setNotice('Download link opened in a new tab.');
      setDownloadTarget(null);
    }
  }, [downloadQuery.data]);
  useEffect(() => {
    if (health.isError) setNotice('Cloud connection is resting. You can still browse your cached files.');
  }, [health.isError]);

  const invalidateFiles = () => { qc.invalidateQueries({ queryKey: getListFilesQueryKey() }); qc.invalidateQueries({ queryKey: getGetStorageSummaryQueryKey() }); };
  const openUpload = () => uploadInput.current?.click();
  const uploadOne = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is larger than 50 MB.`);
    const upload = await new Promise<{ uploadUrl: string; storagePath: string }>((resolve, reject) => {
      requestUploadUrl.mutate({ data: { name: file.name, contentType: file.type || 'application/octet-stream', fileSize: file.size } }, { onSuccess: resolve, onError: reject });
    });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadAbort.current = xhr;
      xhr.open('PUT', upload.uploadUrl);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(`Uploading ${file.name}… ${Math.round((event.loaded / event.total) * 100)}%`);
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The upload could not be completed.')));
      xhr.onerror = () => reject(new Error('The upload could not be completed.'));
      xhr.onabort = () => reject(new Error('Upload cancelled.'));
      xhr.send(file);
    });
    await new Promise<void>((resolve, reject) => {
      createFile.mutate({ data: { name: file.name, originalName: file.name, storagePath: upload.storagePath, mimeType: file.type || 'application/octet-stream', fileSize: file.size, folderId: activeFolderId } }, { onSuccess: () => resolve(), onError: reject });
    });
  };
  const uploadFiles = async (list: FileList | File[]) => {
    const filesToUpload = Array.from(list);
    if (!filesToUpload.length) return;
    setNotice('');
    try {
      for (const file of filesToUpload) {
        setUploadProgress(`Preparing ${file.name}…`);
        await uploadOne(file);
      }
      setUploadProgress('');
      setNotice(filesToUpload.length === 1 ? `${filesToUpload[0].name} is safely in your cloud.` : `${filesToUpload.length} files are safely in your cloud.`);
      invalidateFiles();
    } catch (error) {
      setUploadProgress('');
      setNotice(getErrorMessage(error));
    } finally {
      uploadAbort.current = null;
    }
  };
  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    event.target.value = '';
    if (list) await uploadFiles(list);
  };
  const openPreview = async (file: { id: string; name: string; mimeType: string }) => {
    try {
      const result = await apiRequest<{ url: string }>(`/api/files/${file.id}/download`);
      if (!result.url) throw new Error('Preview unavailable');
      setPreview({ name: file.name, mime: file.mimeType, url: result.url });
    } catch (error) {
      setNotice(getErrorMessage(error));
    }
  };
  const onCreateFolder = (event: FormEvent) => {
    event.preventDefault();
    if (!folderName.trim()) return;
    createFolder.mutate({ data: { name: folderName.trim(), parentFolderId: activeFolderId } }, { onSuccess: () => { setModal(null); setFolderName(''); qc.invalidateQueries({ queryKey: getListFoldersQueryKey() }); setNotice('New room created.'); }, onError: (error) => setNotice(getErrorMessage(error)) });
  };
  const onRename = (event: FormEvent) => {
    event.preventDefault();
    if (!editName.trim() || !modal) return;
    if (modal.type === 'rename-file') updateFile.mutate({ id: modal.id, data: { name: editName.trim() } }, { onSuccess: () => { setModal(null); invalidateFiles(); }, onError: (error) => setNotice(getErrorMessage(error)) });
    if (modal.type === 'rename-folder') updateFolder.mutate({ id: modal.id, data: { name: editName.trim() } }, { onSuccess: () => { setModal(null); qc.invalidateQueries({ queryKey: getListFoldersQueryKey() }); }, onError: (error) => setNotice(getErrorMessage(error)) });
  };
  const onMove = (event: FormEvent) => {
    event.preventDefault();
    if (!modal || modal.type !== 'move') return;
    updateFile.mutate({ id: modal.id, data: { folderId: moveFolderId || null } }, { onSuccess: () => { setModal(null); invalidateFiles(); }, onError: (error) => setNotice(getErrorMessage(error)) });
  };
  const confirmDelete = () => {
    if (!modal) return;
    if (modal.type === 'delete-file') deleteFile.mutate({ id: modal.id }, { onSuccess: () => { setModal(null); invalidateFiles(); setNotice('File deleted.'); }, onError: (error) => setNotice(getErrorMessage(error)) });
    if (modal.type === 'delete-folder') deleteFolder.mutate({ id: modal.id }, { onSuccess: () => { setModal(null); qc.invalidateQueries({ queryKey: getListFoldersQueryKey() }); invalidateFiles(); setNotice('Room deleted.'); }, onError: (error) => setNotice(getErrorMessage(error)) });
  };
  const onLock = () => lock.mutate(undefined, { onSuccess: (nextSession) => { qc.setQueryData(getGetAuthSessionQueryKey(), nextSession); setLocation('/'); }, onError: (error) => setNotice(getErrorMessage(error)) });
  const onLogout = () => logout.mutate(undefined, { onSuccess: () => { qc.removeQueries({ queryKey: getGetAuthSessionQueryKey() }); setLocation('/'); }, onError: (error) => setNotice(getErrorMessage(error)) });

  if (sessionQuery.isLoading) return <div className="min-h-[100dvh] bg-[hsl(var(--background))] p-8"><SkeletonRows /></div>;
  if (!session?.authenticated || !session.vaultUnlocked) return null;

  return (
    <div className="noise flex min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className={`fixed inset-y-0 left-0 z-30 flex transition-transform duration-300 lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}><WorkspaceSidebar activeFolderId={activeFolderId} folders={folders} storage={storageQuery.data} onSelectFolder={setActiveFolderId} onNewFolder={() => setModal({ type: 'folder' })} onClose={() => setSidebarOpen(false)} /></div>
      {sidebarOpen && <button className="fixed inset-0 z-20 bg-[hsl(var(--sidebar)/.46)] lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" data-testid="button-sidebar-overlay" />}
      <section className="min-w-0 flex-1">
        <WorkspaceHeader user={session.user} search={search} setSearch={setSearch} onUpload={openUpload} onNewFolder={() => setModal({ type: 'folder' })} onLock={onLock} onLogout={onLogout} onToggleSidebar={() => setSidebarOpen(true)} />
        <input ref={uploadInput} type="file" multiple className="hidden" onChange={onUpload} data-testid="input-upload-file" />
        <main
          className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-11"
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files); }}
        >
          <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]"><span className="size-1.5 rounded-full bg-[hsl(var(--accent))]" /> {health.data?.status === 'ok' ? 'Cloud online' : 'Your private cloud'}</div><h1 className="font-serif text-[44px] font-bold leading-none tracking-[-.06em] sm:text-[54px]">{activeFolderId ? folders.find((folder: any) => folder.id === activeFolderId)?.name || 'Room' : 'All files'}</h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{search ? `Showing results for “${search}”` : 'Everything you keep close, in one calm place.'}</p></div>
            <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] p-1"><button onClick={() => setView('list')} className={`rounded-lg p-2 ${view === 'list' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid="button-view-list"><List size={16} /></button><button onClick={() => setView('grid')} className={`rounded-lg p-2 ${view === 'grid' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid="button-view-grid"><LayoutGrid size={16} /></button></div>
          </div>
          <div className="mb-7 grid gap-4 md:grid-cols-[1fr_1fr_1.22fr]">
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.67)] p-5 shadow-[var(--shadow-2xs)]"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Files kept</span><File size={16} className="text-[hsl(var(--primary))]" /></div><p className="font-serif text-3xl font-bold">{storageQuery.data?.fileCount ?? '—'}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">quietly accounted for</p></div>
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.67)] p-5 shadow-[var(--shadow-2xs)]"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Storage used</span><HardDrive size={16} className="text-[hsl(var(--destructive))]" /></div><p className="font-serif text-3xl font-bold">{formatBytes(storageQuery.data?.usedBytes)}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">of {formatBytes(storageQuery.data?.quotaBytes)} available</p></div>
            <div className="rounded-2xl bg-[hsl(var(--primary))] p-5 text-[hsl(var(--primary-foreground))] shadow-[0_14px_30px_hsl(var(--primary)/.18)]"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-[hsl(var(--primary-foreground)/.7)]">Private by design</span><ShieldCheck size={17} className="text-[hsl(var(--accent))]" /></div><p className="max-w-[240px] font-serif text-xl font-bold leading-tight">Your files stay yours, from upload to download.</p><div className="mt-4 flex items-center gap-2 text-[10px] text-[hsl(var(--primary-foreground)/.65)]"><Check size={13} className="text-[hsl(var(--accent))]" /> No public index · No shared feed</div></div>
          </div>
          {(notice || uploadProgress || dragging) && <div className="mb-5 flex items-center gap-3 rounded-xl border border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.1)] px-4 py-3 text-xs font-medium text-[hsl(var(--foreground))]" data-testid="status-workspace"><span className={`size-2 rounded-full ${uploadProgress || dragging ? 'animate-pulse bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--primary))]'}`} />{dragging ? 'Drop files to upload them privately.' : uploadProgress || notice}{uploadProgress && <button onClick={() => uploadAbort.current?.abort()} className="rounded-lg px-2 py-1 text-[hsl(var(--destructive))]">Cancel</button>}<button onClick={() => { setNotice(''); setUploadProgress(''); }} className="ml-auto text-[hsl(var(--muted-foreground))]" data-testid="button-dismiss-notice"><X size={15} /></button></div>}
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.64)] shadow-[var(--shadow-2xs)]">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-4 sm:px-5"><div><h2 className="text-sm font-bold">{filesQuery.isLoading ? 'Gathering your files…' : `${files.length} ${files.length === 1 ? 'file' : 'files'}`}</h2><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Updated moments ago</p></div><button onClick={() => { filesQuery.refetch(); foldersQuery.refetch(); storageQuery.refetch(); }} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-refresh-files"><RefreshCw size={15} /></button></div>
            {filesQuery.isLoading ? <SkeletonRows /> : filesQuery.isError ? <div className="p-10 text-center"><p className="font-serif text-xl font-bold">Couldn’t open this room.</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{getErrorMessage(filesQuery.error)}</p><button onClick={() => filesQuery.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-semibold text-[hsl(var(--primary-foreground))]" data-testid="button-retry-files"><RefreshCw size={14} /> Try again</button></div> : files.length === 0 ? <EmptyFiles onUpload={openUpload} /> : view === 'list' ? <><div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_40px] gap-3 px-5 py-3 text-[10px] font-mono uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))] sm:grid"><span>Name</span><span>Size</span><span>Modified</span><span /></div>{files.map((file: any) => <FileRow key={file.id} file={file} onPreview={() => void openPreview(file)} onDownload={() => setDownloadTarget(file.id)} onRename={() => { setEditName(file.name); setModal({ type: 'rename-file', id: file.id, name: file.name }); }} onMove={() => { setMoveFolderId(file.folderId || ''); setModal({ type: 'move', id: file.id, name: file.name, folderId: file.folderId }); }} onDelete={() => setModal({ type: 'delete-file', id: file.id, name: file.name })} />)}</> : <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{files.map((file: any) => { const Icon = iconForMime(file.mimeType); return <div key={file.id} className="group rounded-2xl border border-[hsl(var(--border))] p-4 transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--accent)/.7)] hover:shadow-[var(--shadow-sm)]" data-testid={`card-file-${file.id}`}><div className="mb-8 flex items-start justify-between"><div className="grid size-11 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Icon size={20} /></div><button onClick={() => setModal({ type: 'delete-file', id: file.id, name: file.name })} className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]" data-testid={`button-grid-delete-${file.id}`}><Trash2 size={15} /></button></div><p className="truncate text-sm font-semibold">{file.name}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{formatBytes(file.fileSize)} · {formatDate(file.updatedAt)}</p><div className="mt-4 flex gap-3"><button onClick={() => void openPreview(file)} className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--primary))]"><Eye size={14} /> Preview</button><button onClick={() => setDownloadTarget(file.id)} className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--primary))]" data-testid={`button-grid-download-${file.id}`}><ArrowDownToLine size={14} /> Download</button></div></div> })}</div>}
          </div>
        </main>
      </section>
      {modal?.type === 'folder' && <Modal title="Create a new room" onClose={() => setModal(null)}><form onSubmit={onCreateFolder}><label className="block text-xs font-semibold">Room name<input autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)} className="focus-ring mt-2 h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent))]" placeholder="e.g. Personal archive" data-testid="input-folder-name" /></label><button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="button-create-folder"><FolderPlus size={16} /> Create room</button></form></Modal>}
      {(modal?.type === 'rename-file' || modal?.type === 'rename-folder') && <Modal title={`Rename ${modal.type === 'rename-file' ? 'file' : 'room'}`} onClose={() => setModal(null)}><form onSubmit={onRename}><label className="block text-xs font-semibold">New name<input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="focus-ring mt-2 h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent))]" data-testid="input-rename" /></label><button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="button-save-rename"><Check size={16} /> Save change</button></form></Modal>}
      {modal?.type === 'move' && <Modal title="Move file" onClose={() => setModal(null)}><form onSubmit={onMove}><p className="mb-4 text-sm leading-5 text-[hsl(var(--muted-foreground))]">Choose a room for <strong className="text-[hsl(var(--foreground))]">{modal.name}</strong>.</p><select value={moveFolderId} onChange={(e) => setMoveFolderId(e.target.value)} className="focus-ring h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent))]" data-testid="select-move-folder"><option value="">All files</option>{folders.map((folder: any) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="button-save-move"><Folder size={16} /> Move file</button></form></Modal>}
      {(modal?.type === 'delete-file' || modal?.type === 'delete-folder') && <Modal title={`Delete ${modal.type === 'delete-file' ? 'file' : 'room'}?`} onClose={() => setModal(null)}><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">This will permanently remove <strong className="text-[hsl(var(--foreground))]">{modal.name}</strong>. This action cannot be undone.</p><div className="mt-6 flex gap-3"><button onClick={() => setModal(null)} className="focus-ring h-11 flex-1 rounded-xl border border-[hsl(var(--border))] text-sm font-semibold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-delete">Keep it</button><button onClick={confirmDelete} className="focus-ring h-11 flex-1 rounded-xl bg-[hsl(var(--destructive))] text-sm font-semibold text-[hsl(var(--destructive-foreground))]" data-testid="button-confirm-delete"><Trash2 size={15} className="mr-2 inline" /> Delete</button></div></Modal>}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--sidebar)/.72)] p-4" onClick={() => setPreview(null)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[hsl(var(--card))] p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold">{preview.name}</p>
              <button onClick={() => setPreview(null)} className="rounded-lg p-1.5 hover:bg-[hsl(var(--muted))]"><X size={16} /></button>
            </div>
            {preview.mime.startsWith('image/') && <img src={preview.url} alt="" className="max-h-[70vh] w-full object-contain" />}
            {preview.mime.startsWith('video/') && <video src={preview.url} controls className="max-h-[70vh] w-full" />}
            {preview.mime.startsWith('audio/') && <audio src={preview.url} controls className="w-full" />}
            {(preview.mime.includes('pdf') || preview.mime.startsWith('text/')) && <iframe title={preview.name} src={preview.url} className="h-[70vh] w-full rounded-xl bg-white" />}
            {!preview.mime.startsWith('image/') && !preview.mime.startsWith('video/') && !preview.mime.startsWith('audio/') && !preview.mime.includes('pdf') && !preview.mime.startsWith('text/') && (
              <div className="p-10 text-center">
                <p className="font-serif text-2xl font-bold">Preview unavailable</p>
                <a href={preview.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-11 items-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]">Download file</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={PrivateAccess} /><Route path="/dashboard" component={Dashboard} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

export default App;