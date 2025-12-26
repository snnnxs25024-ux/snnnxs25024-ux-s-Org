
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import GoogleIcon from '../components/icons/GoogleIcon';

const LOGO_URL = 'https://i.imgur.com/lie9EMX.png';

const SignUpPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full mx-auto">
        <div className="flex justify-center mb-8">
            <a href="/" className="flex items-center gap-3">
                 <img src={LOGO_URL} alt="ABSENIN Logo" className="h-10 w-10 object-contain" />
                 <h1 className="text-xl font-black text-blue-600 leading-none tracking-tighter">ABSENIN</h1>
            </a>
        </div>
        
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
          {success ? (
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800">Cek Email Anda</h2>
              <p className="text-gray-600 mt-2">Kami telah mengirimkan link verifikasi ke <strong>{email}</strong>. Silakan klik link tersebut untuk mengaktifkan akun Anda.</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-800 text-center">Buat Akun Baru</h2>
              <p className="text-center text-gray-500 text-sm mt-2 mb-6">Mulai kelola absensi perusahaan Anda hari ini.</p>
              
              <div className="space-y-4">
                <button 
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 bg-white border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all text-sm"
                >
                    <GoogleIcon className="w-5 h-5" />
                    {googleLoading ? 'Mengarahkan...' : 'Daftar dengan Google'}
                </button>
                <div className="flex items-center my-4">
                    <div className="flex-grow border-t border-gray-100"></div>
                    <span className="mx-4 text-gray-400 text-[10px] uppercase font-black tracking-widest">Atau</span>
                    <div className="flex-grow border-t border-gray-100"></div>
                </div>
              </div>

              <form onSubmit={handleSignUp} className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="nama@perusahaan.com"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Minimal 6 karakter"
                    required
                  />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-70"
                >
                  {loading ? 'Mendaftar...' : 'Buat Akun'}
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-6">
                Sudah punya akun?{' '}
                <a href="/" className="font-bold text-blue-600 hover:underline">
                  Masuk di sini
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
