
import React, { useState, useMemo } from 'react';
import { Bell, FileEdit, UserCog, UserPlus, CheckCircle2, Clock, Trash2, CheckSquare } from 'lucide-react';
import { Notification } from '../types';

interface Props {
  notifications: Notification[];
  onUpdateNotifications: (notifications: Notification[]) => void;
}

const NotificationMenu: React.FC<Props> = ({ notifications, onUpdateNotifications }) => {
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  const markAllAsRead = () => {
    onUpdateNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onUpdateNotifications(notifications.filter(n => n.id !== id));
  };

  const toggleRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onUpdateNotifications(notifications.map(n => n.id === id ? { ...n, isRead: !n.isRead } : n));
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'Edit': return <FileEdit size={16} className="text-blue-500" />;
      case 'RoleChange': return <UserCog size={16} className="text-purple-500" />;
      case 'NewMember': return <UserPlus size={16} className="text-emerald-500" />;
      case 'StatusUpdate': return <CheckCircle2 size={16} className="text-green-500" />;
      default: return <Bell size={16} className="text-gray-400" />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all relative group"
      >
        <Bell size={20} className={isOpen ? 'text-blue-600' : ''} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-gray-900">Notifications</h3>
                <span className="bg-blue-100 text-blue-600 text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase">
                  {notifications.length} Total
                </span>
              </div>
              <button 
                onClick={markAllAsRead}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center"
              >
                <CheckSquare size={14} className="mr-1" /> Mark all read
              </button>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {notifications.map((n) => (
                    <div 
                      key={n.id} 
                      onClick={(e) => toggleRead(e, n.id)}
                      className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer group flex items-start space-x-3 ${!n.isRead ? 'bg-blue-50/20' : ''}`}
                    >
                      <div className={`mt-1 p-2 rounded-lg bg-white border border-gray-100 shadow-sm ${!n.isRead ? 'border-blue-200 shadow-blue-50' : ''}`}>
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-xs font-bold truncate ${!n.isRead ? 'text-blue-700' : 'text-gray-900'}`}>
                            {n.title}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-2 flex items-center">
                            <Clock size={10} className="mr-1" /> {n.timestamp}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                          {n.description}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter truncate max-w-[150px]">
                            {n.projectName}
                          </span>
                          <button 
                            onClick={(e) => deleteNotification(e, n.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                    <Bell size={24} className="text-gray-300" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-900">All caught up!</h4>
                  <p className="text-xs text-gray-500 mt-1">No new project updates at the moment.</p>
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
              <button 
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold text-gray-400 hover:text-gray-600"
              >
                Close Panel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationMenu;
