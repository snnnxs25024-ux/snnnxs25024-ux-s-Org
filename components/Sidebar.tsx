import React from 'react';
import { Page } from '../App';
import DashboardIcon from './icons/DashboardIcon';
import AttendanceIcon from './icons/AttendanceIcon';
import DatabaseIcon from './icons/DatabaseIcon';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}

const NavItem: React.FC<{
  label: Page;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
  <li
    className={`flex items-center p-3 my-2 rounded-lg cursor-pointer transition-all duration-200 ease-in-out ${
      isActive
        ? 'bg-teal-600 text-white shadow-lg'
        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
    }`}
    onClick={onClick}
  >
    {icon}
    <span className="ml-4 font-semibold">{label}</span>
  </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
  const navItems: { label: Page; icon: React.ReactNode }[] = [
    { label: 'Dashboard', icon: <DashboardIcon /> },
    { label: 'Absensi', icon: <AttendanceIcon /> },
    { label: 'Data Base', icon: <DatabaseIcon /> },
  ];

  return (
    <aside className="w-64 bg-gray-800 p-4 flex flex-col shadow-2xl">
      <div className="text-center py-6">
        <h1 className="text-xl font-bold text-teal-400 tracking-wider">
          ABSENSI NEXUS
        </h1>
        <p className="text-sm text-gray-500">SUNTER DC</p>
      </div>
      <nav className="mt-8">
        <ul>
          {navItems.map((item) => (
            <NavItem
              key={item.label}
              label={item.label}
              icon={item.icon}
              isActive={currentPage === item.label}
              onClick={() => setCurrentPage(item.label)}
            />
          ))}
        </ul>
      </nav>
      <div className="mt-auto text-center text-xs text-gray-600 pb-4">
        <p>&copy; {new Date().getFullYear()} Nexus Sunter DC</p>
        <p>Version 1.0.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;
