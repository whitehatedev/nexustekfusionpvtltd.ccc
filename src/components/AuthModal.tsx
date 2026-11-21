import React from 'react';
import { X } from 'lucide-react';
import { CustomerOtpAuth } from './CustomerOtpAuth';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccessRedirect?: (destination: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose, onSuccessRedirect }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123B5D]/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-[#DCEAF5] shadow-2xl">
        <div className="bg-[#F0F8FF] border-b border-[#DCEAF5] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
          <div className="text-[11px] font-mono font-semibold text-[#1E88E5] uppercase tracking-wider">
            Customer Email OTP Sign-In
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#263746] hover:text-[#123B5D] hover:bg-white/80"
            aria-label="Close sign in dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          <CustomerOtpAuth
            compact
            onComplete={(dest) => {
              onClose();
              onSuccessRedirect?.(dest);
            }}
          />
        </div>
      </div>
    </div>
  );
};
