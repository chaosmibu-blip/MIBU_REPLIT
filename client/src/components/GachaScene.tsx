import React from 'react';
import { motion } from 'framer-motion';

export const GachaScene: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-indigo-600/95 backdrop-blur-md">
      <motion.div
        className="relative w-64 h-64"
        animate={{ 
          rotate: [0, -5, 5, -5, 5, 0],
          y: [0, -10, 0]
        }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
      >
        <div className="absolute inset-0 bg-white rounded-full opacity-20 blur-3xl animate-pulse" />
        <div className="relative w-full h-full bg-white rounded-full shadow-2xl flex items-center justify-center border-8 border-indigo-200">
           <span className="text-6xl">🔮</span>
        </div>
      </motion.div>
      <motion.h2 
        className="mt-8 text-3xl font-black text-white tracking-widest uppercase"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        Generating...
      </motion.h2>
      <p className="text-indigo-200 mt-2 font-medium">Finding hidden gems</p>
    </div>
  );
};
