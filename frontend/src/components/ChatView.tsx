import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, RefreshCw } from 'lucide-react';
import { ChatMessage } from '../types';
import { sendChatMessage } from '../services/geminiService';

export const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am eVALUEate, your AI assistant. I can answer questions about the exam instructions.',
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Secure Backend Call
      const responseText = await sendChatMessage(userMessage.text, messages);
      
      setMessages(prev => [
        ...prev, 
        { 
            id: (Date.now() + 1).toString(), 
            role: 'model', 
            text: responseText, 
            timestamp: Date.now() 
        }
      ]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: 'Connection Error: Unable to reach AI server.',
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
            <div>
                <h1 className="text-xl font-bold text-slate-800">AI Assistant (Secure Mode)</h1>
                <p className="text-sm text-slate-500">Connected to eVALUEate Server</p>
            </div>
            <button 
                onClick={() => setMessages([messages[0]])}
                className="p-2 text-slate-500 hover:text-indigo-600 rounded-full"
            >
                <RefreshCw className="w-5 h-5" />
            </button>
        </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex items-start max-w-[80%] space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
              <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-100'}`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <div className="max-w-4xl mx-auto relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question..."
            disabled={isLoading}
            className="w-full pl-6 pr-14 py-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
