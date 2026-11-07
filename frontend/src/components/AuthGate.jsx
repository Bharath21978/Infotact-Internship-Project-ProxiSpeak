import { useEffect, useState } from 'react';
import {
  ArrowRight, AudioLines, CheckCircle2, Eye, EyeOff, Headphones, LockKeyhole,
  LogOut, Mail, ShieldCheck, Sparkles, UserRound, Users, Waves,
} from 'lucide-react';
import { AuthApiError, currentUser, loginUser, logoutUser, registerUser } from '../services/authClient.js';
import { hasValidationErrors, validateLogin, validateRegister } from '../lib/authValidation.js';
import './auth.css';

const ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true';
const emptyForm = { username: '', email: '', password: '', confirmPassword: '' };

function AuthScreen({ onSignedIn, notice = '' }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(notice);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  function changeMode(nextMode) {
    setMode(nextMode);
    setErrors({});
    setMessage('');
    setForm(prev => ({ ...prev, password: '', confirmPassword: '' }));
    setPasswordVisible(false);
  }
  function update(event) {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
    setMessage('');
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const problems = mode === 'login' ? validateLogin(form) : validateRegister(form);
    setErrors(problems);
    if (hasValidationErrors(problems)) return;
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'register') {
        await registerUser(form);
        setForm(prev => ({ ...emptyForm, email: prev.email }));
        setMode('login');
        setMessage('Account created. Please sign in with your new credentials.');
      } else {
        await loginUser(form);
        await onSignedIn(); // Verify the server session before mounting the workspace.
      }
    } catch (error) {
      setMessage(error instanceof AuthApiError ? error.message : 'Unexpected error. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ps-auth-shell">
      <section className="ps-auth-story" aria-label="ProxiSpeak introduction">
        <div className="ps-auth-brand"><span className="ps-auth-brand-icon"><AudioLines size={25} /></span><span>proxi<b>speak</b><i>.</i></span></div>
        <div className="ps-auth-story-body">
          <span className="ps-auth-overline"><Sparkles size={14} /> THE SPATIAL INTERNET</span>
          <h1>Work closer.<br /><em>From anywhere.</em></h1>
          <p>Enter a shared 3D space, meet your people, and collaborate with natural, proximity-based conversations.</p>
          <div className="ps-auth-benefits">
            <div><span><Waves size={18} /></span><div><b>Spatial voice</b><small>Conversations that move with you</small></div></div>
            <div><span><Users size={18} /></span><div><b>Live collaboration</b><small>One workspace, connected teams</small></div></div>
            <div><span><ShieldCheck size={18} /></span><div><b>Private workspace</b><small>Secure sessions when backend auth is enabled</small></div></div>
          </div>
        </div>
        <span className="ps-auth-story-footer"><Headphones size={16} /> BUILT FOR THE WAY TEAMS CONNECT</span>
        <div className="ps-auth-orb ps-auth-orb-one" aria-hidden="true"/><div className="ps-auth-orb ps-auth-orb-two" aria-hidden="true"/>
      </section>
      <section className="ps-auth-form-panel">
        <div className="ps-auth-form-wrap">
          <span className="ps-auth-form-tag"><LockKeyhole size={14} /> MEMBER ACCESS</span>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create an account'}</h2>
          <p className="ps-auth-subtitle">{mode === 'login' ? 'Sign in to enter your ProxiSpeak workspace.' : 'Join your team in a more connected workspace.'}</p>
          <div className="ps-auth-tabs" role="group" aria-label="Authentication mode">
            <button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Log in</button>
            <button type="button" aria-pressed={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>Sign up</button>
          </div>
          <form noValidate onSubmit={submit} className="ps-auth-form">
            {mode === 'register' && <label className="ps-auth-field"><span>Username</span><div className="ps-auth-input-wrap"><UserRound size={17}/><input autoComplete="username" name="username" value={form.username} onChange={update} placeholder="your_name" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'ps-auth-username-error' : undefined}/></div>{errors.username && <small id="ps-auth-username-error" className="ps-auth-field-error">{errors.username}</small>}</label>}
            <label className="ps-auth-field"><span>Email address</span><div className="ps-auth-input-wrap"><Mail size={17}/><input type="email" autoComplete="email" name="email" value={form.email} onChange={update} placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'ps-auth-email-error' : undefined}/></div>{errors.email && <small id="ps-auth-email-error" className="ps-auth-field-error">{errors.email}</small>}</label>
            <label className="ps-auth-field"><span>Password</span><div className="ps-auth-input-wrap"><LockKeyhole size={17}/><input type={passwordVisible ? 'text' : 'password'} name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update} placeholder="Enter your password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'ps-auth-password-error' : undefined}/><button type="button" className="ps-auth-reveal" onClick={() => setPasswordVisible(v => !v)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}>{passwordVisible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{errors.password && <small id="ps-auth-password-error" className="ps-auth-field-error">{errors.password}</small>}</label>
            {mode === 'register' && <label className="ps-auth-field"><span>Confirm password</span><div className="ps-auth-input-wrap"><LockKeyhole size={17}/><input type={passwordVisible ? 'text' : 'password'} name="confirmPassword" autoComplete="new-password" value={form.confirmPassword} onChange={update} placeholder="Re-enter your password" aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'ps-auth-confirm-error' : undefined}/></div>{errors.confirmPassword && <small id="ps-auth-confirm-error" className="ps-auth-field-error">{errors.confirmPassword}</small>}</label>}
            {message && <p role="status" className={`ps-auth-message ${message.startsWith('Account created') ? 'ps-auth-success' : ''}`}>{message}</p>}
            <button type="submit" className="ps-auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Enter workspace' : 'Create account'}<ArrowRight size={18} /></button>
          </form>
          <p className="ps-auth-switch">{mode === 'login' ? "New to ProxiSpeak?" : 'Already a member?'} <button type="button" onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Log in'}</button></p>
          <p className="ps-auth-footnote"><CheckCircle2 size={14}/> Your password is never stored in the browser by this frontend.</p>
        </div>
      </section>
    </main>
  );
}

/**
 * Client-side UX gate only; real security REQUIRES backend route + Socket.IO auth.
 * Disabled by default to preserve the existing team demo until API integration.
 */
export default function AuthGate({ children }) {
  const [stage, setStage] = useState(ENABLED ? 'checking' : 'disabled');
  const [account, setAccount] = useState(null);
  const [notice, setNotice] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!ENABLED) return;
    let mounted = true;
    currentUser().then(user => {
      if (!mounted) return;
      setAccount(user);
      setStage('ready');
    }).catch(error => {
      if (!mounted) return;
      if (error.status !== 401) setNotice(error.message);
      setStage('guest');
    });
    return () => { mounted = false; };
  }, []);

  if (stage === 'disabled') return children;
  if (stage === 'checking') return <div className="ps-auth-checking" role="status"><AudioLines size={32}/> Checking your workspace session…</div>;
  if (stage === 'guest') return <AuthScreen notice={notice} onSignedIn={async () => {
    const user = await currentUser();
    setAccount(user);
    setNotice('');
    setStage('ready');
  }}/>;

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setNotice('');
    try {
      await logoutUser();
      setAccount(null);
      setStage('guest');
    } catch (error) {
      // Do not claim the session was revoked if the backend did not confirm it.
      setNotice(`Logout could not be confirmed: ${error.message}`);
    } finally { setLoggingOut(false); }
  }

  return <>
    {children}
    <div className="ps-auth-session-pill" aria-label="Signed-in account">
      <span title={account?.email || ''}><UserRound size={14}/>{account?.username || account?.email || 'Account'}</span>
      <button type="button" disabled={loggingOut} onClick={handleLogout}><LogOut size={14}/>{loggingOut ? 'Signing out' : 'Log out'}</button>
      {notice && <span className="ps-auth-session-error" role="alert">{notice}</span>}
    </div>
  </>;
}
