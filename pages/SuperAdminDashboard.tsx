
import React from 'react';
import { Profile } from '../types';
import { supabase } from '../lib/supabaseClient';

interface SuperAdminDashboardProps {
    profile: Profile;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ profile }) => {
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="p-8 bg-white rounded-lg shadow-lg max-w-lg text-center">
                <h1 className="text-3xl font-bold text-gray-800">Super Admin Dashboard</h1>
                <p className="mt-4 text-gray-600">
                    Welcome, <span className="font-semibold">{profile.full_name || 'Super Admin'}</span>!
                </p>
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h2 className="font-bold text-blue-800">System Overview</h2>
                    <p className="text-sm text-blue-700 mt-2">
                        From here, you will be able to manage all companies, view system-wide analytics, and perform high-level administrative tasks.
                    </p>
                    <p className="text-xs text-blue-500 mt-4">This dashboard is currently under construction.</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="mt-8 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow"
                >
                    Logout
                </button>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
