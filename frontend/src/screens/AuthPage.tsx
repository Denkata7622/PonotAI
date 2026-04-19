'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Music } from "../../lucide-react";
import { useUser } from "../context/UserContext";

const USERNAME_REGEX = /^\w{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, resendVerification, isAuthenticated, isLoading, onboardingRequired } = useUser();

  const [tab, setTab] = useState<"signin" | "signup">(
    searchParams.get("tab") === "signup" ? "signup" : "signin"
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    router.replace(onboardingRequired ? "/onboarding" : "/");
  }, [isLoading, isAuthenticated, onboardingRequired, router]);

  function clearForm() {
    setError(null);
    setVerificationNotice(null);
    setEmail("");
    setPassword("");
    setUsername("");
    setConfirmPassword("");
    setShowPassword(false);
  }

  function switchTab(next: "signin" | "signup") {
    setTab(next);
    clearForm();
  }

  async function submitSignIn() {
    setError(null);
    if (!email.trim()) return setError("Email is required");
    if (!password) return setError("Password is required");

    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (e) {
      const code = (e as Error).message;
      if (code === "INVALID_CREDENTIALS") setError("Wrong email or password");
      else if (code === "EMAIL_NOT_VERIFIED") setError("Please verify your email first. Check your inbox.");
      else setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitSignUp() {
    setError(null);

    if (!username.trim()) return setError("Username is required");
    if (!USERNAME_REGEX.test(username.trim())) {
      return setError("Username must be 3–30 characters (letters, numbers, _)");
    }
    if (!email.trim()) return setError("Email is required");
    if (!EMAIL_REGEX.test(email.trim())) return setError("Enter a valid email address");
    if (!password) return setError("Password is required");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      setVerificationNotice("Account created. Verify your email to finish setup.");
      setTab("signin");
      setPassword("");
      setConfirmPassword("");
    } catch (e) {
      const code = (e as Error).message;
      if (code === "USERNAME_TAKEN") setError("That username is already taken");
      else if (code === "EMAIL_TAKEN") setError("That email is already registered");
      else setError("Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim()) return setError("Enter your email to resend verification");
    if (!EMAIL_REGEX.test(email.trim())) return setError("Enter a valid email address");
    setLoading(true);
    setError(null);
    try {
      await resendVerification(email.trim());
      setVerificationNotice("Verification email sent if this account exists and is not verified.");
    } catch {
      setError("Could not resend verification email.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (tab === "signin") void submitSignIn();
      else void submitSignUp();
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-2.5 text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-8 shadow-[0_20px_45px_rgba(var(--accent-rgb),0.16)]">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--accent-border)] bg-[color:var(--accent-soft)] text-[var(--accent)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.22)]">
            <Music className="h-7 w-7" strokeWidth={2.1} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">PonotAI</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        <div className="mb-6 flex rounded-xl border border-[var(--border)] p-1">
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              tab === "signin"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            onClick={() => switchTab("signin")}
          >
            Sign In
          </button>
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              tab === "signup"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            onClick={() => switchTab("signup")}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/12 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {verificationNotice && (
          <div className="mb-4 rounded-xl border border-green-400/30 bg-green-500/12 px-4 py-3 text-sm text-green-200">
            {verificationNotice}
          </div>
        )}

        {tab === "signin" && (
          <div className="space-y-4" onKeyDown={handleKeyDown}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Email</label>
              <input className={inputClass} type="email" placeholder="you@example.com" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Password</label>
              <div className="relative">
                <input className={`${inputClass} pr-16`} type={showPassword ? "text" : "password"} placeholder="Your password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button className="w-full rounded-xl bg-[var(--accent)] py-2.5 font-semibold text-[var(--accent-foreground)] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={submitSignIn}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <button className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text)] transition-all hover:bg-[var(--input-bg)] disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={handleResendVerification}>
              Resend verification email
            </button>
          </div>
        )}

        {tab === "signup" && (
          <div className="space-y-4" onKeyDown={handleKeyDown}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Username</label>
              <input className={inputClass} type="text" placeholder="e.g. denislav_99" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
              <p className="mt-1 text-xs text-[var(--muted)]">3–30 chars, letters / numbers / _</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Email</label>
              <input className={inputClass} type="email" placeholder="you@example.com" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Password</label>
              <div className="relative">
                <input className={`${inputClass} pr-16`} type={showPassword ? "text" : "password"} placeholder="Min. 8 characters" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Confirm password</label>
              <input
                className={`${inputClass} ${
                  confirmPassword && confirmPassword !== password
                    ? "border-red-400/60 ring-1 ring-red-400/40"
                    : confirmPassword && confirmPassword === password
                      ? "border-green-400/60"
                      : ""
                }`}
                type={showPassword ? "text" : "password"}
                placeholder="Repeat your password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button className="w-full rounded-xl bg-[var(--accent)] py-2.5 font-semibold text-[var(--accent-foreground)] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={submitSignUp}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </div>
        )}

        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          {tab === "signin" ? (
            <>Don&apos;t have an account? <button className="text-[var(--accent)] underline-offset-2 hover:underline" onClick={() => switchTab("signup")}>Sign up</button></>
          ) : (
            <>Already have an account? <button className="text-[var(--accent)] underline-offset-2 hover:underline" onClick={() => switchTab("signin")}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
