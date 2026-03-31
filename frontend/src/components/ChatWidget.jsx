import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Calendar } from './ui/calendar';
import { Calendar as CalendarIcon, Info } from 'lucide-react';
import {
  MessageCircle, X, Phone, Mail, Globe, ChevronDown, ChevronUp, ChevronRight,
  Loader2, CheckCircle2, UserCog, Gift, Building2, PartyPopper,
  ShoppingBag, HelpCircle, Check, Send, Sparkles, RotateCcw,
  Disc3, Droplets, Utensils,
} from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Discount banner — set string to activate, null to hide ───────────────────
// Example: "🎉 Gegužės akcija: -20% visiems batutams! Skambinti: +37064880388"
const DISCOUNT_BANNER = null;

// ── DATA ─────────────────────────────────────────────────────────────────────

// Shared trampoline definitions
const T = {
  pilis:          { id: 'pilis',          name: 'Pilis',          category: 'Mažiausiems', desc: 'Saugus ir spalvingas patiems mažiausiems', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250525_115950_542_1748163603293_photo_optimized-1-yojROivTGOldDzbK.jpg' },
  monstrai:       { id: 'monstrai',       name: 'Monstrai',       category: 'Žaidimų centras', desc: '2026 m. su šokinėjimo pagalve ir smiginiumi', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165240_881_49-sRgMsjrVMtThU9QZ.png' },
  chameleonas:    { id: 'chameleonas',    name: 'Chameleonas',    category: 'Žaidimų centras', desc: '2026 m. ryškus modelis su darts zona', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165904_889_49-YAzOnlljvGg8uSaZ.png' },
  candy_pop:      { id: 'candy_pop',      name: 'Candy Pop',      category: 'Žaidimų centras', desc: '2026 m. su darts sienele ir pagalve', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210165543_886_49-oig3Em2dE8jQSwix.png' },
  astuonkojis:    { id: 'astuonkojis',    name: 'Aštuonkojis',    category: 'Žaidimų centras', desc: '2026 m. naujiena su darts zona', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210164945_873_49-NgQcJYlCT9BnlJoA.png' },
  vienaragiai:    { id: 'vienaragiai',    name: 'Vienaragiai',    category: 'Žaidimų centras', desc: 'Su slėptuve ir kliūčių ruožu', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/vienaragiai1-X6dYQ8JBEOiSwPsL.jpg' },
  mega_raketa:    { id: 'mega_raketa',    name: 'Mega raketa',    category: 'Dviejų dalių',   desc: 'Kosminis dviejų dalių batutas', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250608_144102_598_1749383165455_photo-1-DWXubfRscVaZs0KU.jpg' },
  mega_ufonautai: { id: 'mega_ufonautai', name: 'Mega ufonautai', category: 'Dviejų dalių',   desc: 'Kosmonautų pramogos vaikams', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-03-21-at-15.48.00-Ny8M1EXYDelHi9KY.jpeg' },
  mega_waikiki:   { id: 'mega_waikiki',   name: 'Mega waikiki',   category: 'Dviejų dalių',   desc: 'Egzotiškas dviejų dalių batutas', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/a3-4-r-a-a3-4c_20251210170439_893_49-VO5WtchqawaPVo4Y.png' },
  mega_ruozas:    { id: 'mega_ruozas',    name: 'Mega ruožas',    category: 'Kliūčių ruožas', desc: 'Ilgas kliūčių ruožas aktyviai pramogai', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-12-22-at-11.06.55-ziiCN5QBR6kNIKiy.jpeg' },
  giga_ruozas:    { id: 'giga_ruozas',    name: 'Giga ruožas',    category: 'Kliūčių ruožas', desc: 'Didžiausias kliūčių ruožas masiniams renginiams', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as5_-xMAasSCrKpRl9Lza.jpg' },
  fantaziju_parkas: { id: 'fantaziju_parkas', name: 'Fantazijų parkas', category: 'Didysis parkas', desc: '5 moduliai, 14×14m, iki 150 vaikų per valandą', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=768,fit=crop/0e8dAXAD75sxRpD2/dji_fly_20250718_183914_625_1752853163044_photo_optimized-Pa9IAIUmCkWz0Pls.jpg' },
  dziumandzi_parkas: { id: 'dziumandzi_parkas', name: 'Džiumandži parkas', category: 'Didysis parkas', desc: '8.5m čiuožykla, iki 200 vaikų per valandą', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=768,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-12-10-at-11.20.54-1-SDSuAp44sw4kjZSS.jpeg' },
};

// Per-flow trampoline lists
const BIRTHDAY_TRAMPOLINES = [T.pilis, T.monstrai, T.chameleonas, T.candy_pop, T.astuonkojis, T.vienaragiai, T.mega_raketa, T.mega_ufonautai, T.mega_waikiki, T.mega_ruozas, T.giga_ruozas];
const COMPANY_TRAMPOLINES  = [T.fantaziju_parkas, T.dziumandzi_parkas, T.giga_ruozas, T.mega_ruozas, T.mega_raketa, T.mega_ufonautai, T.mega_waikiki, T.monstrai, T.chameleonas, T.candy_pop, T.astuonkojis, T.vienaragiai];
// ── Šventės nuomai – paslaugų sąrašas ────────────────────────────────────────
const PARTY_SERVICES = [
  { id: 'disco_pavilijonas', name: 'Disco Pavilijonas',       Icon: Disc3,     desc: 'Apšvietimas, garso sistema ir veidrodinė disko lempa' },
  { id: 'putu_sou',          name: 'Pūtų šou',                Icon: Droplets,  desc: 'Putos ir spalvingos šviesos – nepamirštama pramoga' },
  { id: 'banketo_stalai',    name: 'Banketo stalai ir kėdės', Icon: Utensils,  desc: 'Patogios sėdėjimo vietos jūsų svečiams' },
];

const PURCHASE_CATEGORIES = [
  { id: 'ciuozyklos',    name: 'Čiuožyklos',          category: 'Pirkimui', desc: 'Milžiniškas wow efektas Jūsų kieme', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/iguana_3-dz9hunkSFmwl9lEA.jpg' },
  { id: 'kliuciu_ruozai',name: 'Kliūčių ruožai',      category: 'Pirkimui', desc: 'Sportiškoms šventėms ir renginiams', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/klia-aia3-ruoa3-4as7_-PF5s1CBJOSf9Dsw8.jpg' },
  { id: '2daliu',        name: '2-jų dalių batutai',  category: 'Pirkimui', desc: 'Universalus ir lengvai transportuojamas', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/20250521_110510-9ivNn8rnMl8Msni4.jpg' },
  { id: 'zaidimai',      name: 'Pripučiami žaidimai', category: 'Pirkimui', desc: 'Dart, krepšinis ir kitos pramogos', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/img-20250825-wa0000-8QyGFEKpLmp4qiN7.jpg' },
  { id: 'aiksteles',     name: 'Kompaktiškos aikštelės',category: 'Pirkimui',desc: 'Puikiai tinka mažesnėms erdvėms', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/vandenynas_1-bY1Q8sYDKw23WzgU.jpg' },
  { id: 'individuali',   name: 'Individuali gamyba',  category: 'Pirkimui', desc: 'Specifinės formos su Jūsų logotipu', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/whatsapp-image-2025-12-10-at-11.20.54-1-SDSuAp44sw4kjZSS.jpeg' },
];

const ADDONS = [
  { id: 'cukraus_vata', name: 'Cukraus vata',        desc: 'Saldūs debesėliai',        price: '40€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_hd3faxhd3faxhd3f-2RL89Y89SihhXISI.png' },
  { id: 'popcorn',      name: 'Popcorn aparatas',    desc: 'Kino teatro spragėsiai',    price: '40€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_66y74g66y74g66y7-VlbuG5ChABMqrjI3.png' },
  { id: 'serbetas',     name: 'Šerbeto aparatas',    desc: 'Vasariška atgaiva',         price: '40€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/gemini_generated_image_nj59vrnj59vrnj59-WwnAaY9XnFT0QqSs.png' },
  { id: 'jbl',          name: 'JBL PartyBox',        desc: 'Galinga garso sistema',     price: '45€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/unnamed-21-f7MublgIL52DABHh.jpg' },
  { id: 'vr',           name: 'Virtuali realybė',    desc: '360° žaidimai',             price: '40€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/occulus-quest-2-vr-gaming-QtC33jQbS4CMEhLe.jpg' },
  { id: 'burbuilai',    name: 'Burbulų mašina',      desc: 'Magiška burbulų jūra',      price: '20€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/unnamed-18-RCisgJ5gSyqKnYs3.jpg' },
  { id: 'instax',       name: 'Instax Mini',         desc: 'Momentinis fotoaparatas',   price: '20€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/fujifilm_instax_mini_11_review_8c9cd6ffa9b02044a7a3327bc82c5649-85UNqcxSSc90bLMk.jpg' },
  { id: 'sumo',         name: 'Sumo kostiumai',      desc: 'Juokingos imtynės vaikams', price: '40€ / NEMOKAMAS', image: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/0e8dAXAD75sxRpD2/fb_img_1767910149829-sogtSQXqI3GWH7om.jpg' },
];

const FLOWS = {
  birthday: { label: 'Vaiko gimtadieniui', Icon: Gift, color: 'bg-pink-100 text-pink-600',
    intro: 'Padėkime surengti nepamirštamą vaiko gimtadienį! Pasirinkite batutą:',
    trampolines: BIRTHDAY_TRAMPOLINES, showAddons: true,
    fields: [
      { name: 'vardas',         label: 'Jūsų vardas',    type: 'text', placeholder: 'Jonas Jonaitis',  required: true },
      { name: 'telefonas',      label: 'Tel. numeris',   type: 'tel',  placeholder: '+37060000000',    required: true },
      { name: 'vaikuSkaicius',  label: 'Vaikų skaičius', type: 'text', placeholder: 'pvz. 10 vaikų',   required: true },
      { name: 'data',           label: 'Renginio data',  type: 'date', placeholder: '',                required: true },
      { name: 'vieta',          label: 'Pilnas adresas',  type: 'text', placeholder: 'pvz. Kaunas, Savanorių pr. 5', required: true },
    ],
    successMsg: 'Jūsų užklausa gauta! Savininkas susisieks su jumis telefonu artimiausiu metu.',
  },
  company: { label: 'Įmonės renginiui', Icon: Building2, color: 'bg-blue-100 text-blue-600',
    intro: 'Organizuojate įmonės renginį? Turime didžiausius parkus ir kliūčių ruožus! Pasirinkite:',
    trampolines: COMPANY_TRAMPOLINES, showAddons: true,
    fields: [
      { name: 'imonesP',    label: 'Įmonės pavadinimas', type: 'text', placeholder: 'UAB Pavyzdys',     required: true },
      { name: 'kontaktinis',label: 'Kontaktinis asmuo',  type: 'text', placeholder: 'Vardas Pavardė',   required: true },
      { name: 'telefonas',  label: 'Tel. numeris',        type: 'tel',  placeholder: '+37060000000',     required: true },
      { name: 'dalyviai',   label: 'Dalyvių skaičius',   type: 'text', placeholder: 'pvz. 50 žmonių',   required: true },
      { name: 'data',       label: 'Renginio data',       type: 'date', placeholder: '',                 required: true },
      { name: 'vieta',      label: 'Pilnas adresas',       type: 'text', placeholder: 'pvz. Vilnius, Gedimino pr. 1', required: true },
    ],
    successMsg: 'Ačiū! Įmonės renginio užklausa gauta. Savininkas susisieks artimiausiu metu.',
  },
  party: { label: 'Šventės nuomai', Icon: PartyPopper, color: 'bg-amber-100 text-amber-600',
    intro: 'Planuojate šventę? Pasirinkite paslaugas (galima kelias) ir priedus!',
    services: PARTY_SERVICES, multiSelect: true, showAddons: true,
    fields: [
      { name: 'vardas',          label: 'Jūsų vardas',     type: 'text', placeholder: 'Vardas Pavardė',   required: true },
      { name: 'telefonas',       label: 'Tel. numeris',     type: 'tel',  placeholder: '+37060000000',     required: true },
      { name: 'sveciumSkaicius', label: 'Svečių skaičius', type: 'text', placeholder: 'pvz. 30 svečių',   required: true },
      { name: 'data',            label: 'Renginio data',    type: 'date', placeholder: '',                 required: true },
      { name: 'vieta',           label: 'Pilnas adresas',    type: 'text', placeholder: 'pvz. Šiauliai, Tilžės g. 10', required: true },
    ],
    successMsg: 'Ačiū! Šventės nuomos užklausa gauta. Savininkas susisieks artimiausiu metu.',
  },
  purchase: { label: 'Pirkti batutą', Icon: ShoppingBag, color: 'bg-green-100 text-green-600',
    intro: 'Pagelbėkime jums įsigyti batutą! Pasirinkite kategoriją:',
    trampolines: PURCHASE_CATEGORIES, showAddons: false,
    fields: [
      { name: 'vardas',    label: 'Jūsų vardas',        type: 'text',  placeholder: 'Vardas Pavardė',  required: true },
      { name: 'telefonas', label: 'Tel. numeris',         type: 'tel',   placeholder: '+37060000000',    required: true },
      { name: 'epastas',   label: 'El. paštas',          type: 'email', placeholder: 'vardas@gmail.com',required: true },
      { name: 'adresas',   label: 'Pristatymo adresas',  type: 'text',  placeholder: 'Gatvė, miestas',  required: true },
    ],
    successMsg: 'Ačiū! Atsiųsime jums batutų katalogą el. paštu. Savininkas susisieks artimiausiu metu.',
  },
};

const ESCALATION_FIELDS = [
  { name: 'vardas',    label: 'Jūsų vardas',                  type: 'text',     placeholder: 'Vardas Pavardė',        required: true },
  { name: 'kontaktas', label: 'Tel. numeris arba el. paštas', type: 'text',     placeholder: '+37060000000',          required: true },
  { name: 'zinute',    label: 'Jūsų žinutė',                  type: 'textarea', placeholder: 'Aprašykite klausimą...', required: true },
];

const FAQ_ITEMS = [
  { q: 'Koks batuto dydis man tinka?',     a: 'Vaikams iki 5 m. rekomenduojame "Pilis". Šeimoms ir šventėms – kompaktinius žaidimų centrus ar dviejų dalių batutus.' },
  { q: 'Ar galima naudoti lietuje?',        a: 'Esant lengvam lietui galima, tačiau drėgnas paviršius gali tapti slidus. Audros metu sustabdykite naudojimą.' },
  { q: 'Kokios saugumo taisyklės?',         a: 'Maks. 1 vaikas vienu metu. Vaikai iki 6 m. prižiūrimi suaugusiojo. Šokinėti tik be batų, vengti kraštų.' },
  { q: 'Kiek laiko trunka pristatymas?',    a: 'Paprastai per 1–3 darbo dienas. Konkrečią datą suderinsite su savininku po užklausos.' },
  { q: 'Ar reikia mokėti užstatą?',         a: 'Taip, imamas nedidelis užstatas. Tikslią sumą savininkas patvirtins susisiekdamas telefonu.' },
  { q: 'Kokiems renginiams tinka batutai?', a: 'Gimtadieniams, įmonių piknikams, vestuvių šventėms, mokyklų renginiams ir kitiems lauko ar salės renginiams.' },
];

// ── Shared input class ────────────────────────────────────────────────────────
const INPUT_CLS = 'w-full rounded-2xl border border-purple-200 bg-purple-50/50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:opacity-50 transition-all';

// ── Step indicator ────────────────────────────────────────────────────────────
const STEP_LABELS = {
  default:  ['Batutas', 'Priedai', 'Forma', 'Patvirtinta'],
  purchase: ['Kategorija', 'Forma', 'Patvirtinta'],
};
const StepBar = ({ flowId, step }) => {
  if (!flowId || flowId === 'faq' || flowId === 'escalation' || step === 0) return null;
  const isPurchase = flowId === 'purchase';
  const labels = isPurchase ? STEP_LABELS.purchase : STEP_LABELS.default;
  // Map raw step (1-4) to display index
  const displayIdx = isPurchase
    ? (step === 1 ? 0 : step >= 3 ? 1 : step === 4 ? 2 : 0)
    : step - 1;
  return (
    <div className="flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-50 border-b border-purple-100 flex-shrink-0">
      {labels.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${i < displayIdx ? 'bg-violet-600 text-white' : i === displayIdx ? 'bg-violet-600 text-white ring-2 ring-violet-200 ring-offset-1' : 'bg-gray-200 text-gray-500'}`}>
              {i < displayIdx ? <Check size={11} /> : i + 1}
            </div>
            <span className={`text-xs font-semibold hidden sm:block ${i <= displayIdx ? 'text-violet-700' : 'text-gray-400'}`}>{label}</span>
          </div>
          {i < labels.length - 1 && (
            <div className={`h-px w-4 flex-shrink-0 ${i < displayIdx ? 'bg-violet-400' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ── Image with skeleton loading ───────────────────────────────────────────────
const ImgSkeleton = ({ src, alt, className }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative overflow-hidden">
      {!loaded && <div className={`${className} img-skeleton absolute inset-0`} />}
      <img src={src} alt={alt} className={`${className} transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
    </div>
  );
};

// ── Date field with Shadcn Calendar + availability ────────────────────────────
const DateField = ({ value, onChange, disabled, trampolineName }) => {
  const [open, setOpen] = useState(false);
  const [bookedDates, setBookedDates] = useState([]);
  const [calMonth, setCalMonth] = useState(new Date());
  const ref = useRef(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const selected = value ? new Date(value + 'T00:00:00') : undefined;
  const displayDate = selected
    ? selected.toLocaleDateString('lt-LT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  // Fetch booked dates whenever trampoline or visible month changes
  useEffect(() => {
    if (!trampolineName) return;
    const month = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}`;
    axios.get(`${API_URL}/availability`, { params: { batutas: trampolineName, month } })
      .then(res => setBookedDates((res.data.booked_dates || []).map(d => new Date(d + 'T00:00:00'))))
      .catch(() => setBookedDates([]));
  }, [trampolineName, calMonth]);

  const handleSelect = date => {
    if (!date) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const disabledMatcher = [{ before: today }, ...bookedDates];

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button type="button" onClick={() => setOpen(v => !v)} disabled={disabled}
        data-testid="date-field-trigger"
        className={`w-full text-left rounded-2xl border-2 px-4 py-3 text-sm transition-all flex items-center gap-3
          ${open ? 'border-violet-500 ring-2 ring-violet-100 bg-white' : selected ? 'border-violet-400 bg-violet-50' : 'border-dashed border-purple-300 bg-purple-50/40 hover:border-violet-400'}
          disabled:opacity-50 cursor-pointer`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-violet-600' : 'bg-purple-100'}`}>
          <CalendarIcon size={15} className={selected ? 'text-white' : 'text-violet-500'} />
        </div>
        <div className="flex-1 min-w-0">
          {selected ? (
            <>
              <p className="text-xs text-violet-500 font-semibold uppercase tracking-wide leading-none mb-0.5">Pasirinkta data</p>
              <p className="text-sm font-bold text-violet-800 capitalize leading-tight truncate">{displayDate}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-400 font-medium leading-none mb-0.5">Renginio data</p>
              <p className="text-sm text-gray-400">Spauskite norėdami pasirinkti...</p>
            </>
          )}
        </div>
        <ChevronDown size={16} className={`text-violet-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Calendar popup */}
      {open && (
        <div className="absolute z-20 mt-2 bg-white rounded-2xl border border-purple-200 shadow-2xl overflow-hidden left-0 right-0">
          <div className="px-4 pt-3 pb-2 bg-gradient-to-r from-violet-600 to-purple-600">
            <p className="text-xs font-bold text-white text-center tracking-wide">Pasirinkite renginio datą</p>
            {bookedDates.length > 0 && (
              <p className="text-xs text-violet-200 text-center mt-0.5">Pilkos datos — jau užimtos</p>
            )}
          </div>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={disabledMatcher}
            defaultMonth={selected || today}
            onMonthChange={setCalMonth}
            className="p-2"
          />
        </div>
      )}
    </div>
  );
};

// ── Trampoline detail modal ───────────────────────────────────────────────────
const TrampolineModal = ({ trampoline, onClose }) => (
  <div className="absolute inset-0 z-[80] bg-black/55 flex items-end sm:items-center justify-center p-3 sm:p-4"
    onClick={onClose}>
    <div className="bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="relative">
        <ImgSkeleton src={trampoline.image} alt={trampoline.name} className="w-full h-44 object-cover" />
        {trampoline.badge && (
          <span className="absolute top-3 left-3 bg-amber-400 text-amber-900 text-xs font-bold px-2.5 py-1 rounded-full shadow">{trampoline.badge}</span>
        )}
        <span className="absolute top-3 right-3 bg-violet-600/85 text-white text-xs px-2.5 py-1 rounded-full">{trampoline.category}</span>
      </div>
      <div className="p-5">
        <h3 className="text-lg font-extrabold text-purple-900 mb-1">{trampoline.name}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{trampoline.desc}</p>
        <button onClick={onClose} data-testid="modal-close"
          className="mt-4 w-full rounded-2xl bg-violet-600 text-white py-3 font-bold text-sm hover:bg-violet-700 active:scale-[0.98] transition-all">
          Uždaryti
        </button>
      </div>
    </div>
  </div>
);

// ── Confetti overlay ──────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#7c3aed','#a855f7','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316'];
const ConfettiOverlay = () => {
  const pieces = useMemo(() =>
    Array.from({ length: 38 }, (_, i) => ({
      left:              `${5 + Math.random() * 90}%`,
      width:             `${6 + Math.random() * 7}px`,
      height:            `${9 + Math.random() * 8}px`,
      background:        CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      animationDelay:    `${Math.random() * 0.6}s`,
      animationDuration: `${0.9 + Math.random() * 0.8}s`,
      borderRadius:      Math.random() > 0.5 ? '50%' : '3px',
      opacity:           0.85 + Math.random() * 0.15,
    }))
  , []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {pieces.map((style, i) => <div key={i} className="confetti-piece" style={style} />)}
    </div>
  );
};

// ── TrampolineSelector ────────────────────────────────────────────────────────
const TrampolineSelector = ({ trampolines, onSelect, selectedId, flowId, onDetail }) => (
  <div className="space-y-3">
    <p className="text-sm font-bold text-purple-700">{flowId === 'purchase' ? 'Pasirinkite kategoriją:' : 'Pasirinkite batutą:'}</p>
    <div className="grid grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-0.5">
      {trampolines.map(t => {
        const isSelected = selectedId === t.id;
        const isLocked = !!selectedId;
        return (
          <div key={t.id} className={`rounded-2xl border-2 overflow-hidden transition-all ${isSelected ? 'border-violet-500 ring-2 ring-violet-200 shadow-md' : 'border-purple-100 hover:border-violet-300 hover:shadow-sm'} ${isLocked && !isSelected ? 'opacity-40' : ''}`}>
            <div className="relative">
              <ImgSkeleton src={t.image} alt={t.name} className="w-full h-24 object-cover" />
              {t.badge && <span className="absolute top-2 left-2 bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full shadow">{t.badge}</span>}
              <span className="absolute top-2 right-2 bg-violet-600/85 text-white text-xs px-2 py-0.5 rounded-full">{t.category}</span>
              <button onClick={() => onDetail(t)} data-testid={`trampoline-info-${t.id}`}
                className="absolute bottom-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow hover:bg-white transition-all">
                <Info size={12} className="text-violet-600" />
              </button>
            </div>
            <div className="p-2.5">
              <p className="text-sm font-bold text-purple-900 leading-tight">{t.name}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight line-clamp-2">{t.desc}</p>
              {!isLocked ? (
                <button onClick={() => onSelect(t)} data-testid={`trampoline-select-${t.id}`}
                  className="mt-2 w-full text-sm bg-violet-600 text-white rounded-xl py-2 hover:bg-violet-700 active:scale-95 transition-all font-bold shadow-sm">
                  Pasirinkti
                </button>
              ) : isSelected ? (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-violet-600 font-bold py-1">
                  <Check size={14} /> Pasirinkta
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ── PartyServicesSelector (multi-select) ─────────────────────────────────────
const PartyServicesSelector = ({ services, onConfirm, confirmed, selectedNames }) => {
  const [selected, setSelected] = useState([]);
  const toggle = id => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  if (confirmed) return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-purple-700">Pasirinktos paslaugos:</p>
      {selectedNames?.length > 0
        ? <div className="flex flex-wrap gap-1.5">{selectedNames.map(n => <span key={n} className="text-xs bg-violet-100 text-violet-700 px-3 py-1 rounded-full font-semibold">{n}</span>)}</div>
        : <p className="text-sm text-gray-500">Paslaugų nepasirinkta</p>
      }
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-purple-700">Pasirinkite paslaugas (galima kelias):</p>
      <div className="space-y-2">
        {services.map(s => {
          const isOn = selected.includes(s.id);
          const SvcIcon = s.Icon;
          return (
            <div key={s.id} onClick={() => toggle(s.id)} data-testid={`service-toggle-${s.id}`}
              className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98] ${isOn ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200 shadow-sm' : 'border-purple-100 hover:border-violet-300 hover:bg-purple-50/40'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${isOn ? 'bg-violet-600' : 'bg-purple-100'}`}>
                <SvcIcon size={20} className={isOn ? 'text-white' : 'text-violet-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-purple-900">{s.name}</p>
                <p className="text-xs text-gray-500 leading-tight mt-0.5">{s.desc}</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${isOn ? 'border-violet-600 bg-violet-600' : 'border-gray-300'}`}>
                {isOn && <Check size={12} className="text-white" />}
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => onConfirm(selected.map(id => services.find(s => s.id === id)?.name).filter(Boolean))}
        disabled={selected.length === 0} data-testid="services-confirm-btn"
        className="w-full rounded-2xl bg-violet-600 text-white text-sm font-bold py-3.5 hover:bg-violet-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
        Tęsti {selected.length > 0 ? `(${selected.length} pasirinkta)` : '→'}
      </button>
    </div>
  );
};

// ── AddonsSelector ────────────────────────────────────────────────────────────
const AddonsSelector = ({ onConfirm, confirmed, selectedAddons: confirmedAddons }) => {
  const [selected, setSelected] = useState([]);
  const toggle = id => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  if (confirmed) return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-purple-700">Pasirinkti priedai:</p>
      {confirmedAddons?.length > 0
        ? <div className="flex flex-wrap gap-1.5">{confirmedAddons.map(n => <span key={n} className="text-xs bg-violet-100 text-violet-700 px-3 py-1 rounded-full font-semibold">{n}</span>)}</div>
        : <p className="text-sm text-gray-500">Priedų nepasirinkta</p>
      }
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-purple-700">Pasirinkite priedus:</p>
        <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200">1 nemokamas!</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-0.5">
        {ADDONS.map(addon => {
          const isOn = selected.includes(addon.id);
          return (
            <div key={addon.id} onClick={() => toggle(addon.id)} data-testid={`addon-toggle-${addon.id}`}
              className={`rounded-2xl border-2 cursor-pointer overflow-hidden transition-all active:scale-95 ${isOn ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200 shadow' : 'border-purple-100 hover:border-violet-200'}`}>
              <div className="relative">
                <img src={addon.image} alt={addon.name} className="w-full h-16 object-cover"
                  onError={e => { e.target.style.display = 'none'; }} />
                {isOn && <div className="absolute inset-0 bg-violet-600/25 flex items-center justify-center"><Check size={24} className="text-white drop-shadow-md" /></div>}
              </div>
              <div className="p-2">
                <p className="text-xs font-bold text-purple-900 leading-tight">{addon.name}</p>
                <p className="text-xs text-violet-600 font-semibold mt-0.5">{addon.price}</p>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => onConfirm(selected.map(id => ADDONS.find(a => a.id === id)?.name).filter(Boolean))}
        data-testid="addons-confirm-btn"
        className="w-full rounded-2xl bg-violet-600 text-white text-sm font-bold py-3.5 hover:bg-violet-700 active:scale-[0.98] transition-all shadow-sm">
        Tęsti {selected.length > 0 ? `(${selected.length} pasirinkta)` : '→'}
      </button>
    </div>
  );
};

// ── FlowForm ─────────────────────────────────────────────────────────────────
const FlowForm = ({ flowId, trampolineName, onSubmit, isSubmitting, submitted }) => {
  const fields = flowId === 'escalation' ? ESCALATION_FIELDS : (FLOWS[flowId]?.fields || []);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});

  const handleChange = (name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };
  const handleSubmit = e => {
    e.preventDefault();
    const newErrors = {};
    fields.forEach(f => {
      if (f.required && !values[f.name]?.toString()?.trim()) newErrors[f.name] = 'Privalomas laukas';
    });
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    onSubmit(flowId, values);
  };

  if (submitted) return (
    <div className="flex items-center gap-3 text-green-600 py-3" data-testid="form-submitted-indicator">
      <CheckCircle2 size={22} /><span className="text-base font-semibold">Užklausa pateikta!</span>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-bold text-purple-700">Kontaktiniai duomenys:</p>
      {fields.map(field => (
        <div key={field.name} className="space-y-1.5">
          <label className="text-sm font-semibold text-purple-800 block">
            {field.label}{field.required && <span className="text-rose-400 ml-0.5">*</span>}
          </label>
          {field.type === 'textarea' ? (
            <textarea value={values[field.name] || ''} placeholder={field.placeholder}
              onChange={e => handleChange(field.name, e.target.value)}
              disabled={isSubmitting} rows={3} data-testid={`input-${field.name}`}
              className={`${INPUT_CLS} resize-none`} />
          ) : field.type === 'date' ? (
            <DateField value={values[field.name] || ''} onChange={v => handleChange(field.name, v)} disabled={isSubmitting} trampolineName={trampolineName} />
          ) : (
            <input type={field.type} value={values[field.name] || ''} placeholder={field.placeholder}
              onChange={e => handleChange(field.name, e.target.value)}
              disabled={isSubmitting} data-testid={`input-${field.name}`}
              className={INPUT_CLS} />
          )}
          {errors[field.name] && <p className="text-xs text-red-500 flex items-center gap-1"><span>!</span>{errors[field.name]}</p>}
        </div>
      ))}
      <button type="submit" disabled={isSubmitting} data-testid={`form-submit-${flowId}`}
        className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold py-4 text-base hover:from-violet-700 hover:to-purple-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-violet-200 mt-2">
        {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Siunčiama...</> : 'Siųsti užklausą'}
      </button>
    </form>
  );
};

// ── FAQSection ────────────────────────────────────────────────────────────────
const FAQSection = ({ onEscalate }) => {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-bold text-purple-700 mb-3">Dažniausiai užduodami klausimai</p>
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} className="border border-purple-100 rounded-2xl overflow-hidden">
          <button onClick={() => setExpanded(expanded === i ? null : i)} data-testid={`faq-item-${i}`}
            className="w-full text-left px-4 py-3.5 flex items-center justify-between bg-purple-50/60 hover:bg-purple-100/60 transition-colors">
            <span className="text-sm font-semibold text-purple-900 pr-3">{item.q}</span>
            {expanded === i ? <ChevronUp size={16} className="text-purple-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-purple-400 flex-shrink-0" />}
          </button>
          {expanded === i && <div className="px-4 py-3 bg-white text-sm text-gray-700 leading-relaxed border-t border-purple-50">{item.a}</div>}
        </div>
      ))}
      <div className="mt-4 p-4 bg-purple-50 rounded-2xl border border-purple-100 space-y-3">
        <p className="text-sm font-bold text-purple-700">Kontaktai</p>
        <a href="tel:+37064880388" className="flex items-center gap-3 text-sm text-purple-800 hover:text-violet-600 transition-colors py-0.5"><Phone size={15} className="text-violet-500" /> +370 648 80388</a>
        <a href="mailto:info@batutynas.lt" className="flex items-center gap-3 text-sm text-purple-800 hover:text-violet-600 transition-colors py-0.5"><Mail size={15} className="text-violet-500" /> info@batutynas.lt</a>
        <a href="https://batutynas.lt" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-purple-800 hover:text-violet-600 transition-colors py-0.5"><Globe size={15} className="text-violet-500" /> batutynas.lt</a>
      </div>
      <button onClick={onEscalate} data-testid="escalate-to-human"
        className="w-full mt-2 rounded-2xl border-2 border-violet-300 text-violet-700 font-bold py-3.5 text-sm hover:bg-violet-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm">
        <UserCog size={16} /> Kalbėti su žmogumi
      </button>
    </div>
  );
};

// ── Main ChatWidget ───────────────────────────────────────────────────────────
const ChatWidget = ({ embedded = false }) => {
  const [isOpen, setIsOpen]               = useState(embedded);
  const [messages, setMessages]           = useState([]);
  const [submittedForms, setSubmittedForms] = useState(new Set());
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [hasUnread, setHasUnread]         = useState(true);
  const [inputValue, setInputValue]       = useState('');
  const [isAiTyping, setIsAiTyping]       = useState(false);
  const [detailTrampoline, setDetailTrampoline] = useState(null);
  const [showConfetti, setShowConfetti]   = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const orderRef       = useRef({});
  const sessionIdRef   = useRef(`s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  // Computed: current flow step for progress bar
  const { flowStep, activeFlowId } = useMemo(() => {
    const hasTrampoline = messages.some(m => m.type === 'trampoline_select');
    const hasAddons     = messages.some(m => m.type === 'addons_select');
    const hasForm       = messages.some(m => m.type === 'form');
    const hasSuccess    = submittedForms.size > 0;
    const flowMsg       = messages.find(m => m.type === 'trampoline_select');
    const flowId        = flowMsg?.data?.flowId || null;
    let step = 0;
    if (hasTrampoline) step = 1;
    if (hasAddons)     step = 2;
    if (hasForm)       step = 3;
    if (hasSuccess)    step = 4;
    return { flowStep: step, activeFlowId: flowId };
  }, [messages, submittedForms]);
  // Listen for external open event (from landing page CTA)
  useEffect(() => {
    const handler = () => { setIsOpen(true); setHasUnread(false); };
    window.addEventListener('open-batutynas-chat', handler);
    return () => window.removeEventListener('open-batutynas-chat', handler);
  }, []);

  // Init messages
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        { id: 'init-1', role: 'bot', type: 'text',
          content: 'Sveiki, aš Batutyno asistentas, pasirinkitę šventės progą arba rašykite klausimą apačioje!', data: {} },
        { id: 'init-2', role: 'bot', type: 'buttons', content: '',
          data: { buttons: [
            { id: 'birthday',        label: 'Vaiko gimtadieniui',   Icon: Gift,       color: 'bg-pink-100 text-pink-600' },
            { id: 'company',         label: 'Įmonės renginiui',     Icon: Building2,  color: 'bg-blue-100 text-blue-600' },
            { id: 'party',           label: 'Šventės nuomai',       Icon: PartyPopper,color: 'bg-amber-100 text-amber-600' },
            { id: 'purchase',        label: 'Pirkti batutą',        Icon: ShoppingBag,color: 'bg-green-100 text-green-600' },
            { id: 'faq',             label: 'DUK ir kontaktai',     Icon: HelpCircle, color: 'bg-violet-100 text-violet-600' },
            { id: 'escalate_direct', label: 'Kalbėti su žmogumi',   Icon: UserCog,    color: 'bg-rose-100 text-rose-600' },
          ]},
        },
      ]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    const t = setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    return () => clearTimeout(t);
  }, [messages, isAiTyping]);

  useEffect(() => {
    if (isOpen && window.innerWidth >= 640) setTimeout(() => inputRef.current?.focus(), 400);
  }, [isOpen]);

  const addMsgs   = useCallback(newMsgs => setMessages(prev => [...prev, ...newMsgs]), []);
  const updateMsg = useCallback((id, patch) => setMessages(prev => prev.map(m => m.id === id ? { ...m, data: { ...m.data, ...patch } } : m)), []);

  // AI free-text
  const handleSendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isAiTyping) return;
    setInputValue('');
    setIsAiTyping(true);
    const ts = Date.now();
    setMessages(prev => [...prev,
      { id: `u-ai-${ts}`, role: 'user', type: 'text', content: text, data: {} },
      { id: `typ-${ts}`,  role: 'bot',  type: 'typing', content: '', data: {} },
    ]);
    try {
      const { data } = await axios.post(`${API_URL}/chat`, { session_id: sessionIdRef.current, message: text });
      setMessages(prev => prev.map(m => m.id === `typ-${ts}` ? { ...m, type: 'text', content: data.reply } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === `typ-${ts}` ? { ...m, type: 'text', content: 'Atsiprašome, įvyko klaida. Skambinkite: +37064880388' } : m));
    } finally {
      setIsAiTyping(false);
    }
  }, [inputValue, isAiTyping]);

  // Flow handlers
  const handleFlowSelect = useCallback(flowId => {
    const ts = Date.now();
    orderRef.current = {};
    const newMsgs = [{ id: `u-${ts}`, role: 'user', type: 'text', content: FLOWS[flowId]?.label || 'DUK', data: {} }];
    if (flowId === 'faq') {
      newMsgs.push({ id: `faq-${ts}`, role: 'bot', type: 'faq', content: '', data: {} });
    } else {
      newMsgs.push({ id: `intr-${ts}`, role: 'bot', type: 'text', content: FLOWS[flowId].intro, data: {} });
      const isMulti = FLOWS[flowId]?.multiSelect === true;
      newMsgs.push({ id: `tsel-${ts}`, role: 'bot', type: 'trampoline_select', content: '', data: {
        flowId,
        ...(isMulti
          ? { multiSelect: true, confirmed: false, selectedNames: [] }
          : { selectedId: null }
        ),
      }});
    }
    addMsgs(newMsgs);
  }, [addMsgs]);

  const handleServicesConfirm = useCallback((msgId, flowId, serviceNames) => {
    updateMsg(msgId, { confirmed: true, selectedNames: serviceNames });
    orderRef.current.trampoline = serviceNames.join(', ');
    const ts = Date.now();
    const newMsgs = [{ id: `u-sv-${ts}`, role: 'user', type: 'text', content: `Paslaugos: ${serviceNames.join(', ')}`, data: {} }];
    if (FLOWS[flowId]?.showAddons)
      newMsgs.push({ id: `add-${ts}`, role: 'bot', type: 'addons_select', content: '', data: { flowId, confirmed: false, selectedAddons: [] } });
    else
      newMsgs.push({ id: `frm-${ts}`, role: 'bot', type: 'form', content: '', data: { flowId, trampoline: orderRef.current.trampoline } });
    addMsgs(newMsgs);
  }, [updateMsg, addMsgs]);

  const handleTrampolineSelect = useCallback((msgId, flowId, trampoline) => {
    updateMsg(msgId, { selectedId: trampoline.id });
    orderRef.current.trampoline = trampoline.name;
    const ts = Date.now();
    const newMsgs = [{ id: `u-t-${ts}`, role: 'user', type: 'text', content: `Batutas: ${trampoline.name}`, data: {} }];
    if (FLOWS[flowId]?.showAddons)
      newMsgs.push({ id: `add-${ts}`, role: 'bot', type: 'addons_select', content: '', data: { flowId, confirmed: false, selectedAddons: [] } });
    else
      newMsgs.push({ id: `frm-${ts}`, role: 'bot', type: 'form', content: '', data: { flowId, trampoline: trampoline.name } });
    addMsgs(newMsgs);
  }, [updateMsg, addMsgs]);

  const handleAddonsConfirm = useCallback((msgId, flowId, addonNames) => {
    updateMsg(msgId, { confirmed: true, selectedAddons: addonNames });
    orderRef.current.addons = addonNames;
    addMsgs([{ id: `frm-${Date.now()}`, role: 'bot', type: 'form', content: '', data: { flowId, trampoline: orderRef.current.trampoline } }]);
  }, [updateMsg, addMsgs]);

  const handleFormSubmit = useCallback(async (formMsgId, flowId, formValues) => {
    setIsSubmitting(true);
    const data = {
      ...formValues,
      ...(orderRef.current.trampoline && { batutas: orderRef.current.trampoline }),
      ...(orderRef.current.addons?.length > 0 && { priedai: orderRef.current.addons.join(', ') }),
    };
    try {
      if (flowId === 'escalation')
        await axios.post(`${API_URL}/escalation`, { name: data.vardas || 'Nenurodyta', contact: data.kontaktas || 'Nenurodyta', message: data.zinute || '' });
      else
        await axios.post(`${API_URL}/orders`, { flow_type: flowId, form_data: data });
      setSubmittedForms(prev => new Set([...prev, formMsgId]));
      // Trigger confetti for non-escalation flows
      if (flowId !== 'escalation') {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2500);
      }
      const ok = flowId === 'escalation' ? 'Jūsų žinutė perduota savininkui. Susisieksime artimiausiu metu!' : (FLOWS[flowId]?.successMsg || 'Užklausa gauta!');
      const ts = Date.now();
      addMsgs([
        { id: `ok-${ts}`,  role: 'bot', type: 'text', content: ok, data: {} },
        { id: `rs-${ts}`,  role: 'bot', type: 'buttons', content: 'Ar galiu kuo nors dar padėti?',
          data: { buttons: [{ id: 'reset', label: '← Grįžti į pradžią', Icon: null, color: '' }] } },
      ]);
    } catch {
      addMsgs([{ id: `err-${Date.now()}`, role: 'bot', type: 'text', content: 'Atsiprašome, įvyko klaida. Skambinkite: +37064880388', data: {} }]);
    } finally {
      setIsSubmitting(false);
    }
  }, [addMsgs]);

  const handleEscalate = useCallback(() => {
    const ts = Date.now();
    addMsgs([
      { id: `eu-${ts}`,  role: 'user', type: 'text', content: 'Kalbėti su žmogumi', data: {} },
      { id: `ei-${ts}`,  role: 'bot',  type: 'text', content: 'Žinutė bus perduota savininkui. Prašome užpildyti:', data: {} },
      { id: `ef-${ts}`,  role: 'bot',  type: 'form', content: '', data: { flowId: 'escalation' } },
    ]);
  }, [addMsgs]);

  const handleReset = useCallback(() => {
    setMessages([]); setSubmittedForms(new Set()); orderRef.current = {}; setDetailTrampoline(null);
  }, []);

  const handleButtonClick = useCallback(btnId => {
    if (btnId === 'reset') handleReset();
    else if (btnId === 'escalate_direct') handleEscalate();
    else handleFlowSelect(btnId);
  }, [handleFlowSelect, handleReset, handleEscalate]);

  // Render
  const renderMessage = useCallback(msg => {
    const isBot = msg.role === 'bot';

    if (msg.type === 'typing') return (
      <div key={msg.id} className="flex justify-start chat-msg-enter">
        <div className="bg-purple-100 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-1.5">
          {[0,160,320].map(d => <span key={d} className="w-2.5 h-2.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
        </div>
      </div>
    );

    if (msg.type === 'text') return (
      <div key={msg.id} className={`flex ${isBot ? 'justify-start' : 'justify-end'} chat-msg-enter`}>
        <div className={`max-w-[82%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed ${isBot ? 'bg-purple-100 text-purple-900 rounded-bl-sm' : 'bg-gradient-to-br from-violet-600 to-purple-600 text-white rounded-br-sm shadow-sm'}`}>
          {msg.content}
        </div>
      </div>
    );

    if (msg.type === 'buttons') return (
      <div key={msg.id} className="flex justify-start chat-msg-enter w-full">
        <div className="w-full space-y-2">
          {msg.content && <p className="text-sm text-purple-700 font-semibold px-1 mb-2">{msg.content}</p>}
          {msg.data.buttons.map(btn => {
            const BtnIcon = btn.Icon;
            return (
              <button key={btn.id} onClick={() => handleButtonClick(btn.id)} data-testid={`quick-reply-${btn.id}`}
                className="w-full flex items-center gap-3 bg-white border-2 border-purple-100 hover:border-violet-300 hover:bg-violet-50/50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-gray-800 transition-all active:scale-[0.98] shadow-sm hover:shadow">
                {BtnIcon && <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${btn.color || 'bg-violet-100 text-violet-600'}`}><BtnIcon size={18} /></div>}
                <span className="flex-1 text-left">{btn.label}</span>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );

    if (msg.type === 'trampoline_select') return (
      <div key={msg.id} className="flex justify-start chat-flow-enter w-full">
        <div className="w-full bg-white border border-purple-100 rounded-2xl p-4 shadow-sm">
          {msg.data.multiSelect
            ? <PartyServicesSelector
                services={FLOWS[msg.data.flowId]?.services || []}
                onConfirm={names => handleServicesConfirm(msg.id, msg.data.flowId, names)}
                confirmed={msg.data.confirmed}
                selectedNames={msg.data.selectedNames}
              />
            : <TrampolineSelector trampolines={FLOWS[msg.data.flowId]?.trampolines || []}
                onSelect={t => handleTrampolineSelect(msg.id, msg.data.flowId, t)}
                selectedId={msg.data.selectedId} flowId={msg.data.flowId}
                onDetail={t => setDetailTrampoline(t)} />
          }
        </div>
      </div>
    );

    if (msg.type === 'addons_select') return (
      <div key={msg.id} className="flex justify-start chat-flow-enter w-full">
        <div className="w-full bg-white border border-purple-100 rounded-2xl p-4 shadow-sm">
          <AddonsSelector onConfirm={names => handleAddonsConfirm(msg.id, msg.data.flowId, names)}
            confirmed={msg.data.confirmed} selectedAddons={msg.data.selectedAddons} />
        </div>
      </div>
    );

    if (msg.type === 'form') return (
      <div key={msg.id} className="flex justify-start chat-flow-enter w-full">
        <div className="w-full bg-white border border-purple-100 rounded-2xl p-4 shadow-sm">
          <FlowForm flowId={msg.data.flowId} trampolineName={msg.data.trampoline}
            onSubmit={(flowId, data) => handleFormSubmit(msg.id, flowId, data)}
            isSubmitting={isSubmitting} submitted={submittedForms.has(msg.id)} />
        </div>
      </div>
    );

    if (msg.type === 'faq') return (
      <div key={msg.id} className="flex justify-start chat-flow-enter w-full">
        <div className="w-full bg-white border border-purple-100 rounded-2xl p-4 shadow-sm">
          <FAQSection onEscalate={handleEscalate} />
        </div>
      </div>
    );

    return null;
  }, [handleButtonClick, handleTrampolineSelect, handleServicesConfirm, handleAddonsConfirm, handleFormSubmit, handleEscalate, isSubmitting, submittedForms, setDetailTrampoline]);

  const handleClose = useCallback(() => {
    if (embedded) {
      window.parent.postMessage({ type: 'batutynas-close' }, '*');
    } else {
      setIsOpen(false);
    }
  }, [embedded]);

  const handleOpen = () => { setIsOpen(o => !o); setHasUnread(false); };

  return (
    <>
      {/* Mobile backdrop (not in embedded mode) */}
      {isOpen && !embedded && <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={handleClose} />}

      {/* Chat window */}
      {isOpen && (
        <div data-testid="chat-window"
          className={`flex flex-col overflow-hidden bg-white ${embedded
            ? 'fixed inset-0 w-full h-full'
            : 'fixed z-50 chat-widget-enter left-0 right-0 bottom-0 h-[82dvh] rounded-t-3xl shadow-2xl border-t border-x border-purple-100 sm:left-auto sm:right-6 sm:bottom-[88px] sm:w-[400px] sm:h-[540px] sm:rounded-3xl sm:border'
          }`}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 bg-gradient-to-r from-violet-600 to-purple-700 flex-shrink-0 shadow-sm">
            <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-sm text-white font-nunito tracking-tight">Batutynas</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse flex-shrink-0" />
                <p className="text-xs text-purple-200 font-medium truncate">Aktyvus dabar</p>
              </div>
            </div>
            {messages.length > 0 && (
              <button onClick={handleReset} data-testid="chat-reset-btn" title="Pradėti iš naujo"
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/20 hover:bg-white/35 transition-all active:scale-95 flex-shrink-0">
                <RotateCcw size={13} className="text-white" />
                <span className="text-white text-xs font-bold">Meniu</span>
              </button>
            )}
            <button onClick={handleClose} data-testid="chat-close-btn"
              className="w-11 h-11 rounded-2xl bg-white/15 hover:bg-white/30 flex items-center justify-center transition-all active:scale-90 flex-shrink-0">
              <X size={20} className="text-white" />
            </button>
          </div>

          {/* Step progress bar */}
          <StepBar flowId={activeFlowId} step={flowStep} />

          {/* Discount banner — shows when DISCOUNT_BANNER constant is set */}
          {DISCOUNT_BANNER && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold flex-shrink-0">
              <span className="flex-1">{DISCOUNT_BANNER}</span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-gradient-to-b from-purple-50/30 to-white overscroll-contain">
            {messages.map(msg => renderMessage(msg))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-purple-100 bg-white shadow-[0_-4px_12px_rgba(124,58,237,0.06)]">
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <input ref={inputRef} type="text" value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Rašykite klausimą Gemini AI..."
                  disabled={isAiTyping} data-testid="chat-text-input"
                  className="w-full rounded-2xl border-2 border-purple-200 bg-purple-50/60 pl-4 pr-10 py-3 text-sm placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50 transition-all"
                />
                <Sparkles size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-violet-300 pointer-events-none" />
              </div>
              <button onClick={handleSendMessage} disabled={!inputValue.trim() || isAiTyping}
                data-testid="chat-send-btn"
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 text-white flex items-center justify-center hover:from-violet-700 hover:to-purple-700 active:scale-90 transition-all disabled:opacity-40 flex-shrink-0 shadow-md shadow-violet-200">
                {isAiTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">Batutynas &bull; batutų nuoma ir pardavimas</p>
          </div>

          {/* Confetti overlay — shows briefly on order success */}
          {showConfetti && <ConfettiOverlay />}

          {/* Trampoline detail modal */}
          {detailTrampoline && <TrampolineModal trampoline={detailTrampoline} onClose={() => setDetailTrampoline(null)} />}
        </div>
      )}

      {/* FAB (hidden in embedded mode — embed.js provides its own) */}
      {!embedded && (
        <div className="fixed z-[60] bottom-4 right-4 sm:bottom-6 sm:right-6 flex flex-col items-end gap-3">
          {!isOpen && hasUnread && (
            <div className="hidden sm:flex items-center gap-2 bg-white border border-purple-200 rounded-2xl px-4 py-2.5 shadow-lg shadow-purple-100 chat-msg-enter">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-semibold text-violet-700">Susisiekite su mumis!</span>
            </div>
          )}
          <button onClick={handleOpen} data-testid="chat-trigger"
            className={`relative h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-xl shadow-violet-300/50 hover:shadow-violet-400/60 hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center ${!isOpen ? 'pulse-ring' : ''}`}
          >
            <div className={`transition-all duration-200 ${isOpen ? 'rotate-0 scale-100' : 'rotate-0 scale-100'}`}>
              {isOpen ? <X size={26} /> : <MessageCircle size={26} />}
            </div>
            {hasUnread && !isOpen && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-400 rounded-full border-2 border-white shadow-sm flex items-center justify-center" data-testid="unread-badge">
                <span className="text-xs font-black text-amber-900">!</span>
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
};

export default ChatWidget;
