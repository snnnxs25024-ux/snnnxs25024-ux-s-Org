
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import GoogleIcon from '../components/icons/GoogleIcon';

// Menggunakan logo yang diberikan oleh user
const LOGO_URL = 'https://i.imgur.com/lie9EMX.png';
// Menggunakan gambar gudang logistik modern dengan perspektif luas
const HERO_IMAGE = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2000&auto=format&fit=crop'; 

const LoginPage: React.FC = () => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  // Load email jika "Ingat Saya" pernah dicentang sebelumnya
  useEffect(() => {
    if (authMode === 'login') {
      const savedEmail = localStorage.getItem('absenin_remember_email');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    }
  }, [authMode]);

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
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSignUpSuccess(false);

    // Proses pendaftaran disederhanakan.
    // Cukup panggil supabase.auth.signUp.
    // Trigger di database akan secara otomatis menangani pembuatan profil dan perusahaan.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Kirim nama lengkap sebagai metadata, agar bisa diambil oleh trigger di database.
        data: {
          full_name: fullName,
        }
      }
    });

    setLoading(false);
    
    if (signUpError) {
      setError(signUpError.message);
    } else if (data.user) {
      // Jika pendaftaran berhasil (bahkan jika perlu verifikasi email), tampilkan pesan sukses.
      setSignUpSuccess(true);
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
  };

  const toggleMode = () => {
    setAuthMode(prev => prev === 'login' ? 'signup' : 'login');
    setError(null);
    setSignUpSuccess(false);
    setPassword('');
  };

  if (signUpSuccess) {
    return (
      <div className="min-h-screen w-full flex bg-white font-sans items-center justify-center p-4">
        <div className="w-full max-w-md text-center bg-green-50 p-10 rounded-2xl border border-green-200">
           <div className="w-20 h-20 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h1 className="text-2xl font-black text-green-800 mb-2 uppercase tracking-tight">Pendaftaran Berhasil!</h1>
          <p className="text-gray-600 font-bold text-sm uppercase leading-relaxed">
              Satu langkah terakhir: Silakan periksa email Anda di <strong className="text-green-700">{email}</strong> untuk link verifikasi akun.
          </p>
          <button onClick={() => setSignUpSuccess(false)} className="mt-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-blue-600">
            Kembali ke Login
          </button>
        </div>
      </div>
    )
  }

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
            Logistics Infrastructure
          </div>
          <h2 className="text-5xl xl:text-7xl font-black text-white leading-[1.05] tracking-tighter">
            Efisien. Terintegrasi. <br/><span className="text-blue-500">Real-time.</span>
          </h2>
          <p className="text-blue-100/40 text-lg font-medium max-w-lg mt-8 leading-relaxed">
            Sistem manajemen absensi tercanggih bernama <span className="text-blue-400 font-bold">"ABSENIN"</span>, yang berguna untuk pantau kehadiran Daily Worker di ekosistem pergudangan.
          </p>
          <div className="mt-12 flex gap-10">
            <div className="flex flex-col">
              <span className="text-white font-black text-3xl">99.9%</span>
              <span className="text-blue-100/30 text-[10px] uppercase tracking-widest font-bold mt-1">Uptime System</span>
            </div>
            <div className="w-px h-12 bg-white/10"></div>
            <div className="flex flex-col">
              <span className="text-white font-black text-3xl">Smart</span>
              <span className="text-blue-100/30 text-[10px] uppercase tracking-widest font-bold mt-1">Warehouse Monitoring</span>
            </div>
          </div>
        </div>
        <div className="absolute bottom-12 left-16 flex items-center gap-4 z-20">
          <div className="w-12 h-12 p-2 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
            <img src={LOGO_URL} alt="Mini Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="text-white text-[11px] font-black tracking-[0.2em] uppercase leading-none">ABSENIN</span>
            <span className="text-blue-500/60 text-[9px] font-bold uppercase tracking-widest mt-1.5">Portal Absensi Industri</span>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-2/5 flex items-center justify-center p-8 sm:p-20 bg-white relative">
        <div className="w-full max-w-md">
          <div className="mb-12 text-center lg:text-left">
            <div className="flex justify-center lg:justify-start mb-10">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-100 rounded-3xl blur-xl opacity-50 scale-150"></div>
                <div className="relative w-20 h-20 p-3 bg-white rounded-3xl border border-blue-100 shadow-2xl transition-transform hover:scale-110 cursor-pointer flex items-center justify-center">
                  <img src={LOGO_URL} alt="ABSENIN Logo" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">{authMode === 'login' ? 'Selamat Datang' : 'Buat Akun Baru'}</h1>
            <p className="text-gray-500 font-medium mt-3 text-lg leading-relaxed">{authMode === 'login' ? 'Silakan masuk menggunakan kredensial administrator Anda.' : 'Isi data berikut untuk mendaftar sebagai admin.'}</p>
          </div>

          <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp} className="space-y-6">
            {authMode === 'signup' && (
               <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Nama Lengkap</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-600 transition-colors">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                    placeholder="Contoh: John Doe"
                    required
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Email Administrator</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-600 transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Kata Sandi</label>
                {authMode === 'login' && <a href="#" className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Lupa Sandi?</a>}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-600 transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-700 transition-colors"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573 3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {authMode === 'login' && (
              <div className="flex items-center justify-between px-1">
                <label className="flex items-center group cursor-pointer">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={rememberMe}
                      onChange={() => setRememberMe(!rememberMe)}
                    />
                    <div className={`w-5 h-5 border-2 rounded-md transition-all flex items-center justify-center ${rememberMe ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-200' : 'bg-gray-50 border-gray-200 group-hover:border-blue-400'}`}>
                      {rememberMe && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                  </div>
                  <span className="ml-3 text-[11px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700 transition-colors">Ingat Saya</span>
                </label>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-xs rounded-2xl flex items-center gap-3 animate-shake">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <span className="font-bold">{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-200 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed text-xs uppercase tracking-[0.2em]"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Memproses...</span>
                </div>
              ) : (authMode === 'login' ? 'Masuk Ke Dashboard' : 'Daftar Akun Baru')}
            </button>
          </form>

          <div className="my-8 flex items-center">
              <hr className="w-full border-gray-200" />
              <span className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">atau</span>
              <hr className="w-full border-gray-200" />
          </div>

          <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-gray-200 rounded-2xl hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-gray-400 transition-all text-sm font-bold text-gray-700 disabled:opacity-70 disabled:cursor-not-allowed"
          >
              <GoogleIcon />
              <span>{authMode === 'login' ? 'Masuk' : 'Daftar'} dengan Google</span>
          </button>
           
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              {authMode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
              <button onClick={toggleMode} className="ml-2 font-bold text-blue-600 hover:underline">
                {authMode === 'login' ? 'Daftar di sini' : 'Masuk sekarang'}
              </button>
            </p>
          </div>

          <div className="mt-16 pt-8 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-[10px] uppercase font-black tracking-widest">
              &copy; 2025 ABSENIN
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-blue-600 transition-colors">Bantuan</a>
              <a href="#" className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-blue-600 transition-colors">Privasi</a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slow-zoom {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.15); }
        }
        .animate-slow-zoom {
          animation: slow-zoom 20s ease-in-out infinite;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
};

export default LoginPage;