import React from 'react';
import { Save, Bell, Lock, Globe, Monitor } from 'lucide-react';

interface SettingsProps {
    currentTheme: string;
    onThemeChange: (theme: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({ currentTheme, onThemeChange }) => {
  return (
    <div className="p-8 max-w-4xl mx-auto overflow-y-auto h-full dark:text-slate-200">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Platform Settings</h1>

      <div className="space-y-6">
        {/* Profile Section */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center space-x-3 mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
            <Monitor className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Appearance</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Theme Preference</label>
              <select 
                value={currentTheme}
                onChange={(e) => onThemeChange(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Density</label>
              <select className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Comfortable</option>
                <option>Compact</option>
              </select>
            </div>
          </div>
        </div>

        {/* API Config Placeholder */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 opacity-75">
           <div className="flex items-center space-x-3 mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
            <Lock className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">API Configuration (Locked)</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Manage your API keys and webhooks. These settings are currently managed by the organization administrator.
          </p>
          <div className="flex items-center space-x-2">
            <input 
                type="password" 
                value="************************" 
                disabled 
                className="flex-1 p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
            />
            <button className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg font-medium text-sm cursor-not-allowed">Reveal</button>
          </div>
        </div>

        <div className="flex justify-end pt-4">
            <button className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm hover:shadow-md">
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
            </button>
        </div>
      </div>
    </div>
  );
};