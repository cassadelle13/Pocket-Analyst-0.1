"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogInIcon, EyeIcon, EyeOffIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { useConnectionState } from "../../providers";

const VALID_USERS = [
  { login: "user 1", password: "1111" },
  { login: "user 2", password: "1111" },
  { login: "user 3", password: "1111" },
];

export function LoginForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { setActiveConnection } = useConnectionState();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      const isValid = VALID_USERS.some(
        (u) => u.login === login.trim().toLowerCase() && u.password === password
      );

      if (isValid) {
        setError("");
        setActiveConnection({
          id: "demo-session",
          name: login.trim(),
          type: "clickhouse" as any,
          connectedAt: new Date().toISOString(),
        });
        router.push("/home");
      } else {
        setError("Неверный логин или пароль");
      }
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      {/* Динамический градиент в стиле нефтяного пятна */}
      <div className="absolute inset-0 opacity-15">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-purple-950 to-slate-900 opacity-60 animate-pulse" style={{ animationDelay: '3s', animationDuration: '12s' }} />
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-amber-950/20 to-orange-950/10 rounded-full blur-[150px] opacity-30 animate-blob" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-rose-950/20 to-pink-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-0 left-1/3 w-[450px] h-[450px] bg-gradient-to-tr from-violet-950/20 to-purple-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '4s' }} />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-teal-950/15 to-cyan-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '6s' }} />
        <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-gradient-to-tl from-indigo-950/15 to-blue-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '8s' }} />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gradient-to-r from-emerald-950/10 to-teal-950/5 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '10s' }} />
      </div>
      
      {/* Основная карточка */}
      <div className="relative z-10 w-full max-w-md px-4">
          {/* Основной контент */}
          <div className="relative bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-8">
              {/* Иконка */}
              <div className="inline-flex items-center justify-center w-16 h-16 mb-6 relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl animate-pulse" />
                <div className="relative bg-gradient-to-br from-emerald-500/30 to-blue-500/30 rounded-2xl p-4 border border-emerald-500/30">
                  <LogInIcon className="w-8 h-8 text-emerald-400" />
                </div>
              </div>
              
              {/* Заголовки */}
              <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                PocketAnalyst
              </h1>
              <p className="text-emerald-400 text-sm font-medium uppercase tracking-[0.3em] mb-2">
                Вход в систему
              </p>
              <p className="text-slate-400 text-sm">
                Введите данные для доступа к аналитической платформе
              </p>
            </div>

            {/* Ошибка */}
            {error && (
              <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            {/* Форма */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Поле логина */}
              <div className="space-y-2">
                <label htmlFor="login" className="block text-sm font-medium text-slate-300 uppercase tracking-[0.2em]">
                  Логин
                </label>
                <div className="relative">
                  <input
                    id="login"
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="Введите логин"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-300"
                    required
                  />
                </div>
              </div>

              {/* Поле пароля */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 uppercase tracking-[0.2em]">
                  Пароль
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    className="w-full px-4 py-3 pr-12 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-300"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Кнопка входа */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
                <div className="relative bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-3 px-6 rounded-xl border-0 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50">
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Вход...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheckIcon className="w-4 h-4" />
                      <span>Войти</span>
                    </>
                  )}
                </div>
              </button>
            </form>

            {/* Demo подсказка */}
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <SparklesIcon className="w-3 h-3 text-emerald-400" />
                <span>Доступные логины: user 1, user 2, user 3 · Пароль: 1111</span>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
