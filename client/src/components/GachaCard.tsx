import { motion } from "framer-motion";
import { GachaItem, Coupon } from "@/types";
import { RARITY_COLORS, CATEGORIES } from "@/lib/constants";
import { MapPin, Ticket, Sparkles } from "lucide-react";

interface GachaCardProps {
  item: GachaItem;
  index: number;
}

export function GachaCard({ item, index }: GachaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, rotateX: -15 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: index * 0.2, type: "spring", stiffness: 100 }}
      className="glass-card p-4 mb-4 relative overflow-hidden group"
    >
      {/* Rarity Glow for Coupon items */}
      {item.coupon && (
        <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-${item.coupon.rarity === 'SP' ? 'rose' : 'amber'}-400/20 to-transparent rounded-bl-full pointer-events-none`} />
      )}

      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-2">
          <span className="bg-white/80 px-2 py-1 rounded-lg text-xs font-bold text-primary">
            {item.suggested_time}
          </span>
          <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">
            {item.district}
          </span>
        </div>
        {/* Category Icon */}
        <div className="p-2 bg-white rounded-full shadow-sm text-primary">
          {/* We would render the icon component here based on item.category */}
          <MapPin className="w-4 h-4" />
        </div>
      </div>

      <h3 className="text-xl font-bold text-gray-800 mb-1 leading-tight">
        {item.place_name}
      </h3>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
        {item.description}
      </p>

      {item.coupon && (
        <motion.div 
          className={`relative p-3 rounded-xl border-dashed border-2 flex items-center gap-3 ${RARITY_COLORS[item.coupon.rarity]}`}
          whileHover={{ scale: 1.02 }}
        >
          <div className="bg-white p-2 rounded-full shadow-sm">
            <Ticket className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-1.5 py-0.5 bg-white/50 rounded uppercase tracking-wider">
                {item.coupon.rarity}
              </span>
              <p className="font-bold text-sm">{item.coupon.title}</p>
            </div>
            <p className="text-xs opacity-80">{item.coupon.description}</p>
          </div>
          {item.coupon.rarity === 'SP' && (
            <Sparkles className="w-5 h-5 animate-pulse text-yellow-500 absolute top-2 right-2" />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
