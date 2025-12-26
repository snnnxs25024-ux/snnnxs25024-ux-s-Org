
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import GoogleIcon from '../components/icons/GoogleIcon';

const LOGO_URL = 'https://i.imgur.com/lie9EMX.png';
const HERO_IMAGE = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2000&auto=format&fit=crop'; 

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (rememberMe) {
        localStorage.setItem('absenin_remember_email', email);
      } else {
        localStorage.removeItem('absenin_remember_email');
      }
      // On successful login, App.tsx will handle redirection
    }
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
    <div className="min-h-screen w-full flex bg-white font-sans overflow-hidden">
      
      <div className="hidden lg:flex lg:w-3/5 relative bg-[#020617] flex-col items-center justify-center p-16">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
          
          <div className="absolute inset-0 z-0">
            <img 
              src={HERO_IMAGE} 
              alt="Modern Warehouse Logistics" 
              className="w-full h-full object-cover opacity-40 mix-blend-luminosity scale-105 animate-slow-zoom"
            />
            <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#020617] via-[#020617]/50 to-transparent"></div>
          </div>
        </div>
        
        <div className="relative z-10 w-full max-w-2xl text-center lg:text-left">
          <div className="inline-block px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black tracking-[0.4em] uppercase mb-8 backdrop-blur-md">
            SaaS Attendance Platform
          </div>
          <h2 className="text-5xl xl:text-7xl font-black text-white leading-[1.05] tracking-tighter">
            Efisien. Terintegrasi. <br/><span className="text-blue-500">Real-time.</span>
          </h2>
          <p className="text-blue-100/40 text-lg font-medium max-w-lg mt-8 leading-relaxed">
            Platform absensi modern <span className="text-blue-400 font-bold">"ABSENIN"</span>, dirancang untuk efisiensi operasional di berbagai industri.
          </p>

          <div className="mt-12 flex gap-10">
            <div className="flex flex-col">
              <span className="text-white font-black text-3xl">99.9%</span>
              <span className="text-blue-100/30 text-[10px] uppercase tracking-widest font-bold mt-1">Uptime System</span>
            </div>
            <div className="w-px h-12 bg-white/10"></div>
            <div className="flex flex-col">
              <span className="text-white font-black text-3xl">Multi-Tenant</span>
              <span className="text-blue-100/30 text-[10px] uppercase tracking-widest font-bold mt-1">Data Isolation</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-12 left-16 flex items-center gap-4 z-20">
          <div className="w-12 h-12 p-2 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
            <img src={LOGO_URL} alt="Mini Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="text-white text-[11px] font-black tracking-[0.2em] uppercase leading-none">ABSENIN</span>
            <span className="text-blue-500/60 text-[9px] font-bold uppercase tracking-widest mt-1.5">Public Platform</span>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-2/5 flex items-center justify-center p-8 sm:p-20 bg-white relative">
        <div className="w-full max-w-md">
          <div className="mb-12 text-center lg:text-left">
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Selamat Datang</h1>
            <p className="text-gray-500 font-medium mt-3 text-lg leading-relaxed">Masuk ke akun perusahaan Anda atau daftar untuk memulai.</p>
          </div>

          <div className="space-y-4">
              <button 
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-gray-200 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-all text-sm"
              >
                  <GoogleIcon className="w-5 h-5" />
                  {googleLoading ? 'Mengarahkan...' : 'Masuk atau Daftar dengan Google'}
              </button>
              <div className="flex items-center my-4">
                  <div className="flex-grow border-t border-gray-100"></div>
                  <span className="mx-4 text-gray-400 text-[10px] uppercase font-black tracking-widest">Atau</span>
                  <div className="flex-grow border-t border-gray-100"></div>
              </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                placeholder="nama@perusahaan.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                  placeholder="••••••••"
                  required
                />
            </div>
            
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-xs rounded-2xl flex items-center gap-3 animate-shake">
                <span className="font-bold">{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-200 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed text-xs uppercase tracking-[0.2em]"
            >
              {loading ? 'Authenticating...' : 'Masuk'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Belum punya akun?{' '}
              <a href="/signup" className="font-bold text-blue-600 hover:underline">
                Daftar sekarang
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;