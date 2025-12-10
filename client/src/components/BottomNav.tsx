import { Link, useLocation } from "wouter";
import { Home, Compass, User, Map } from "lucide-react";

export function BottomNav() {
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-200 py-3 px-6 pb-safe z-50 flex justify-between items-center max-w-md mx-auto">
      <Link href="/">
        <a className={`flex flex-col items-center gap-1 ${isActive("/") ? "text-primary" : "text-gray-400"}`}>
          <Compass className={`w-6 h-6 ${isActive("/") ? "fill-current" : ""}`} />
          <span className="text-[10px] font-medium">Gacha</span>
        </a>
      </Link>
      
      <Link href="/collection">
        <a className={`flex flex-col items-center gap-1 ${isActive("/collection") ? "text-primary" : "text-gray-400"}`}>
          <Map className={`w-6 h-6 ${isActive("/collection") ? "fill-current" : ""}`} />
          <span className="text-[10px] font-medium">Collection</span>
        </a>
      </Link>

      <Link href="/merchant">
        <a className={`flex flex-col items-center gap-1 ${isActive("/merchant") ? "text-primary" : "text-gray-400"}`}>
          <User className={`w-6 h-6 ${isActive("/merchant") ? "fill-current" : ""}`} />
          <span className="text-[10px] font-medium">Merchant</span>
        </a>
      </Link>
    </nav>
  );
}
