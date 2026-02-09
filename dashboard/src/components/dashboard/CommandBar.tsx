"use client";

import { useState } from "react";
import { Send, Loader2, CheckCircle, XCircle } from "lucide-react";

interface CommandBarProps {
  onCommand: (text: string) => Promise<void>;
  disabled?: boolean;
}

export function CommandBar({ onCommand, disabled = false }: CommandBarProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState("");

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
    <div className="border-t border-slate-700 bg-slate-900 p-4">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || disabled}
              placeholder='Try: "сделай график столбчатым" or "покажи топ 5"'
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {status !== 'idle' && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {status === 'success' && (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                )}
                {status === 'error' && (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!input.trim() || loading || disabled}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
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
          <div className={`mt-2 text-sm ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            {message}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-slate-500">Examples:</span>
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
              className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
