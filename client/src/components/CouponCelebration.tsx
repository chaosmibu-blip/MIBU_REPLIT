import { motion, AnimatePresence } from "framer-motion";
import { Coupon } from "@/types";
import { RARITY_COLORS } from "@/lib/constants";
import { Sparkles, X } from "lucide-react";
import { useState, useEffect } from "react";

interface CouponCelebrationProps {
  coupon: Coupon;
  onClose: () => void;
}

export function CouponCelebration({ coupon, onClose }: CouponCelebrationProps) {
  const [show, setShow] = useState(true);

  // Auto close after 5 seconds if not interacted? No, let user close it.
  
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="relative bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background Rays Effect */}
            <div className="absolute inset-0 z-0 animate-[spin_10s_linear_infinite] opacity-10">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0_20deg,var(--color-primary)_20deg_40deg,transparent_40deg_60deg,var(--color-primary)_60deg_80deg,transparent_80deg_100deg,var(--color-primary)_100deg_120deg,transparent_120deg_140deg,var(--color-primary)_140deg_160deg,transparent_160deg_180deg,var(--color-primary)_180deg_200deg,transparent_200deg_220deg,var(--color-primary)_220deg_240deg,transparent_240deg_260deg,var(--color-primary)_260deg_280deg,transparent_280deg_300deg,var(--color-primary)_300deg_320deg,transparent_320deg_340deg,var(--color-primary)_340deg_360deg)]" />
            </div>

            <div className="relative z-10">
              <motion.div 
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-4 inline-block"
              >
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl font-black text-white shadow-lg ${coupon.rarity === 'SP' ? 'bg-rose-500' : 'bg-amber-400'}`}>
                  {coupon.rarity}
                </div>
              </motion.div>

              <h2 className="text-2xl font-black text-gray-800 mb-2">NEW COUPON!</h2>
              <p className="text-gray-500 mb-6">You found a hidden treasure!</p>

              <div className={`p-4 rounded-xl border-2 border-dashed ${RARITY_COLORS[coupon.rarity]} mb-6`}>
                <h3 className="font-bold text-lg mb-1">{coupon.title}</h3>
                <p className="text-sm opacity-80">{coupon.description}</p>
              </div>

              <button 
                onClick={onClose}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:scale-105 transition-transform"
              >
                Awesome!
              </button>
            </div>

            {/* Confetti particles could go here */}
            {coupon.rarity === 'SP' && (
              <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <Sparkles className="absolute top-10 left-10 text-yellow-400 animate-pulse" />
                <Sparkles className="absolute bottom-10 right-10 text-rose-400 animate-pulse delay-75" />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
