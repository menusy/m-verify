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
let qrExpiredEl;
let qrOverlayRefreshBtn;
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
  qrExpiredEl = document.getElementById('authQrExpired');
  qrOverlayRefreshBtn = document.getElementById('authQrOverlayRefresh');
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
      closeOverlay();
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

  qrOverlayRefreshBtn?.addEventListener('click', () => {
    if (isFetchingCode) return;
    void issueNewCode();
  });

  // Sprawdź cookie weryfikacji przy ładowaniu strony
  checkVerificationCookie();
  
  // Sprawdź status domeny przy ładowaniu strony
  void verifyDomainStatus();
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

  handleRefreshThreshold(secondsRemaining);
  countdownInterval = setInterval(() => {
    secondsRemaining = Math.max(secondsRemaining - 1, 0);
    updateCountdownDisplay();
    handleRefreshThreshold(secondsRemaining);

    if (secondsRemaining === 0) {
      handleCodeExpired();
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
  setQrStatus('Nie udało się wczytać obrazu QR. Użyj przycisku „Odśwież”.', 'error');
}

function setQrExpiredState(isExpired) {
  if (!qrExpiredEl) return;

  if (isExpired) {
    qrExpiredEl.removeAttribute('hidden');
    qrImageEl?.setAttribute('hidden', '');
    qrPlaceholderEl?.setAttribute('hidden', '');
  } else {
    qrExpiredEl.setAttribute('hidden', '');
  }
}

function handleRefreshThreshold(currentSeconds) {
  // Pokaż przycisk odświeżania tylko gdy odliczanie dojdzie do 0
  if (currentSeconds <= 0) {
    setRefreshButtonVisibility(true);
  } else {
    setRefreshButtonVisibility(false);
  }
}

function handleCodeExpired() {
  resetCountdown();
  stopStatusPolling();
  setQrExpiredState(true);
  setRefreshButtonVisibility(true);
  setQrStatus('Kod wygasł. Odśwież, aby wygenerować nowy.');
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
      if (response.status === 404 || response.status === 410) {
        handleCodeExpired();
        return;
      }
      throw new Error(`Status request failed with ${response.status}`);
    }
    const data = await response.json();
    handlePairingStatusResponse(data);
  } catch (error) {
    console.error('Failed to fetch pairing status', error);
  }
}

function handlePairingStatusResponse(data) {
  if (!data) return;
  const { status, verification_result: verificationResult } = data;
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
  if (status === 'expired') {
    handleCodeExpired();
    return;
  }
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

async function verifyDomainStatus() {
  const securityPanel = document.getElementById('securityInfoPanel');
  const domainNameEl = document.getElementById('domainName');
  const domainStatusEl = document.getElementById('domainStatus');
  const domainStatusIconEl = document.getElementById('domainStatusIcon');
  const connectionStatusEl = document.getElementById('httpsStatus');
  const trustScoreEl = document.getElementById('trustScore');
  
  if (!securityPanel) {
    console.warn('Security panel not found');
    return;
  }
  
  // Sprawdź HTTPS
  const isHttps = window.location.protocol === 'https:';
  connectionStatusEl.textContent = isHttps ? 'Aktywne' : 'Nieaktywne';
  
  // Pobierz hostname
  const hostname = window.location.hostname;
  domainNameEl.textContent = hostname;
  
  // Pokaż panel
  securityPanel.hidden = false;
  securityPanel.removeAttribute('hidden');
  
  // Ustaw status "sprawdzanie"
  domainStatusEl.textContent = 'Sprawdzanie...';
  domainStatusEl.className = 'security-status checking';
  domainStatusIconEl.textContent = '🔍';
  trustScoreEl.textContent = '-';
  
  try {
    const domain = hostname;
    const apiUrl = buildApiUrl(`/api/domain/verify?domain=${encodeURIComponent(domain)}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Aktualizuj status domeny
    if (data.is_official) {
      domainStatusEl.textContent = 'Zweryfikowana';
      domainStatusEl.className = 'security-status verified';
      domainStatusIconEl.textContent = '✓';
      trustScoreEl.textContent = `${data.trust_score}%`;
    } else {
      domainStatusEl.textContent = 'Niezweryfikowana';
      domainStatusEl.className = 'security-status unverified';
      domainStatusIconEl.textContent = '⚠️';
      trustScoreEl.textContent = `${data.trust_score}%`;
    }
    
    // Aktualizuj nazwę domeny jeśli została znormalizowana
    if (data.domain && data.domain !== hostname) {
      domainNameEl.textContent = data.domain;
    }
    
  } catch (error) {
    console.error('Error verifying domain:', error);
    domainStatusEl.textContent = 'Błąd sprawdzania';
    domainStatusEl.className = 'security-status unverified';
    domainStatusIconEl.textContent = '⚠️';
    trustScoreEl.textContent = '-';
  }
}

