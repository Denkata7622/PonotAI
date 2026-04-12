'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "../context/UserContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { writeTasteProfile } from "../features/onboarding/tasteProfile";

const USERNAME_REGEX = /^\w{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, isAuthenticated } = useUser();
  const { language } = useLanguage();

  const [tab, setTab] = useState<"signin" | "signup">(
    searchParams.get("tab") === "signup" ? "signup" : "signin"
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [genres, setGenres] = useState("");
  const [artists, setArtists] = useState("");
  const [moods, setMoods] = useState("");
  const [goals, setGoals] = useState("");

  // If already logged in, redirect home
  useEffect(() => {
    if (isAuthenticated) router.push("/");
  }, [isAuthenticated, router]);

  function clearForm() {
    setError(null);
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
      router.push("/");
    } catch (e) {
      const code = (e as Error).message;
      if (code === "INVALID_CREDENTIALS") setError("Wrong email or password");
      else setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitSignUp() {
    setError(null);

    if (!username.trim()) return setError("Username is required");
    if (!USERNAME_REGEX.test(username.trim()))
      return setError("Username must be 3–30 characters (letters, numbers, _)");
    if (!email.trim()) return setError("Email is required");
    if (!EMAIL_REGEX.test(email.trim())) return setError("Enter a valid email address");
    if (!password) return setError("Password is required");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      setShowOnboarding(true);
    } catch (e) {
      const code = (e as Error).message;
      if (code === "USERNAME_TAKEN") setError("That username is already taken");
      else if (code === "EMAIL_TAKEN") setError("That email is already registered");
      else setError("Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function finishOnboarding(skip = false) {
    writeTasteProfile({
      genres: skip ? [] : genres.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8),
      artists: skip ? [] : artists.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8),
      moods: skip ? [] : moods.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8),
      goals: skip ? [] : goals.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8),
      completedAt: new Date().toISOString(),
      skipped: skip,
    });
    router.push("/");
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
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-2xl">
        {/* Logo */}
        <div className="mb-6 text-center">
          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/20">
            <span className="text-2xl">🎵</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">PonotAI</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex rounded-xl border border-[var(--border)] p-1">
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              tab === "signin"
                ? "bg-[var(--accent)] text-white shadow"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            onClick={() => switchTab("signin")}
          >
            Sign In
          </button>
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              tab === "signup"
                ? "bg-[var(--accent)] text-white shadow"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            onClick={() => switchTab("signup")}
          >
            Sign Up
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Sign In */}
        {tab === "signin" && (
          <div className="space-y-4" onKeyDown={handleKeyDown}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Email</label>
              <input
                className={inputClass}
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Password</label>
              <div className="relative">
                <input
                  className={inputClass + " pr-16"}
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button
              className="w-full rounded-xl bg-[var(--accent)] py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
              onClick={submitSignIn}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </div>
        )}

        {/* Sign Up */}
        {tab === "signup" && (
          <div className="space-y-4" onKeyDown={handleKeyDown}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Username</label>
              <input
                className={inputClass}
                type="text"
                placeholder="e.g. denislav_99"
                value={username}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">3–30 chars, letters / numbers / _</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Email</label>
              <input
                className={inputClass}
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Password</label>
              <div className="relative">
                <input
                  className={inputClass + " pr-16"}
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="mt-1.5 flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-all ${
                        password.length >= level * 3
                          ? level <= 1 ? "bg-red-400"
                            : level <= 2 ? "bg-yellow-400"
                            : level <= 3 ? "bg-blue-400"
                            : "bg-green-400"
                          : "bg-[var(--border)]"
                      }`}
                    />
                  ))}
                </div>
              )}
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
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1 text-xs text-red-400">Passwords don't match</p>
              )}
            </div>
            <button
              className="w-full rounded-xl bg-[var(--accent)] py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
              onClick={submitSignUp}
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </div>
        )}

        {/* Switch hint */}
        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          {tab === "signin" ? (
            <>Don't have an account?{" "}
              <button className="text-[var(--accent)] underline-offset-2 hover:underline" onClick={() => switchTab("signup")}>
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button className="text-[var(--accent)] underline-offset-2 hover:underline" onClick={() => switchTab("signin")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
      {showOnboarding ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-xl font-semibold">{t("onboarding_title", language)}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("onboarding_desc", language)}</p>
            {[
              [t("onboarding_genres", language), genres, setGenres, "rock, pop, jazz"],
              [t("onboarding_artists", language), artists, setArtists, "Daft Punk, Metallica"],
              [t("onboarding_moods", language), moods, setMoods, "calm, energetic"],
              [t("onboarding_goals", language), goals, setGoals, "study, gym, chill, focus"],
            ].map(([label, value, setter, placeholder]) => (
              <label key={label as string} className="mt-3 block text-sm">
                <span className="mb-1 block">{label as string}</span>
                <input className={inputClass} value={value as string} placeholder={placeholder as string} onChange={(event) => (setter as (v: string) => void)(event.target.value)} />
              </label>
            ))}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" onClick={() => finishOnboarding(true)}>{t("onboarding_skip", language)}</button>
              <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white" onClick={() => finishOnboarding(false)}>{t("onboarding_save", language)}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
