
import React, { useState } from 'react';
import { Page } from '../App';
import { supabase } from '../lib/supabaseClient';
import DashboardIcon from './icons/DashboardIcon';
import AttendanceIcon from './icons/AttendanceIcon';
import DatabaseIcon from './icons/DatabaseIcon';
import LinkIcon from './icons/LinkIcon';
import SettingsIcon from './icons/SettingsIcon';
import Modal from './Modal';
import { useToast } from '../hooks/useToast';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  isOpen: boolean; 
  onClose: () => void;
}

const LOGO_URL = 'https://i.imgur.com/lie9EMX.png';

const NavItem: React.FC<{
  label: Page;
  icon: React.ReactNode;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, isCollapsed, onClick }) => (
  <li className="list-none">
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={isCollapsed ? label : ""}
      className={`flex items-center p-3 my-1 rounded-xl transition-all duration-300 ease-in-out group ${
        isActive
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
          : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'
      } ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}
    >
      <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      {!isCollapsed && (
        <span className="ml-4 text-sm font-semibold whitespace-nowrap opacity-100 transition-opacity duration-300">
          {label}
        </span>
      )}
    </a>
  </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isOpen, onClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const { showToast } = useToast();

  const handleLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const confirmLogout = async () => {
    const { error } = await supabase.auth.signOut();
    setIsLogoutModalOpen(false);
    if (error) {
        showToast('Gagal logout, silakan coba lagi.', { type: 'error', title: 'Error' });
    } else {
        showToast('Anda berhasil logout.', { type: 'success', title: 'Logout Berhasil' });
    }
  };

  const navGroups = [
    {
      title: 'Utama',
      items: [
        { label: 'Dashboard' as Page, icon: <DashboardIcon /> },
      ]
    },
    {
      title: 'Operasional',
      items: [
        { label: 'Absensi' as Page, icon: <AttendanceIcon /> },
        { label: 'Open List' as Page, icon: <LinkIcon /> },
      ]
    },
    {
      title: 'Data & Sistem',
      items: [
        { label: 'Data Base' as Page, icon: <DatabaseIcon /> },
        { label: 'Pengaturan' as Page, icon: <SettingsIcon /> },
      ]
    }
  ];

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      ></div>
    
      <aside 
        className={`fixed top-0 left-0 h-full bg-white flex flex-col shadow-2xl z-40 transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'w-20' : 'w-72'}`}
      >
        <div className="relative">
          <div className={`bg-blue-600 text-white p-5 transition-all duration-300 flex items-center ${isCollapsed ? 'justify-center' : 'gap-4'}`}>
            <div className={`shrink-0 bg-white p-1.5 rounded-xl shadow-inner transition-all duration-300 ${isCollapsed ? 'w-10 h-10' : 'w-12 h-12'}`}>
              <img src={LOGO_URL} alt="ABSENIN Logo" className="w-full h-full object-contain" />
            </div>
            
            {!isCollapsed && (
              <div className="animate-fade-in overflow-hidden">
                <h1 className="text-xl font-bold tracking-tight whitespace-nowrap uppercase">ABSENIN</h1>
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex absolute -right-3 top-16 bg-white border border-gray-200 text-blue-600 rounded-full p-1 shadow-md hover:bg-blue-50 transition-colors z-50"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-4 w-4 transition-transform duration-500 ${isCollapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 mt-8 px-3 overflow-y-auto no-scrollbar">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-8">
              {!isCollapsed && (
                <p className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 animate-fade-in">
                  {group.title}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <NavItem
                    key={item.label}
                    label={item.label}
                    icon={item.icon}
                    isCollapsed={isCollapsed}
                    isActive={currentPage === item.label}
                    onClick={() => {
                      setCurrentPage(item.label);
                      if (window.innerWidth < 1024) onClose();
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer Profile with Logout */}
        <div className={`mt-auto border-t border-gray-50 p-4 transition-all duration-300 ${isCollapsed ? 'flex flex-col items-center gap-4' : ''}`}>
          {!isCollapsed ? (
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-xl border border-gray-100">
               <div className="flex items-center gap-3 overflow-hidden">
                 <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center p-1 overflow-hidden shrink-0">
                   <img src={LOGO_URL} alt="ABSENIN Logo" className="w-full h-full object-contain" />
                 </div>
                 <div className="overflow-hidden">
                    <p className="text-xs font-bold text-gray-700 truncate">Admin</p>
                    <p className="text-[9px] text-gray-400 truncate tracking-tight">Akun Administrator</p>
                 </div>
               </div>
               <button 
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Keluar Sistem"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                 </svg>
               </button>
            </div>
          ) : (
            <button 
              onClick={handleLogout}
              className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-100 transition-all"
              title="Logout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      <Modal isOpen={isLogoutModalOpen} onClose={() => setIsLogoutModalOpen(false)} title="Konfirmasi Logout" size="sm" scrollable={false}>
        <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg leading-6 font-bold text-gray-900 mt-5">Keluar dari Sesi</h3>
            <p className="text-sm text-gray-500 mt-2">
              Apakah Anda yakin ingin keluar dari sistem?
            </p>
        </div>
        <div className="mt-6 flex justify-center gap-3">
            <button
                type="button"
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
                onClick={() => setIsLogoutModalOpen(false)}
            >
                Batal
            </button>
            <button
                type="button"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm"
                onClick={confirmLogout}
            >
                Ya, Keluar
            </button>
        </div>
      </Modal>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </>
  );
};

export default Sidebar;