import { useState, useEffect } from "react";
import { Itinerary } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Calendar } from "lucide-react";
import { Link } from "wouter";

export default function Collection() {
  const [history, setHistory] = useState<Itinerary[]>([]);

  useEffect(() => {
    // Read from the actual collection list
    const collectionStr = localStorage.getItem("collection");
    if (collectionStr) {
      setHistory(JSON.parse(collectionStr));
    }
  }, []);

  return (
    <div className="min-h-screen p-6 pb-24 bg-gray-50">
      <header className="mb-8 pt-4">
        <h1 className="text-3xl font-black text-gray-800">My Collection</h1>
        <p className="text-gray-500">Your travel memories</p>
      </header>

      {history.length === 0 ? (
        <div className="text-center py-20 opacity-50">
          <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>No trips collected yet.</p>
          <Link href="/">
             <a className="text-primary font-bold mt-4 block">Start Gacha</a>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
           {history.map((item) => (
             <Link key={item.id} href="/result">
               {/* Note: Clicking here goes to result, but Result page reads from 'currentItinerary'. 
                   Ideally we should pass ID or have a way to view specific history item.
                   For prototype, we can just set currentItinerary on click.
               */}
               <a className="block" onClick={() => localStorage.setItem("currentItinerary", JSON.stringify(item))}>
                 <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer border-none shadow-sm bg-white">
                   <div className="h-32 bg-gray-200 relative">
                     <img 
                       src="https://images.unsplash.com/photo-1492571350019-22de08371fd3?q=80&w=2053&auto=format&fit=crop" 
                       className="w-full h-full object-cover"
                       alt="City"
                     />
                     <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md">
                       Level {item.intensity}
                     </div>
                   </div>
                   <CardContent className="p-4">
                     <h3 className="font-bold text-lg mb-1">{item.district}, {item.city}</h3>
                     <div className="flex items-center text-gray-500 text-xs gap-2">
                       <Calendar className="w-3 h-3" />
                       {new Date(item.created_at).toLocaleDateString()}
                     </div>
                     <div className="mt-2 flex gap-1">
                        {item.items.filter(i => i.coupon).map((i, idx) => (
                          <span key={idx} className={`w-2 h-2 rounded-full ${i.coupon?.rarity === 'SP' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                        ))}
                     </div>
                   </CardContent>
                 </Card>
               </a>
             </Link>
           ))}
        </div>
      )}
    </div>
  );
}
