import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { COUNTRIES, CITIES, INTENSITY_LEVELS } from "@/lib/constants";
import { CatPawLoader } from "@/components/CatPawLoader";
import { generateItinerary } from "@/services/geminiService";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Map, User } from "lucide-react";

export default function Home() {
  const [_, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState("TW");
  const [city, setCity] = useState("");
  const [intensity, setIntensity] = useState([8]);

  const handleGacha = async () => {
    if (!city) return;
    setLoading(true);
    try {
      const itinerary = await generateItinerary(country, city, intensity[0]);
      // Save to local storage for the result page to pick up (simplest way for now)
      localStorage.setItem("currentItinerary", JSON.stringify(itinerary));
      setLocation("/result");
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white/80 backdrop-blur-sm z-50 fixed inset-0">
        <CatPawLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 pb-24 max-w-md mx-auto relative overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 pt-4">
        <h1 className="text-3xl font-black tracking-tighter text-primary drop-shadow-sm">
          Mibu <span className="text-foreground">Gacha</span>
        </h1>
        <div className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center">
          <User className="w-5 h-5 text-gray-600" />
        </div>
      </header>

      <main className="space-y-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <p className="text-lg text-gray-600 mb-1">Where to next?</p>
          <h2 className="text-4xl font-bold text-gray-800">Start Your Journey</h2>
        </motion.div>

        {/* Form Card */}
        <Card className="glass border-0 shadow-2xl overflow-hidden">
          <CardContent className="p-6 space-y-6">
            
            {/* Country Tabs */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-500 uppercase tracking-wide">Destination</label>
              <Tabs defaultValue="TW" onValueChange={(v) => { setCountry(v); setCity(""); }} className="w-full">
                <TabsList className="w-full grid grid-cols-3 bg-gray-100/50 p-1 h-12 rounded-xl">
                  {COUNTRIES.map((c) => (
                    <TabsTrigger 
                      key={c.id} 
                      value={c.id}
                      className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-lg"
                    >
                      {c.emoji}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* City Select */}
            <div className="space-y-2">
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="h-14 rounded-xl border-gray-200 bg-white/80 text-lg">
                  <SelectValue placeholder="Select City" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES[country]?.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-lg py-3">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Intensity Slider */}
            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-gray-500 uppercase tracking-wide">Intensity</label>
                <span className="text-2xl font-black text-primary">{intensity[0]}</span>
              </div>
              <Slider
                value={intensity}
                onValueChange={setIntensity}
                max={12}
                min={5}
                step={1}
                className="py-4"
              />
              <p className="text-xs text-center text-gray-500 font-medium">
                {INTENSITY_LEVELS.find(l => Math.abs(l.level - intensity[0]) <= 2)?.label || "Custom"}
              </p>
            </div>

            {/* Gacha Button */}
            <Button 
              size="lg" 
              className="w-full h-16 text-xl rounded-2xl bg-gradient-to-r from-primary to-rose-400 hover:opacity-90 transition-opacity shadow-lg shadow-primary/30 animate-pulse"
              onClick={handleGacha}
              disabled={!city}
            >
              <Sparkles className="mr-2 w-6 h-6" />
              Gacha Itinerary
            </Button>
          </CardContent>
        </Card>
      </main>

      {/* Decorative Background Elements */}
      <div className="absolute top-20 -left-10 w-40 h-40 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" />
      <div className="absolute top-40 -right-10 w-40 h-40 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" style={{ animationDelay: "1s" }} />
      <div className="absolute -bottom-10 left-20 w-40 h-40 bg-yellow-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" style={{ animationDelay: "2s" }} />
    </div>
  );
}
