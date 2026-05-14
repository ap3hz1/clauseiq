"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Only allow same-origin relative redirects (open-redirect safe). */
function safeCallbackUrl(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/";
  const t = raw.trim();
  if (!t.startsWith("/")) return "/";
  if (t.startsWith("//")) return "/";
  if (t.includes("://")) return "/";
  return t;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const body = (await res.json()) as {
      data?: { status?: string; requiresEmailConfirmation?: boolean };
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(body.error?.message ?? "Authentication failed.");
      return;
    }
    if (mode === "signup" && body.data?.requiresEmailConfirmation) {
      setNotice("Account created. Check your email and confirm your account, then log in.");
      setMode("login");
      return;
    }
    const next = safeCallbackUrl(searchParams.get("callbackUrl"));
    router.push(next);
    router.refresh();
  }

  return (
    <section className="card w-full">
      <div className="card-heading">
        <h1 className="title">ClauseIQ access</h1>
        <p className="card-lead">Sign in to use the analyzer, history, and exports.</p>
      </div>
      <label>
        Email
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block pt-1">
        Password
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <div className="auth-actions">
        <button type="button" className="btn-primary" onClick={submit}>
          {mode === "login" ? "Log in" : "Create account"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}>
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm font-medium text-emerald-800">{notice}</p> : null}
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="w-full max-w-lg">
      <Suspense
        fallback={
          <section className="card w-full">
            <div className="card-heading">
              <h1 className="title">ClauseIQ access</h1>
              <p className="card-lead text-slate-400">Loading…</p>
            </div>
          </section>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
