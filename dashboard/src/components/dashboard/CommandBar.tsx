"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Send, Loader2, CheckCircle, XCircle } from "lucide-react";

interface CommandBarProps {
  onCommand: (text: string) => Promise<void>;
  disabled?: boolean;
  voiceEnabled?: boolean;
}

export type CommandBarHandle = {
  startVoice: () => void;
  stopVoice: () => void;
  isListening: () => boolean;
};

export const CommandBar = forwardRef<CommandBarHandle, CommandBarProps>(function CommandBar(
  { onCommand, disabled = false, voiceEnabled = true }: CommandBarProps,
  ref
) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState("");

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCommittedRef = useRef<string>("");

  const stopVoice = () => {
    try {
      recognitionRef.current?.stop?.();
    } finally {
      setIsListening(false);
    }
  };

  const startVoice = () => {
    if (!voiceEnabled || disabled || loading) return;
    if (!recognitionRef.current) return;
    lastCommittedRef.current = input;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      startVoice,
      stopVoice,
      isListening: () => isListening,
    }),
    [isListening, voiceEnabled, disabled, loading, input]
  );

  useEffect(() => {
    if (!voiceEnabled) return;
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "ru-RU";

    rec.onresult = (event: any) => {
      const committed = lastCommittedRef.current;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        const t = String(r?.[0]?.transcript ?? "");
        if (r?.isFinal) {
          lastCommittedRef.current = (lastCommittedRef.current ? lastCommittedRef.current + " " : "") + t.trim();
        } else {
          interim += t;
        }
      }
      const next = [lastCommittedRef.current.trim(), interim.trim()].filter(Boolean).join(" ");
      setInput(next);
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      inputRef.current?.focus?.();
    };

    recognitionRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        // noop
      }
      recognitionRef.current = null;
    };
  }, [voiceEnabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || loading || disabled) {
      return;
    }

    setLoading(true);
    setStatus('idle');
    setMessage("");

    try {
      await onCommand(input.trim());
      setStatus('success');
      setMessage("Command executed");
      setInput("");
      
      setTimeout(() => {
        setStatus('idle');
        setMessage("");
      }, 2000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : "Command failed");
      
      setTimeout(() => {
        setStatus('idle');
        setMessage("");
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 focus-within:border-white/20 transition-colors">
              <Send className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading || disabled}
                placeholder='Try: "сделай график столбчатым" or "покажи топ 5"'
                className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {status !== 'idle' && (
                <div className="shrink-0">
                  {status === 'success' && (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  )}
                  {status === 'error' && (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              )}
            </div>

            {voiceEnabled && isListening && (
              <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10" />
                <div className="absolute inset-0 flex items-center justify-end pr-4">
                  <div className="flex items-end gap-[3px] h-5">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-[3px] rounded-full bg-gradient-to-t from-blue-400/90 to-purple-400/90 animate-pulse"
                        style={{
                          height: `${8 + ((i * 7) % 14)}px`,
                          animationDelay: `${i * 60}ms`,
                          animationDuration: `${380 + (i % 3) * 120}ms`,
                          opacity: 0.9,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!input.trim() || loading || disabled}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:shadow-lg hover:shadow-blue-500/25 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 disabled:shadow-none text-white rounded-xl transition-all text-xs font-semibold flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </div>

        {message && (
          <div className={`mt-2 text-xs ${status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
            {message}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[11px] text-slate-500 mr-1">Examples:</span>
          {[
            "сделай график линейным",
            "поменяй X на timestamp",
            "добавь revenue в Y",
            "покажи топ 10",
          ].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setInput(example)}
              disabled={loading || disabled}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-slate-300 transition-all disabled:opacity-40"
            >
              {example}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
});
