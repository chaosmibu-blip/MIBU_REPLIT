import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Itinerary, Coupon } from "@/types";
import { GachaCard } from "@/components/GachaCard";
import { CouponCelebration } from "@/components/CouponCelebration";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Save } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Result() {
  const [location, setLocation] = useLocation();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [celebrationCoupon, setCelebrationCoupon] = useState<Coupon | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const data = localStorage.getItem("currentItinerary");
    if (data) {
      const parsed: Itinerary = JSON.parse(data);
      setItinerary(parsed);

      // Check for coupons to celebrate
      // Prioritize rarest coupon
      const coupons = parsed.items
        .map(item => item.coupon)
        .filter((c): c is Coupon => !!c);
      
      if (coupons.length > 0) {
        // Sort by rarity (SP > SSR > SR > R)
        const rarityOrder = { SP: 4, SSR: 3, SR: 2, R: 1 };
        coupons.sort((a, b) => rarityOrder[b.rarity] - rarityOrder[a.rarity]);
        
        // Delay celebration slightly for effect
        setTimeout(() => {
          setCelebrationCoupon(coupons[0]);
        }, 1000);
      }
    } else {
      setLocation("/");
    }
  }, [setLocation]);

  const handleSave = () => {
    if (!itinerary) return;
    
    // Get existing collection
    const collectionStr = localStorage.getItem("collection");
    const collection: Itinerary[] = collectionStr ? JSON.parse(collectionStr) : [];
    
    // Check if already saved
    if (collection.some(i => i.id === itinerary.id)) {
      toast({ title: "Already saved!", description: "This trip is in your collection." });
      return;
    }

    // Add to collection
    const newCollection = [itinerary, ...collection];
    localStorage.setItem("collection", JSON.stringify(newCollection));
    
    toast({ 
      title: "Saved to Collection!", 
      description: "You can find this trip in your collection tab." 
    });
  };

  if (!itinerary) return null;

  return (
    <div className="min-h-screen bg-gray-50/50 pb-24">
      {/* Celebration Overlay */}
      {celebrationCoupon && (
        <CouponCelebration 
          coupon={celebrationCoupon} 
          onClose={() => setCelebrationCoupon(null)} 
        />
      )}

      {/* Header Image Area */}
      <div className="h-48 bg-gradient-to-br from-primary/80 to-secondary/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1492571350019-22de08371fd3?q=80&w=2053&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center text-white z-10">
          <Button variant="ghost" size="icon" className="hover:bg-white/20 text-white rounded-full" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="hover:bg-white/20 text-white rounded-full">
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-4 left-6 z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end gap-2"
          >
            <h1 className="text-4xl font-black text-white drop-shadow-lg tracking-tight">
              {itinerary.district}
            </h1>
            <span className="text-white/90 font-medium pb-1.5 text-lg drop-shadow-md">
              / {itinerary.city}
            </span>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 -mt-6 relative z-20">
        <div className="flex justify-between items-center mb-6 px-1">
          <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Your Gacha Result
          </div>
          <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold">
            Level {itinerary.intensity}
          </div>
        </div>

        <div className="space-y-2">
          {itinerary.items.map((item, index) => (
            <GachaCard key={item.id} item={item} index={index} />
          ))}
        </div>

        <div className="mt-8">
           <Button 
             className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/20 bg-gradient-to-r from-primary to-rose-400 hover:opacity-90" 
             size="lg"
             onClick={handleSave}
           >
             <Save className="mr-2 w-5 h-5" />
             Save to Collection
           </Button>
        </div>
      </div>
    </div>
  );
}
