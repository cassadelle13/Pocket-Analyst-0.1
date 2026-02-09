"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Mic, MicOff, Sparkles } from "lucide-react";

interface AIChartAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  chartName: string;
  chartType: string;
}

export function AIChartAssistant({ isOpen, onClose, chartName, chartType }: AIChartAssistantProps) {
  const [message, setMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'ru-RU';

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setMessage(prev => prev + (prev ? ' ' : '') + transcript);
          setIsListening(false);
        };

        recognitionRef.current.onerror = () => {
          setIsListening(false);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Voice input is not supported in your browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleSend = () => {
    if (!message.trim()) return;

    const userMessage = { role: 'user' as const, content: message };
    setMessages(prev => [...prev, userMessage]);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse = {
        role: 'assistant' as const,
        content: `Понял ваш запрос по графику "${chartName}". Я могу помочь настроить цвета, оси, легенду и другие параметры. Что именно вы хотите изменить?`
      };
      setMessages(prev => [...prev, aiResponse]);
    }, 1000);

    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4 pointer-events-none">
      <div 
        className="w-full max-w-4xl pointer-events-auto animate-in slide-in-from-bottom duration-300"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className="backdrop-blur-xl bg-slate-900/95 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg">
                <Sparkles className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">AI Chart Assistant</h3>
                <p className="text-xs text-slate-400">{chartName} • {chartType}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="max-h-64 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-xl ${
                      msg.role === 'user'
                        ? 'bg-blue-500/20 text-white border border-blue-500/30'
                        : 'bg-white/5 text-slate-200 border border-white/10'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="px-6 py-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Опишите, как вы хотите настроить график... (Enter для отправки, Shift+Enter для новой строки)"
                  className="w-full bg-white/5 text-white border border-white/20 rounded-xl px-4 py-3 pr-14 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400 resize-none"
                  rows={3}
                  style={{ maxHeight: '200px' }}
                />
                
                {/* Voice Button Inside Input */}
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`absolute right-3 bottom-3 p-2 rounded-lg transition-all ${
                    isListening
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/20'
                  }`}
                  title={isListening ? 'Остановить запись' : 'Голосовой ввод'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={!message.trim()}
                className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors flex items-center justify-center"
                title="Отправить"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>

            {isListening && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                <span>Слушаю...</span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMessage("Измени цвета графика на более контрастные")}
                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors"
              >
                💡 Изменить цвета
              </button>
              <button
                type="button"
                onClick={() => setMessage("Добавь подписи данных на график")}
                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors"
              >
                💡 Добавить подписи
              </button>
              <button
                type="button"
                onClick={() => setMessage("Сделай график более минималистичным")}
                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors"
              >
                💡 Минималистичный стиль
              </button>
              <button
                type="button"
                onClick={() => setMessage("Увеличь размер шрифта на осях")}
                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg transition-colors"
              >
                💡 Увеличить шрифт
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
