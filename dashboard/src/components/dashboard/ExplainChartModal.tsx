"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface ExplainChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartData?: any;
  chartConfig?: any;
}

export function ExplainChartModal({ isOpen, onClose, chartData, chartConfig }: ExplainChartModalProps) {
  const [explanation, setExplanation] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setExplanation("");
      setError(null);
      return;
    }

    const fetchExplanation = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ai/explain-chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chartData, chartConfig }),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to generate explanation");
        }

        setExplanation(data.explanation || "No explanation available");
      } catch (err: any) {
        console.error("Failed to fetch explanation:", err);
        setError(err.message || "Failed to generate explanation");
      } finally {
        setLoading(false);
      }
    };

    fetchExplanation();
  }, [isOpen, chartData, chartConfig]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-2xl mx-4 bg-slate-900/95 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-xl border border-purple-400/20">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Chart Explanation</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-4" />
                  <p className="text-slate-400 text-sm">Generating explanation...</p>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {!loading && !error && explanation && (
                <div className="prose prose-invert max-w-none">
                  <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {explanation}
                    </p>
                  </div>
                </div>
              )}

              {!loading && !error && !explanation && (
                <div className="text-center py-12">
                  <p className="text-slate-400">No explanation available</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10 bg-white/5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
