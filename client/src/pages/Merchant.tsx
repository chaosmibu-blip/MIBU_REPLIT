import { Card, CardContent } from "@/components/ui/card";
import { User, Store, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Merchant() {
  return (
    <div className="min-h-screen p-6 pb-24 bg-gray-50">
      <header className="mb-8 pt-4">
        <h1 className="text-3xl font-black text-gray-800">Merchant Center</h1>
        <p className="text-gray-500">Manage your business & coupons</p>
      </header>

      <div className="space-y-6">
        {/* Profile Card */}
        <Card className="border-none shadow-lg bg-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <Store className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Guest Merchant</h2>
              <p className="text-sm text-gray-500">Free Plan</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto">
              Login
            </Button>
          </CardContent>
        </Card>

        {/* Claim Place CTA */}
        <div className="bg-gradient-to-r from-primary to-rose-400 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold mb-1">Claim Your Place</h3>
              <p className="text-white/80 text-sm">Found your shop in our Gacha?</p>
            </div>
            <ShieldCheck className="w-8 h-8 opacity-80" />
          </div>
          <Button className="w-full bg-white text-primary hover:bg-white/90 border-none font-bold">
            Search & Claim
          </Button>
        </div>

        {/* Stats Placeholder */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl font-black text-gray-800 mb-1">0</div>
            <div className="text-xs text-gray-500 font-bold uppercase">Active Coupons</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl font-black text-gray-800 mb-1">0</div>
            <div className="text-xs text-gray-500 font-bold uppercase">Redeemed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
