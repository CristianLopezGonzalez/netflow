import { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Option {
  value: string | number;
  label: string;
  isCurrent?: boolean;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (val: any) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  hSize?: string;
  disabled?: boolean;
}

export default function CustomSelect({ 
  value, 
  onChange, 
  options, 
  placeholder = "Seleccionar...", 
  className,
  hSize = "h-11",
  disabled = false
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const selectedOptionRef = useRef<HTMLLIElement | null>(null);

  const selectedOption = options.find(o => String(o.value) === String(value));

  // Portal container positioned to match the trigger button
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      setPortalPos({ 
        top: rect.bottom + scrollY + 8, 
        left: rect.left, 
        width: rect.width 
      });
    } else {
      setPortalPos(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scrollY = window.scrollY;
        setPortalPos({ 
          top: rect.bottom + scrollY + 8, 
          left: rect.left, 
          width: rect.width 
        });
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { 
      window.removeEventListener('scroll', onScroll, true); 
      window.removeEventListener('resize', onScroll); 
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedOptionRef.current || !listRef.current) {
      return;
    }

    const option = selectedOptionRef.current;
    const list = listRef.current;

    requestAnimationFrame(() => {
      const targetScrollTop = option.offsetTop - list.clientHeight / 2 + option.clientHeight / 2;
      list.scrollTop = Math.max(0, Math.min(targetScrollTop, list.scrollHeight - list.clientHeight));
    });
  }, [isOpen, selectedOption]);

  const dropdown = useMemo(() => (
    <div
      className="absolute z-[9999] bg-gray-900/50 backdrop-blur-md border border-[var(--color-surface-border)] rounded-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
      style={portalPos ? { 
        top: `${portalPos.top}px`, 
        left: `${portalPos.left}px`, 
        width: `${portalPos.width}px`,
        maxHeight: '300px'
      } : {}}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ul ref={listRef} className="max-h-[300px] overflow-auto custom-scrollbar py-1.5">
        {options.map((opt) => {
          const isSelected = String(opt.value) === String(value);
          const isCurrent = Boolean(opt.isCurrent) && !isSelected;

          const optionClasses = isSelected
            ? "bg-gradient-to-r from-[var(--primary-600)] to-[var(--primary-700)] text-white shadow-xl shadow-[rgba(0,0,0,0.18)]"
            : isCurrent
              ? "bg-yellow-500/15 text-yellow-100 border-l-4 border-yellow-400 shadow-sm"
              : "text-[var(--primary-300)] hover:bg-white/10 hover:text-white";

          return (
            <li
              ref={isSelected ? selectedOptionRef : null}
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={cn(
                "px-4 py-2.5 text-xs font-bold uppercase tracking-wide cursor-pointer transition-all flex items-center justify-between group",
                optionClasses,
              )}
            >
              <span className="flex items-center gap-2">
                {opt.label}
                {opt.isCurrent && !isSelected && (
                  <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.15em] text-yellow-100">
                    Actual
                  </span>
                )}
              </span>
              {isSelected && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.15em] text-white">
                  Seleccionada
                </span>
              )}
            </li>
          );
        })}
        {options.length === 0 && (
          <li className="px-4 py-6 text-xs text-[var(--primary-500)] italic text-center uppercase tracking-widest font-bold opacity-60">
            Sin opciones
          </li>
        )}
      </ul>
    </div>
  ), [options, value, onChange, portalPos]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 transition-all duration-300 cursor-pointer rounded-md bg-[#121418] border border-[var(--color-surface-border)]",
          isOpen ? "ring-1 ring-[var(--primary-500)] border-[var(--primary-500)]" : "hover:border-[var(--primary-400)]",
          disabled ? "opacity-50 cursor-not-allowed" : "",
          hSize
        )}
      >
        <span className={cn(
          "text-xs font-bold tracking-tight uppercase truncate mr-2",
          !selectedOption ? "text-[var(--primary-500)] italic" : "text-white"
        )}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={cn(
          "w-4 h-4 text-[var(--primary-500)] transition-transform duration-300",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && ReactDOM.createPortal(dropdown, document.body)}
    </div>
  );
}
