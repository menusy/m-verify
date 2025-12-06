// Konfiguracja API - używa tego samego hosta co frontend
const API_BASE_URL = window.location.origin;

// Funkcje pomocnicze
async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Pobierz wszystkie elementy
async function loadItems() {
  const itemsList = document.getElementById('itemsList');
  itemsList.innerHTML = '<p class="loading">Ładowanie...</p>';

  try {
    const items = await fetchAPI('/api/items');
    
    if (items.length === 0) {
      itemsList.innerHTML = '<p class="loading">Brak elementów. Dodaj pierwszy!</p>';
      return;
    }

    itemsList.innerHTML = items.map(item => `
      <div class="item-card" data-id="${item.id}">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.description || 'Brak opisu')}</p>
        <div class="item-actions">
          <button class="btn-delete" onclick="deleteItem(${item.id})">Usuń</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    itemsList.innerHTML = `<p class="error">Błąd podczas ładowania danych: ${error.message}</p>`;
  }
}

// Dodaj nowy element
async function createItem(name, description) {
  try {
    await fetchAPI('/api/items', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        description: description || null,
      }),
    });
    
    // Odśwież listę
    await loadItems();
    
    // Wyczyść formularz
    document.getElementById('itemForm').reset();
  } catch (error) {
    alert(`Błąd podczas dodawania elementu: ${error.message}`);
  }
}

// Usuń element
async function deleteItem(id) {
  if (!confirm('Czy na pewno chcesz usunąć ten element?')) {
    return;
  }

  try {
    await fetchAPI(`/api/items/${id}`, {
      method: 'DELETE',
    });
    
    // Odśwież listę
    await loadItems();
  } catch (error) {
    alert(`Błąd podczas usuwania elementu: ${error.message}`);
  }
}

// Funkcja pomocnicza do escapowania HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Obsługa formularza
document.getElementById('itemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const name = document.getElementById('itemName').value.trim();
  const description = document.getElementById('itemDescription').value.trim();
  
  if (!name) {
    alert('Nazwa jest wymagana!');
    return;
  }
  
  await createItem(name, description);
});

// Sprawdź połączenie z API przy starcie
async function checkAPI() {
  try {
    const health = await fetchAPI('/health');
    console.log('API Status:', health);
  } catch (error) {
    console.error('API nie jest dostępne:', error);
    const itemsList = document.getElementById('itemsList');
    itemsList.innerHTML = `
      <p class="error">
        Nie można połączyć się z API. Upewnij się, że backend działa na ${API_BASE_URL}
      </p>
    `;
  }
}

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
  checkAPI();
  loadItems();
  
  // Odświeżaj co 30 sekund
  setInterval(loadItems, 30000);
  
  // Inicjalizacja parowania QR
  initPairingQR();
});

// ========== System parowania QR code ==========

let currentPairingToken = null;
let pairingStatusInterval = null;

function initPairingQR() {
  const ctaButton = document.getElementById('ctaButton');
  const modal = document.getElementById('qrModal');
  const closeBtn = document.querySelector('.close');
  const copyPinBtn = document.getElementById('copyPinBtn');
  
  if (!ctaButton || !modal) return;
  
  // Otwórz modal po kliknięciu CTA
  ctaButton.addEventListener('click', async () => {
    await generatePairingQR();
    modal.classList.add('show');
  });
  
  // Zamknij modal
  closeBtn.addEventListener('click', () => {
    closePairingModal();
  });
  
  // Zamknij modal po kliknięciu poza nim
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePairingModal();
    }
  });
  
  // Kopiuj PIN do schowka
  if (copyPinBtn) {
    copyPinBtn.addEventListener('click', () => {
      const pinCode = document.getElementById('pinCode');
      if (pinCode && pinCode.textContent !== '------') {
        navigator.clipboard.writeText(pinCode.textContent).then(() => {
          copyPinBtn.textContent = '✓ Skopiowano!';
          copyPinBtn.classList.add('copied');
          setTimeout(() => {
            copyPinBtn.textContent = 'Kopiuj kod';
            copyPinBtn.classList.remove('copied');
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy PIN:', err);
          alert('Nie udało się skopiować kodu. Skopiuj ręcznie: ' + pinCode.textContent);
        });
      }
    });
  }
}

async function generatePairingQR() {
  const qrContainer = document.getElementById('qrContainer');
  const pinCode = document.getElementById('pinCode');
  const copyPinBtn = document.getElementById('copyPinBtn');
  const qrStatus = document.getElementById('qrStatus');
  const qrTimer = document.getElementById('qrTimer');
  
  qrContainer.innerHTML = '<div class="qr-loading">Generowanie kodu QR...</div>';
  pinCode.textContent = '------';
  copyPinBtn.style.display = 'none';
  qrStatus.innerHTML = '';
  qrTimer.innerHTML = '';
  
  try {
    // Generuj nowy token parowania
    const response = await fetchAPI('/api/pairing/generate');
    currentPairingToken = response.token;
    const pin = response.pin;
    
    // Wyświetl 6-cyfrowy PIN
    if (pinCode && pin) {
      pinCode.textContent = pin;
      copyPinBtn.style.display = 'inline-block';
      copyPinBtn.classList.remove('copied');
      copyPinBtn.textContent = 'Kopiuj kod';
    }
    
    // Wyświetl QR code
    const qrImage = document.createElement('img');
    qrImage.src = `/api/pairing/qr/${currentPairingToken}`;
    qrImage.alt = 'QR Code do parowania';
    qrContainer.innerHTML = '';
    qrContainer.appendChild(qrImage);
    
    // Ustaw status
    qrStatus.innerHTML = '<div class="qr-status pending">Oczekiwanie na skanowanie QR lub wpisanie PIN...</div>';
    qrStatus.className = 'qr-status pending';
    
    // Rozpocznij sprawdzanie statusu
    startPairingStatusCheck();
    
  } catch (error) {
    qrContainer.innerHTML = `<p class="error">Błąd podczas generowania QR: ${error.message}</p>`;
    console.error('Error generating QR:', error);
  }
}

function startPairingStatusCheck() {
  // Sprawdzaj status co sekundę
  if (pairingStatusInterval) {
    clearInterval(pairingStatusInterval);
  }
  
  pairingStatusInterval = setInterval(async () => {
    if (!currentPairingToken) return;
    
    try {
      const status = await fetchAPI(`/api/pairing/status/${currentPairingToken}`);
      
      updatePairingStatus(status);
      
      // Jeśli potwierdzono lub wygasło, zatrzymaj sprawdzanie
      if (status.status === 'confirmed' || status.status === 'expired') {
        clearInterval(pairingStatusInterval);
        
        if (status.status === 'confirmed') {
          // Parowanie zakończone sukcesem
          setTimeout(() => {
            alert('Parowanie zakończone pomyślnie! Aplikacja mobilna została połączona.');
            closePairingModal();
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Error checking pairing status:', error);
      if (error.message.includes('404') || error.message.includes('410')) {
        clearInterval(pairingStatusInterval);
        updatePairingStatus({ status: 'expired', remaining_seconds: 0 });
      }
    }
  }, 1000);
}

function updatePairingStatus(status) {
  const qrStatus = document.getElementById('qrStatus');
  const qrTimer = document.getElementById('qrTimer');
  
  if (!qrStatus || !qrTimer) return;
  
  // Aktualizuj status
  if (status.status === 'pending') {
    qrStatus.innerHTML = '<div class="qr-status pending">Oczekiwanie na skanowanie QR lub wpisanie PIN...</div>';
    qrStatus.className = 'qr-status pending';
  } else if (status.status === 'confirmed') {
    const deviceInfo = status.device_name ? ` (${status.device_name})` : '';
    qrStatus.innerHTML = `<div class="qr-status confirmed">✓ Parowanie potwierdzone${deviceInfo}</div>`;
    qrStatus.className = 'qr-status confirmed';
  } else if (status.status === 'expired') {
    qrStatus.innerHTML = '<div class="qr-status expired">Kod wygasł. Wygeneruj nowy kod.</div>';
    qrStatus.className = 'qr-status expired';
  }
  
  // Aktualizuj timer
  if (status.status === 'pending' && status.remaining_seconds !== undefined) {
    const minutes = Math.floor(status.remaining_seconds / 60);
    const seconds = status.remaining_seconds % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    qrTimer.textContent = `Pozostało czasu: ${timeString}`;
    qrTimer.className = 'qr-timer';
    
    // Ostrzeżenie gdy mniej niż 1 minuta
    if (status.remaining_seconds < 60) {
      qrTimer.classList.add('warning');
    }
    
    if (status.remaining_seconds <= 0) {
      qrTimer.textContent = 'Kod wygasł';
      qrTimer.classList.add('expired');
    }
  } else if (status.status === 'expired') {
    qrTimer.textContent = 'Kod wygasł';
    qrTimer.className = 'qr-timer expired';
  } else {
    qrTimer.textContent = '';
  }
}

function closePairingModal() {
  const modal = document.getElementById('qrModal');
  if (modal) {
    modal.classList.remove('show');
  }
  
  // Zatrzymaj sprawdzanie statusu
  if (pairingStatusInterval) {
    clearInterval(pairingStatusInterval);
    pairingStatusInterval = null;
  }
  
  currentPairingToken = null;
  
  // Wyczyść zawartość
  const qrContainer = document.getElementById('qrContainer');
  const pinCode = document.getElementById('pinCode');
  const copyPinBtn = document.getElementById('copyPinBtn');
  const qrStatus = document.getElementById('qrStatus');
  const qrTimer = document.getElementById('qrTimer');
  
  if (qrContainer) qrContainer.innerHTML = '';
  if (pinCode) pinCode.textContent = '------';
  if (copyPinBtn) {
    copyPinBtn.style.display = 'none';
    copyPinBtn.classList.remove('copied');
    copyPinBtn.textContent = 'Kopiuj kod';
  }
  if (qrStatus) {
    qrStatus.innerHTML = '';
    qrStatus.className = '';
  }
  if (qrTimer) {
    qrTimer.textContent = '';
    qrTimer.className = '';
  }
}

