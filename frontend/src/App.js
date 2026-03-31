import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatWidget from './components/ChatWidget';
import AdminDashboard from './components/AdminDashboard';
import EmbedPage from './components/EmbedPage';
import { Phone, Globe, MapPin, Star, ArrowRight, Calendar, Users, ShoppingCart, HelpCircle } from 'lucide-react';

const FEATURES = [
  { Icon: Calendar,     color: 'bg-pink-100 text-pink-600',   title: 'Vaikų gimtadieniai', desc: 'Nepamirštama šventė su batutu' },
  { Icon: Users,        color: 'bg-blue-100 text-blue-600',   title: 'Įmonių renginiai',   desc: 'Aktyvus poilsis komandai' },
  { Icon: Star,         color: 'bg-amber-100 text-amber-600', title: 'Šventės ir nuoma',   desc: 'Batutai bet kokiam renginiui' },
  { Icon: ShoppingCart, color: 'bg-green-100 text-green-600', title: 'Batutų pardavimas',  desc: 'Kokybiški batutai namams' },
];

function Landing() {
  const openChat = () => window.dispatchEvent(new CustomEvent('open-batutynas-chat'));

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50/60 font-figtree">

      {/* Hero */}
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-6 py-20">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-bold px-4 py-2 rounded-full mb-8 uppercase tracking-widest border border-violet-200 shadow-sm">
          <Star size={11} fill="currentColor" /> Batutų nuoma ir pardavimas Lietuvoje
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-violet-700 mb-5 font-nunito leading-tight tracking-tight">
          Batutynas
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-lg leading-relaxed">
          Profesionalūs batutai nuomai ir pardavimui visoje Lietuvoje.
          Greitas pristatymas, puikios kainos, saugios pramogos!
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-12">
          <button
            onClick={openChat}
            data-testid="landing-open-chat"
            className="flex items-center justify-center gap-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold px-8 py-4 rounded-2xl shadow-lg shadow-violet-200 hover:shadow-violet-300 hover:scale-105 active:scale-95 transition-all duration-200 text-base"
          >
            Pradėti pokalbį
            <ArrowRight size={18} />
          </button>
          <a href="tel:+37068558996"
            className="flex items-center justify-center gap-3 bg-white text-violet-700 border-2 border-violet-200 font-bold px-8 py-4 rounded-2xl hover:bg-violet-50 hover:border-violet-300 active:scale-95 transition-all duration-200 text-base shadow-sm"
          >
            <Phone size={18} />
            +370 685 58996
          </a>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-2xl w-full mb-10">
          {FEATURES.map(f => (
            <div key={f.title}
              onClick={openChat}
              className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-purple-100 text-center hover:shadow-md hover:-translate-y-1 hover:border-violet-200 transition-all duration-200 cursor-pointer group"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${f.color} group-hover:scale-110 transition-transform`}>
                <f.Icon size={22} />
              </div>
              <p className="text-sm font-bold text-gray-800 mb-1 leading-tight">{f.title}</p>
              <p className="text-xs text-gray-500 leading-tight">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Contact row */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-sm">
          <a href="https://batutynas.lt" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-gray-500 hover:text-violet-600 transition-colors font-medium">
            <Globe size={15} className="text-violet-400" /> batutynas.lt
          </a>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-2 text-gray-500 font-medium">
            <MapPin size={15} className="text-violet-400" /> Lietuva
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-2 text-gray-500 font-medium">
            <HelpCircle size={15} className="text-violet-400" /> I–VII 8:00–21:00
          </span>
        </div>

        {/* Arrow hint */}
        <div className="hidden sm:flex items-center gap-2 text-violet-400 text-sm mt-8 animate-bounce">
          <span>Pokalbio asistentas dešinėje apačioje</span>
          <ArrowRight size={14} />
        </div>
      </div>

      <ChatWidget />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        <Route path="/embed" element={<EmbedPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
