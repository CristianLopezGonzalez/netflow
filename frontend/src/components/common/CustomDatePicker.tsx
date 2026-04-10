import { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CustomDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  hSize?: string;
  turnos?: Array<{
    dia: string;
    semana_detalle: {
      fecha_inicio_semana: string;
      fecha_fin_semana: string;
    };
  }>;
}

export default function CustomDatePicker({ 
  value, 
  onChange, 
  placeholder = "Seleccionar fecha...", 
  className,
  hSize = "h-11",
  turnos = [] 
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(value || new Date()));
  const containerRef = useRef<HTMLDivElement>(null);

  // Portal container positioning
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      setPortalPos({ 
        top: rect.bottom + scrollY + 8, 
        left: rect.left, 
        width: 280 
      });
    } else {
      setPortalPos(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  // Adjust first day to Monday (0=Sun, 1=Mon... -> 0=Mon, 6=Sun)
  const firstDayAdjusted = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const handleSelectDay = (day: number) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    const [vy, vm, vd] = value.split('-').map(Number);
    return viewDate.getFullYear() === vy && viewDate.getMonth() === vm - 1 && day === vd;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear();
  };

  const isWorkDay = (day: number): boolean => {
    const targetDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return turnos.some(turno => {
      if (!turno || !turno.semana_detalle) return false;
      const inicio = new Date(turno.semana_detalle.fecha_inicio_semana);
      const fin = new Date(turno.semana_detalle.fecha_fin_semana);
      return targetDate >= inicio && targetDate <= fin;
    });
  };

  const calendar = useMemo(() => (
    <div
    <div
      className="absolute z-[9999] bg-gray-900/50 backdrop-blur-md border border-[var(--color-surface-border)] rounded-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 p-4"
      style={portalPos ? { 
        top: `${portalPos.top}px`, 
        left: `${portalPos.left}px`, 
        width: `${portalPos.width}px` 
      } : {}}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white/10 rounded-full text-[var(--primary-400)] transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
          {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
        </div>
        <button onClick={handleNextMonth} className="p-1.5 hover:bg-white/10 rounded-full text-[var(--primary-400)] transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
          <div key={d} className="text-center text-[9px] font-black text-[var(--primary-600)] py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayAdjusted }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const selected = isSelected(day);
          const today = isToday(day);
          const workDay = isWorkDay(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => handleSelectDay(day)}
              className={cn(
                "w-8 h-8 rounded-md text-[10px] font-bold transition-all flex items-center justify-center relative",
                selected
                  ? "bg-[var(--primary-600)] text-white shadow-md shadow-blue-500/20"
                  : workDay
                    ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : today
                      ? "text-[var(--primary-400)] border border-[var(--primary-600)]"
                      : "text-[var(--primary-200)] hover:bg-white/5"
              )}
            >
              {day}
              {today && !selected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[var(--primary-500)]" />}
              {workDay && !selected && <div className="absolute inset-0 rounded-lg border border-emerald-500/30 pointer-events-none" />}
            </button>
          );
        })}
      </div>
      
      <div className="mt-4 pt-4 border-t border-[var(--color-surface-border)] flex justify-between items-center">
        <button 
          onClick={() => { onChange(''); setIsOpen(false); }} 
          className="text-[9px] font-black uppercase text-rose-400 px-2 py-1.5 hover:bg-rose-500/10 rounded-md transition-colors flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Borrar
        </button>
        <button 
          onClick={() => { setViewDate(new Date()); }} 
          className="text-[9px] font-black uppercase text-[var(--primary-400)] px-2 py-1.5 hover:bg-blue-500/10 rounded-md transition-colors"
        >
          Hoy
        </button>
      </div>
    </div>
  ), [viewDate, value, portalPos, turnos]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 transition-all duration-300 cursor-pointer rounded-md bg-[#121418] border border-[var(--color-surface-border)]",
          isOpen ? "ring-1 ring-[var(--primary-500)] border-[var(--primary-500)]" : "hover:border-[var(--primary-400)]",
          hSize
        )}
      >
        <span className={cn(
          "text-xs font-bold tracking-tight uppercase truncate mr-2",
          !value ? "text-[var(--primary-500)] italic" : "text-white"
        )}>
          {value || placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-[var(--primary-500)]" />
      </button>

      {isOpen && ReactDOM.createPortal(calendar, document.body)}
    </div>
  );
}
