import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { staffSignInError } from "../auth/auth-errors";
type LocationState = { from?: string; reason?: string; message?: string };
export function LoginPage() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as LocationState | null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (state.status === "authenticated")
    return <Navigate replace to={routeState?.from ?? "/dashboard/overview"} />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      navigate(routeState?.from ?? "/dashboard/overview", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? staffSignInError(cause.message) : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }
  const pageError =
    state.status === "error" || state.status === "disabled" ? state.message : routeState?.message;
  return (
    <main className="login-page">
      <section className="login-brand">
        <div>
          <span className="brand-mark">S</span>
          <p className="eyebrow">Sokoni Digital</p>
          <h1>Keep the market moving.</h1>
          <p>Secure operations access for authorized Sokoni staff.</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={(event) => void submit(event)}>
          <div className="mobile-brand">
            <span className="brand-mark">S</span>
            <strong>Sokoni Operations</strong>
          </div>
          <p className="eyebrow">Staff portal</p>
          <h2>Welcome back</h2>
          <p>Sign in with your staff email and password.</p>
          {pageError ? (
            <p className="auth-error" role="alert">
              {pageError}
            </p>
          ) : null}
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <label htmlFor="email">Email address</label>
          <input
            autoComplete="email"
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@sokoni.ug"
          />
          <label htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
          <button className="login-button" disabled={submitting || state.status === "loading"}>
            {submitting ? "Signing in…" : "Sign in securely"}
          </button>
          <small>Access is restricted to authorized operations staff.</small>
        </form>
      </section>
    </main>
  );
}
