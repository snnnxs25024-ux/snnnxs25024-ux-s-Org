
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import GoogleIcon from '../components/icons/GoogleIcon';

const LOGO_URL = 'https://i.imgur.com/lie9EMX.png';
const HERO_IMAGE = 'https://images.unsplash.com/photo-1578575437136-161069819445?q=80&w=2000&auto=format&fit=crop'; 

interface SignUpPageProps {
  onSwitchMode: () => void;
}

const SignUpPage: React.FC<SignUpPageProps> = ({ onSwitchMode }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    fullName: '',
    nik: '',
    phone: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Idealnya, ini harus menjadi satu transaksi atau fungsi RPC di Supabase
    // untuk memastikan atomicity. Untuk kesederhanaan di frontend, kita lakukan berurutan.
    // NOTE: Setup RLS dan policies di Supabase sangat penting untuk keamanan.
    try {
        // 1. Create a new company
        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .insert({ name: formData.companyName })
            .select()
            .single();

        if (companyError) throw companyError;

        // 2. Sign up the user
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: formData.email,
            password: formData.password,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Registrasi berhasil, tapi data pengguna tidak ditemukan. Silakan coba login.");

        // 3. Create the user's profile
        const { error: profileError } = await supabase.from('profiles').insert({
            id: authData.user.id,
            company_id: companyData.id,
            full_name: formData.fullName,
            nik: formData.nik,
            phone: formData.phone,
            role: 'admin',
        });

        if (profileError) {
            // Coba hapus pengguna yang baru dibuat jika profil gagal dibuat
            // Ini adalah penanganan error sederhana; fungsi RPC akan lebih baik
            await supabase.auth.admin.deleteUser(authData.user.id);
            throw profileError;
        }

        alert('Registrasi berhasil! Silakan cek email Anda untuk verifikasi dan kemudian login.');
        onSwitchMode();

    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };
  
  const signInWithGoogle = async () => {
    // Implementasi pendaftaran Google untuk SaaS lebih kompleks karena
    // perlu menangani alur di mana pengguna harus memasukkan nama perusahaan
    // setelah login. Untuk saat ini, kita akan menonaktifkannya di halaman pendaftaran
    // dan fokus pada alur email/password.
    alert("Pendaftaran via Google akan segera tersedia. Silakan gunakan email dan password untuk saat ini.");
  };

  return (
    <div className="min-h-screen w-full flex bg-white font-sans overflow-hidden">
      
      <div className="w-full lg:w-2/5 flex items-center justify-center p-8 sm:p-12 bg-white relative">
        <div className="w-full max-w-md">
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-4">Buat Akun Baru</h1>
          <p className="text-gray-500 font-medium text-lg leading-relaxed mb-8">Daftarkan perusahaan Anda dan mulai kelola absensi secara efisien.</p>

          <button onClick={signInWithGoogle} className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors mb-6">
              <GoogleIcon />
              <span className="text-sm font-bold text-gray-700">Daftar dengan Google</span>
          </button>
          
          <div className="flex items-center my-6">
              <hr className="flex-grow border-gray-200"/>
              <span className="mx-4 text-[10px] uppercase font-black text-gray-400 tracking-widest">Atau Isi Form</span>
              <hr className="flex-grow border-gray-200"/>
          </div>

          <form onSubmit={handleSignUp} className="space-y-4">
            <input name="companyName" onChange={handleChange} placeholder="Nama Perusahaan" required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <input name="fullName" onChange={handleChange} placeholder="Nama Lengkap Anda (Admin)" required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <div className="flex gap-4">
                <input name="nik" onChange={handleChange} placeholder="NIK" required className="w-1/2 p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                <input name="phone" type="tel" onChange={handleChange} placeholder="Nomor Telepon" required className="w-1/2 p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <hr className="border-gray-100 !my-6"/>
            <input name="email" type="email" onChange={handleChange} placeholder="Alamat Email" required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            <input name="password" type="password" onChange={handleChange} placeholder="Kata Sandi" required minLength={6} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl font-bold animate-shake">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-200 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed text-xs uppercase tracking-[0.2em]"
            >
              {loading ? 'Mendaftarkan...' : 'Buat Akun Perusahaan'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm font-medium">
              Sudah punya akun?{' '}
              <button onClick={onSwitchMode} className="font-bold text-blue-600 hover:underline">
                Masuk di sini
              </button>
            </p>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-3/5 relative bg-gray-50 items-center justify-center p-16">
         <div className="absolute inset-0 z-0">
            <img 
              src={HERO_IMAGE} 
              alt="Team Collaboration" 
              className="w-full h-full object-cover opacity-10 mix-blend-luminosity"
            />
            <div className="absolute inset-0 bg-gradient-to-l from-gray-50 via-white/50 to-white"></div>
          </div>
          <div className="relative z-10 w-full max-w-lg">
             <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 p-2 bg-white backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
                    <img src={LOGO_URL} alt="Mini Logo" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col">
                    <span className="text-gray-900 text-lg font-black tracking-tighter uppercase leading-none">ABSENIN</span>
                    <span className="text-blue-500/80 text-sm font-bold mt-1">Satu Platform untuk Semua Kebutuhan</span>
                </div>
            </div>
             <h2 className="text-5xl font-black text-gray-900 leading-tight tracking-tighter">
                Mulai dari Nol, <br/>Tumbuh Tanpa Batas.
             </h2>
             <p className="text-gray-500 text-lg font-medium mt-6 leading-relaxed">
                Daftarkan perusahaan Anda dalam hitungan menit dan dapatkan akses instan ke semua fitur manajemen absensi yang Anda butuhkan.
             </p>
          </div>
      </div>
    </div>
  );
};

export default SignUpPage;
