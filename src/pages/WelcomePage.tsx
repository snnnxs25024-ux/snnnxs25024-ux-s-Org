
import React from 'react';

const LOGO_URL = 'https://i.imgur.com/79JL73s.png';

interface WelcomePageProps {
  onEnter: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background decoration - subtle patterns */}
      <div className="absolute inset-0 z-0 opacity-40" 
           style={{ backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
      </div>
      
      {/* Animated blobs for aesthetic */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-60 animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-60 animate-blob animation-delay-2000"></div>

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Logo Container */}
        <div className="relative mb-12 group cursor-pointer" onClick={onEnter}>
          <div className="absolute inset-0 bg-blue-200 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 scale-125"></div>
          <div className="relative w-40 h-40 md:w-56 md:h-56 bg-white rounded-[3rem] shadow-2xl shadow-blue-100 flex items-center justify-center p-8 border border-white transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-2 ring-1 ring-gray-50">
             <img src={LOGO_URL} alt="ABSENIN Logo" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Text Content */}
        <div className="space-y-4 animate-fade-in-up">
           <div className="inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black tracking-[0.2em] uppercase border border-blue-100">
              Portal Absensi
           </div>
           <h1 className="text-4xl md:text-6xl font-black text-slate-800 tracking-tighter leading-tight">
             <span className="text-blue-600">ABSENIN</span>
           </h1>
           <p className="text-slate-400 text-sm md:text-base font-medium max-w-md mx-auto leading-relaxed">
             Sistem manajemen kehadiran terintegrasi untuk efisiensi operasional.
           </p>
        </div>

        {/* Enter Button */}
        <button 
          onClick={onEnter}
          className="mt-12 group relative px-8 py-4 bg-slate-900 text-white rounded-2xl overflow-hidden shadow-xl shadow-blue-900/10 transition-all hover:shadow-blue-900/20 hover:-translate-y-1 active:translate-y-0"
        >
          <div className="absolute inset-0 w-full h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative flex items-center gap-3 font-bold tracking-widest text-xs uppercase">
            <span>Masuk Ke Sistem</span>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </div>
        </button>
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Powered by ABSENIN</p>
      </div>

      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default WelcomePage;
