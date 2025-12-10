import { motion } from "framer-motion";

export function CatPawLoader() {
  return (
    <div className="flex flex-col items-center justify-center space-y-6">
      <div className="relative w-24 h-24">
        {/* Main Pad */}
        <motion.div
          className="absolute top-1/2 left-1/2 w-12 h-10 bg-primary rounded-full -translate-x-1/2 -translate-y-1/2"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        
        {/* Toes */}
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute w-5 h-5 bg-primary rounded-full"
            style={{
              top: i === 0 || i === 3 ? "20%" : "5%",
              left: i === 0 ? "10%" : i === 1 ? "30%" : i === 2 ? "55%" : "75%",
            }}
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
      <motion.p
        className="text-lg font-medium text-primary tracking-widest"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        MIBU IS THINKING...
      </motion.p>
    </div>
  );
}
