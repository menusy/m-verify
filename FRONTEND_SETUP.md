# Konfiguracja Frontendu z Vite

Frontend jest teraz zbudowany z użyciem Vite, co zapewnia:
- ✅ Szybsze budowanie i hot-reload w czasie rozwoju
- ✅ Optymalizację plików dla produkcji
- ✅ Prawidłowe serwowanie plików statycznych na Vercel

## Instalacja

```bash
npm install
```

## Development

```bash
npm run dev
```

Frontend będzie dostępny na `http://localhost:5173` (Vite dev server).
Backend powinien działać na `http://localhost:8000` (konfiguracja proxy w vite.config.js).

## Build dla produkcji

```bash
npm run build
```

Zbudowane pliki będą w katalogu `dist/`.

## Deploy na Vercel

Vercel automatycznie wykryje `package.json` i `vercel.json`:

1. Połącz repozytorium z Vercel
2. Vercel automatycznie:
   - Zainstaluje zależności (`npm install`)
   - Zbuduje projekt (`npm run build`)
   - Wdroży pliki z katalogu `dist/`

**Uwaga:** Jeśli backend FastAPI też ma być na Vercel, potrzebna będzie dodatkowa konfiguracja serverless functions. Alternatywnie, backend może być na osobnym serwerze (Render, Railway, itp.), a frontend będzie łączył się z nim przez API.


