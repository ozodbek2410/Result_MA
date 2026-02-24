# components/ — Kontekst

## Vazifasi
Sahifa-spetsifik va umumiy React komponentlar. `ui/` — qayta ishlatiladigan primitiv komponentlar, qolganlari — biznes logika komponentlari.

## Qoidalar
- Har bir komponent alohida fayl, PascalCase (`TestEditor.tsx`)
- Props uchun interface shu fayl ichida yoziladi
- `ui/` komponentlari `cn()` utility bilan TailwindCSS ishlat, biznes logika bo'lmasin
- Icon faqat `lucide-react` dan import qilinadi
- API chaqiruvlar `@/lib/api` orqali, to'g'ridan-to'g'ri `axios` ISHLATMA
- `SubjectText` komponentlar (MathText, BiologyText, ChemistryText...) — fan bo'yicha matn renderlash uchun

## Namuna
```tsx
// ui/ komponent namunasi (Button.tsx pattern)
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', loading, children, ...props }, ref) => {
    return (
      <button className={cn('...', { /* variant styles */ })} ref={ref} {...props}>
        {loading && <Loader2 className="animate-spin mr-2" />}
        {children}
      </button>
    );
  }
);
```
