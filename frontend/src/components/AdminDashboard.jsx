import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2,
  Phone, MapPin, Calendar, TrendingUp, Package,
  Loader2, CheckCircle2, Clock, Search, RefreshCw,
  ArrowUpRight, ArrowDownRight, Users, Euro, Zap, AlertCircle,
  LogOut, Lock, Bell, CheckCheck, XCircle, ClipboardList,
} from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// axios instance that injects the admin token on every request
const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('admin_token');
  if (token) cfg.headers['x-admin-token'] = token;
  return cfg;
});

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS_LT = ['Sausis','Vasaris','Kovas','Balandis','Gegužė','Birželis',
  'Liepa','Rugpjūtis','Rugsėjis','Spalis','Lapkritis','Gruodis'];
const DAYS_LT_SHORT = ['Pr','An','Tr','Kt','Pn','Št','Sk'];

const EQUIPMENT_LIST = [
  'Fantazijų parkas','Džiumandži parkas','Giga ruožas','Mega ruožas',
  'Mega raketa','Mega ufonautai','Mega waikiki',
  'Monstrai','Chameleonas','Candy Pop','Aštuonkojis','Vienaragiai','Pilis',
];

const EQUIP_ICONS = {
  'Fantazijų parkas':'🏰','Džiumandži parkas':'🌴','Giga ruožas':'🏃',
  'Mega ruožas':'🏃','Mega raketa':'🚀','Mega ufonautai':'🛸',
  'Mega waikiki':'🌊','Monstrai':'👾','Chameleonas':'🦎',
  'Candy Pop':'🍭','Aštuonkojis':'🐙','Vienaragiai':'🦄','Pilis':'🏰',
};

const DOT_COLORS = [
  '#7c3aed','#2563eb','#059669','#d97706','#dc2626',
  '#9333ea','#0891b2','#65a30d','#e11d48','#c026d3',
  '#0284c7','#16a34a','#ca8a04',
];
const equipColor = name => DOT_COLORS[EQUIPMENT_LIST.indexOf(name) % DOT_COLORS.length] || '#7c3aed';

// ── Date helpers ──────────────────────────────────────────────────────────────
const toYMD = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const todayYMD = toYMD(new Date());

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  // Monday-first: 0=Mon…6=Sun
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1;
  const days = [];
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, 1 - (startDow - i));
    days.push({ date: toYMD(d), cur: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: toYMD(new Date(year, month, d)), cur: true });
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    const d = new Date(last.date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    days.push({ date: toYMD(d), cur: false });
  }
  return days;
}

// ── LoginScreen ───────────────────────────────────────────────────────────────
const LoginScreen = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${API_URL}/admin/auth`, { password });
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_token_day', data.day);
      onLogin(data.token);
    } catch {
      setError('Neteisingas slaptažodis. Bandykite dar kartą.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-violet-200">🎪</div>
          <h1 className="text-2xl font-extrabold text-gray-900">Batutynas</h1>
          <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1.5">
            <Lock size={12} /> Valdymo panelė
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Slaptažodis</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Įveskite slaptažodį..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              autoFocus
              data-testid="login-password-input"
            />
          </div>
          <button type="submit" disabled={loading || !password} data-testid="login-submit-btn"
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold py-3.5 text-sm hover:from-violet-700 hover:to-purple-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-violet-200">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Tikrinama...</> : 'Prisijungti'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── PendingOrderCard ──────────────────────────────────────────────────────────
const FLOW_ICONS = { birthday:'🎂', company:'🏢', party:'🎉', purchase:'🛒', faq:'❓' };
const FLOW_LABELS_LT = { birthday:'Gimtadienis', company:'Įmonės renginys', party:'Šventė/nuoma', purchase:'Pirkimas', faq:'Klausimai' };

const PendingOrderCard = ({ order, onConfirm, onReject, acting }) => {
  const fd = order.form_data || {};
  const name  = fd.vardas || fd.kontaktinis || '—';
  const phone = fd.telefonas || '—';
  const equip = fd.batutas || '—';
  const date  = fd.data || '—';
  const addr  = fd.vieta || fd.adresas || '—';
  const ts    = order.created_at ? new Date(order.created_at).toLocaleString('lt-LT') : '';

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-md overflow-hidden" data-testid={`pending-order-${order.id}`}>
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 flex items-center justify-between border-b border-amber-100">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{FLOW_ICONS[order.flow_type] || '📋'}</span>
          <div>
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">{FLOW_LABELS_LT[order.flow_type] || order.flow_type}</span>
            {ts && <p className="text-[10px] text-amber-600">{ts}</p>}
          </div>
        </div>
        <span className="text-xs bg-amber-200 text-amber-800 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          <Clock size={10} /> Laukia
        </span>
      </div>

      <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Klientas</p>
          <p className="font-semibold text-gray-800 truncate">{name}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Telefonas</p>
          <a href={`tel:${phone}`} className="font-semibold text-violet-700 hover:underline flex items-center gap-1">
            <Phone size={11} /> {phone}
          </a>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Įranga</p>
          <p className="font-semibold text-gray-800 truncate">{equip}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Data</p>
          <p className="font-semibold text-gray-800">{date}</p>
        </div>
        {addr !== '—' && (
          <div className="col-span-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Adresas</p>
            <p className="font-semibold text-gray-700 flex items-start gap-1 text-xs"><MapPin size={11} className="flex-shrink-0 mt-0.5" />{addr}</p>
          </div>
        )}
        {fd.priedai?.length > 0 && (
          <div className="col-span-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Priedai</p>
            <p className="text-xs text-gray-600 flex items-center gap-1"><Zap size={10} />{Array.isArray(fd.priedai) ? fd.priedai.join(', ') : fd.priedai}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-4 pb-4 pt-1">
        <button onClick={() => onConfirm(order)}
          disabled={acting === order.id}
          data-testid={`confirm-order-${order.id}`}
          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-sm py-3 rounded-xl hover:from-emerald-600 hover:to-green-600 active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm shadow-emerald-200">
          {acting === order.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
          Patvirtinti → Kalendorių
        </button>
        <button onClick={() => onReject(order.id)}
          disabled={acting === order.id}
          data-testid={`reject-order-${order.id}`}
          className="w-11 flex items-center justify-center bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors">
          <XCircle size={18} />
        </button>
      </div>
    </div>
  );
};

// ── ConfirmOrderModal ─────────────────────────────────────────────────────────
const ConfirmOrderModal = ({ order, onClose, onConfirmed }) => {
  const fd = order.form_data || {};
  const [form, setForm] = useState({
    equipment:     fd.batutas || '',
    customer_name: fd.vardas || fd.kontaktinis || '',
    phone:         fd.telefonas || '',
    address:       fd.vieta || fd.adresas || '',
    startDate:     fd.data || '',
    durationDays:  '1',
    price:         '',
    addons:        Array.isArray(fd.priedai) ? fd.priedai.join(', ') : (fd.priedai || ''),
    notes:         '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleConfirm = async e => {
    e.preventDefault();
    if (!form.startDate) { setError('Nurodykite datą'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/orders/${order.id}/confirm`, {
        ...form,
        durationDays: Number(form.durationDays),
        price:        form.price ? Number(form.price) : 0,
        addons:       form.addons ? form.addons.split(',').map(s=>s.trim()).filter(Boolean) : [],
      });
      onConfirmed();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Klaida');
    } finally { setSaving(false); }
  };

  const Inp = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <CheckCheck size={16} /> Patvirtinti rezervaciją
            </h2>
            <p className="text-xs text-emerald-100 mt-0.5">Bus sukurtas Google Calendar įvykis</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Klientas</label>
              <input value={form.customer_name} onChange={e=>set('customer_name',e.target.value)} className={Inp} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Telefonas</label>
              <input value={form.phone} onChange={e=>set('phone',e.target.value)} className={Inp} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Įranga</label>
            <select value={form.equipment} onChange={e=>set('equipment',e.target.value)} className={Inp}>
              <option value="">Pasirinkite...</option>
              {EQUIPMENT_LIST.map(eq => <option key={eq} value={eq}>{EQUIP_ICONS[eq]} {eq}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Pilnas adresas</label>
            <input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="pvz. Kaunas, Savanorių pr. 5" className={Inp} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Data *</label>
              <input type="date" value={form.startDate} onChange={e=>set('startDate',e.target.value)} className={Inp} required data-testid="confirm-date-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Dienų</label>
              <input type="number" min="1" max="30" value={form.durationDays} onChange={e=>set('durationDays',e.target.value)} className={Inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Kaina (€)</label>
              <input type="number" min="0" value={form.price} onChange={e=>set('price',e.target.value)} placeholder="pvz. 150" className={Inp} data-testid="confirm-price-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Priedai</label>
              <input value={form.addons} onChange={e=>set('addons',e.target.value)} className={Inp} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5">Pastabos savininkui</label>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Vidinės pastabos, spec. reikalavimai..." rows={2} className={`${Inp} resize-none`} />
          </div>
          <button type="submit" disabled={saving} data-testid="confirm-submit-btn"
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold py-3.5 text-sm hover:from-emerald-600 hover:to-green-600 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-emerald-200">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Kuriamas...</> : <><CheckCheck size={16} /> Patvirtinti ir Įkelti į Kalendorių</>}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── StatsCard ─────────────────────────────────────────────────────────────────
const StatsCard = ({ icon: Icon, label, value, sub, subUp, color, loading }) => (
  <div className={`bg-white rounded-2xl p-5 border-l-4 shadow-sm flex items-start gap-4 ${color}`}>
    <div className="w-11 h-11 rounded-xl bg-current/10 flex items-center justify-center flex-shrink-0">
      <Icon size={20} className="text-current" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {loading
        ? <div className="h-7 w-16 bg-gray-100 rounded-lg animate-pulse" />
        : <p className="text-2xl font-extrabold text-gray-900 leading-none">{value ?? '—'}</p>
      }
      {sub && (
        <p className={`text-xs mt-1.5 font-semibold flex items-center gap-1 ${subUp === true ? 'text-emerald-600' : subUp === false ? 'text-red-500' : 'text-gray-400'}`}>
          {subUp === true && <ArrowUpRight size={12} />}
          {subUp === false && <ArrowDownRight size={12} />}
          {sub}
        </p>
      )}
    </div>
  </div>
);

// ── BookingCard (in DayPanel) ─────────────────────────────────────────────────
const BookingCard = ({ booking, onEdit, onDelete, deleting }) => {
  const color = equipColor(booking.equipment);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-1" style={{ background: color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{EQUIP_ICONS[booking.equipment] || '🎪'}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{booking.equipment || '—'}</p>
              {booking.days > 1 && (
                <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-semibold">{booking.days} d.</span>
              )}
            </div>
          </div>
          {booking.price > 0 && (
            <span className="text-sm font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl flex-shrink-0">
              {booking.price}€
            </span>
          )}
        </div>

        <p className="text-sm font-semibold text-gray-800 mb-2 truncate">
          {booking.customer_name || 'Nežinomas klientas'}
        </p>

        <div className="space-y-1 text-xs text-gray-500">
          {booking.phone && (
            <a href={`tel:${booking.phone}`} className="flex items-center gap-1.5 hover:text-violet-600 transition-colors">
              <Phone size={11} /> {booking.phone}
            </a>
          )}
          {booking.address && (
            <p className="flex items-center gap-1.5 truncate">
              <MapPin size={11} className="flex-shrink-0" /> {booking.address}
            </p>
          )}
          {booking.addons?.length > 0 && (
            <p className="flex items-center gap-1.5 flex-wrap">
              <Zap size={11} className="flex-shrink-0" />
              {booking.addons.join(', ')}
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
          <button onClick={() => onEdit(booking)} data-testid={`booking-edit-${booking.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl py-2 transition-colors">
            <Edit2 size={12} /> Redaguoti
          </button>
          <button onClick={() => onDelete(booking)} disabled={deleting === booking.id} data-testid={`booking-delete-${booking.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl py-2 transition-colors disabled:opacity-50">
            {deleting === booking.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Ištrinti
          </button>
        </div>
      </div>
    </div>
  );
};

// ── BookingModal (create / edit) ──────────────────────────────────────────────
const EMPTY_FORM = { equipment:'', customer_name:'', phone:'', address:'', startDate:'', durationDays:'1', price:'', addons:'', notes:'' };

const BookingModal = ({ booking, onClose, onSaved }) => {
  const isEdit = !!booking?.id;
  const [form, setForm] = useState(booking ? {
    equipment:     booking.equipment || '',
    customer_name: booking.customer_name || '',
    phone:         booking.phone || '',
    address:       booking.address || '',
    startDate:     booking.startDate || '',
    durationDays:  String(booking.days || 1),
    price:         String(booking.price || ''),
    addons:        Array.isArray(booking.addons) ? booking.addons.join(', ') : (booking.addons || ''),
    notes:         booking.notes || '',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.equipment || !form.customer_name || !form.phone || !form.startDate) {
      setError('Užpildykite privalomą informaciją: įranga, kliento vardas, tel., data');
      return;
    }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await api.post(`/admin/booking/update`, {
          eventId: booking.id,
          action: 'edit',
          fields: {
            equipment:     form.equipment,
            customer_name: form.customer_name,
            phone:         form.phone,
            address:       form.address,
            price:         form.price ? Number(form.price) : undefined,
            addons:        form.addons ? form.addons.split(',').map(s=>s.trim()).filter(Boolean) : [],
            notes:         form.notes,
          },
          newDate:    form.startDate,
          extendDays: Number(form.durationDays) - 1,
        });
      } else {
        await api.post(`/admin/booking/create`, {
          equipment:     form.equipment,
          customer_name: form.customer_name,
          phone:         form.phone,
          address:       form.address,
          startDate:     form.startDate,
          durationDays:  Number(form.durationDays),
          price:         form.price ? Number(form.price) : 0,
          addons:        form.addons ? form.addons.split(',').map(s=>s.trim()).filter(Boolean) : [],
          notes:         form.notes,
        });
      }
      onSaved();
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Įvyko klaida';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const InputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-extrabold text-gray-900">
            {isEdit ? 'Redaguoti rezervaciją' : 'Nauja rezervacija'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Įranga *</label>
            <select value={form.equipment} onChange={e=>set('equipment',e.target.value)} className={InputCls} required data-testid="modal-equipment">
              <option value="">Pasirinkite įrangą...</option>
              {EQUIPMENT_LIST.map(eq => <option key={eq} value={eq}>{EQUIP_ICONS[eq]} {eq}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Kliento vardas *</label>
              <input value={form.customer_name} onChange={e=>set('customer_name',e.target.value)} placeholder="Vardas Pavardė" className={InputCls} required data-testid="modal-customer-name" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Tel. numeris *</label>
              <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+37060000000" className={InputCls} required data-testid="modal-phone" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Pilnas adresas</label>
            <input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="pvz. Kaunas, Savanorių pr. 5" className={InputCls} data-testid="modal-address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Pradžios data *</label>
              <input type="date" value={form.startDate} onChange={e=>set('startDate',e.target.value)} className={InputCls} required data-testid="modal-start-date" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Dienų skaičius</label>
              <input type="number" min="1" max="30" value={form.durationDays} onChange={e=>set('durationDays',e.target.value)} className={InputCls} data-testid="modal-duration" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Kaina (€)</label>
              <input type="number" min="0" value={form.price} onChange={e=>set('price',e.target.value)} placeholder="pvz. 150" className={InputCls} data-testid="modal-price" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Priedai</label>
              <input value={form.addons} onChange={e=>set('addons',e.target.value)} placeholder="Cukraus vata, JBL..." className={InputCls} data-testid="modal-addons" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Pastabos</label>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Papildoma informacija..." rows={2} className={`${InputCls} resize-none`} data-testid="modal-notes" />
          </div>
          <button type="submit" disabled={saving} data-testid="modal-save-btn"
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold py-3.5 text-sm hover:from-violet-700 hover:to-purple-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-violet-200 mt-1">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Saugoma...</> : <><CheckCircle2 size={16} /> {isEdit ? 'Išsaugoti' : 'Sukurti rezervaciją'}</>}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── BookingModal – swap axios → api ──────────────────────────────────────────
// (already uses api via module scope — see interceptor above)

// ── NextFreePanel ─────────────────────────────────────────────────────────────
const NextFreePanel = () => {
  const [equip, setEquip] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!equip) return;
    setLoading(true); setResult(null);
    try {
      const { data } = await api.get(`/admin/next-free`, { params: { equipment: equip, days: 30 } });
      setResult(data);
    } catch { setResult({ freeDates: [] }); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Calendar size={15} className="text-violet-500" /> Laisvos datos</p>
      <div className="flex gap-2">
        <select value={equip} onChange={e=>setEquip(e.target.value)} data-testid="next-free-select"
          className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
          <option value="">Pasirinkite įrangą...</option>
          {EQUIPMENT_LIST.map(eq => <option key={eq} value={eq}>{EQUIP_ICONS[eq]} {eq}</option>)}
        </select>
        <button onClick={search} disabled={!equip || loading} data-testid="next-free-search-btn"
          className="rounded-xl bg-violet-600 text-white px-4 py-2 text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Ieškoti
        </button>
      </div>
      {result && (
        <div className="mt-3">
          {result.freeDates?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {result.freeDates.slice(0, 8).map((fd, i) => (
                <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold">
                  {fd.date || fd} {fd.weekday || ''}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">Artimiausias 30 d. laisvų datų nerasta</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const now = new Date();

  // ── Auth ──
  const [token, setToken] = useState(() => localStorage.getItem('admin_token') || '');
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!token) { setAuthChecked(true); return; }
    api.get('/admin/verify').then(({ data }) => {
      if (!data.valid) { localStorage.removeItem('admin_token'); setToken(''); }
    }).catch(() => {
      localStorage.removeItem('admin_token'); setToken('');
    }).finally(() => setAuthChecked(true));
  }, []); // eslint-disable-line

  const handleLogin = t => setToken(t);
  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_token_day');
    setToken('');
  };

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'pending'

  // ── Calendar state ──
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [data, setData]   = useState({ bookings: [], stats: {}, equipment: [] });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [selectedDay, setSelectedDay] = useState(todayYMD);
  const [filterEquip, setFilterEquip] = useState('');
  const [search, setSearch]     = useState('');
  const [equipSearch, setEquipSearch] = useState('');
  const [modal, setModal]       = useState(null);
  const [deleting, setDeleting] = useState('');

  // ── Pending orders state ──
  const [pending, setPending]         = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [confirmOrder, setConfirmOrder]     = useState(null);
  const [acting, setActing]                 = useState('');

  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const { data: d } = await api.get('/admin/dashboard', { params: { month: monthStr } });
      setData({ bookings: d.bookings || [], stats: d.stats || {}, equipment: d.equipment || [] });
    } catch (e) {
      if (e?.response?.status === 401) { handleLogout(); return; }
      setError('Nepavyko gauti duomenų. Patikrinkite n8n ryšį.');
    } finally { setLoading(false); }
  }, [monthStr, token]); // eslint-disable-line

  const fetchPending = useCallback(async () => {
    if (!token) return;
    setPendingLoading(true);
    try {
      const { data } = await api.get('/admin/pending-orders');
      setPending(data || []);
    } catch { setPending([]); }
    finally { setPendingLoading(false); }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (activeTab === 'pending') fetchPending(); }, [activeTab, fetchPending]);

  const prevMonth = () => { if (month === 0) { setYear(y=>y-1); setMonth(11); } else setMonth(m=>m-1); };
  const nextMonth = () => { if (month === 11) { setYear(y=>y+1); setMonth(0); } else setMonth(m=>m+1); };
  const goToday   = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(todayYMD); };

  const handleReject = async id => {
    if (!window.confirm('Atmesti šį užsakymą?')) return;
    setActing(id);
    try {
      await api.post(`/orders/${id}/reject`);
      setPending(p => p.filter(o => o.id !== id));
    } catch (e) { alert(e?.response?.data?.detail || 'Klaida'); }
    finally { setActing(''); }
  };

  const handleConfirmedOrder = () => {
    setConfirmOrder(null);
    setPending(p => p.filter(o => o.id !== confirmOrder?.id));
    fetchData(); // refresh calendar
  };

  // Extract string name from an equipment item (can be string or object)
  const equipStr = item => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    if (typeof item === 'object') return item.name || item.title || '';
    return '';
  };

  // Normalise a booking object to consistent field names
  const normalise = b => {
    const rawEquip = b.equipment;
    const equipArr = Array.isArray(rawEquip)
      ? rawEquip.map(equipStr).filter(Boolean)
      : (rawEquip ? [equipStr(rawEquip)] : []);
    return {
      ...b,
      startDate:     b.startDate  || b.event_date  || b.start_date || '',
      endDate:       b.endDate    || b.end_date     || b.startDate || b.event_date || '',
      days:          b.days       || b.duration_days || 1,
      customer_name: b.customer_name || 'Nežinomas klientas',
      phone:         b.phone      || b.customer_phone || '',
      address:       b.address    || b.delivery_address || b.city || '',
      equipment:     equipArr[0] || '',
      equipmentList: equipArr,
      price:         b.price || 0,
      addons:        (b.addons || []).map(a => typeof a === 'string' ? a : (a?.name || '')).filter(Boolean),
    };
  };

  // Map bookings to dates for calendar
  const bookingsByDate = useMemo(() => {
    const map = {};
    data.bookings.map(normalise).forEach(b => {
      const start = b.startDate;
      const end   = b.endDate || start;
      if (!start) return;
      let cur = new Date(start + 'T00:00:00');
      const endD = new Date((end||start) + 'T00:00:00');
      while (cur <= endD) {
        const k = toYMD(cur);
        if (!map[k]) map[k] = [];
        map[k].push(b);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [data.bookings]); // eslint-disable-line

  // Filter bookings for selected day
  const dayBookings = useMemo(() => {
    const all = (bookingsByDate[selectedDay] || []);
    const q = search.toLowerCase();
    return all.filter(b =>
      (!filterEquip || b.equipment === filterEquip || b.equipmentList?.includes(filterEquip)) &&
      (!q || (b.customer_name||'').toLowerCase().includes(q) || (b.equipment||'').toLowerCase().includes(q))
    );
  }, [bookingsByDate, selectedDay, filterEquip, search]);

  // Unique equipment in current month's bookings for filter chips
  const equipInMonth = useMemo(() => {
    const set = new Set();
    data.bookings.map(normalise).forEach(b => {
      (b.equipmentList || (b.equipment ? [b.equipment] : [])).forEach(e => { if(e) set.add(e); });
    });
    return [...set];
  }, [data.bookings]); // eslint-disable-line

  // Equipment table filtered
  const filteredEquipment = useMemo(() => {
    const q = equipSearch.toLowerCase();
    return data.equipment.filter(e => !q || (e.name||'').toLowerCase().includes(q));
  }, [data.equipment, equipSearch]);

  const handleDelete = async booking => {
    if (!window.confirm(`Ištrinti rezervaciją: ${booking.equipment} – ${booking.customer_name}?`)) return;
    setDeleting(booking.id);
    try {
      await api.post('/admin/booking/delete', { eventId: booking.id, force: false });
      fetchData();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Klaida trinant');
    } finally { setDeleting(''); }
  };

  const handleSaved = () => {
    setModal(null);
    fetchData();
  };

  // Stats derived values
  const st = data.stats;

  const calDays = useMemo(() => buildCalendarDays(year, month), [year, month]);

  // Selected day label
  const selDate = selectedDay ? new Date(selectedDay + 'T00:00:00') : null;
  const selLabel = selDate
    ? `${selDate.getDate()} ${MONTHS_LT[selDate.getMonth()]}`
    : '';

  // ── Auth gate ──
  if (!authChecked) return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 to-indigo-900 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-white/60" />
    </div>
  );
  if (!token) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-slate-50 font-figtree">

      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-violet-900 to-indigo-900 shadow-xl sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 flex items-center gap-3 h-16">
          <div className="flex items-center gap-2.5 mr-auto">
            <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center text-lg">🎪</div>
            <div>
              <span className="text-white font-extrabold text-base leading-none">Batutynas</span>
              <span className="text-violet-300 text-xs block leading-none">Valdymo panelė</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-xl p-1">
            <button onClick={() => setActiveTab('calendar')} data-testid="tab-calendar"
              className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-colors ${activeTab==='calendar' ? 'bg-white text-violet-700' : 'text-white/80 hover:bg-white/20'}`}>
              <Calendar size={13} /> Kalendorius
            </button>
            <button onClick={() => setActiveTab('pending')} data-testid="tab-pending"
              className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-colors ${activeTab==='pending' ? 'bg-white text-amber-600' : 'text-white/80 hover:bg-white/20'}`}>
              <Bell size={13} />
              Laukiančios
              {pending.length > 0 && (
                <span className="bg-amber-400 text-amber-900 text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                  {pending.length}
                </span>
              )}
            </button>
          </div>

          {/* Month navigation (calendar tab only) */}
          {activeTab === 'calendar' && (
            <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
              <button onClick={prevMonth} data-testid="prev-month" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors"><ChevronLeft size={16} /></button>
              <button onClick={goToday} data-testid="today-btn" className="px-3 h-8 rounded-lg text-xs font-bold text-white/80 hover:bg-white/20 transition-colors whitespace-nowrap">Šiandien</button>
              <span className="text-white font-bold text-sm px-2 whitespace-nowrap" data-testid="month-title">{MONTHS_LT[month]} {year}</span>
              <button onClick={nextMonth} data-testid="next-month" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors"><ChevronRight size={16} /></button>
            </div>
          )}

          <button onClick={fetchData} disabled={loading} data-testid="refresh-btn"
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <button onClick={() => setModal('create')} data-testid="create-booking-btn"
            className="hidden sm:flex items-center gap-2 bg-white text-violet-700 font-bold text-sm px-4 py-2 rounded-xl hover:bg-violet-50 active:scale-95 transition-all shadow-sm">
            <Plus size={15} /> Naujas
          </button>

          <button onClick={handleLogout} data-testid="logout-btn"
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors" title="Atsijungti">
            <LogOut size={15} />
          </button>
        </div>

        {/* Mobile tabs */}
        <div className="sm:hidden flex border-t border-white/10">
          <button onClick={() => setActiveTab('calendar')} className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 ${activeTab==='calendar' ? 'text-white border-b-2 border-white' : 'text-white/50'}`}>
            <Calendar size={13} /> Kalendorius
          </button>
          <button onClick={() => setActiveTab('pending')} className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 ${activeTab==='pending' ? 'text-amber-300 border-b-2 border-amber-300' : 'text-white/50'}`}>
            <Bell size={13} /> Laukiančios {pending.length > 0 && `(${pending.length})`}
          </button>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-5 py-3.5 text-sm font-medium">
            <AlertCircle size={16} className="flex-shrink-0 text-amber-500" />
            {error}
          </div>
        )}

        {/* ════════════════ PENDING TAB ════════════════ */}
        {activeTab === 'pending' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <Bell size={16} className="text-amber-500" />
                Laukiančios rezervacijos iš chatbot
              </h2>
              <button onClick={fetchPending} disabled={pendingLoading} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600 transition-colors font-semibold">
                <RefreshCw size={12} className={pendingLoading ? 'animate-spin' : ''} /> Atnaujinti
              </button>
            </div>

            {pendingLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-violet-400" />
              </div>
            ) : pending.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm" data-testid="no-pending-orders">
                <CheckCircle2 size={36} className="text-emerald-300 mx-auto mb-3" />
                <p className="font-bold text-gray-600">Viskas tvarkoje!</p>
                <p className="text-sm text-gray-400 mt-1">Šiuo metu laukiančių užsakymų nėra</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="pending-orders-list">
                {pending.map(order => (
                  <PendingOrderCard
                    key={order.id}
                    order={order}
                    onConfirm={o => setConfirmOrder(o)}
                    onReject={handleReject}
                    acting={acting}
                  />
                ))}
              </div>
            )}

            {/* Connection test info banner */}
            <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex gap-3">
              <ClipboardList size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-blue-800 mb-1">Kaip veikia srautas:</p>
                <ol className="text-blue-700 space-y-1 list-decimal list-inside text-xs">
                  <li>Klientas pateikia užsakymą per chatbot → jūs gaunate el. laišką + Telegram pranešimą</li>
                  <li>Užsakymas pasirodo čia su statusu <span className="bg-amber-200 text-amber-800 px-1.5 rounded-full font-bold">Laukia</span></li>
                  <li>Paskambinate klientui, patvirtinate telefonu</li>
                  <li>Spauskite <span className="text-emerald-700 font-bold">Patvirtinti → Kalendorių</span> — Google Calendar automatiškai sukuriamas įvykis</li>
                  <li>Įvykis matomas dashboarde ir jūsų telefone per Google Calendar app</li>
                </ol>
              </div>
            </div>

            {/* Telegram sync integration card */}
            <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
              <p className="font-bold text-indigo-800 text-sm mb-2 flex items-center gap-2">
                <span>✈️</span> Telegram boto sinchronizacija
              </p>
              <p className="text-xs text-indigo-700 mb-3">
                Kai Telegram bote paspaudžiate <strong>bk_ok</strong> arba <strong>bk_no</strong> mygtuką — pridėkite n8n HTTP Request mazgą, kad užsakymo statusas atsinaujintų ir šiame dashborde:
              </p>
              <div className="bg-indigo-900 rounded-xl p-3 text-xs font-mono text-indigo-100 space-y-1 overflow-x-auto">
                <p className="text-indigo-300">{'// n8n HTTP Request node settings:'}</p>
                <p><span className="text-emerald-400">URL:</span> {`${process.env.REACT_APP_BACKEND_URL}/api/webhook/n8n-sync`}</p>
                <p><span className="text-emerald-400">Method:</span> POST</p>
                <p><span className="text-emerald-400">Header:</span> x-sync-secret: __N8N_SYNC_SECRET__</p>
                <p><span className="text-emerald-400">Body:</span> {'{'}"orderId": {'{{'}orderId{'}}'}, "status": "confirmed", "bkId": {'{{'}bookingId{'}}'}, "source": "telegram"{'}'}</p>
              </div>
              <p className="text-xs text-indigo-500 mt-2">orderId yra iš <strong>batutynas-booking-notify</strong> payload lauko — jis jau siunčiamas į Telegram.</p>
            </div>
          </div>
        )}

        {/* ════════════════ CALENDAR TAB ════════════════ */}
        {activeTab === 'calendar' && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={Calendar} label="Šiandien" color="border-violet-500 text-violet-600"
            value={st.today_count ?? st.todayCount ?? 0}
            sub={`${st.today_count ?? st.todayCount ?? 0} rezervacij${(st.today_count || st.todayCount) === 1 ? 'a' : 'os'}`}
            loading={loading} />
          <StatsCard icon={Euro} label="Savaitės pajamos" color="border-emerald-500 text-emerald-600"
            value={(st.week_revenue ?? st.weekRevenue) ? `${st.week_revenue ?? st.weekRevenue}€` : '—'}
            sub={(() => {
              const cur = st.week_revenue ?? st.weekRevenue ?? 0;
              const prev = st.last_week_revenue ?? st.weekRevenuePrev ?? 0;
              if (!prev) return '';
              const pct = Math.round(((cur - prev) / prev) * 100);
              return `${pct >= 0 ? '+' : ''}${pct}% nuo praeitos sav.`;
            })()}
            subUp={(() => {
              const cur = st.week_revenue ?? st.weekRevenue ?? 0;
              const prev = st.last_week_revenue ?? st.weekRevenuePrev ?? 0;
              return prev ? cur >= prev : undefined;
            })()}
            loading={loading} />
          <StatsCard icon={TrendingUp} label="Mėnesio" color="border-blue-500 text-blue-600"
            value={st.month_count ?? st.monthCount ?? data.bookings.length}
            sub={`Vidutiniškai ${(st.avg_price ?? st.avgPrice) ? (st.avg_price ?? st.avgPrice) + '€' : '—'}`}
            loading={loading} />
          <StatsCard icon={Package} label="Laisva įranga" color="border-orange-500 text-orange-600"
            value={st.available_equipment ?? st.availableCount ?? '—'}
            sub={(st.total_equipment ?? st.totalEquipment) ? `iš ${st.total_equipment ?? st.totalEquipment} viso` : ''}
            loading={loading} />
        </div>

        {/* ── Filter chips ── */}
        {equipInMonth.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center" data-testid="filter-bar">
            <button onClick={() => setFilterEquip('')} data-testid="filter-all"
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${!filterEquip ? 'bg-violet-600 text-white border-violet-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'}`}>
              Visi ({data.bookings.length})
            </button>
            {equipInMonth.map(eq => {
              const cnt = data.bookings.map(normalise).filter(b =>
                b.equipment === eq || b.equipmentList?.includes(eq)
              ).length;
              return (
                <button key={eq} onClick={() => setFilterEquip(eq === filterEquip ? '' : eq)}
                  data-testid={`filter-${eq}`}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${filterEquip===eq ? 'text-white border-transparent shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'}`}
                  style={filterEquip===eq ? { background: equipColor(eq) } : {}}>
                  {EQUIP_ICONS[eq]} {eq} ({cnt})
                </button>
              );
            })}
          </div>
        )}

        {/* ── Calendar + Day panel ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">

          {/* Calendar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="calendar-pane">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAYS_LT_SHORT.map(d => (
                <div key={d} className="text-center text-xs font-bold text-gray-400 py-3 uppercase tracking-wide">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 size={24} className="animate-spin text-violet-400" />
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {calDays.map(({ date, cur }) => {
                  const bks = bookingsByDate[date] || [];
                  const filtered = filterEquip ? bks.filter(b=>b.equipment===filterEquip) : bks;
                  const isToday = date === todayYMD;
                  const isSelected = date === selectedDay;
                  return (
                    <button key={date} onClick={() => setSelectedDay(date)} data-testid={`cal-day-${date}`}
                      className={`relative min-h-[72px] p-2 text-left transition-all border-b border-r border-gray-50 hover:bg-violet-50/60
                        ${!cur ? 'opacity-30' : ''}
                        ${isSelected ? 'bg-violet-50 ring-2 ring-inset ring-violet-400' : ''}
                        ${isToday && !isSelected ? 'bg-amber-50/60' : ''}
                      `}>
                      <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold leading-none mb-1
                        ${isToday ? 'bg-violet-600 text-white shadow-sm shadow-violet-300' : isSelected ? 'text-violet-700' : 'text-gray-700'}`}>
                        {new Date(date + 'T00:00:00').getDate()}
                      </span>
                      {/* Booking dots */}
                      {filtered.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {filtered.slice(0, 4).map((b, i) => (
                            <span key={i} title={b.equipment}
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: equipColor(b.equipment) }} />
                          ))}
                          {filtered.length > 4 && <span className="text-[9px] text-gray-400 font-bold">+{filtered.length-4}</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Day panel */}
          <div className="space-y-4" data-testid="day-panel">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                  <Calendar size={14} className="text-violet-500" />
                  {selLabel || 'Pasirinkite dieną'}
                </h3>
                {dayBookings.length > 0 && (
                  <span className="bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {dayBookings.length}
                  </span>
                )}
              </div>

              {/* Search in day */}
              <div className="px-4 py-3 border-b border-gray-50">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={search} onChange={e=>setSearch(e.target.value)}
                    placeholder="Ieškoti rezervacijų..." data-testid="day-search"
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 transition-all" />
                </div>
              </div>

              <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-violet-400" />
                  </div>
                ) : dayBookings.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 font-medium">Šiai dienai rezervacijų nėra</p>
                    <button onClick={() => setModal('create')}
                      className="mt-3 text-xs text-violet-600 font-semibold hover:underline">
                      + Sukurti rezervaciją
                    </button>
                  </div>
                ) : (
                  dayBookings.map(b => (
                    <BookingCard key={b.id} booking={b}
                      onEdit={() => setModal(b)}
                      onDelete={() => handleDelete(b)}
                      deleting={deleting} />
                  ))
                )}
              </div>
            </div>

            {/* Next free dates */}
            <NextFreePanel />
          </div>
        </div>

        {/* ── Equipment status table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="equipment-section">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
              <Package size={15} className="text-violet-500" /> Įrangos būsena (šiandien)
            </h3>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={equipSearch} onChange={e=>setEquipSearch(e.target.value)}
                placeholder="Filtruoti įrangą..." data-testid="equip-search"
                className="pl-8 pr-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 transition-all w-44" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wide px-6 py-3">Įranga</th>
                  <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Tipas</th>
                  <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wide px-4 py-3">Būsena</th>
                  <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Šiandienos rezervacija</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({length:5}).map((_,i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {[1,2,3,4].map(j => (
                        <td key={j} className="px-6 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredEquipment.length > 0 ? (
                  filteredEquipment.map((eq, i) => {
                    const isFree = !eq.status || 
                      eq.status.toLowerCase().includes('available') ||
                      eq.status.toLowerCase().includes('laisv') ||
                      eq.status.toLowerCase() === 'free';
                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-violet-50/30 transition-colors" data-testid={`equip-row-${i}`}>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-base flex-shrink-0">
                              {EQUIP_ICONS[eq.name] || '🎪'}
                            </div>
                            <span className="font-semibold text-gray-800 text-sm">{eq.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-sm hidden sm:table-cell">{eq.type || eq.category || '—'}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${isFree ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isFree ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {isFree ? 'LAISVA' : 'UŽIMTA'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-sm hidden md:table-cell">
                          {eq.todayBooking
                            ? <span className="font-semibold text-gray-700">{eq.todayBooking}</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-400">
                      {data.equipment.length === 0
                        ? 'Įrangos duomenys nepasiekiami. Patikrinkite n8n ryšį.'
                        : 'Nėra atitinkančios įrangos'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats chips row */}
        {((st.top_equipment || st.busiestEquipment) || st.sources) && (
          <div className="flex flex-wrap gap-3">
            {(st.top_equipment || st.busiestEquipment) && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5 flex items-center gap-2 text-sm">
                <Users size={13} className="text-violet-500" />
                <span className="text-gray-500 text-xs">Populiariausia:</span>
                <span className="font-bold text-gray-800">{EQUIP_ICONS[st.top_equipment || st.busiestEquipment]} {st.top_equipment || st.busiestEquipment}</span>
              </div>
            )}
            {st.sources && Object.entries(st.sources).map(([src, cnt]) => (
              <div key={src} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5 flex items-center gap-2 text-sm">
                <span className="text-gray-500 text-xs">{src}:</span>
                <span className="font-bold text-gray-800">{cnt}</span>
              </div>
            ))}
          </div>
        )}

        </>)}
      </div>{/* end main container */}

      {/* ── Floating create button (mobile) ── */}
      <button onClick={() => setModal('create')} data-testid="create-fab"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-xl shadow-violet-300 flex items-center justify-center hover:scale-110 active:scale-95 transition-all xl:hidden z-20">
        <Plus size={22} />
      </button>

      {/* ── Modals ── */}
      {modal && (
        <BookingModal
          booking={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {confirmOrder && (
        <ConfirmOrderModal
          order={confirmOrder}
          onClose={() => setConfirmOrder(null)}
          onConfirmed={handleConfirmedOrder}
        />
      )}
    </div>
  );
}
