import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { GoogleLoginButton } from './GoogleLoginButton';
import { ReplitLoginButton } from './ReplitLoginButton';
import { X, User } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (name: string, email: string, avatar?: string) => void;
  language: Language;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLogin, language }) => {
  const t = TRANSLATIONS[language];
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingReplit, setLoadingReplit] = useState(false);
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState('');

  const handleGoogleLogin = () => {
    setLoadingGoogle(true);
    setTimeout(() => {
      setLoadingGoogle(false);
      const mockUser = {
        name: 'Google User',
        email: 'user@gmail.com',
        avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
      };
      onLogin(mockUser.name, mockUser.email, mockUser.avatar);
      onClose();
    }, 1500);
  };

  const handleReplitLogin = () => {
    setLoadingReplit(true);
    setTimeout(() => {
      setLoadingReplit(false);
      const mockUser = {
        name: 'Replit Hacker',
        email: 'hacker@replit.com',
        avatar: 'https://storage.googleapis.com/replit/images/1669917395724_44b0365851d87652701140049e685652.png'
      };
      onLogin(mockUser.name, mockUser.email, mockUser.avatar);
      onClose();
    }, 1500);
  };

  const handleGuestLogin = () => {
    if (!guestName.trim()) return;
    onLogin(guestName, '', '');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-3xl p-6 w-full max-w-sm relative shadow-2xl"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-8 mt-2">
              <h2 className="text-2xl font-black text-slate-800 mb-1">{t.welcomeBack}</h2>
              <p className="text-slate-500 text-sm">{t.appTitle}</p>
            </div>

            <div className="space-y-3">
              <ReplitLoginButton 
                text={t.signInReplit} 
                onClick={handleReplitLogin} 
                isLoading={loadingReplit}
              />
              
              <GoogleLoginButton 
                text={t.signInGoogle} 
                onClick={handleGoogleLogin} 
                isLoading={loadingGoogle}
              />

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-slate-400 text-xs font-bold uppercase">{t.or}</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {showGuestInput ? (
                <div className="space-y-3">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={t.enterName}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()}
                    />
                  </div>
                  <button
                    onClick={handleGuestLogin}
                    disabled={!guestName.trim()}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold disabled:opacity-50"
                  >
                    {t.guestLogin}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowGuestInput(true)}
                  className="w-full py-3.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  {t.guestLogin}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
