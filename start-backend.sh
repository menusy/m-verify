#!/bin/bash

# Skrypt do uruchomienia backendu
echo "🚀 Uruchamianie backendu..."
echo ""

# Sprawdź czy jesteśmy w odpowiednim katalogu
if [ ! -d "backend" ]; then
    echo "❌ Błąd: Katalog 'backend' nie istnieje!"
    exit 1
fi

# Przejdź do katalogu backend
cd backend

# Sprawdź czy Python jest zainstalowany
if ! command -v python3 &> /dev/null; then
    echo "❌ Błąd: Python3 nie jest zainstalowany!"
    exit 1
fi

# Sprawdź czy virtualenv istnieje, jeśli nie - utwórz
if [ ! -d "venv" ]; then
    echo "📦 Tworzenie środowiska wirtualnego..."
    python3 -m venv venv
fi

# Aktywuj środowisko wirtualne
echo "🔧 Aktywowanie środowiska wirtualnego..."
source venv/bin/activate

# Zainstaluj zależności
echo "📥 Instalowanie zależności..."
pip install -r requirements.txt

# Uruchom serwer
echo ""
echo "✅ Backend uruchomiony na http://localhost:8000"
echo "📚 Dokumentacja API: http://localhost:8000/docs"
echo "🔍 ReDoc: http://localhost:8000/redoc"
echo ""
echo "Naciśnij Ctrl+C aby zatrzymać serwer"
echo ""

python main.py

