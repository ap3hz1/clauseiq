"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

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
    router.push("/");
    router.refresh();
  }

  return (
    <main className="container">
      <section className="card">
        <h1>ClauseIQ Access</h1>
        <p>Use your account to run analyses and access history.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={submit}>
            {mode === "login" ? "Log in" : "Sign up"}
          </button>
          <button type="button" onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}>
            Switch to {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </div>
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {notice ? <p style={{ color: "#047857" }}>{notice}</p> : null}
      </section>
    </main>
  );
}
