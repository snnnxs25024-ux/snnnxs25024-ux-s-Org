
import React from 'react';
import { Profile } from '../types';
import { supabase } from '../lib/supabaseClient';

interface EmployeeDashboardProps {
    profile: Profile;
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ profile }) => {
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="p-8 bg-white rounded-lg shadow-lg max-w-lg text-center">
                <h1 className="text-3xl font-bold text-gray-800">Employee Dashboard</h1>
                <p className="mt-4 text-gray-600">
                    Welcome, <span className="font-semibold">{profile.full_name || 'Employee'}</span>!
                </p>
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h2 className="font-bold text-green-800">Your Attendance</h2>
                    <p className="text-sm text-green-700 mt-2">
                        This section will display your personal attendance history, upcoming shifts, and other relevant information.
                    </p>
                    <p className="text-xs text-green-500 mt-4">This dashboard is currently under construction.</p>
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

export default EmployeeDashboard;
