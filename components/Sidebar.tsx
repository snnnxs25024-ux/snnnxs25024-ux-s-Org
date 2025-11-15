
import React from 'react';
import { Page } from '../App';
import DashboardIcon from './icons/DashboardIcon';
import AttendanceIcon from './icons/AttendanceIcon';
import DatabaseIcon from './icons/DatabaseIcon';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  isOpen: boolean;
  onClose: () => void;
}

const NavItem: React.FC<{
  label: Page;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex items-center p-3 my-1 rounded-lg transition-all duration-200 ease-in-out ${
        isActive
          ? 'bg-blue-600 text-white shadow-md'
          : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
      }`}
    >
      {icon}
      <span className="ml-4 text-sm font-semibold">{label}</span>
    </a>
  </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isOpen, onClose }) => {
  const navItems: { label: Page; icon: React.ReactNode }[] = [
    { label: 'Dashboard', icon: <DashboardIcon /> },
    { label: 'Absensi', icon: <AttendanceIcon /> },
    { label: 'Data Base', icon: <DatabaseIcon /> },
  ];

  return (
    <>
      {/* Overlay for mobile */}
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      ></div>
    
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white flex flex-col shadow-xl z-40 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="text-center">
            <div className="bg-blue-600 text-white p-6">
                <h1 className="text-xl font-bold tracking-wider">ABSENSI NEXUS</h1>
                <p className="text-sm opacity-90">SUNTER DC</p>
            </div>
            <div className="border-b-4 border-blue-500"></div>
        </div>
        <nav className="flex-1 mt-4 px-4">
          <ul>
            {navItems.map((item) => (
              <NavItem
                key={item.label}
                label={item.label}
                icon={item.icon}
                isActive={currentPage === item.label}
                onClick={() => {
                  setCurrentPage(item.label);
                  onClose();
                }}
              />
            ))}
          </ul>
        </nav>
        <div className="mt-auto text-center text-xs text-gray-400 p-4">
          <p>&copy; {new Date().getFullYear()} Nexus Sunter DC</p>
          <p>Version 1.0.0</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
