// modules/trip-planner/client/components/ChatView.tsx

import React, { useEffect, useState, useRef } from "react";
import { 
  Send, 
  Phone, 
  Image as ImageIcon, 
  Plus, 
  MoreVertical, 
  UserPlus, 
  Video,
  ArrowLeft
} from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";

// UI Components (Shadcn & Tailwind)
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// --- Types ---
interface ChatMessage {
  sid: string;
  author: string;
  body: string;
  dateCreated: Date;
  type?: 'text' | 'image' | 'system';
  mediaUrl?: string;
}

interface Participant {
  identity: string;
  status: 'online' | 'offline';
  lastRead?: Date;
}

interface ChatViewProps {
  language: string;
  userId?: string;
  isAuthenticated: boolean;
}

// --- Mibu Brand Colors ---
// Primary Green: #06C755
// Accent Gold: #C4A77D
// Background: #F0F4F8

export const ChatView: React.FC<ChatViewProps> = ({ language, userId, isAuthenticated }) => {
  // --- STATE ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTwilioReady, setIsTwilioReady] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mock Identity (Replace with real Auth/Twilio identity)
  const myIdentity = "user_me"; 

  // --- TWILIO LOGIC PLACEHOLDER ---
  // Keep your existing Twilio connection logic here.
  useEffect(() => {
    console.log("Initializing Twilio Chat...");
    setIsTwilioReady(true);

    // MOCK DATA for Visual Verification
    const mockMessages: ChatMessage[] = [
      {
        sid: "1",
        author: "system",
        body: "Welcome to the Osaka Trip Group!",
        dateCreated: new Date(Date.now() - 86400000 * 2), // 2 days ago
        type: 'system'
      },
      {
        sid: "2",
        author: "alice",
        body: "Has everyone bought their flight tickets yet?",
        dateCreated: new Date(Date.now() - 86400000), // Yesterday
        type: 'text'
      },
      {
        sid: "3",
        author: "user_me",
        body: "Yes! I'm arriving at KIX at 10 AM.",
        dateCreated: new Date(Date.now() - 3600000), // 1 hour ago
        type: 'text'
      },
      {
        sid: "4",
        author: "bob",
        body: "Nice. I'll be there around noon. Let's meet at the hotel?",
        dateCreated: new Date(Date.now() - 1800000), // 30 mins ago
        type: 'text'
      }
    ];
    setMessages(mockMessages);

    setParticipants([
      { identity: "alice", status: "online" },
      { identity: "bob", status: "offline" },
      { identity: "user_me", status: "online" }
    ]);

    // Cleanup logic
    return () => {
      console.log("Disconnecting Twilio...");
    };
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // --- HANDLERS ---

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    // TODO: Connect this to Twilio channel.sendMessage(inputText)
    const tempMsg: ChatMessage = {
      sid: Date.now().toString(),
      author: myIdentity,
      body: inputText,
      dateCreated: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, tempMsg]);
    setInputText("");
  };

  const handleImageUpload = () => {
    // TODO: Implement file picker and Twilio media message logic
    console.log("Trigger Image Upload");
    alert("Image Upload Logic to be implemented here (Keep existing logic)");
  };

  const handleCall = (video: boolean = false) => {
    // TODO: Connect to Twilio Voice/Video
    console.log(`Starting ${video ? 'Video' : 'Voice'} Call...`);
  };

  const handleInvite = () => {
    console.log("Open Invite Modal");
  };

  // --- RENDER HELPERS ---

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  const renderDateSeparator = (currentMsg: ChatMessage, prevMsg: ChatMessage | null) => {
    if (!prevMsg || !isSameDay(currentMsg.dateCreated, prevMsg.dateCreated)) {
      return (
        <div className="flex justify-center my-4">
          <span className="bg-gray-200/60 text-gray-500 text-[10px] font-medium px-3 py-1 rounded-full">
            {formatMessageDate(currentMsg.dateCreated)}
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-[#F0F4F8] relative overflow-hidden font-sans">
      
      {/* --- HEADER --- */}
      <header className="bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden -ml-2 text-gray-500">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          {/* Group Avatar / Icon */}
          <div className="relative">
            <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
              <AvatarImage src="/placeholder-group.jpg" />
              <AvatarFallback className="bg-[#06C755] text-white">TR</AvatarFallback>
            </Avatar>
            {/* Online Indicator */}
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#06C755] border-2 border-white"></span>
          </div>

          <div className="flex flex-col">
            <h2 className="text-sm font-bold text-gray-800 leading-tight">Osaka Trip Group</h2>
            <span className="text-xs text-gray-500 font-medium">
              {participants.length} participants
            </span>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleCall(false)} 
            className="text-gray-400 hover:text-[#06C755] hover:bg-green-50 hidden sm:flex"
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleInvite} 
            className="text-gray-400 hover:text-[#06C755] hover:bg-green-50"
          >
            <UserPlus className="h-5 w-5" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleCall(true)}>
                <Video className="mr-2 h-4 w-4" /> Video Call
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-500">
                Leave Group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* --- MESSAGE LIST --- */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="max-w-3xl mx-auto flex flex-col justify-end min-h-full pb-2">
          {messages.map((msg, index) => {
            const isMe = msg.author === myIdentity;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showAvatar = !isMe && (!prevMsg || prevMsg.author !== msg.author);
            
            // System Message Handling
            if (msg.type === 'system') {
              return (
                <div key={msg.sid} className="flex justify-center my-4">
                  <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                    {msg.body}
                  </span>
                </div>
              );
            }

            return (
              <React.Fragment key={msg.sid}>
                {renderDateSeparator(msg, prevMsg)}
                
                <div className={cn(
                  "flex w-full gap-2 mb-1", 
                  isMe ? "justify-end" : "justify-start"
                )}>
                  
                  {/* Avatar (Left) */}
                  {!isMe && (
                    <div className="flex-shrink-0 w-8 flex flex-col justify-end">
                      {showAvatar ? (
                        <Avatar className="h-8 w-8 mb-1">
                          <AvatarFallback className="bg-[#C4A77D] text-white text-[10px]">
                            {msg.author.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ) : <div className="w-8" />}
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={cn(
                    "relative max-w-[70%] px-4 py-2 shadow-sm text-sm",
                    isMe 
                      ? "bg-[#06C755] text-white rounded-2xl rounded-tr-none"
                      : "bg-white text-gray-800 rounded-2xl rounded-tl-none"
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.body}
                    </p>
                    
                    {/* Timestamp */}
                    <div className={cn(
                      "text-[9px] mt-1 text-right",
                      isMe ? "text-green-100" : "text-gray-400"
                    )}>
                      {format(msg.dateCreated, "h:mm a")}
                    </div>
                  </div>

                </div>
              </React.Fragment>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* --- INPUT AREA --- */}
      <div className="bg-white p-3 border-t border-gray-100">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          
          {/* Attach Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleImageUpload}
            className="text-gray-400 hover:text-[#06C755] hover:bg-green-50 rounded-full h-10 w-10 flex-shrink-0"
          >
            <ImageIcon className="h-5 w-5" />
          </Button>

          {/* Main Input */}
          <div className="flex-1 relative">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type a message..."
              className="pr-10 rounded-full border-gray-200 bg-[#F0F4F8] focus-visible:ring-[#06C755] focus-visible:ring-offset-0 h-10"
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1 h-8 w-8 text-gray-400 hover:text-[#06C755] rounded-full"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Send Button */}
          <Button 
            onClick={handleSendMessage} 
            disabled={!inputText.trim()}
            className={cn(
              "rounded-full h-10 w-10 p-0 transition-all flex-shrink-0",
              inputText.trim() 
                ? "bg-[#06C755] hover:bg-[#05a346] text-white shadow-md shadow-green-200" 
                : "bg-gray-100 text-gray-300"
            )}
          >
            <Send className="h-4 w-4 ml-0.5" />
          </Button>

        </div>
      </div>
    </div>
  );
};
