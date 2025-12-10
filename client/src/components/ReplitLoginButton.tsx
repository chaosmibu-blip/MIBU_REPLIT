import React from 'react';
import { motion } from 'framer-motion';

interface ReplitIconProps {
  className?: string;
}

export const ReplitIcon: React.FC<ReplitIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12zm8.5-4c0-1.105-.895-2-2-2s-2 .895-2 2v4c0 1.105.895 2 2 2s2-.895 2-2V8zm5 4c0-1.105-.895-2-2-2s-2 .895-2 2v4c0 1.105.895 2 2 2s2-.895 2-2v-4zm5 4c0-1.105-.895-2-2-2s-2 .895-2 2v4c0 1.105.895 2 2 2s2-.895 2-2v-4z" />
  </svg>
);

// Simplified Replit Logo (Code brackets style)
export const ReplitLogoSimple: React.FC<ReplitIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
     <path fillRule="evenodd" d="M7 6a1 1 0 0 1 2 0v4l6.4-3.2A1 1 0 0 1 16 8.2l-6 3a1 1 0 0 1-.8 0l-6-3A1 1 0 1 1 4 6.8L7 8.3V6.05zm0 5.95v2.05a1 1 0 0 0 2 0v-4l-2 1.95z" clipRule="evenodd" />
     {/* Official-ish shape approximation for immediate recognition */}
     <path d="M5.5 5h4v4h-4z" />
     <path d="M5.5 11h4v4h-4z" />
     <path d="M10.5 8h4v4h-4z" />
  </svg>
);

// Actual Replit Logo Path
export const ReplitLogo: React.FC<ReplitIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z" className="text-white" fillOpacity="0" /> 
    <path d="M7 7.5H11V11.5H7V7.5Z" />
    <path d="M7 12.5H11V16.5H7V12.5Z" />
    <path d="M12 10H16V14H12V10Z" />
  </svg>
);

interface ReplitLoginButtonProps {
  text: string;
  onClick: () => void;
  isLoading?: boolean;
}

export const ReplitLoginButton: React.FC<ReplitLoginButtonProps> = ({ text, onClick, isLoading }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-3 bg-[#0F1524] text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-slate-200 hover:bg-slate-900 transition-colors relative overflow-hidden"
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
      ) : (
        <>
          <ReplitLogo className="w-5 h-5" />
          <span>{text}</span>
        </>
      )}
    </motion.button>
  );
};
