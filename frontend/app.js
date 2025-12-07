const DEFAULT_CODE_TTL_SECONDS = 120;
const REFRESH_WARNING_THRESHOLD_SECONDS = 30;
const STATUS_POLL_INTERVAL_MS = 3000;
const VERIFICATION_COOKIE_NAME = 'gov_verification_status';
const VERIFICATION_COOKIE_EXPIRY_DAYS = 365; // Cookie ważne przez rok
const API_BASE_URL = (() => {
  // Sprawdź zmienną środowiskową
  const base = import.meta?.env?.VITE_API_BASE_URL ?? '';
  if (base) {
    return base.replace(/\/+$/, '');
  }
  
  // Domyślny URL dla produkcji (Railway)
  // W development użyj pustego stringa (względne ścieżki przez Vite proxy)
  const isProduction = import.meta?.env?.MODE === 'production' || 
                       window.location.hostname !== 'localhost' && 
                       !window.location.hostname.includes('127.0.0.1');
  
  if (isProduction) {
    return 'https://m-verify-production.up.railway.app';
  }
  
  // Development - użyj względnych ścieżek (Vite proxy)
  return '';
})();

let overlay;
let pinValueEl;
let countdownEl;
let progressEl;
let refreshBtn;
let openerBtn;
let closeButtons;
let qrImageEl;
let qrStatusEl;
let codeExpiredModal;
let expiredModalRefreshBtn;
let expiredModalCloseBtn;
let qrPlaceholderEl;
let countdownInterval = null;
let secondsRemaining = DEFAULT_CODE_TTL_SECONDS;
let currentCodeTtlSeconds = DEFAULT_CODE_TTL_SECONDS;
let currentToken = null;
let isFetchingCode = false;
let statusPollingInterval = null;
let hasShownSuccessNotification = false;
let cookieImageEl = null;

// Funkcje do obsługi cookies
function setCookie(name, value, days) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

function saveVerificationStatus() {
  const timestamp = Date.now();
  setCookie(VERIFICATION_COOKIE_NAME, 'verified', VERIFICATION_COOKIE_EXPIRY_DAYS);
  showCookieImage();
}

function checkVerificationCookie() {
  const verificationStatus = getCookie(VERIFICATION_COOKIE_NAME);
  if (verificationStatus === 'verified') {
    showCookieImage();
  }
}

function showCookieImage() {
  const cookieIcon = document.getElementById('verificationCookieIcon');
  const cookieIconModal = document.getElementById('verificationCookieIconModal');
  
  if (cookieIcon) {
    cookieIcon.hidden = false;
    cookieIcon.removeAttribute('hidden');
  }
  
  if (cookieIconModal) {
    cookieIconModal.hidden = false;
    cookieIconModal.removeAttribute('hidden');
  }
}

function hideCookieImage() {
  const cookieIcon = document.getElementById('verificationCookieIcon');
  const cookieIconModal = document.getElementById('verificationCookieIconModal');
  
  if (cookieIcon) {
    cookieIcon.hidden = true;
    cookieIcon.setAttribute('hidden', '');
  }
  
  if (cookieIconModal) {
    cookieIconModal.hidden = true;
    cookieIconModal.setAttribute('hidden', '');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - initializing...');

  overlay = document.getElementById('authOverlay');
  pinValueEl = document.getElementById('authPinValue');
  countdownEl = document.getElementById('authCountdown');
  progressEl = document.getElementById('authProgress');
  refreshBtn = document.getElementById('authRefresh');
  openerBtn = document.querySelector('[data-auth-open]');
  closeButtons = document.querySelectorAll('[data-auth-close]');
  qrImageEl = document.getElementById('authQrImage');
  qrStatusEl = document.getElementById('authQrStatus');
  codeExpiredModal = document.getElementById('codeExpiredModal');
  expiredModalRefreshBtn = document.getElementById('expiredModalRefresh');
  expiredModalCloseBtn = document.getElementById('expiredModalClose');
  qrPlaceholderEl = document.getElementById('authQrPlaceholder');

  console.log('Elements found:', {
    overlay: !!overlay,
    pinValueEl: !!pinValueEl,
    countdownEl: !!countdownEl,
    progressEl: !!progressEl,
    openerBtn: !!openerBtn,
    qrImageEl: !!qrImageEl,
    qrStatusEl: !!qrStatusEl,
    API_BASE_URL: API_BASE_URL
  });

  if (!overlay || !pinValueEl || !countdownEl || !progressEl || !openerBtn) {
    console.error('Missing required elements!');
    return;
  }

  openerBtn.addEventListener('click', openOverlay);
  closeButtons.forEach((button) => button.addEventListener('click', closeOverlay));

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      // Najpierw zamknij modal wygaśnięcia, jeśli jest otwarty
      if (codeExpiredModal && !codeExpiredModal.hasAttribute('hidden')) {
        closeExpiredModal();
      } else {
        closeOverlay();
      }
    }
  });

  if (qrImageEl) {
    qrImageEl.addEventListener('load', handleQrImageLoad);
    qrImageEl.addEventListener('error', handleQrImageError);
  }

  refreshBtn?.addEventListener('click', () => {
    if (isFetchingCode) return;
    void issueNewCode();
  });

  expiredModalRefreshBtn?.addEventListener('click', () => {
    if (isFetchingCode) return;
    closeExpiredModal();
    void issueNewCode();
  });

  expiredModalCloseBtn?.addEventListener('click', () => {
    closeExpiredModal();
  });

  // Zamknij modal przy kliknięciu w overlay
  codeExpiredModal?.addEventListener('click', (event) => {
    if (event.target === codeExpiredModal || event.target.classList.contains('expired-modal__overlay')) {
      closeExpiredModal();
    }
  });

  // Zamknij modal przy naciśnięciu Escape
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && codeExpiredModal && !codeExpiredModal.hasAttribute('hidden')) {
      closeExpiredModal();
    }
  });

  // Sprawdź cookie weryfikacji przy ładowaniu strony
  checkVerificationCookie();
});

function openOverlay() {
  console.log('openOverlay called');
  if (!overlay) {
    console.error('openOverlay: overlay is missing');
    return;
  }
  console.log('Opening overlay and generating QR code...');
  overlay.hidden = false;
  overlay.classList.add('is-visible');
  document.body.classList.add('overlay-open');
  void issueNewCode();
}

function closeOverlay() {
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  overlay.setAttribute('hidden', '');
  document.body.classList.remove('overlay-open');
  stopStatusPolling();
  resetCountdown();
}

async function issueNewCode() {
  if (isFetchingCode) return;
  stopStatusPolling();
  hasShownSuccessNotification = false;
  isFetchingCode = true;
  toggleRefreshButton(true);
  setRefreshButtonVisibility(false);
  setQrExpiredState(false);
  setQrStatus('Trwa generowanie kodu...');
  setQrLoadingState(true);
  setPinValue('------');
  resetCountdown();
  secondsRemaining = DEFAULT_CODE_TTL_SECONDS;
  currentCodeTtlSeconds = DEFAULT_CODE_TTL_SECONDS;
  updateCountdownDisplay();

  try {
    const apiUrl = buildApiUrl('/api/pairing/generate');
    console.log('Generating QR code, API URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`Request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();

   console.log('QR code generated, full response:', data);
    console.log('Token received:', data.token ? data.token.substring(0, 20) + '...' : 'MISSING');
    console.log('Token type:', typeof data.token, 'Token length:', data.token?.length);

    // Walidacja tokenu z API
    if (!data.token || typeof data.token !== 'string' || data.token.trim() === '') {
      console.error('Invalid token from API:', data);
      setQrStatus('Błąd: Nieprawidłowy token z serwera. Spróbuj ponownie.', 'error');
      currentToken = null;
      return;
    }

    currentToken = data.token ?? null;
    const apiTtl = Number.parseInt(data.expires_in_seconds, 10);
    currentCodeTtlSeconds = Number.isFinite(apiTtl)
      ? Math.min(apiTtl, DEFAULT_CODE_TTL_SECONDS)
      : DEFAULT_CODE_TTL_SECONDS;
    secondsRemaining = currentCodeTtlSeconds;

    setPinValue(data.pin ?? '------');
    updateCountdownDisplay();
    startCountdown();

    // Wywołaj updateQrImage z walidacją
    console.log('Calling updateQrImage with token:', currentToken.substring(0, 20) + '...');
    // Upewnij się, że komunikat wygaśnięcia jest ukryty przed pokazaniem QR
    setQrExpiredState(false);
    updateQrImage(currentToken);
    setQrStatus('Zeskanuj kod w aplikacji mObywatel.');
    startStatusPolling(currentToken);
  } catch (error) {
    console.error('Failed to generate QR code', error);
    setQrStatus(`Nie udało się pobrać kodu: ${error.message}. Spróbuj ponownie.`, 'error');
    currentToken = null;
  } finally {
    isFetchingCode = false;
    toggleRefreshButton(false);
    setQrLoadingState(false);
  }
}

function startCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  countdownInterval = setInterval(() => {
    secondsRemaining = Math.max(secondsRemaining - 1, 0);
    updateCountdownDisplay();

    // Gdy countdown dojdzie do 00:00, nie pokazuj od razu komunikatu
    // Pozwól API polling sprawdzić rzeczywisty status kodu
    // Komunikat pojawi się tylko gdy API potwierdzi wygaśnięcie (status "expired")
    // Nie wywołuj handleRefreshThreshold - przycisk pokaże się tylko gdy kod wygasł
    // WAŻNE: Gdy countdown osiągnie 0, nie pokazuj komunikatu wygaśnięcia
    // Poczekaj na potwierdzenie z API (status "expired" lub kod 404/410)
    if (secondsRemaining <= 0) {
      // Zatrzymaj countdown, ale nie pokazuj komunikatu wygaśnięcia
      // Status polling sprawdzi rzeczywisty status kodu
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);
}

function resetCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function updateCountdownDisplay() {
  if (!countdownEl || !progressEl) return;
  const safeSeconds = Math.max(secondsRemaining, 0);
  countdownEl.textContent = formatTime(safeSeconds);

  const total = currentCodeTtlSeconds || DEFAULT_CODE_TTL_SECONDS;
  const progress = total ? safeSeconds / total : 0;
  progressEl.style.transform = `scaleX(${Math.max(Math.min(progress, 1), 0)})`;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function setPinValue(value) {
  if (!pinValueEl) return;
  pinValueEl.textContent = value;
}

function setRefreshButtonVisibility(shouldShow) {
  if (!refreshBtn) return;
  if (shouldShow) {
    refreshBtn.removeAttribute('hidden');
  } else {
    refreshBtn.setAttribute('hidden', '');
  }
}

function toggleRefreshButton(isDisabled) {
  if (!refreshBtn) return;
  refreshBtn.disabled = isDisabled;
  if (isDisabled) {
    refreshBtn.setAttribute('aria-busy', 'true');
  } else {
    refreshBtn.removeAttribute('aria-busy');
  }
}

function setQrLoadingState(isLoading) {
  if (!qrImageEl) return;
  if (isLoading) {
    qrImageEl.style.opacity = '0.3';
    qrImageEl.style.filter = 'blur(2px)';
  } else {
    qrImageEl.style.opacity = '1';
    qrImageEl.style.filter = 'none';
  }
}

function setQrStatus(message = '', state = 'default') {
  if (!qrStatusEl) return;
  qrStatusEl.textContent = message;
  if (!state || state === 'default') {
    delete qrStatusEl.dataset.state;
    return;
  }
  qrStatusEl.dataset.state = state;
}

function updateQrImage(token) {
 if (!qrImageEl) {
    console.error('updateQrImage: qrImageEl is missing');
    return;
  }

  if (!token || typeof token !== 'string' || token.trim() === '') {
    console.error('updateQrImage: Invalid token', { token, type: typeof token });
    setQrStatus('Błąd: Nieprawidłowy token. Spróbuj ponownie.', 'error');
    return;
  }

  // Walidacja tokenu - powinien być długim stringiem, nie "token"
  if (token === 'token' || token.length < 10) {
    console.error('updateQrImage: Token looks invalid', { token, length: token.length });
    setQrStatus('Błąd: Nieprawidłowy token. Spróbuj ponownie.', 'error');
    return;
  }
  const url = `${buildApiUrl(`/api/pairing/qr/${encodeURIComponent(token)}`)}?t=${Date.now()}`;
  console.log('Loading QR image from:', url);
  console.log('Token used:', token.substring(0, 20) + '...');

  // Pokaż obraz (może być pusty na początku, ale element jest widoczny)
  qrImageEl.hidden = false;
  qrImageEl.removeAttribute('hidden');
  qrImageEl.style.display = 'block';
  qrImageEl.style.opacity = '0.5'; // Półprzezroczysty podczas ładowania

  // Reset error state
  qrImageEl.onerror = null;
  qrImageEl.onload = null;

  // Set up error handler
  qrImageEl.onerror = function() {
    console.error('Failed to load QR image from:', url);
    handleQrImageError();
  };

  // Set up load handler
  qrImageEl.onload = function() {
    console.log('QR image onload event fired');
    handleQrImageLoad();
  };

  console.log('Setting QR image src to:', url);
  qrImageEl.src = url;
  // Sprawdź czy obraz jest już załadowany (może być w cache)
  if (qrImageEl.complete && qrImageEl.naturalHeight !== 0) {
    console.log('QR image already loaded from cache');
    handleQrImageLoad();
  }
}

function handleQrImageLoad() {
  console.log('handleQrImageLoad: QR image loaded successfully!');
  if (!qrImageEl) {
    console.error('handleQrImageLoad: qrImageEl is missing');
    return;
  }
  console.log('Showing QR image');

  // Upewnij się, że obraz jest w pełni widoczny
  qrImageEl.hidden = false;
  qrImageEl.removeAttribute('hidden');
  qrImageEl.style.display = 'block';
  qrImageEl.style.visibility = 'visible';
  qrImageEl.style.opacity = '1'; // Pełna nieprzezroczystość

  console.log('QR image should now be visible', {
    qrImageElHidden: qrImageEl.hidden,
    qrImageElDisplay: window.getComputedStyle(qrImageEl).display,
    qrImageElVisibility: window.getComputedStyle(qrImageEl).visibility,
    qrImageElOpacity: window.getComputedStyle(qrImageEl).opacity,
    qrImageElSrc: qrImageEl.src.substring(0, 80) + '...',
    qrImageElComplete: qrImageEl.complete,
    qrImageElNaturalWidth: qrImageEl.naturalWidth,
    qrImageElNaturalHeight: qrImageEl.naturalHeight
  });
}

function handleQrImageError() {
  if (!qrImageEl) return;
  console.error('QR image error - image src:', qrImageEl.src);
  qrImageEl.hidden = true;
  // Placeholder removed - no longer needed
  // WAŻNE: Nie pokazuj komunikatu wygaśnięcia przy błędzie ładowania obrazu
  // To może być błąd sieciowy, a kod może być nadal aktywny
  setQrExpiredState(false);
  setQrStatus('Nie udało się wczytać obrazu QR. Użyj przycisku „Odśwież”.', 'error');
}

function setQrExpiredState(isExpired) {
  if (!codeExpiredModal) return;

  if (isExpired) {
    codeExpiredModal.removeAttribute('hidden');
    // Zapobiegaj scrollowaniu body gdy modal jest otwarty
    document.body.classList.add('modal-open');
  } else {
    codeExpiredModal.setAttribute('hidden', '');
    document.body.classList.remove('modal-open');
  }
}

function closeExpiredModal() {
  setQrExpiredState(false);
}

function handleRefreshThreshold(currentSeconds) {
  // Nie pokazuj przycisku przedwcześnie - tylko gdy kod rzeczywiście wygasł
  // Przycisk pokaże się tylko gdy handleCodeExpired() zostanie wywołane
  setRefreshButtonVisibility(false);
}

function handleCodeExpired() {
  resetCountdown();
  stopStatusPolling();
  setQrExpiredState(true);
  setRefreshButtonVisibility(false); // Przycisk jest teraz w modalu
  setQrStatus('Kod wygasł. Kliknij "Odśwież kod" w oknie dialogowym.');
}

function startStatusPolling(token) {
  if (!token) return;
  stopStatusPolling();
  statusPollingInterval = setInterval(() => {
    void fetchPairingStatus(token);
  }, STATUS_POLL_INTERVAL_MS);
  void fetchPairingStatus(token);
}

function stopStatusPolling() {
  if (!statusPollingInterval) return;
  clearInterval(statusPollingInterval);
  statusPollingInterval = null;
}

async function fetchPairingStatus(token) {
  if (!token) return;
  const statusUrl = buildApiUrl(`/api/pairing/status/${encodeURIComponent(token)}`);
  try {
    const response = await fetch(statusUrl);
    if (!response.ok) {
      // Tylko gdy API wyraźnie zwraca 404 lub 410 (kod nie istnieje lub wygasł)
      if (response.status === 404 || response.status === 410) {
        handleCodeExpired();
        return;
      }
      // Dla innych błędów (500, timeout, itp.) nie pokazuj komunikatu wygaśnięcia
      // Kod może być nadal aktywny, tylko wystąpił błąd serwera
      console.error(`Status request failed with ${response.status}`);
      // WAŻNE: Ukryj komunikat wygaśnięcia przy błędach serwera - kod może być nadal aktywny
      setQrExpiredState(false);
      return;
    }
    const data = await response.json();
    handlePairingStatusResponse(data);
  } catch (error) {
    // Błąd sieciowy - nie pokazuj komunikatu wygaśnięcia
    // Kod może być nadal aktywny, tylko wystąpił problem z połączeniem
    console.error('Failed to fetch pairing status', error);
    // WAŻNE: Ukryj komunikat wygaśnięcia przy błędach sieciowych - kod może być nadal aktywny
    setQrExpiredState(false);
    // Nie wywołuj handleCodeExpired() - kod może być nadal aktywny
  }
}

function handlePairingStatusResponse(data) {
  if (!data) return;
  const { status, verification_result: verificationResult, remaining_seconds } = data;
  
  if (status === 'confirmed') {
    const successMessage =
      verificationResult?.message ?? 'Autoryzacja przebiegła poprawnie.';
    setQrExpiredState(false);
    setRefreshButtonVisibility(false);
    setQrStatus(successMessage, 'success');
    notifyBrowserSuccess(successMessage);
    stopStatusPolling();
    resetCountdown();
    // Zapisz status weryfikacji w cookie
    saveVerificationStatus();
    return;
  }
  
  // Sprawdź czy kod rzeczywiście wygasł - tylko gdy status jest "expired"
  if (status === 'expired') {
    handleCodeExpired();
    return;
  }
  
  // Jeśli kod jest aktywny (status "pending"), upewnij się, że komunikat wygaśnięcia jest ukryty
  if (status === 'pending') {
    // WAŻNE: Ukryj komunikat wygaśnięcia jeśli kod jest jeszcze aktywny
    setQrExpiredState(false);
    setRefreshButtonVisibility(false); // Ukryj przycisk gdy kod jest aktywny
    
    // Zsynchronizuj countdown z rzeczywistym czasem z API jeśli jest dostępny
    if (remaining_seconds !== undefined && remaining_seconds !== null) {
      const apiSeconds = Math.max(0, Math.floor(remaining_seconds));
      // Tylko aktualizuj jeśli kod jest nadal aktywny (remaining_seconds > 0)
      if (apiSeconds > 0) {
        secondsRemaining = apiSeconds;
        updateCountdownDisplay();
        // Upewnij się, że countdown działa
        if (!countdownInterval) {
          startCountdown();
        }
      } else if (apiSeconds <= 0) {
        // Jeśli remaining_seconds <= 0, ale status jest nadal "pending",
        // to znaczy że kod może być na granicy wygaśnięcia
        // Nie pokazuj jeszcze komunikatu - poczekaj aż API potwierdzi status "expired"
        // Zatrzymaj countdown, ale nie pokazuj komunikatu
        secondsRemaining = 0;
        updateCountdownDisplay();
        // WAŻNE: Ukryj komunikat wygaśnięcia - kod może być nadal aktywny
        setQrExpiredState(false);
        // Nie resetuj countdown - poczekaj na potwierdzenie z API
      }
    }
    setQrStatus('Oczekiwanie na potwierdzenie w aplikacji mObywatel...', 'pending');
    return;
  }
  
  // Dla innych statusów również ukryj komunikat wygaśnięcia (kod jest aktywny)
  setQrExpiredState(false);
  setRefreshButtonVisibility(false);
  setQrStatus('Oczekiwanie na potwierdzenie w aplikacji mObywatel...', 'pending');
}

function notifyBrowserSuccess(message) {
  if (hasShownSuccessNotification) return;
  hasShownSuccessNotification = true;
  const displayMessage = message || 'Autoryzacja przebiegła poprawnie.';
  if (typeof window === 'undefined') return;
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('mVerify', { body: displayMessage });
      return;
    }
    if (Notification.permission !== 'denied') {
      Notification.requestPermission()
        .then((permission) => {
          if (permission === 'granted') {
            new Notification('mVerify', { body: displayMessage });
          } else {
            window.alert(displayMessage);
          }
        })
        .catch(() => window.alert(displayMessage));
      return;
    }
  }
  window.alert(displayMessage);
}

function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${API_BASE_URL}${normalizedPath}`;
  console.log('buildApiUrl:', { path, API_BASE_URL, fullUrl });
  return fullUrl;
}

