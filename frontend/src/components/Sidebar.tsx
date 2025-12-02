import React from 'react';
import { LayoutDashboard, BarChart2, Bot, Settings, LogOut, Hexagon } from 'lucide-react';
import { View, NavItem } from '../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

// Analytics removed as per requirement
const NAV_ITEMS: NavItem[] = [
  { id: View.DASHBOARD, label: 'Overview', icon: LayoutDashboard },
  { id: View.AI_ASSISTANT, label: 'AI Assistant', icon: Bot },
  { id: View.SETTINGS, label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  return (
    <div className="flex flex-col w-64 h-screen bg-slate-900 text-white border-r border-slate-800 flex-shrink-0 transition-all duration-300 dark:border-slate-700">
      {/* Logo Area */}
      <div className="p-6 flex items-center space-x-3 border-b border-slate-800 dark:border-slate-700">
        <div className="bg-indigo-500 p-2 rounded-lg">
          <Hexagon className="w-6 h-6 text-white fill-current" />
        </div>
        <span className="text-xl font-bold tracking-tight">eVALUEate</span>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Area - Left Blank as requested */}
      <div className="p-4 border-t border-slate-800 dark:border-slate-700">
        {/* Intentionally empty */}
      </div>
    </div>
  );
};