
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, User, Bot, Info } from 'lucide-react';
import { startResearchChat } from '../services/geminiService';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface Props {
  projectDescription: string;
}

const AIAssistant: React.FC<Props> = ({ projectDescription }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hello! I'm your Nexus Research Assistant. How can I help you with your project today? I can suggest simulation parameters, review your objectives, or help brainstorm next steps." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const stream = await startResearchChat(projectDescription, userMessage, history);
      
      let assistantText = '';
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of stream) {
        assistantText += chunk.text;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].text = assistantText;
          return updated;
        });
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "I encountered an error connecting to the Nexus AI nodes. Please try again in a moment." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Research Assistant</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Gemini 3 Flash Pro</p>
          </div>
        </div>
        <div className="flex items-center text-[10px] font-bold text-gray-400 bg-white border border-gray-200 px-2 py-1 rounded-lg">
          <Info size={12} className="mr-1" /> CONTEXT ACTIVE
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`flex max-w-[80%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
              <div className={`p-2 rounded-lg shrink-0 ${m.role === 'user' ? 'bg-blue-600 text-white shadow-blue-100' : 'bg-gray-100 text-gray-600 shadow-gray-100'} shadow-md`}>
                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-tl-none'
              }`}>
                {m.text || (isLoading && i === messages.length - 1 ? <Loader2 className="animate-spin" size={16} /> : null)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="p-4 bg-gray-50 border-t border-gray-100">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about simulation parameters, research steps..."
            className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-black shadow-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-3 text-center">
          AI-generated insights should be verified against standard research protocols.
        </p>
      </form>
    </div>
  );
};

export default AIAssistant;
