
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import GoogleIcon from '../components/icons/GoogleIcon';
import Modal from '../components/Modal';

// Menggunakan logo yang diberikan oleh user
const LOGO_URL = 'https://i.imgur.com/lie9EMX.png';
// Menggunakan gambar gudang logistik modern dengan perspektif luas
const HERO_IMAGE = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2000&auto=format&fit=crop'; 

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for Forgot Password Modal
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);


  // Load email jika "Ingat Saya" pernah dicentang sebelumnya
  useEffect(() => {
    const savedEmail = localStorage.getItem('absenin_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Email atau Password salah.' : error.message);
      setLoading(false);
    } else {
      // Jika login berhasil dan "Ingat Saya" dicentang, simpan email
      if (rememberMe) {
        localStorage.setItem('absenin_remember_email', email);
      } else {
        localStorage.removeItem('absenin_remember_email');
      }
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // The page will redirect on success, so no need to set loading to false here.
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(null);

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin + '/',
    });

    setForgotLoading(false);
    if (error) {
        setForgotError('Gagal mengirim email. Pastikan email benar dan coba lagi.');
    } else {
        setForgotSuccess(`Jika email "${forgotEmail}" terdaftar, link untuk reset password telah dikirim.`);
    }
  };

  const openForgotModal = () => {
    setForgotEmail('');
    setForgotError(null);
    setForgotSuccess(null);
    setIsForgotModalOpen(true);
  };

  return (
    <>
    <div className="min-h-screen w-full flex bg-white font-sans overflow-hidden">
      
      {/* LEFT: Hero Warehouse Section */}
      <div className="hidden lg:flex lg:w-3/5 relative bg-[#020617] flex-col items-center justify-center p-16">
        <div className="absolute inset-0 overflow-hidden">
          {/* Ambient Glows */}
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
          
          <div className="absolute inset-0 z-0">
            <img 
              src={HERO_IMAGE} 
              alt="Modern Warehouse Logistics" 
              className="w-full h-full object-cover opacity-40 mix-blend-luminosity scale-105 animate-slow-zoom"
            />
            {/* Cyber Grid Overlay */}
            <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
          </div>
        </div>
      </div>

      {/* RIGHT: Login Form Section */}
      <div className="w-full lg:w-2/5 flex flex-col items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <div className="relative w-24 h-24 p-4 bg-white rounded-3xl border border-blue-100 shadow-2xl flex items-center justify-center">
              <img src={LOGO_URL} alt="ABSENIN Logo" className="w-full h-full object-contain" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Selamat Datang Kembali</h1>
            <p className="text-gray-500 font-medium mt-2 text-sm">Masuk untuk melanjutkan ke Portal Absensi.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Alamat Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                placeholder="contoh@email.com"
              />
            </div>
            <div>
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Password</label>
                <button type="button" onClick={openForgotModal} className="text-xs font-bold text-blue-600 hover:underline">
                  Lupa Password?
                </button>
              </div>
              <div className="relative mt-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600">
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a9.97 9.97 0 01-1.563 3.029m-2.201-1.208l-3.289-3.289" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.543 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium">Ingat Saya</span>
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-200 transition-all transform active:scale-[0.98] disabled:opacity-70 text-xs uppercase tracking-[0.2em]"
            >
              {loading && !error ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500 font-medium">
                Atau lanjutkan dengan
              </span>
            </div>
          </div>
          
          <div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full inline-flex justify-center items-center py-3 px-4 border border-gray-300 rounded-xl shadow-sm bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <GoogleIcon />
              <span className="ml-3">Masuk dengan Google</span>
            </button>
          </div>

        </div>
      </div>
    </div>
    <Modal isOpen={isForgotModalOpen} onClose={() => setIsForgotModalOpen(false)} title="Reset Password" size="md" scrollable={false}>
        <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-sm text-gray-600">
                Masukkan alamat email Anda. Kami akan mengirimkan link untuk mengatur ulang password Anda.
            </p>
            <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700">Email</label>
                <input
                    type="email"
                    id="forgot-email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="you@example.com"
                />
            </div>
            {forgotError && <p className="text-sm text-red-600">{forgotError}</p>}
            {forgotSuccess && <p className="text-sm text-green-600">{forgotSuccess}</p>}
            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsForgotModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">Batal</button>
                <button type="submit" disabled={forgotLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                    {forgotLoading ? 'Mengirim...' : 'Kirim Link Reset'}
                </button>
            </div>
        </form>
    </Modal>
    <style>{`
        @keyframes slow-zoom {
          from { transform: scale(1.05); }
          to { transform: scale(1.15); }
        }
        .animate-slow-zoom {
          animation: slow-zoom 20s ease-in-out infinite alternate;
        }
    `}</style>
    </>
  );
};

// FIX: Add default export for LoginPage component
export default LoginPage;
