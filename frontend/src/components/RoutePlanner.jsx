/**
 * RoutePlanner.jsx – Multi-vehicle delivery/pickup route planner
 *
 * Features:
 *  - Fleet configuration (add small/large vehicles, edit capacity)
 *  - Bin-packing auto-assignment with backend recommendation
 *  - Cross-container drag-and-drop (stops between vehicles / unassigned pool)
 *  - Per-vehicle Google Maps tabs
 *  - 3 built-in simulation scenarios
 *  - Units selector per stop (1–4 or "Pilnas automobilis")
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, DragOverlay,
  KeyboardSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, MapPin, CheckCircle2, XCircle, Loader2,
  Copy, ExternalLink, Check, RefreshCw, Plus, X,
  Navigation, Zap, AlertCircle, Map, RotateCcw,
  Truck, Car, Package, FlaskConical, Pencil, ChevronDown, ChevronUp,
  TrendingDown,
} from 'lucide-react';

// ── Config ────────────────────────────────────────────────────────────────────
const API_URL        = process.env.REACT_APP_BACKEND_URL + '/api';
const MAPS_KEY       = process.env.REACT_APP_GOOGLE_MAPS_KEY || '';
const DEFAULT_ORIGIN = 'Pagramantis';
const today          = new Date().toISOString().split('T')[0];

const VEHICLE_PRESETS = {
  small:  { label: 'Mažas automobilis',         defaultCapacity: 3 },
  large:  { label: 'Didelis automobilis',       defaultCapacity: 4 },
  xlarge: { label: 'Labai didelis automobilis', defaultCapacity: 6 },
};

const UNITS_OPTIONS = [
  { value: 0.5,    label: '0.5 – Nedidelis priedas' },
  { value: 1,      label: '1 – Standartinis batutas' },
  { value: 1.5,    label: '1.5 – Batutas + priedas' },
  { value: 2,      label: '2 – Didelis (pvz. Mega dart)' },
  { value: 3,      label: '3 vienetai' },
  { value: 4,      label: '4 vienetai' },
  { value: 'full', label: 'Pilnas automobilis' },
];

const routeApi = axios.create({ baseURL: API_URL });
routeApi.interceptors.request.use(cfg => {
  const t = localStorage.getItem('admin_token');
  if (t) cfg.headers['x-admin-token'] = t;
  return cfg;
});

// ── Simulation scenarios (Tauragė apskritis – pilni adresai) ─────────────────
const SIMULATIONS = [
  {
    id: 1,
    name: 'Scenarijus 1: Mišrus krovinys',
    desc: '2 maži batutai + 1 Mega Ruožas → 2 automobiliai (miestas + kaimas)',
    vehicles: [
      { type: 'small', name: 'Automobilis 1 (mažas)', capacity: 3 },
      { type: 'large', name: 'Automobilis 2 (didelis)', capacity: 4 },
    ],
    stops: [
      {
        name: 'Jonas Jonaitis',
        phone: '+37060012345',
        equipment: 'Pilis',
        address: 'Vytauto g. 18, Tauragė',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'Petras Petraitis',
        phone: '+37061023456',
        equipment: 'Candy Pop',
        address: 'Žemaičių g. 4, Skaudvilė, Tauragės r.',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'Ona Onaitė',
        phone: '+37062034567',
        equipment: 'Mega Ruožas',
        address: 'Dariaus ir Girėno g. 22, Tauragė',
        units: 'full',
        type: 'delivery',
      },
    ],
  },
  {
    id: 2,
    name: 'Scenarijus 2: Pilnas pakrovimas',
    desc: '7 batutai → 3 automobiliai, 10 vietų (miestas + kaimai)',
    vehicles: [
      { type: 'small', name: 'Automobilis 1 (mažas)',   capacity: 3 },
      { type: 'small', name: 'Automobilis 2 (mažas)',   capacity: 3 },
      { type: 'large', name: 'Automobilis 3 (didelis)', capacity: 4 },
    ],
    stops: [
      {
        name: 'A. Antanavičius',
        phone: '+37060000001',
        equipment: 'Pilis',
        address: 'Prezidento g. 7, Tauragė',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'B. Baltrūnas',
        phone: '+37060000002',
        equipment: 'Monstrai',
        address: 'Laisvės g. 3, Šilalė',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'C. Čeponis',
        phone: '+37060000003',
        equipment: 'Chameleonas',
        address: 'Gedimino g. 12, Jurbarkas',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'D. Daujotis',
        phone: '+37060000004',
        equipment: 'Aštuonkojis',
        address: 'Pagramantis, Tauragės r.',
        units: 1,
        type: 'pickup',
      },
      {
        name: 'E. Eimutis',
        phone: '+37060000005',
        equipment: 'Vienaragiai',
        address: 'Batakiai, Tauragės r.',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'F. Feliksas',
        phone: '+37060000006',
        equipment: 'Candy Pop',
        address: 'Eržvilkas, Jurbarko r.',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'G. Giedrius',
        phone: '+37060000007',
        equipment: 'Mega waikiki',
        address: 'Nemakščiai, Raseinių r.',
        units: 2,
        type: 'delivery',
      },
    ],
  },
  {
    id: 3,
    name: 'Scenarijus 3: Pajėgumas viršytas',
    desc: '1 Mega Ruožas + 3 maži → tik 1 mažas auto. 3 batutai nepriskirti.',
    vehicles: [
      { type: 'small', name: 'Automobilis 1 (mažas)', capacity: 3 },
    ],
    stops: [
      {
        name: 'A. Adomaitis',
        phone: '+37060000001',
        equipment: 'Mega Ruožas',
        address: 'Stoties g. 5, Tauragė',
        units: 'full',
        type: 'delivery',
      },
      {
        name: 'B. Butkus',
        phone: '+37060000002',
        equipment: 'Pilis',
        address: 'Lauko g. 9, Kvėdarna, Skuodo r.',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'C. Česnavičius',
        phone: '+37060000003',
        equipment: 'Monstrai',
        address: 'Birutės g. 2, Šilalė',
        units: 1,
        type: 'delivery',
      },
      {
        name: 'D. Daugėla',
        phone: '+37060000004',
        equipment: 'Chameleonas',
        address: 'Gegužių k., Tauragės r.',
        units: 1,
        type: 'delivery',
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const detectAddonUnits = (addon) => {
  const n = (addon || '').toLowerCase();
  // Full vehicle
  if (n.includes('banketo') || n.includes('stalai')) return 'full';
  // Large (2 units)
  if (n.includes('jautis') || n.includes('bull') || n.includes('dart')) return 2;
  // Large (1 unit)
  if (n.includes('disco')) return 1;
  // Medium (0.5)
  if (n.includes('šou') || n.includes('show') || n.includes('sumo')) return 0.5;
  // Small machines (0.3)
  if (n.includes('cukraus') || n.includes('popcorn') || n.includes('šerbet') || n.includes('vr') || n.includes('virtuali')) return 0.3;
  // Compact (0.2)
  if (n.includes('jbl') || n.includes('burbul')) return 0.2;
  // Tiny (0.1)
  if (n.includes('instax')) return 0.1;
  return 0.5; // default: unknown add-on
};

const detectUnits = (equipment, addons = []) => {
  const n = (equipment || '').toLowerCase();
  if (n.includes('mega') || n.includes('giga')) return 'full';
  // Check add-ons
  for (const a of addons) {
    if (detectAddonUnits(a) === 'full') return 'full';
  }
  const addonSum = addons.reduce((s, a) => {
    const u = detectAddonUnits(a);
    return s + (u === 'full' ? 0 : parseFloat(u) || 0);
  }, 0);
  return parseFloat((1 + addonSum).toFixed(2));
};

const getCapacityUsed = (vehicle, stopsById) => {
  let used = 0;
  for (const sid of vehicle.stopIds) {
    const s = stopsById[sid];
    if (!s) continue;
    if (s.units === 'full') return vehicle.capacity;
    used += parseFloat(s.units) || 1;
  }
  return parseFloat(used.toFixed(1));
};

let _stopCounter = 0;
const makeStop = (partial) => {
  _stopCounter += 1;
  const eq     = partial.equipment || '';
  const addons = partial.addons || [];
  return {
    id:               `s-${Date.now()}-${_stopCounter}`,
    orderId:          partial.orderId   || null,
    name:             partial.name      || '',
    phone:            partial.phone     || '',
    equipment:        eq,
    addons,
    rawAddress:       partial.address   || partial.rawAddress || '',
    formattedAddress: null,
    lat: null, lng: null,
    validStatus: (partial.address || partial.rawAddress || '').trim() ? 'idle' : 'invalid',
    type:  partial.type  || 'delivery',
    units: partial.units !== undefined ? partial.units : detectUnits(eq, addons),
  };
};

let _vehicleCounter = 0;
const makeVehicle = (preset, customName) => {
  _vehicleCounter += 1;
  const p = VEHICLE_PRESETS[preset] || VEHICLE_PRESETS.large;
  return {
    id:        `v-${Date.now()}-${_vehicleCounter}`,
    name:      customName || `${p.label.replace(' automobilis', '')} ${_vehicleCounter}`,
    type:      preset,
    capacity:  p.defaultCapacity,
    stopIds:   [],
    stats:     null,
    collapsed: false,
  };
};

const TYPE_STYLE = {
  delivery: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  pickup:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
};
const TYPE_LABEL = { delivery: 'PRISTATYMAS', pickup: 'PAĖMIMAS' };

// ── StatusIcon ────────────────────────────────────────────────────────────────
const StatusIcon = ({ status }) => {
  if (status === 'validating') return <Loader2 size={14} className="animate-spin text-violet-400 flex-shrink-0" />;
  if (status === 'valid')      return <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />;
  if (status === 'invalid')    return <XCircle size={14} className="text-red-400 flex-shrink-0" />;
  return <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 flex-shrink-0" />;
};

// ── CapacityBar ───────────────────────────────────────────────────────────────
const CapacityBar = ({ used, max }) => {
  const pct = max > 0 ? Math.min(used / max, 1) : 0;
  const color = pct >= 1 ? 'bg-red-500' : pct >= 0.8 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden" style={{ minWidth: 48 }}>
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className={`text-[10px] font-extrabold ${pct >= 1 ? 'text-red-500' : 'text-gray-500'}`}>
        {used}/{max}
      </span>
    </div>
  );
};

// ── DroppableZone ─────────────────────────────────────────────────────────────
const DroppableZone = ({ id, children, className = '' }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded-xl ${isOver ? 'ring-2 ring-violet-400 ring-offset-1 bg-violet-50/50' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

// ── StopCard (pure visual, used in DragOverlay too) ───────────────────────────
const StopCard = React.forwardRef(({
  stop, index, isDragging, dragHandleProps, onAddressChange,
  onTypeChange, onRemove, onUnitsChange, showIndex,
  vehicles, currentVehicleId, onVehicleAssign,
}, ref) => (
  <div
    ref={ref}
    data-testid={`stop-card-${stop.id}`}
    className={`group bg-white rounded-xl border-2 transition-all select-none ${
      isDragging
        ? 'border-violet-400 shadow-2xl opacity-90'
        : 'border-gray-100 hover:border-violet-200 hover:shadow-sm'
    }`}
  >
    <div className="flex items-start gap-2 p-2.5">
      {/* Drag handle */}
      <div
        {...(dragHandleProps || {})}
        className="mt-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-violet-400 transition-colors flex-shrink-0 touch-none"
        title="Vilkti, kad perkeltumėte"
      >
        <GripVertical size={15} />
      </div>

      {/* Number badge */}
      {showIndex !== undefined && (
        <div className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">
          {showIndex + 1}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Row 1: vehicle assign + type badge + name + phone */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Vehicle dropdown (always visible when onVehicleAssign is provided) */}
          {onVehicleAssign && (
            <select
              value={currentVehicleId || ''}
              onChange={e => { e.stopPropagation(); onVehicleAssign(stop.id, e.target.value || null); }}
              onClick={e => e.stopPropagation()}
              className={`text-[10px] font-bold border rounded-lg px-2 py-1 focus:outline-none focus:border-violet-400 flex-shrink-0 ${
                currentVehicleId ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-amber-300 bg-amber-50 text-amber-700'
              }`}
              title="Priskirti automobiliui"
            >
              <option value="">— Nepriskirtas —</option>
              {(vehicles || []).map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
          {/* Type badge (read-only) */}
          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${TYPE_STYLE[stop.type]}`}>
            {TYPE_LABEL[stop.type]}
          </span>
          {stop.name  && <span className="text-xs font-bold text-gray-800 truncate">{stop.name}</span>}
          {stop.phone && <span className="text-[11px] text-gray-400 truncate">{stop.phone}</span>}
        </div>

        {/* Row 2: equipment + units selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {stop.equipment && (
            <span className="text-[11px] font-semibold text-violet-600 flex-1 truncate">{stop.equipment}</span>
          )}
          {onUnitsChange ? (
            <select
              value={stop.units}
              onChange={e => {
                const v = e.target.value;
                onUnitsChange(stop.id, v === 'full' ? 'full' : parseFloat(v));
              }}
              onClick={e => e.stopPropagation()}
              className="text-[10px] font-bold text-gray-600 border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white focus:outline-none focus:border-violet-400"
              title="Kiek vietų automobilio krovinyje"
            >
              {UNITS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-[10px] font-bold text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded-lg flex-shrink-0">
              {stop.units === 'full' ? 'Pilnas auto' : `${stop.units} vnt.`}
            </span>
          )}
        </div>

        {/* Row 3: Add-ons tags */}
        {stop.addons && stop.addons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stop.addons.map((a, i) => (
              <span
                key={i}
                className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full"
              >
                + {a}
              </span>
            ))}
          </div>
        )}

        {/* Row 4: address */}
        <div className="flex items-start gap-1">
          <MapPin size={10} className="text-gray-400 flex-shrink-0 mt-0.5" />
          {onAddressChange ? (
            <input
              value={stop.rawAddress}
              onChange={e => onAddressChange(stop.id, e.target.value)}
              placeholder="Adresas..."
              className="text-[11px] text-gray-700 bg-transparent flex-1 min-w-0 outline-none border-b border-transparent focus:border-violet-300 transition-colors"
            />
          ) : (
            <span className="text-[11px] text-gray-600">{stop.rawAddress}</span>
          )}
        </div>

        {/* Validation feedback */}
        {stop.validStatus === 'valid' && stop.formattedAddress && stop.formattedAddress !== stop.rawAddress && (
          <p className="text-[10px] text-emerald-600 font-medium pl-3 leading-tight truncate">
            ✓ {stop.formattedAddress}
          </p>
        )}
        {stop.validStatus === 'invalid' && (
          <p className="text-[10px] text-red-500 font-medium pl-3">Adresas nerastas</p>
        )}
      </div>

      {/* Status + delete (always visible) */}
      <div className="flex flex-col items-center gap-1.5 flex-shrink-0 pt-0.5">
        <StatusIcon status={stop.validStatus} />
        {onRemove && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); e.preventDefault(); onRemove(stop.id); }}
            className="text-gray-300 hover:text-red-500 transition-colors"
            data-testid={`remove-stop-${stop.id}`}
            title="Ištrinti stotelę"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  </div>
));
StopCard.displayName = 'StopCard';

// ── SortableStopCard (drag within same container) ─────────────────────────────
const SortableStopCard = ({ stop, index, onAddressChange, onTypeChange, onRemove, onUnitsChange, showIndex,
  vehicles, currentVehicleId, onVehicleAssign }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
    >
      <StopCard
        stop={stop}
        index={index}
        showIndex={showIndex}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        onAddressChange={onAddressChange}
        onTypeChange={onTypeChange}
        onRemove={onRemove}
        onUnitsChange={onUnitsChange}
        vehicles={vehicles}
        currentVehicleId={currentVehicleId}
        onVehicleAssign={onVehicleAssign}
      />
    </div>
  );
};

// ── VehicleColumn ─────────────────────────────────────────────────────────────
const VehicleColumn = ({
  vehicle, stopsById, waitLocation,
  onRename, onCapacityChange, onRemoveVehicle,
  onAddressChange, onTypeChange, onRemoveStop, onUnitsChange,
  onOptimize, isOptimizing, isSelected, onSelect, onToggleCollapse,
  vehicles, onVehicleAssign,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(vehicle.name);
  const used = getCapacityUsed(vehicle, stopsById);
  const isFull = used >= vehicle.capacity;

  const deliveryIds = vehicle.stopIds.filter(id => stopsById[id]?.type === 'delivery');
  const pickupIds   = vehicle.stopIds.filter(id => stopsById[id]?.type !== 'delivery');
  const hasDelivery = deliveryIds.length > 0;
  const hasPickup   = pickupIds.length > 0;

  const validStops = vehicle.stopIds.filter(id => stopsById[id]?.validStatus === 'valid');

  const colorClass = vehicle.type === 'small'
    ? 'border-blue-200 bg-blue-50/30'
    : 'border-violet-200 bg-violet-50/30';

  return (
    <div
      className={`rounded-2xl border-2 transition-all ${colorClass} ${isSelected ? 'ring-2 ring-violet-400 ring-offset-1' : ''}`}
      data-testid={`vehicle-col-${vehicle.id}`}
    >
      {/* Vehicle header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100/60">
        <button onClick={() => onSelect(vehicle.id)} title="Pasirinkti žemėlapiui">
          {vehicle.type === 'small'
            ? <Car size={14} className={isSelected ? 'text-violet-600' : 'text-blue-500'} />
            : <Truck size={14} className={isSelected ? 'text-violet-600' : 'text-violet-500'} />
          }
        </button>

        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => { setEditingName(false); onRename(vehicle.id, nameVal); }}
            onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); onRename(vehicle.id, nameVal); } }}
            className="flex-1 text-xs font-bold text-gray-800 bg-white border border-violet-400 rounded-lg px-2 py-0.5 outline-none shadow-sm"
          />
        ) : (
          <span className="flex-1 text-xs font-bold text-gray-800 truncate">{vehicle.name}</span>
        )}

        {/* Rename button – always visible */}
        {!editingName && (
          <button
            onClick={() => { setNameVal(vehicle.name); setEditingName(true); }}
            className="flex items-center gap-1 text-[10px] font-bold text-violet-500 hover:text-violet-700 hover:bg-violet-50 px-1.5 py-0.5 rounded-lg transition-colors flex-shrink-0"
            title="Pervardyti automobilį"
          >
            <Pencil size={10} /> Pervardyti
          </button>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[9px] text-gray-400 font-bold uppercase">max</span>
          <input
            type="number" min="1" max="10" value={vehicle.capacity}
            onChange={e => onCapacityChange(vehicle.id, parseInt(e.target.value) || 1)}
            className="w-8 text-center text-[11px] font-extrabold text-gray-700 border border-gray-200 rounded-lg py-0.5 outline-none focus:border-violet-400"
            title="Maksimalus krovinio vienetų skaičius"
          />
        </div>

        <button onClick={() => onToggleCollapse(vehicle.id)} className="text-gray-300 hover:text-gray-500 transition-colors">
          {vehicle.collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        <button onClick={() => onRemoveVehicle(vehicle.id)} className="text-gray-200 hover:text-red-400 transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Capacity bar */}
      <div className="px-3 py-1.5 border-b border-gray-100/60">
        <CapacityBar used={used} max={vehicle.capacity} />
      </div>

      {!vehicle.collapsed && (
        <>
          {/* Stop list with delivery/pickup sections */}
          <DroppableZone id={vehicle.id} className="min-h-[60px] p-2">
            <SortableContext id={vehicle.id} items={vehicle.stopIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">

                {/* ── Morning: Delivery section ── */}
                {hasDelivery && (
                  <div className="mb-1">
                    <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-wider">
                        Pristatymas · rytas
                      </span>
                      <div className="flex-1 h-px bg-blue-100" />
                    </div>
                    <div className="space-y-1.5">
                      {deliveryIds.map((id, i) => {
                        const stop = stopsById[id];
                        if (!stop) return null;
                        return (
                          <SortableStopCard
                            key={id} stop={stop} index={i} showIndex={i}
                            onAddressChange={onAddressChange} onTypeChange={onTypeChange}
                            onRemove={onRemoveStop} onUnitsChange={onUnitsChange}
                            vehicles={vehicles} currentVehicleId={vehicle.id}
                            onVehicleAssign={onVehicleAssign}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Evening: Pickup section ── */}
                {hasPickup && (
                  <div className="mt-1">
                    <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-wider">
                        Paėmimas · vakaras
                      </span>
                      <div className="flex-1 h-px bg-amber-100" />
                      <span className="text-[9px] text-amber-400">→ Pagramantis</span>
                    </div>
                    <div className="space-y-1.5">
                      {pickupIds.map((id, i) => {
                        const stop = stopsById[id];
                        if (!stop) return null;
                        return (
                          <SortableStopCard
                            key={id} stop={stop} index={i} showIndex={deliveryIds.length + i}
                            onAddressChange={onAddressChange} onTypeChange={onTypeChange}
                            onRemove={onRemoveStop} onUnitsChange={onUnitsChange}
                            vehicles={vehicles} currentVehicleId={vehicle.id}
                            onVehicleAssign={onVehicleAssign}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {vehicle.stopIds.length === 0 && (
                  <div className="py-4 text-center">
                    <Package size={18} className="text-gray-300 mx-auto mb-1" />
                    <p className="text-[11px] text-gray-400">Vilkite batutą čia</p>
                  </div>
                )}
              </div>
            </SortableContext>
          </DroppableZone>

          {/* Footer: stats + optimize */}
          <div className="px-3 py-2 flex items-center gap-2 border-t border-gray-100/60 flex-wrap">
            {vehicle.stats ? (
              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-600 flex-1 flex-wrap">
                {vehicle.stats.deliveryKm != null ? (
                  <>
                    <span className="flex items-center gap-1 text-blue-600">
                      <Navigation size={9} />↑{vehicle.stats.deliveryKm}km·{vehicle.stats.deliveryMin}min
                    </span>
                    <span className="flex items-center gap-1 text-amber-600">
                      <Navigation size={9} />↓{vehicle.stats.pickupKm}km·{vehicle.stats.pickupMin}min
                    </span>
                    <span className="text-gray-400">={vehicle.stats.km}km</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1"><Navigation size={10} />{vehicle.stats.km} km · {vehicle.stats.min} min</span>
                )}
                {vehicle.stats.savingsKm > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600 font-extrabold" title="Sutaupyta km lyginant su neoptimizuotu maršrutu">
                    <TrendingDown size={9} />~{vehicle.stats.savingsKm}km
                  </span>
                )}
                {isFull && <span className="text-emerald-600 font-extrabold">PILNAS</span>}
              </div>
            ) : (
              <div className="flex-1 text-[10px] text-gray-400">
                {validStops.length} validuot{validStops.length === 1 ? 'as' : 'i'}
              </div>
            )}
            {validStops.length >= 1 && (
              <button
                onClick={() => onOptimize(vehicle.id)}
                disabled={isOptimizing}
                className="flex items-center gap-1 text-[10px] font-extrabold text-violet-600 hover:text-violet-800 transition-colors disabled:opacity-40"
                title="Optimizuoti šio automobilio maršrutą"
              >
                {isOptimizing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                Optimizuoti
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── SimulationPanel ───────────────────────────────────────────────────────────
const SimulationPanel = ({ onLoad, isLoading }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        data-testid="simulation-panel-toggle"
      >
        <FlaskConical size={14} className="text-violet-500 flex-shrink-0" />
        <span className="text-xs font-extrabold text-gray-700 flex-1">Simuliaciniai testai</span>
        <span className="text-[10px] text-gray-400 font-semibold mr-1">3 scenarijai</span>
        {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3 space-y-2">
          {SIMULATIONS.map(s => (
            <div key={s.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-extrabold text-gray-800">{s.name}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{s.desc}</p>
              </div>
              <button
                onClick={() => onLoad(s)}
                disabled={isLoading}
                data-testid={`simulation-btn-${s.id}`}
                className="flex-shrink-0 flex items-center gap-1 text-[11px] font-extrabold bg-violet-600 text-white px-3 py-1.5 rounded-xl hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={11} className="animate-spin" /> : <FlaskConical size={11} />}
                Paleisti
              </button>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 text-center leading-snug">
            Simuliacijos užkrauna testavimo duomenis → spustelėkite „Rekomenduoti" →
            vilkite batutus rankiniu būdu norėdami koreguoti
          </p>
        </div>
      )}
    </div>
  );
};

// ── RoutePlanner ──────────────────────────────────────────────────────────────
const RoutePlanner = () => {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [date,           setDate]           = useState(today);
  const [origin,         setOrigin]         = useState(DEFAULT_ORIGIN);
  const [waitLocation,   setWaitLocation]   = useState('Tauragė');
  const [vehicles,       setVehicles]       = useState([]);
  const [stopsById,      setStopsById]      = useState({});
  const [unassignedIds,  setUnassignedIds]  = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [activeId,       setActiveId]       = useState(null);
  const [isFetching,     setIsFetching]     = useState(false);
  const [isValidating,   setIsValidating]   = useState(false);
  const [isAssigning,    setIsAssigning]    = useState(false);
  const [isSimLoading,   setIsSimLoading]   = useState(false);
  const [optimizingVid,  setOptimizingVid]  = useState(null);
  const [error,          setError]          = useState('');
  const [fetchInfo,      setFetchInfo]      = useState(null);
  const [pickupDate,     setPickupDate]     = useState('');
  const [mapMode,        setMapMode]        = useState('full'); // 'full' | 'delivery' | 'pickup'
  const [showMoreControls, setShowMoreControls] = useState(false);
  const [copiedUrl,      setCopiedUrl]      = useState('');
  const [copied,         setCopied]         = useState(false);
  const embedKeyRef = useRef(0);
  const addressDebounceRef = useRef({});

  // Refs for stable callbacks
  const stopsByIdRef = useRef(stopsById);
  useEffect(() => { stopsByIdRef.current = stopsById; }, [stopsById]);
  const vehiclesRef = useRef(vehicles);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);
  const unassignedRef = useRef(unassignedIds);
  useEffect(() => { unassignedRef.current = unassignedIds; }, [unassignedIds]);

  // ── DnD sensors (pointer + touch for mobile) ───────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Auto-select first vehicle ───────────────────────────────────────────────
  useEffect(() => {
    if (vehicles.length > 0 && (!selectedVehicleId || !vehicles.find(v => v.id === selectedVehicleId))) {
      setSelectedVehicleId(vehicles[0].id);
    } else if (vehicles.length === 0) {
      setSelectedVehicleId(null);
    }
  }, [vehicles, selectedVehicleId]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.id === selectedVehicleId),
    [vehicles, selectedVehicleId],
  );

  const validStopsForMap = useMemo(() => {
    if (!selectedVehicle) return [];
    return selectedVehicle.stopIds
      .map(id => stopsById[id])
      .filter(s => s?.validStatus === 'valid');
  }, [selectedVehicle, stopsById]);
  const allStopIds = useMemo(() => Object.keys(stopsById), [stopsById]);
  const validCount = useMemo(
    () => allStopIds.filter(id => stopsById[id]?.validStatus === 'valid').length,
    [allStopIds, stopsById],
  );
  const unassignedWarning = unassignedIds.filter(id => stopsById[id]?.validStatus === 'valid').length;

  const embedUrl = useMemo(() => {
    embedKeyRef.current += 1;
    if (!MAPS_KEY || !selectedVehicle) return null;

    const orderedStops = selectedVehicle.stopIds
      .map(id => stopsById[id])
      .filter(s => s?.validStatus === 'valid');

    const deliveryStops = orderedStops.filter(s => s.type === 'delivery');
    const pickupStops   = orderedStops.filter(s => s.type !== 'delivery');

    if (!deliveryStops.length && !pickupStops.length) return null;

    const originEnc = encodeURIComponent(origin + ', Lietuva');
    const waitLoc   = waitLocation.toLowerCase().includes('lietuv')
      ? waitLocation : waitLocation + ', Lietuva';
    const waitEnc   = encodeURIComponent(waitLoc);

    const enc = (s) => encodeURIComponent(s.formattedAddress);
    const base = `https://www.google.com/maps/embed/v1/directions?key=${MAPS_KEY}&mode=driving&language=lt`;

    // Only delivery → Pagramantis → deliveries → Tauragė
    if (!pickupStops.length) {
      const wps = deliveryStops.map(enc).join('|');
      return `${base}&origin=${originEnc}&destination=${waitEnc}${wps ? `&waypoints=${wps}` : ''}`;
    }

    // Only pickup → Tauragė → [pickups] → Pagramantis
    if (!deliveryStops.length) {
      const wps = pickupStops.map(enc).join('|');
      return `${base}&origin=${waitEnc}&destination=${originEnc}${wps ? `&waypoints=${wps}` : ''}`;
    }

    // Both: Pagramantis → deliveries → Tauragė → pickups → Pagramantis
    const waypoints = [
      ...deliveryStops.map(enc),
      waitEnc,
      ...pickupStops.map(enc),
    ].join('|');
    return `${base}&origin=${originEnc}&destination=${originEnc}&waypoints=${waypoints}`;
  }, [validStopsForMap, selectedVehicle, stopsById, origin, waitLocation]); // eslint-disable-line

  // ── Delivery-only embed (Pagramantis → deliveries → Tauragė) ─────────────
  const deliveryEmbedUrl = useMemo(() => {
    if (!MAPS_KEY || !selectedVehicle) return null;
    const stops = selectedVehicle.stopIds
      .map(id => stopsById[id])
      .filter(s => s?.validStatus === 'valid' && s.type === 'delivery');
    if (!stops.length) return null;
    const enc = s => encodeURIComponent(s.formattedAddress);
    const base = `https://www.google.com/maps/embed/v1/directions?key=${MAPS_KEY}&mode=driving&language=lt`;
    const originEnc = encodeURIComponent(origin + ', Lietuva');
    const waitLoc   = waitLocation.toLowerCase().includes('lietuv') ? waitLocation : waitLocation + ', Lietuva';
    const waitEnc   = encodeURIComponent(waitLoc);
    const wps = stops.map(enc).join('|');
    return `${base}&origin=${originEnc}&destination=${waitEnc}${wps ? `&waypoints=${wps}` : ''}`;
  }, [selectedVehicle, stopsById, origin, waitLocation]);

  // ── Pickup-only embed (Tauragė → pickups → Pagramantis) ──────────────────
  const pickupEmbedUrl = useMemo(() => {
    if (!MAPS_KEY || !selectedVehicle) return null;
    const stops = selectedVehicle.stopIds
      .map(id => stopsById[id])
      .filter(s => s?.validStatus === 'valid' && s.type !== 'delivery');
    if (!stops.length) return null;
    const enc = s => encodeURIComponent(s.formattedAddress);
    const base = `https://www.google.com/maps/embed/v1/directions?key=${MAPS_KEY}&mode=driving&language=lt`;
    const originEnc = encodeURIComponent(origin + ', Lietuva');
    const waitLoc   = waitLocation.toLowerCase().includes('lietuv') ? waitLocation : waitLocation + ', Lietuva';
    const waitEnc   = encodeURIComponent(waitLoc);
    const wps = stops.map(enc).join('|');
    return `${base}&origin=${waitEnc}&destination=${originEnc}${wps ? `&waypoints=${wps}` : ''}`;
  }, [selectedVehicle, stopsById, origin, waitLocation]);

  // ── Active embed (based on mapMode) ──────────────────────────────────────
  const activeEmbedUrl = mapMode === 'delivery' ? deliveryEmbedUrl
                       : mapMode === 'pickup'   ? pickupEmbedUrl
                       : embedUrl;

  // ── Combined share URL (full route) ────────────────────────────────────────
  const shareUrl = useMemo(() => {
    if (!selectedVehicle) return '';
    const orderedStops = selectedVehicle.stopIds
      .map(id => stopsById[id])
      .filter(s => s?.validStatus === 'valid');
    const deliveryStops = orderedStops.filter(s => s.type === 'delivery');
    const pickupStops   = orderedStops.filter(s => s.type !== 'delivery');

    const pts = [];
    if (deliveryStops.length > 0) {
      pts.push(origin + ', Lietuva');
      deliveryStops.forEach(s => pts.push(s.formattedAddress || s.rawAddress));
      if (!pickupStops.length) pts.push(waitLocation + ', Lietuva'); // delivery only → end in Tauragė
    }
    if (pickupStops.length > 0) {
      pts.push(waitLocation + ', Lietuva'); // pickup starts from Tauragė
      pickupStops.forEach(s => pts.push(s.formattedAddress || s.rawAddress));
      pts.push(origin + ', Lietuva');       // pickup ends at Pagramantis
    }
    if (!pts.length) return '';
    return 'https://www.google.com/maps/dir/' + pts.map(encodeURIComponent).join('/');
  }, [selectedVehicle, stopsById, origin, waitLocation]);

  // ── Delivery-only share URL (Pagramantis → deliveries → Tauragė) ─────────
  const deliveryShareUrl = useMemo(() => {
    if (!selectedVehicle) return '';
    const stops = selectedVehicle.stopIds
      .map(id => stopsById[id])
      .filter(s => s?.validStatus === 'valid' && s.type === 'delivery');
    if (!stops.length) return '';
    const pts = [
      origin + ', Lietuva',
      ...stops.map(s => s.formattedAddress || s.rawAddress),
      waitLocation + ', Lietuva',
    ];
    return 'https://www.google.com/maps/dir/' + pts.map(encodeURIComponent).join('/');
  }, [selectedVehicle, stopsById, origin, waitLocation]);

  // ── Pickup-only share URL (Tauragė → pickups → Pagramantis) ──────────────
  const pickupShareUrl = useMemo(() => {
    if (!selectedVehicle) return '';
    const stops = selectedVehicle.stopIds
      .map(id => stopsById[id])
      .filter(s => s?.validStatus === 'valid' && s.type !== 'delivery');
    if (!stops.length) return '';
    const pts = [
      waitLocation + ', Lietuva',
      ...stops.map(s => s.formattedAddress || s.rawAddress),
      origin + ', Lietuva',
    ];
    return 'https://www.google.com/maps/dir/' + pts.map(encodeURIComponent).join('/');
  }, [selectedVehicle, stopsById, origin, waitLocation]);

  // ── DnD helpers ────────────────────────────────────────────────────────────
  const findContainer = useCallback((stopId) => {
    const u = unassignedRef.current;
    if (u.includes(stopId)) return 'unassigned';
    for (const v of vehiclesRef.current) {
      if (v.stopIds.includes(stopId)) return v.id;
    }
    return null;
  }, []);

  const handleDragStart = useCallback(({ active }) => {
    setActiveId(active.id);
  }, []);

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null);
    if (!over) return;

    const sourceId = active.data?.current?.sortable?.containerId || findContainer(active.id);
    const targetId = over.data?.current?.sortable?.containerId || over.id;
    if (!sourceId || !targetId) return;

    const validVehicleIds = vehiclesRef.current.map(v => v.id);
    const validContainers = ['unassigned', ...validVehicleIds];
    if (!validContainers.includes(targetId)) return;

    if (sourceId === targetId) {
      // Within same container – reorder
      const activeStopId = active.id;
      const overStopId   = over.id;
      if (sourceId === 'unassigned') {
        setUnassignedIds(prev => {
          const from = prev.indexOf(activeStopId);
          const to   = prev.indexOf(overStopId);
          if (from < 0 || to < 0 || from === to) return prev;
          return arrayMove(prev, from, to);
        });
      } else {
        setVehicles(prev => prev.map(v => {
          if (v.id !== sourceId) return v;
          const from = v.stopIds.indexOf(activeStopId);
          const to   = v.stopIds.indexOf(overStopId);
          if (from < 0 || to < 0 || from === to) return v;
          return { ...v, stopIds: arrayMove(v.stopIds, from, to) };
        }));
      }
    } else {
      // Cross-container move
      const activeStopId = active.id;
      const overStopId   = over.id;

      if (sourceId === 'unassigned') {
        setUnassignedIds(prev => prev.filter(id => id !== activeStopId));
      }
      if (targetId === 'unassigned') {
        setUnassignedIds(prev => {
          const arr = prev.filter(id => id !== activeStopId);
          const overIdx = arr.indexOf(overStopId);
          if (overIdx >= 0) arr.splice(overIdx, 0, activeStopId);
          else arr.push(activeStopId);
          return arr;
        });
      }

      setVehicles(prev => prev.map(v => {
        if (v.id === sourceId) {
          return { ...v, stopIds: v.stopIds.filter(id => id !== activeStopId), stats: null };
        }
        if (v.id === targetId) {
          const arr = [...v.stopIds];
          const overIdx = arr.indexOf(overStopId);
          if (overIdx >= 0) arr.splice(overIdx, 0, activeStopId);
          else arr.push(activeStopId);
          return { ...v, stopIds: arr, stats: null };
        }
        return v;
      }));
    }
  }, [findContainer]);

  // ── Validation ──────────────────────────────────────────────────────────────
  const runValidation = useCallback(async (stopIds) => {
    if (!stopIds.length) return;
    setIsValidating(true);

    // Mark as validating
    setStopsById(prev => {
      const u = { ...prev };
      stopIds.forEach(id => {
        if (u[id]) u[id] = { ...u[id], validStatus: u[id].rawAddress.trim() ? 'validating' : 'invalid' };
      });
      return u;
    });

    try {
      const addresses = stopIds.map(id => stopsByIdRef.current[id]?.rawAddress || '');
      const { data } = await routeApi.post('/admin/route/validate-addresses', { addresses });
      const results = data.results || [];
      setStopsById(prev => {
        const u = { ...prev };
        stopIds.forEach((id, i) => {
          const r = results[i];
          if (!u[id]) return;
          u[id] = {
            ...u[id],
            validStatus:      r?.valid ? 'valid'   : 'invalid',
            formattedAddress: r?.valid ? r.formatted : null,
            lat:  r?.valid ? r.lat : null,
            lng:  r?.valid ? r.lng : null,
          };
        });
        return u;
      });
    } catch {
      setStopsById(prev => {
        const u = { ...prev };
        stopIds.forEach(id => { if (u[id]) u[id] = { ...u[id], validStatus: 'invalid' }; });
        return u;
      });
    } finally {
      setIsValidating(false);
    }
  }, []);

  // ── Fetch orders (delivery + optional pickup from different date) ────────────
  const fetchOrders = useCallback(async () => {
    setIsFetching(true); setError(''); setFetchInfo(null);
    try {
      const { data: dd } = await routeApi.get(`/admin/route/orders?date=${date}`);
      const deliveryOrders = (dd.orders || []).map(o => ({ ...o, type: 'delivery' }));

      let pickupOrders = [];
      if (pickupDate && pickupDate !== date) {
        // Separate pickup date: fetch orders from that date as pickup stops
        const { data: pd } = await routeApi.get(`/admin/route/orders?date=${pickupDate}`);
        pickupOrders = (pd.orders || []).map(o => ({ ...o, type: 'pickup' }));
      } else {
        // Same day or no pickup date: auto-generate pickup stops from delivery orders
        // (equipment must be picked up from the same addresses)
        // Pickup units = 0: vehicle capacity is shared with delivery (same load, return trip)
        pickupOrders = deliveryOrders.map(o => ({
          ...o,
          orderId: (o.orderId || '') + '-pickup',
          type: 'pickup',
          units: 0,
        }));
      }

      const allOrders = [...deliveryOrders, ...pickupOrders];
      const newStops  = {};
      const newIds    = [];
      allOrders.forEach(o => {
        const s = makeStop(o);
        newStops[s.id] = s;
        newIds.push(s.id);
      });
      setStopsById(newStops);
      setUnassignedIds(newIds);
      setVehicles(prev => prev.map(v => ({ ...v, stopIds: [], stats: null })));
      setFetchInfo({
        count:          allOrders.length,
        deliveryCount:  deliveryOrders.length,
        pickupCount:    pickupOrders.length,
        date,
        pickupDateUsed: (pickupDate && pickupDate !== date) ? pickupDate : null,
      });
      if (newIds.length) runValidation(newIds);
    } catch {
      setError('Nepavyko gauti užsakymų. Patikrinkite ryšį.');
    } finally {
      setIsFetching(false);
    }
  }, [date, pickupDate, runValidation]);

  // ── Auto-assign (bin packing + route optimization) ─────────────────────────
  const autoAssign = useCallback(async () => {
    const allStops = Object.values(stopsByIdRef.current).filter(s => s.validStatus === 'valid');
    const curVehicles = vehiclesRef.current;
    if (!allStops.length || !curVehicles.length) {
      setError('Reikia validuotų adresų ir bent vieno automobilio.');
      return;
    }
    setIsAssigning(true);
    try {
      const { data } = await routeApi.post('/admin/route/optimize-multi', {
        origin:        origin + ', Lietuva',
        wait_location: waitLocation,
        vehicles:      curVehicles.map(v => ({ id: v.id, name: v.name, capacity: v.capacity })),
        stops:         allStops.map(s => ({
          id: s.id, equipment: s.equipment, units: s.units,
          formattedAddress: s.formattedAddress, lat: s.lat, lng: s.lng,
          type: s.type,
        })),
        auto_assign: true,
      });

      const assignments   = data.assignments    || {};
      const vehicleRoutes = data.vehicle_routes  || {};
      const unassignedSids = data.unassigned_stop_ids || [];

      setVehicles(prev => prev.map(v => {
        const route   = vehicleRoutes[v.id];
        const rawIds  = assignments[v.id] || [];

        // Re-order stops: delivery (optimized) first, pickup (optimized) second
        const curStops = stopsByIdRef.current;
        const deliveryIds = rawIds.filter(id => curStops[id]?.type === 'delivery');
        const pickupIds   = rawIds.filter(id => curStops[id]?.type !== 'delivery');

        let orderedDelivery = deliveryIds;
        let orderedPickup   = pickupIds;
        if (route?.delivery_order?.length === deliveryIds.length) {
          orderedDelivery = route.delivery_order.map(i => deliveryIds[i]).filter(Boolean);
        }
        if (route?.pickup_order?.length === pickupIds.length) {
          orderedPickup = route.pickup_order.map(i => pickupIds[i]).filter(Boolean);
        }

        return {
          ...v,
          stopIds: [...orderedDelivery, ...orderedPickup],
          stats: route ? {
            km:          route.km,
            min:         route.min,
            deliveryKm:  route.delivery_km,
            deliveryMin: route.delivery_min,
            pickupKm:    route.pickup_km,
            pickupMin:   route.pickup_min,
            savingsKm:   route.savings_km_estimate || 0,
          } : null,
        };
      }));

      const nonValidIds = Object.values(stopsByIdRef.current)
        .filter(s => s.validStatus !== 'valid')
        .map(s => s.id);
      setUnassignedIds([...unassignedSids, ...nonValidIds]);

      // Auto-save route plan to MongoDB
      try {
        const curStops = stopsByIdRef.current;
        const savedVehicles = vehiclesRef.current.map(v => ({
          id: v.id, name: v.name, capacity: v.capacity,
          stopIds: assignments[v.id] || [],
          stats: vehicleRoutes[v.id] || null,
        }));
        const savedStops = Object.values(curStops).filter(s => s.validStatus === 'valid').map(s => ({
          id: s.id, equipment: s.equipment, address: s.formattedAddress || s.rawAddress,
          name: s.name, type: s.type, units: s.units,
        }));
        await routeApi.post('/admin/route/save', {
          date,
          vehicles: savedVehicles,
          stops: savedStops,
          total_km: data.total_km || 0,
          total_min: data.total_min || 0,
          google_maps_urls: {},  // URLs computed client-side from saved stops
        });
      } catch { /* silent — save is best-effort */ }
    } catch (e) {
      setError('Automatinis paskirstymas nepavyko.');
    } finally {
      setIsAssigning(false);
    }
  }, [origin, waitLocation, date]);

  // ── Per-vehicle optimization ────────────────────────────────────────────────
  const optimizeVehicle = useCallback(async (vehicleId) => {
    const vehicle = vehiclesRef.current.find(v => v.id === vehicleId);
    if (!vehicle) return;
    const validStops = vehicle.stopIds
      .map(id => stopsByIdRef.current[id])
      .filter(s => s?.validStatus === 'valid');
    if (!validStops.length) return;

    setOptimizingVid(vehicleId);
    try {
      const { data } = await routeApi.post('/admin/route/optimize-multi', {
        origin:        origin + ', Lietuva',
        wait_location: waitLocation,
        vehicles:      [{ id: vehicle.id, name: vehicle.name, capacity: vehicle.capacity }],
        stops:         validStops.map(s => ({
          id: s.id, equipment: s.equipment, units: s.units,
          formattedAddress: s.formattedAddress, lat: s.lat, lng: s.lng, type: s.type,
        })),
        auto_assign:  false,
        assignments:  { [vehicle.id]: validStops.map(s => s.id) },
      });

      const route = data.vehicle_routes?.[vehicle.id];
      if (route) {
        const deliveryStops = validStops.filter(s => s.type === 'delivery');
        const pickupStops   = validStops.filter(s => s.type !== 'delivery');
        const ordDelivery = (route.delivery_order || []).map(i => deliveryStops[i]?.id).filter(Boolean);
        const ordPickup   = (route.pickup_order   || []).map(i => pickupStops[i]?.id).filter(Boolean);
        const invalidIds  = vehicle.stopIds.filter(id => !validStops.find(s => s.id === id));

        setVehicles(prev => prev.map(v => v.id === vehicleId ? {
          ...v,
          stopIds: [...ordDelivery, ...ordPickup, ...invalidIds],
          stats: {
            km:          route.km,
            min:         route.min,
            deliveryKm:  route.delivery_km,
            deliveryMin: route.delivery_min,
            pickupKm:    route.pickup_km,
            pickupMin:   route.pickup_min,
            savingsKm:   route.savings_km_estimate || 0,
          },
        } : v));
      } else {
        setError('Maršruto optimizavimas nepavyko.');
      }
    } catch {
      setError('Maršruto optimizavimas nepavyko.');
    } finally {
      setOptimizingVid(null);
    }
  }, [origin, waitLocation]);

  // ── Simulation loading ──────────────────────────────────────────────────────
  const loadSimulation = useCallback(async (scenario) => {
    setIsSimLoading(true);
    setError('');
    setFetchInfo(null);

    // Auto-generate pickup stops from delivery stops (same addresses, equipment picked up later)
    const deliveryStops = scenario.stops.filter(s => s.type === 'delivery');
    const autoPickups = deliveryStops.map(s => ({ ...s, type: 'pickup', units: 0 }));
    const allStops = [...scenario.stops, ...autoPickups];

    const newStopsById = {};
    const newUnassigned = [];
    allStops.forEach(s => {
      const stop = makeStop({ ...s, orderId: null });
      newStopsById[stop.id] = stop;
      newUnassigned.push(stop.id);
    });

    const newVehicles = scenario.vehicles.map((v, i) => ({
      id:        `v-${Date.now()}-sim${i}`,
      name:      v.name,
      type:      v.type,
      capacity:  v.capacity,
      stopIds:   [],
      stats:     null,
      collapsed: false,
    }));

    setStopsById(newStopsById);
    setUnassignedIds(newUnassigned);
    setVehicles(newVehicles);
    setSelectedVehicleId(newVehicles[0]?.id || null);
    setFetchInfo({ count: allStops.length, deliveryCount: deliveryStops.length + scenario.stops.filter(s => s.type !== 'delivery').length, pickupCount: autoPickups.length, date: `Simuliacija ${scenario.id}` });

    // Auto-validate addresses
    const ids = Object.keys(newStopsById);
    // Update ref immediately so runValidation reads correct data
    stopsByIdRef.current = newStopsById;
    setIsSimLoading(false);
    await runValidation(ids);
  }, [runValidation]);

  // ── Stop mutations ──────────────────────────────────────────────────────────
  const handleAddressChange = useCallback((id, val) => {
    setStopsById(prev => ({
      ...prev,
      [id]: { ...prev[id], rawAddress: val, validStatus: val.trim() ? 'idle' : 'invalid', formattedAddress: null, lat: null, lng: null },
    }));
    // Debounce: auto-validate after 900ms of no typing
    if (addressDebounceRef.current[id]) clearTimeout(addressDebounceRef.current[id]);
    if (val.trim().length >= 5) {
      addressDebounceRef.current[id] = setTimeout(() => runValidation([id]), 900);
    }
  }, [runValidation]);

  const handleTypeChange = useCallback((id, type) =>
    setStopsById(prev => ({ ...prev, [id]: { ...prev[id], type } })),
  []);

  // Vehicle assignment via dropdown (alternative to drag-and-drop)
  const handleVehicleAssign = useCallback((stopId, targetVehicleId) => {
    setVehicles(prev => prev.map(v => ({
      ...v,
      stopIds: v.stopIds.filter(sid => sid !== stopId),
      stats: v.stopIds.includes(stopId) ? null : v.stats,
    })));
    setUnassignedIds(prev => prev.filter(sid => sid !== stopId));
    if (targetVehicleId) {
      setVehicles(prev => prev.map(v =>
        v.id === targetVehicleId
          ? { ...v, stopIds: [...v.stopIds, stopId], stats: null }
          : v
      ));
    } else {
      setUnassignedIds(prev => [...prev, stopId]);
    }
  }, []);

  const handleUnitsChange = useCallback((id, units) => {
    setStopsById(prev => ({ ...prev, [id]: { ...prev[id], units } }));
    // Clear stats for vehicle containing this stop
    setVehicles(prev => prev.map(v =>
      v.stopIds.includes(id) ? { ...v, stats: null } : v
    ));
  }, []);

  const handleRemoveStop = useCallback((id) => {
    setStopsById(prev => { const u = { ...prev }; delete u[id]; return u; });
    setUnassignedIds(prev => prev.filter(i => i !== id));
    setVehicles(prev => prev.map(v =>
      v.stopIds.includes(id) ? { ...v, stopIds: v.stopIds.filter(i => i !== id), stats: null } : v
    ));
  }, []);

  const addManualStop = useCallback(() => {
    const stop = makeStop({});
    setStopsById(prev => ({ ...prev, [stop.id]: stop }));
    setUnassignedIds(prev => [...prev, stop.id]);
  }, []);

  // ── Vehicle mutations ───────────────────────────────────────────────────────
  const addVehicle = useCallback((type) => {
    const v = makeVehicle(type);
    setVehicles(prev => [...prev, v]);
  }, []);

  const removeVehicle = useCallback((vid) => {
    setVehicles(prev => {
      const v = prev.find(v => v.id === vid);
      if (v) setUnassignedIds(u => [...u, ...v.stopIds]);
      return prev.filter(v => v.id !== vid);
    });
  }, []);

  const renameVehicle = useCallback((vid, name) =>
    setVehicles(prev => prev.map(v => v.id === vid ? { ...v, name } : v)),
  []);

  const setVehicleCapacity = useCallback((vid, capacity) =>
    setVehicles(prev => prev.map(v => v.id === vid ? { ...v, capacity, stats: null } : v)),
  []);

  const toggleCollapse = useCallback((vid) =>
    setVehicles(prev => prev.map(v => v.id === vid ? { ...v, collapsed: !v.collapsed } : v)),
  []);

  // ── Validate all ───────────────────────────────────────────────────────────
  const validateAll = useCallback(() => runValidation(allStopIds), [allStopIds, runValidation]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    setStopsById({});
    setUnassignedIds([]);
    setVehicles(prev => prev.map(v => ({ ...v, stopIds: [], stats: null })));
    setError('');
    setFetchInfo(null);
  }, []);

  // ── Copy URL ───────────────────────────────────────────────────────────────
  const copyUrl = useCallback(async (url) => {
    try { await navigator.clipboard.writeText(url); }
    catch { window.prompt('Kopijuokite nuorodą:', url); return; }
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(''), 2500);
  }, []);

  const copyShareUrl = useCallback(async () => {
    try { await navigator.clipboard.writeText(shareUrl); }
    catch { window.prompt('Kopijuokite nuorodą:', shareUrl); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [shareUrl]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="route-planner">

      {/* Error bar */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-2xl px-4 py-3">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* ── Simulation panel ── */}
      {/* Simulations hidden in production — add ?dev=true to URL to show */}
      {new URLSearchParams(window.location.search).has('dev') && (
        <SimulationPanel onLoad={loadSimulation} isLoading={isSimLoading} />
      )}

      {/* ── Controls ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        {/* Primary row: date + fetch */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-36">
            <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1.5">Pristatymo data</label>
            <input type="date" value={date}
              onChange={e => { setDate(e.target.value); resetAll(); }}
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-violet-400 transition-colors min-h-[44px]"
            />
          </div>
          <button onClick={fetchOrders} disabled={isFetching || isValidating} data-testid="fetch-orders-btn"
            className="flex items-center justify-center gap-2 bg-violet-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-violet-700 active:scale-95 transition-all shadow-sm disabled:opacity-60 min-h-[44px]">
            {isFetching || isValidating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {isFetching ? 'Gaunama...' : isValidating ? 'Validuojama...' : 'Gauti užsakymus'}
          </button>

          {/* Reset */}
          {allStopIds.length > 0 && (
            <button onClick={resetAll} title="Išvalyti stotelių sąrašą"
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 p-2.5 rounded-xl border-2 border-gray-100 text-gray-400 hover:text-red-400 hover:border-red-200 transition-colors min-h-[44px] text-xs font-semibold">
              <RotateCcw size={14} /> Išvalyti
            </button>
          )}
        </div>

        {/* Daugiau nustatymų (collapsible) */}
        <div className="mt-2">
          <button
            onClick={() => setShowMoreControls(v => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-violet-500 transition-colors py-1"
          >
            {showMoreControls ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Daugiau nustatymų
          </button>
          {showMoreControls && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1.5">Paėmimo data</label>
                <input type="date" value={pickupDate}
                  onChange={e => setPickupDate(e.target.value)}
                  className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-violet-400 transition-colors min-h-[44px]"
                />
                <p className="text-[10px] text-gray-400 mt-1">Palik tuščią — paėmimai iš tos pačios dienos</p>
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1.5">Išvykimo taškas</label>
                <input type="text" value={origin}
                  onChange={e => setOrigin(e.target.value)}
                  placeholder={DEFAULT_ORIGIN}
                  className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-violet-400 transition-colors min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1.5">Laukimo vieta</label>
                <input type="text" value={waitLocation}
                  onChange={e => setWaitLocation(e.target.value)}
                  placeholder="Tauragė"
                  className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-violet-400 transition-colors min-h-[44px]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Fetch result */}
        {fetchInfo && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center flex-wrap gap-2 text-xs">
            {fetchInfo.count > 0 ? (
              <>
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span className="text-emerald-700 font-bold">
                  {fetchInfo.deliveryCount > 0 && `${fetchInfo.deliveryCount} pristatym${fetchInfo.deliveryCount === 1 ? 'as' : 'ai'}`}
                  {fetchInfo.deliveryCount > 0 && fetchInfo.pickupCount > 0 && ' + '}
                  {fetchInfo.pickupCount > 0 && `${fetchInfo.pickupCount} paėmim${fetchInfo.pickupCount === 1 ? 'as' : 'ai'}`}
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={13} className="text-amber-500" />
                <span className="text-amber-700 font-bold">Šiai datai užsakymų nerasta.</span>
              </>
            )}
            <span className="text-gray-400">– {fetchInfo.date}</span>
            {fetchInfo.pickupDateUsed && (
              <span className="text-amber-500 font-bold">· paėm. {fetchInfo.pickupDateUsed}</span>
            )}
            {validCount > 0 && (
              <span className="ml-auto text-violet-600 font-bold">{validCount}/{allStopIds.length} validuot{validCount === 1 ? 'as' : 'i'}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Fleet configuration ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest flex-shrink-0 flex items-center gap-1">
            <Truck size={11} /> Automobiliai
          </span>
          <button
            onClick={() => addVehicle('small')}
            data-testid="add-small-vehicle-btn"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-700 border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 active:scale-95 px-3 py-2 rounded-xl transition-colors min-h-[40px]"
          >
            <Car size={13} /> + Mažas (3)
          </button>
          <button
            onClick={() => addVehicle('large')}
            data-testid="add-large-vehicle-btn"
            className="flex items-center gap-1.5 text-xs font-bold text-violet-700 border-2 border-violet-200 bg-violet-50 hover:bg-violet-100 active:scale-95 px-3 py-2 rounded-xl transition-colors min-h-[40px]"
          >
            <Truck size={13} /> + Didelis (4)
          </button>
          <button
            onClick={() => addVehicle('xlarge')}
            data-testid="add-xlarge-vehicle-btn"
            className="flex items-center gap-1.5 text-xs font-bold text-rose-700 border-2 border-rose-200 bg-rose-50 hover:bg-rose-100 active:scale-95 px-3 py-2 rounded-xl transition-colors min-h-[40px]"
          >
            <Truck size={14} /> + Labai didelis (6)
          </button>

          {/* Auto-assign */}
          {vehicles.length > 0 && validCount > 0 && (
            <button
              onClick={autoAssign}
              disabled={isAssigning}
              data-testid="auto-assign-btn"
              className="flex items-center gap-2 bg-emerald-600 text-white text-xs font-extrabold px-4 py-2 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 ml-auto min-h-[40px]"
            >
              {isAssigning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {isAssigning ? 'Skaičiuojama...' : 'Rekomenduoti išdėstymą'}
            </button>
          )}

        </div>

        {vehicles.length === 0 && (
          <p className="mt-2 text-[11px] text-gray-400 text-center py-1">
            Pridėkite automobilius ir naudokite „Rekomenduoti išdėstymą" arba vilkite batutus rankiniu būdu
          </p>
        )}
      </div>

      {/* ── Main board (DnD context wraps everything) ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* LEFT: Unassigned pool + vehicle columns */}
          <div className="lg:col-span-2 space-y-3">

            {/* Unassigned pool */}
            <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50/50">
                <Package size={13} className="text-gray-400" />
                <span className="text-xs font-extrabold text-gray-600 flex-1">
                  Nepriskirti batutai
                  <span className="ml-1 font-normal text-gray-400">({unassignedIds.length})</span>
                </span>
                {unassignedWarning > 0 && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                    {unassignedWarning} validuot{unassignedWarning === 1 ? 'as' : 'i'} – priskirti!
                  </span>
                )}
              </div>
              {/* Pickup hint */}
              {unassignedIds.length > 0 && (
                <div className="mx-2 mt-2 mb-0.5 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-1.5 text-[10px] text-amber-700 font-semibold">
                  <Navigation size={10} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <span>Paėmimo stotelėms – spustelėkite <strong>↑ Prista. / ↓ Paėm.</strong> ant kiekvienos stotelės kortelės</span>
                </div>
              )}
              <DroppableZone id="unassigned" className="p-2 min-h-[60px]">
                <SortableContext id="unassigned" items={unassignedIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {unassignedIds.length === 0 && (
                      <p className="py-3 text-center text-[11px] text-gray-400">
                        {allStopIds.length === 0 ? 'Gauti užsakymus arba paleisti simuliaciją' : 'Visi batutai priskirti'}
                      </p>
                    )}
                    {unassignedIds.map((id, i) => {
                      const stop = stopsById[id];
                      if (!stop) return null;
                      return (
                        <SortableStopCard
                          key={id}
                          stop={stop}
                          index={i}
                          onAddressChange={handleAddressChange}
                          onTypeChange={handleTypeChange}
                          onRemove={handleRemoveStop}
                          onUnitsChange={handleUnitsChange}
                          vehicles={vehicles}
                          currentVehicleId={null}
                          onVehicleAssign={handleVehicleAssign}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DroppableZone>
            </div>

            {/* Vehicle columns */}
            {vehicles.map(v => (
              <VehicleColumn
                key={v.id}
                vehicle={v}
                stopsById={stopsById}
                waitLocation={waitLocation}
                onRename={renameVehicle}
                onCapacityChange={setVehicleCapacity}
                onRemoveVehicle={removeVehicle}
                onAddressChange={handleAddressChange}
                onTypeChange={handleTypeChange}
                onRemoveStop={handleRemoveStop}
                onUnitsChange={handleUnitsChange}
                onOptimize={optimizeVehicle}
                isOptimizing={optimizingVid === v.id}
                isSelected={selectedVehicleId === v.id}
                onSelect={setSelectedVehicleId}
                onToggleCollapse={toggleCollapse}
                vehicles={vehicles}
                onVehicleAssign={handleVehicleAssign}
              />
            ))}

            {/* Add manual stop */}
            <button onClick={addManualStop} data-testid="add-stop-btn"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-xs font-bold hover:border-violet-300 hover:text-violet-500 transition-colors">
              <Plus size={13} /> Pridėti stotelę rankiniu būdu
            </button>
          </div>

          {/* RIGHT: Map tabs + share */}
          <div className="lg:col-span-3 space-y-3">

            {/* Vehicle map tabs */}
            {vehicles.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Route mode tabs */}
                <div className="flex border-b border-gray-100 bg-gray-50/50 overflow-x-auto">
                  {vehicles.map(v => {
                    const used = getCapacityUsed(v, stopsById);
                    const isSel = selectedVehicleId === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVehicleId(v.id)}
                        data-testid={`vehicle-tab-${v.id}`}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                          isSel
                            ? 'border-violet-500 text-violet-700 bg-white'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
                        }`}
                      >
                        {v.type === 'small' ? <Car size={11} /> : <Truck size={11} />}
                        {v.name.length > 20 ? v.name.slice(0, 18) + '…' : v.name}
                        <span className={`text-[9px] px-1 py-0.5 rounded-full font-extrabold ${
                          used >= v.capacity ? 'bg-red-100 text-red-600' :
                          used > 0 ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {used}/{v.capacity}
                        </span>
                      </button>
                    );
                  })}
                  {/* Map mode switcher */}
                  <div className="ml-auto flex items-center gap-1 px-2">
                    {[
                      { id: 'full',     label: 'Pilnas',      color: 'violet' },
                      { id: 'delivery', label: 'Pristatymas', color: 'blue' },
                      { id: 'pickup',   label: 'Paėmimas',    color: 'amber' },
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => setMapMode(m.id)}
                        data-testid={`map-mode-${m.id}`}
                        className={`text-[9px] font-extrabold px-2 py-1 rounded-lg border transition-all whitespace-nowrap ${
                          mapMode === m.id
                            ? m.color === 'violet' ? 'bg-violet-100 border-violet-300 text-violet-700'
                              : m.color === 'blue'   ? 'bg-blue-100 border-blue-300 text-blue-700'
                              : 'bg-amber-100 border-amber-300 text-amber-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Route legend */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-50 text-[10px] font-bold text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1 text-blue-600"><Navigation size={9} />Pagramantis → pristatymai</span>
                  <span className="text-gray-200 mx-1">|</span>
                  <span className="flex items-center gap-1 text-amber-600"><Navigation size={9} />{waitLocation} → paėmimai → Pagramantis</span>
                </div>

                {/* Map iframe */}
                {!MAPS_KEY ? (
                  <div className="h-72 flex flex-col items-center justify-center gap-2 p-6 text-center">
                    <MapPin size={28} className="text-gray-300" />
                    <p className="text-sm font-bold text-gray-500">Google Maps žemėlapis neaktyvuotas</p>
                    <p className="text-xs text-gray-400">
                      Pridėkite <code className="bg-gray-100 px-1 rounded">REACT_APP_GOOGLE_MAPS_KEY</code> į frontend/.env
                    </p>
                  </div>
                ) : !selectedVehicle || validStopsForMap.length === 0 ? (
                  <div className="h-72 flex flex-col items-center justify-center gap-2 text-center p-6">
                    <Navigation size={28} className="text-gray-300" />
                    <p className="text-sm font-bold text-gray-400">
                      {selectedVehicle
                        ? `„${selectedVehicle.name}" – nėra validuotų adresų`
                        : 'Pasirinkite automobilį viršuje'}
                    </p>
                    <p className="text-xs text-gray-300">Validuokite adresus ir priskirskite batutus automobiliams</p>
                  </div>
                ) : !activeEmbedUrl ? (
                  <div className="h-72 flex flex-col items-center justify-center gap-2 text-center p-6">
                    <Navigation size={28} className="text-gray-300" />
                    <p className="text-sm font-bold text-gray-400">
                      Nėra {mapMode === 'delivery' ? 'pristatymo' : mapMode === 'pickup' ? 'paėmimo' : ''} stotelių šiam automobiliui
                    </p>
                    <p className="text-xs text-gray-300">Perjunkite į kitą rodinį arba priskirskite stotelių</p>
                  </div>
                ) : (
                  <iframe
                    key={`map-${selectedVehicleId}-${mapMode}`}
                    src={activeEmbedUrl}
                    title="Pristatymo / paėmimo maršrutas"
                    className="w-full"
                    style={{ height: 380, border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    data-testid="map-iframe"
                  />
                )}
              </div>
            )}

            {/* Share panel – follows map mode selection (2 buttons instead of 6) */}
            {selectedVehicle && validStopsForMap.length > 0 && (() => {
              const activeUrl = mapMode === 'delivery' ? deliveryShareUrl
                : mapMode === 'pickup' ? pickupShareUrl
                : shareUrl;
              const modeLabel = mapMode === 'delivery' ? 'Pristatymo'
                : mapMode === 'pickup' ? 'Paėmimo'
                : 'Pilnas';
              const modeColor = mapMode === 'delivery' ? 'blue'
                : mapMode === 'pickup' ? 'amber'
                : 'violet';
              if (!activeUrl) return null;
              return (
                <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                      {modeLabel} maršrutas – {selectedVehicle.name}
                    </p>
                  </div>
                  <div className={`bg-${modeColor}-50 rounded-xl px-3 py-1.5 flex items-center gap-2`}>
                    <MapPin size={10} className={`text-${modeColor}-400 flex-shrink-0`} />
                    <code className="text-[10px] text-gray-500 flex-1 min-w-0 truncate">{activeUrl.slice(0, 90)}…</code>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyUrl(activeUrl)}
                      data-testid="copy-route-btn"
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-extrabold border-2 transition-all ${
                        copiedUrl === activeUrl
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : `bg-${modeColor}-50 border-${modeColor}-200 text-${modeColor}-700 hover:bg-${modeColor}-100`
                      }`}
                    >
                      {copiedUrl === activeUrl ? <Check size={13} /> : <Copy size={13} />}
                      {copiedUrl === activeUrl ? 'Nukopijuota!' : 'Kopijuoti nuorodą'}
                    </button>
                    <a
                      href={activeUrl} target="_blank" rel="noreferrer"
                      data-testid="open-gmaps-btn"
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-extrabold text-white transition-colors border-2 ${
                        mapMode === 'delivery' ? 'bg-blue-600 border-blue-600 hover:bg-blue-700'
                          : mapMode === 'pickup' ? 'bg-amber-500 border-amber-500 hover:bg-amber-600'
                          : 'bg-violet-600 border-violet-600 hover:bg-violet-700'
                      }`}
                    >
                      <ExternalLink size={13} /> Atidaryti Maps
                    </a>
                  </div>
                  <p className="text-[10px] text-gray-400 text-center">
                    Perjunkite viršuje: Pilnas · Pristatymas · Paėmimas
                  </p>
                </div>
              );
            })()}

            {/* No vehicles placeholder */}
            {vehicles.length === 0 && (
              <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
                <Truck size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-gray-400">Pridėkite automobilius kairėje</p>
                <p className="text-xs text-gray-300 mt-1">Mažas (3 vnt.) arba Didelis (4 vnt.)</p>
              </div>
            )}
          </div>
        </div>

        {/* DragOverlay – ghost card follows cursor */}
        <DragOverlay>
          {activeId && stopsById[activeId] ? (
            <div className="opacity-90 rotate-1 scale-105">
              <StopCard stop={stopsById[activeId]} isDragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default RoutePlanner;
