import React, { useState } from 'react';
import { Lock, ArrowLeft, Loader2, KeyRound, AlertCircle } from 'lucide-react';
import { AppLogo } from './AppLogo';

interface AdminLoginProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdminLogin({ onSuccess, onCancel }: AdminLoginProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    if (!cleanPin) {
      setError('Please enter the Admin PIN');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Attempt verification with backend API
      let isVerified = false;
      let errorMessage: string | null = null;

      try {
        const res = await fetch('/api/admin/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: cleanPin }),
        });

        if (res.status === 200) {
          const data = await res.json();
          if (data.success) {
            isVerified = true;
            sessionStorage.setItem('iskcon_admin_token', data.token || 'authenticated');
          } else {
            errorMessage = data.error || 'Incorrect PIN';
          }
        } else if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          errorMessage = data.error || 'Incorrect PIN. Please enter the valid Admin PIN.';
        } else {
          // If server responded with other status, fallback check
          if (cleanPin === '2580') {
            isVerified = true;
            sessionStorage.setItem('iskcon_admin_token', 'local_authenticated');
          } else {
            errorMessage = 'Incorrect PIN. Please enter the valid Admin PIN.';
          }
        }
      } catch {
        // Direct fallback check if offline or standalone preview
        if (cleanPin === '2580') {
          isVerified = true;
          sessionStorage.setItem('iskcon_admin_token', 'offline_authenticated');
        } else {
          errorMessage = 'Incorrect PIN. Please enter 2580 or your configured Admin PIN.';
        }
      }

      if (isVerified) {
        onSuccess();
      } else {
        setError(errorMessage || 'Incorrect PIN. Please try again.');
        setPin('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 10) {
      setPin((prev) => prev + digit);
      setError(null);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  return (
    <div className="w-full max-w-sm mx-auto px-2 py-4 sm:py-8 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white border border-blue-100 rounded-3xl p-6 sm:p-7 shadow-xl space-y-5 text-center relative overflow-hidden">
        {/* Decorative Top Accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 blue-gradient" />

        {/* Logo and Title */}
        <div className="flex flex-col items-center space-y-2 pt-1">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 p-1 shadow-sm flex items-center justify-center overflow-hidden">
              <AppLogo className="w-full h-full object-contain" size={48} />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#1E40AF] text-white flex items-center justify-center shadow-xs">
              <Lock className="w-3 h-3" />
            </div>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-serif-cultural flex items-center justify-center">
              <span>Admin Verification</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter Admin PIN to access volunteer cards
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 text-left">
            <label
              htmlFor="admin-pin-input"
              className="text-xs font-bold text-slate-700 flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#1E40AF]" />
              <span>Admin PIN</span>
            </label>

            <div className="relative">
              <input
                id="admin-pin-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
                autoFocus
                className="w-full text-center tracking-[0.35em] text-xl font-mono font-bold py-3.5 px-4 rounded-2xl border border-slate-300 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 outline-none transition-all bg-slate-50/70"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Mobile Touch Keypad */}
          <div className="grid grid-cols-3 gap-1.5 pt-1 select-none">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 active:bg-blue-100 text-slate-800 font-bold text-base border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin('')}
              className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs border border-slate-200 transition-colors cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-800 font-bold text-base border border-slate-200 transition-colors cursor-pointer shadow-2xs"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs border border-slate-200 transition-colors cursor-pointer"
            >
              ⌫
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="admin-login-submit-btn"
            disabled={isLoading || !pin}
            className="w-full py-3 px-4 rounded-xl blue-gradient hover:opacity-95 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Unlock Admin Portal</span>
              </>
            )}
          </button>
        </form>

        {/* Back to Public Form */}
        <div className="pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-500 hover:text-[#1E40AF] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Volunteer Form</span>
          </button>
        </div>
      </div>
    </div>
  );
}
