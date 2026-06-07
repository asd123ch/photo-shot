import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Wand2, ChevronDown } from 'lucide-react';

export interface TemplateItem {
  name: string;
  prompt: string;
}

export interface TemplateCategory {
  name: string;
  templates: TemplateItem[];
}

interface TemplateMenuProps {
  categories: TemplateCategory[];
  onSelect: (prompt: string) => void;
}

/**
 * Custom template picker. Replaces a native <select>/<optgroup>, whose group
 * labels render in an unreadable system grey and whose selected option draws a
 * checkmark + indent we cannot style. Here we own every pixel: bright, readable
 * group headings; flat items with no checkmark; on-brand hover/focus state; and
 * full keyboard support (Arrow/Home/End/Escape) as an ARIA listbox.
 */
const TemplateMenu: React.FC<TemplateMenuProps> = ({ categories, onSelect }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const optionEls = useCallback(
    (): HTMLButtonElement[] =>
      menuRef.current
        ? Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]'))
        : [],
    [],
  );

  // Close on outside pointer.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (open) optionEls()[0]?.focus();
  }, [open, optionEls]);

  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (prompt: string) => {
    onSelect(prompt);
    close();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const opts = optionEls();
    if (opts.length === 0) return;
    const idx = opts.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        opts[(idx + 1) % opts.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        opts[(idx - 1 + opts.length) % opts.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        opts[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        opts[opts.length - 1]?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Apply a style template"
        className="w-full flex items-center gap-3 bg-surface border border-gray-700 rounded-xl py-3 pl-3 pr-3 text-xs text-gray-300 hover:bg-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Wand2 size={16} className="text-primary flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">Apply a style template…</span>
        <ChevronDown
          size={14}
          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Style templates"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 right-0 z-50 mt-2 max-h-[55vh] overflow-y-auto no-scrollbar rounded-xl border border-gray-700 bg-surface shadow-2xl p-1.5 animate-fade-in"
        >
          {categories.map((category) => (
            <div key={category.name} className="mb-2 last:mb-0">
              <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                {category.name}
              </div>
              {category.templates.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  role="option"
                  aria-selected={false}
                  tabIndex={-1}
                  onClick={() => choose(t.prompt)}
                  className="w-full text-left px-2.5 py-2.5 rounded-lg text-sm text-gray-100 hover:bg-primary/15 hover:text-white focus:bg-primary/15 focus:text-white focus:outline-none transition-colors"
                >
                  {t.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TemplateMenu;
