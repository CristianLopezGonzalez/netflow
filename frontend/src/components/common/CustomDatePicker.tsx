import { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface CustomDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  turnos?: Array<{
    dia: string;
    semana_detalle: {
      fecha_inicio_semana: string;
      fecha_fin_semana: string;
    };
  }>;
}

export default function CustomDatePicker({ value, onChange, placeholder = "Seleccionar fecha...", className, turnos = [] }: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(value || new Date()));
  const containerRef = useRef<HTMLDivElement>(null);

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
    // Format as YYYY-MM-DD local
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

  // Determina si un día específico del mes actual es un día laboral (tiene turno)
  const isWorkDay = (day: number): boolean => {
    const targetDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);

    return turnos.some(turno => {
      // Validar que el turno tenga los campos necesarios
      if (!turno || !turno.semana_detalle) return false;

      const { semana_detalle } = turno;
      const inicio = new Date(semana_detalle.fecha_inicio_semana);
      const fin = new Date(semana_detalle.fecha_fin_semana);
      // Verificar que targetDate está dentro de la semana
      return targetDate >= inicio && targetDate <= fin;
    });
  };

  return (
    <div ref={containerRef} className={cn("relative min-w-[140px]", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full input-field-no-arrow flex items-center justify-between cursor-pointer select-none bg-[#121418] border-surfaceBorder hover:border-blue-500/50 transition-all shadow-md min-h-[38px] px-3 group"
      >
        <span className={cn("text-xs transition-colors", !value ? "text-primary-600 italic" : "text-white font-bold tracking-tight uppercase")}>
          {value || placeholder}
        </span>
        <CalendarIcon className="w-3.5 h-3.5 text-primary-500 group-hover:text-blue-400 transition-colors" />
      </button>

      {isOpen && (
        <div className="absolute z-[110] mt-1.5 right-0 sm:left-0 w-[260px] bg-surface/98 backdrop-blur-2xl border border-surfaceBorder rounded-lg shadow-2xl overflow-hidden animate-fade-in p-4 ring-1 ring-white/5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-white/5 rounded-full text-primary-400 hover:text-white transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </div>
            <button onClick={handleNextMonth} className="p-1 hover:bg-white/5 rounded-full text-primary-400 hover:text-white transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
              <div key={d} className="text-center text-[8px] font-bold text-primary-600 py-1">{d}</div>
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
                    "w-7 h-7 rounded text-[10px] font-bold transition-all flex items-center justify-center relative",
                    selected
                      ? "bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                      : workDay
                        ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                        : today
                          ? "text-blue-400 hover:bg-blue-500/10"
                          : "text-primary-300 hover:bg-white/5"
                  )}
                >
                  {day}
                  {today && !selected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-500" />}
                  {workDay && !selected && <div className="absolute inset-0 rounded-md border border-emerald-500/40 pointer-events-none" />}
                </button>
              );
            })}
          </div>
          
          <div className="mt-4 pt-4 border-t border-surfaceBorder/50 flex justify-between items-center">
            <button 
              onClick={() => { onChange(''); setIsOpen(false); }} 
              className="text-[9px] font-bold uppercase text-red-400 px-2 py-1 hover:bg-red-500/10 rounded transition-colors"
            >
              Borrar
            </button>
            <button 
              onClick={() => { setViewDate(new Date()); }} 
              className="text-[9px] font-bold uppercase text-blue-400 px-2 py-1 hover:bg-blue-500/10 rounded transition-colors"
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
