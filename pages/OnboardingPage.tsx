
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const LOGO_URL = 'https://i.imgur.com/lie9EMX.png';

const OnboardingPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const user = supabase.auth.getSession()?.data.session?.user;

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const companyName = formData.get('companyName') as string;
        const fullName = formData.get('fullName') as string;
        const nik = formData.get('nik') as string;
        const phone = formData.get('phone') as string;

        const { error: rpcError } = await supabase.rpc('complete_onboarding', {
            company_name: companyName,
            full_name: fullName,
            nik: nik,
            phone: phone
        });

        if (rpcError) {
            setError(rpcError.message);
            setLoading(false);
        } else {
            // Success, reload the page. App.tsx will detect the new profile and show the dashboard.
            window.location.reload();
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="max-w-lg w-full mx-auto">
                <div className="flex justify-center mb-8">
                    <a href="/" className="flex items-center gap-3">
                        <img src={LOGO_URL} alt="ABSENIN Logo" className="h-10 w-10 object-contain" />
                        <h1 className="text-xl font-black text-blue-600 leading-none tracking-tighter">ABSENIN</h1>
                    </a>
                </div>
                
                <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
                    <h2 className="text-2xl font-bold text-gray-800 text-center">Selamat Datang!</h2>
                    <p className="text-center text-gray-500 text-sm mt-2 mb-6">Satu langkah lagi. Mohon lengkapi data perusahaan dan profil Anda.</p>
                    
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Nama Perusahaan</label>
                            <input
                                name="companyName"
                                type="text"
                                className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="PT. Maju Bersama"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">Nama Lengkap Anda</label>
                            <input
                                name="fullName"
                                type="text"
                                defaultValue={user?.user_metadata?.full_name || ''}
                                className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="John Doe"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="text-sm font-medium text-gray-700">NIK (Nomor Induk Kependudukan)</label>
                            <input
                                name="nik"
                                type="text"
                                className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="16 digit NIK"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">Nomor Telepon</label>
                            <input
                                name="phone"
                                type="tel"
                                className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="0812..."
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-70"
                        >
                            {loading ? 'Menyimpan...' : 'Selesai & Masuk Dashboard'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default OnboardingPage;
