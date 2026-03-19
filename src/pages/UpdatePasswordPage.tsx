
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';

const LOGO_URL = 'https://i.imgur.com/79JL73s.png';

const UpdatePasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password harus memiliki minimal 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak cocok.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      showToast('Gagal memperbarui password.', { type: 'error', title: 'Error' });
    } else {
      showToast('Password berhasil diperbarui! Silakan login kembali.', { type: 'success', title: 'Berhasil' });
      // Sign out to clear the recovery session and force a re-login
      await supabase.auth.signOut();
      // Redirect to login page after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
            <div className="relative w-24 h-24 p-4 bg-white rounded-3xl border border-blue-100 shadow-2xl flex items-center justify-center">
                <img src={LOGO_URL} alt="ABSENIN Logo" className="w-full h-full object-contain" />
            </div>
        </div>
        
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Atur Ulang Password</h1>
                <p className="text-gray-500 font-medium mt-2 text-sm">Masukkan password baru Anda di bawah ini.</p>
            </div>
            
            <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Password Baru</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="mt-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        placeholder="Minimal 6 karakter"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Konfirmasi Password Baru</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="mt-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        placeholder="Ketik ulang password"
                    />
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
                    {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default UpdatePasswordPage;
