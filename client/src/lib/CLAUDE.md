# lib/ — Kontekst

## Vazifasi
Yordamchi funksiyalar va API klient konfiguratsiyasi. Barcha tashqi service chaqiruvlar shu yerdan boshqariladi.

## Qoidalar
- `api.ts` — yagona Axios instance, boshqa joyda yangi `axios.create()` QILMA
- `utils.ts` — faqat `cn()` (clsx + twMerge), ortiqcha util qo'shma — kerak bo'lsa `hooks/` ga yoz
- LaTeX/MathML/OMML utillar shu papkada — fanga oid matn konvertatsiyasi
- `queryClient.ts` — React Query global config, default staleTime/cacheTime shu yerda
- Token avtomatik `Authorization: Bearer` headerga qo'shiladi (interceptor `api.ts` da)

## Namuna
```typescript
// API chaqiruv pattern (api.ts)
const api = axios.create({ baseURL: '/api', timeout: 0 });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```
