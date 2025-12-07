import './styles.css';

const CODE_TTL_SECONDS = 120;

let overlay;
let pinValueEl;
let countdownEl;
let progressEl;
let refreshBtn;
let openerBtn;
let closeButtons;
let countdownInterval = null;
let secondsRemaining = CODE_TTL_SECONDS;

document.addEventListener('DOMContentLoaded', () => {
  overlay = document.getElementById('authOverlay');
  pinValueEl = document.getElementById('authPinValue');
  countdownEl = document.getElementById('authCountdown');
  progressEl = document.getElementById('authProgress');
  refreshBtn = document.getElementById('authRefresh');
  openerBtn = document.querySelector('[data-auth-open]');
  closeButtons = document.querySelectorAll('[data-auth-close]');

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

  refreshBtn?.addEventListener('click', issueNewCode);
});

function openOverlay() {
  if (!overlay) return;
  overlay.hidden = false;
  overlay.classList.add('is-visible');
  document.body.classList.add('overlay-open');
  issueNewCode();
}

function closeOverlay() {
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  overlay.setAttribute('hidden', '');
  document.body.classList.remove('overlay-open');

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function issueNewCode() {
  secondsRemaining = CODE_TTL_SECONDS;
  pinValueEl.textContent = generatePin();
  updateCountdownDisplay();
  startCountdown();
}

function startCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  countdownInterval = setInterval(() => {
    secondsRemaining = Math.max(secondsRemaining - 1, 0);
    updateCountdownDisplay();

    if (secondsRemaining === 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);
}

function updateCountdownDisplay() {
  if (!countdownEl || !progressEl) return;
  countdownEl.textContent = formatTime(secondsRemaining);
  const progress = secondsRemaining / CODE_TTL_SECONDS;
  progressEl.style.transform = `scaleX(${progress})`;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000);
}

