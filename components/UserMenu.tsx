
import React, { useState } from 'react';
import { User, Settings, LogOut, UserCircle, X, CheckCircle, Bell, Shield, Mail, Briefcase, FileText, ChevronRight } from 'lucide-react';
import { Project } from '../types';

interface Props {
  userProjects: Project[];
  onLogout: () => void;
  trigger: React.ReactNode;
}

const UserMenu: React.FC<Props> = ({ userProjects, onLogout, trigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'info' | 'settings' | 'profile' | null>(null);

  // Mock user data state
  const [userInfo, setUserInfo] = useState({
    name: 'Cognexus Researcher',
    email: 'researcher@cognexus.ai',
    bio: 'Lead data scientist specializing in fluid dynamics and predictive atmospheric modeling.',
    role: 'Senior Researcher'
  });

  const toggleMenu = () => setIsOpen(!isOpen);

  const closeModals = () => {
    setActiveModal(null);
    setIsOpen(false);
  };

  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Information updated successfully!');
    setActiveModal(null);
  };

  return (
    <div className="relative">
      <div onClick={toggleMenu} className="cursor-pointer transition-transform active:scale-95">
        {trigger}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-3 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 bg-gray-50 border-b border-gray-100">
              <div className="text-sm font-bold text-gray-900">{userInfo.name}</div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{userInfo.role}</div>
            </div>
            
            <div className="p-2">
              <button 
                onClick={() => setActiveModal('info')}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors group"
              >
                <UserCircle size={18} className="mr-3 text-gray-400 group-hover:text-blue-500" />
                Personal Information
              </button>
              <button 
                onClick={() => setActiveModal('profile')}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors group"
              >
                <FileText size={18} className="mr-3 text-gray-400 group-hover:text-blue-500" />
                Researcher Profile
              </button>
              <button 
                onClick={() => setActiveModal('settings')}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors group"
              >
                <Settings size={18} className="mr-3 text-gray-400 group-hover:text-blue-500" />
                Account Settings
              </button>
            </div>

            <div className="p-2 border-t border-gray-100">
              <button 
                onClick={onLogout}
                className="w-full flex items-center px-3 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors group"
              >
                <LogOut size={18} className="mr-3 group-hover:translate-x-1 transition-transform" />
                Log Out
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modals Container */}
      {activeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 text-black">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0">
              <div className="flex items-center space-x-2">
                {activeModal === 'info' && <User className="text-blue-600" size={20} />}
                {activeModal === 'settings' && <Settings className="text-blue-600" size={20} />}
                {activeModal === 'profile' && <Briefcase className="text-blue-600" size={20} />}
                <h3 className="font-bold text-gray-900">
                  {activeModal === 'info' && 'Personal Information'}
                  {activeModal === 'settings' && 'Account Settings'}
                  {activeModal === 'profile' && 'Researcher Portfolio'}
                </h3>
              </div>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              
              {/* Personal Info Modal */}
              {activeModal === 'info' && (
                <form onSubmit={handleSaveInfo} className="space-y-6">
                  <div className="flex items-center space-x-6 mb-8">
                    <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-blue-100">ME</div>
                    <div>
                      <button type="button" className="text-sm font-bold text-blue-600 hover:underline">Change Photo</button>
                      <p className="text-xs text-gray-400 mt-1">Recommended: Square 256x256px</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                      <input 
                        type="text" 
                        value={userInfo.name} 
                        onChange={e => setUserInfo({...userInfo, name: e.target.value})}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                        <input 
                          type="email" 
                          value={userInfo.email} 
                          onChange={e => setUserInfo({...userInfo, email: e.target.value})}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Short Bio</label>
                      <textarea 
                        rows={3}
                        value={userInfo.bio}
                        onChange={e => setUserInfo({...userInfo, bio: e.target.value})}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={closeModals} className="px-6 py-2.5 font-bold text-gray-500 hover:text-gray-900">Cancel</button>
                    <button type="submit" className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700">Save Changes</button>
                  </div>
                </form>
              )}

              {/* Settings Modal */}
              {activeModal === 'settings' && (
                <div className="space-y-8">
                  <section>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                      <Bell size={14} className="mr-2" /> Notifications
                    </h4>
                    <div className="space-y-4">
                      {[
                        { title: 'Simulation Completed', desc: 'Alert when an HPC job finishes running.' },
                        { title: 'Publication Requests', desc: 'Notify when a team member submits a draft for review.' },
                        { title: 'Cognexus Research News', desc: 'Updates from the global research community.' }
                      ].map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div>
                            <div className="text-sm font-bold text-gray-900">{s.title}</div>
                            <div className="text-xs text-gray-500">{s.desc}</div>
                          </div>
                          <div className="w-12 h-6 bg-blue-600 rounded-full flex items-center px-1 shadow-inner">
                            <div className="w-4 h-4 bg-white rounded-full translate-x-6"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                      <Shield size={14} className="mr-2" /> Privacy & Security
                    </h4>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                      <div className="text-sm font-bold text-gray-900">Two-Factor Authentication</div>
                      <button className="text-xs font-bold text-blue-600 hover:underline">Manage</button>
                    </div>
                  </section>

                  <div className="flex justify-end pt-4">
                    <button onClick={closeModals} className="px-8 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-colors shadow-lg shadow-gray-200">Done</button>
                  </div>
                </div>
              )}

              {/* Profile/History Modal */}
              {activeModal === 'profile' && (
                <div className="space-y-8">
                  <div className="text-center pb-8 border-b border-gray-100">
                    <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-3xl font-black text-white shadow-2xl shadow-blue-100 mx-auto mb-4">ME</div>
                    <h4 className="text-2xl font-extrabold text-gray-900">{userInfo.name}</h4>
                    <p className="text-blue-600 font-bold text-sm tracking-wide">{userInfo.role}</p>
                    <p className="text-gray-500 text-sm mt-4 max-w-sm mx-auto leading-relaxed">{userInfo.bio}</p>
                  </div>

                  <section>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                      <Briefcase size={14} className="mr-2" /> Research History
                    </h4>
                    <div className="space-y-3">
                      {userProjects.map(project => (
                        <div key={project.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-blue-200 transition-colors group">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors mr-4">
                              <FileText size={18} />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-900">{project.name}</div>
                              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{project.organization}</div>
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                        </div>
                      ))}
                      {userProjects.length === 0 && (
                        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <p className="text-sm text-gray-400">No active research projects found.</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <div className="flex justify-center pt-4">
                    <button onClick={closeModals} className="px-12 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">Return to Dashboard</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
