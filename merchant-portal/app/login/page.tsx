"use client";
import React, { Suspense } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, Lock, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";

function safeRedirectPath(input?: string | null): string {
  if (!input) return "/";
  try {
    const url = new URL(input, "http://x");
    const path = url.pathname + (url.search || "");
    if (!path.startsWith("/")) return "/";
    if (path.startsWith("/_next")) return "/";
    if (path.startsWith("/api/")) return "/";
    if (path.startsWith("/login")) return "/";
    return path;
  } catch {
    return "/";
  }
}

// Wrapper for Suspense boundary (useSearchParams requires it)
export default function PortalLoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="fixed inset-0 z-50 min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-8 animate-pulse">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 bg-gray-200 rounded-xl mb-4" />
          <div className="h-6 w-48 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
        </div>
        <div className="mt-8 space-y-5">
          <div className="h-10 w-full bg-gray-100 rounded-lg" />
          <div className="h-10 w-full bg-gray-100 rounded-lg" />
          <div className="h-12 w-full bg-gray-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectPath = safeRedirectPath(searchParams.get("redirect"));
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [needCode, setNeedCode] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  async function login() {
    if (loading) return;
    setMsg("");
    setLoading(true);
    try {
      const payload = {
        email: email.trim(),
        password,
        code: needCode ? code.trim() : undefined,
      };
      const r = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        if (/TOTP required/i.test(t)) {
          setNeedCode(true);
          setMsg("Требуется код из аутентификатора");
          return;
        }

        let message = t;
        try {
          const json = JSON.parse(t);
          if (json?.message) message = String(json.message);
          else if (json?.error) message = String(json.error);
        } catch {}

        if (r.status === 401 || r.status === 403) {
          throw new Error(
            message && message.length < 200
              ? message
              : "Не удалось войти. Проверьте email и пароль.",
          );
        }

        throw new Error(message || "Ошибка входа");
      }
      window.location.href = redirectPath;
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden">
        <div className="bg-white p-8 pb-0 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-600 rounded-xl text-white font-bold text-xl mb-4 shadow-lg shadow-purple-200">
            L
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Добро пожаловать!</h2>
          <p className="text-gray-500 text-sm mt-2">
            Введите свои данные для входа в панель управления.
          </p>
        </div>

        <div className="p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
            className="space-y-5"
          >
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setMsg("");
                  }}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
                  placeholder="name@company.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Пароль
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setMsg("");
                  }}
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {needCode && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Код 2FA
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-5 w-5 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
                  </div>
                  <input
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setMsg("");
                    }}
                    placeholder="123456"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Введите 6‑значный код из приложения‑аутентификатора.
                </p>
              </div>
            )}

            {msg && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {msg}
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !email.trim() ||
                !password ||
                (needCode && !code.trim())
              }
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  Вход в систему...
                </>
              ) : (
                <>
                  Войти
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200/30 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
