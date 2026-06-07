import { useState } from 'react';
import { Lock, User, Activity } from 'lucide-react';
import MarketDashboard from './components/MarketDashboard';

function App() {
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem('marketbox_user');
  });

  const [inputUsername, setInputUsername] = useState('');
  const [inputPassword, setInputPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUsername.trim() && inputPassword.trim()) {
      const trimmedUser = inputUsername.trim();
      localStorage.setItem('marketbox_user', trimmedUser);
      setUsername(trimmedUser);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('marketbox_user');
    setUsername(null);
    setInputUsername('');
    setInputPassword('');
  };

  if (username) {
    return <MarketDashboard username={username} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-[#030008] text-slate-350 font-sans flex flex-col items-center justify-center p-6 antialiased selection:bg-purple-500/30 selection:text-white">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.06)_0%,transparent_70%)] pointer-events-none" />

      {/* Login Card Container */}
      <div className="w-full max-w-[380px] bg-[#0c0714] border border-[#7c3aed]/20 rounded-2xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(124,58,237,0.08)]">
        {/* Subtle top purple line */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-[#7c3aed] to-transparent" />
        
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-4 mb-8">
          <div className="p-3 bg-[#7c3aed]/10 border border-[#7c3aed]/30 rounded-xl shadow-[0_0_15px_rgba(124,58,237,0.15)] relative">
            <Activity className="w-6 h-6 text-[#7c3aed] animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white font-sans uppercase">
              MarketBox Terminal
            </h1>
            <p className="text-[9px] text-[#7c3aed] font-mono tracking-widest uppercase font-semibold mt-1">
              Simulation Workspace Gate
            </p>
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="block text-[8px] font-bold uppercase tracking-widest text-gray-500 font-mono">
              Terminal Identifier (Username)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-gray-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="ENTER OPERATOR ID"
                value={inputUsername}
                onChange={(e) => setInputUsername(e.target.value)}
                className="w-full bg-[#030008] text-white border border-[#1d1a26] focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20 rounded-lg py-2.5 pl-10 pr-4 text-xs font-mono tracking-wider outline-none placeholder-[#434052] transition duration-150"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-[8px] font-bold uppercase tracking-widest text-gray-500 font-mono">
              Access Code (Password)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-gray-500">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                placeholder="••••••••••••"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                className="w-full bg-[#030008] text-white border border-[#1d1a26] focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/20 rounded-lg py-2.5 pl-10 pr-4 text-xs font-mono tracking-wider outline-none placeholder-[#434052] transition duration-150"
                required
              />
            </div>
          </div>

          {/* Form Actions */}
          <button
            type="submit"
            className="w-full bg-[#7c3aed] text-white hover:bg-[#6d28d9] rounded-lg py-2.5 transition duration-150 flex items-center justify-center gap-2 cursor-pointer font-sans font-semibold tracking-wide text-xs shadow-sm hover:shadow-[0_0_15px_rgba(124,58,237,0.3)] mt-2"
          >
            <span>INITIALIZE TERMINAL</span>
          </button>
        </form>
      </div>

      {/* HUD footer info */}
      <div className="mt-8 text-[8px] text-gray-600 font-mono tracking-widest uppercase text-center space-y-1">
        <div>System Secure Layer Node: connected</div>
        <div>AUTHORIZED ACCESS ONLY &bull; PHASE 4 PROT</div>
      </div>
    </div>
  );
}

export default App;
