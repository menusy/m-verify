import './styles.css';

const DEFAULT_CODE_TTL_SECONDS = 120;
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
let qrPlaceholderEl;
let qrStatusEl;
let countdownInterval = null;
let secondsRemaining = DEFAULT_CODE_TTL_SECONDS;
let currentCodeTtlSeconds = DEFAULT_CODE_TTL_SECONDS;
let currentToken = null;
let isFetchingCode = false;

document.addEventListener('DOMContentLoaded', () => {
  overlay = document.getElementById('authOverlay');
  pinValueEl = document.getElementById('authPinValue');
  countdownEl = document.getElementById('authCountdown');
  progressEl = document.getElementById('authProgress');
  refreshBtn = document.getElementById('authRefresh');
  openerBtn = document.querySelector('[data-auth-open]');
  closeButtons = document.querySelectorAll('[data-auth-close]');
  qrImageEl = document.getElementById('authQrImage');
  qrPlaceholderEl = document.getElementById('authQrPlaceholder');
  qrStatusEl = document.getElementById('authQrStatus');

  if (!overlay || !pinValueEl || !countdownEl || !progressEl || !openerBtn) {
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
});

function openOverlay() {
  if (!overlay) return;
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
  resetCountdown();
}

async function issueNewCode() {
  if (isFetchingCode) return;
  isFetchingCode = true;
  toggleRefreshButton(true);
  setQrStatus('Trwa generowanie kodu...');
  setQrLoadingState(true);
  setPinValue('------');
  resetCountdown();
  secondsRemaining = DEFAULT_CODE_TTL_SECONDS;
  currentCodeTtlSeconds = DEFAULT_CODE_TTL_SECONDS;
  updateCountdownDisplay();

  try {
    const response = await fetch(buildApiUrl('/api/pairing/generate'), {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    currentToken = data.token ?? null;
    currentCodeTtlSeconds = Number.parseInt(data.expires_in_seconds, 10) || DEFAULT_CODE_TTL_SECONDS;
    secondsRemaining = currentCodeTtlSeconds;

    setPinValue(data.pin ?? '------');
    updateCountdownDisplay();
    startCountdown();
    updateQrImage(currentToken);
    setQrStatus('Zeskanuj kod w aplikacji mObywatel.');
  } catch (error) {
    console.error('Failed to generate QR code', error);
    setQrStatus('Nie udało się pobrać kodu. Spróbuj ponownie.', true);
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

    if (secondsRemaining === 0) {
      resetCountdown();
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
  if (!qrImageEl || !qrPlaceholderEl) return;
  if (isLoading) {
    qrImageEl.hidden = true;
    qrPlaceholderEl.removeAttribute('hidden');
  }
}

function setQrStatus(message = '', isError = false) {
  if (!qrStatusEl) return;
  qrStatusEl.textContent = message;
  if (isError) {
    qrStatusEl.dataset.state = 'error';
  } else {
    delete qrStatusEl.dataset.state;
  }
}

function updateQrImage(token) {
  if (!qrImageEl || !token) return;
  const url = `${buildApiUrl(`/api/pairing/qr/${encodeURIComponent(token)}`)}?t=${Date.now()}`;
  qrImageEl.hidden = true;
  qrPlaceholderEl?.removeAttribute('hidden');
  qrImageEl.src = url;
}

function handleQrImageLoad() {
  if (!qrImageEl) return;
  qrImageEl.hidden = false;
  qrPlaceholderEl?.setAttribute('hidden', '');
}

function handleQrImageError() {
  if (!qrImageEl) return;
  qrImageEl.hidden = true;
  qrPlaceholderEl?.removeAttribute('hidden');
  setQrStatus('Nie udało się wczytać obrazu QR. Użyj przycisku „Odśwież”.', true);
}

function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

