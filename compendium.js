import './styles.css';

const DEFAULT_LIMIT = 200;
const SEARCH_DEBOUNCE_MS = 250;

const API_BASE_URL = (() => {
  const base = import.meta?.env?.VITE_API_BASE_URL ?? '';
  if (base) {
    return base.replace(/\/+$/, '');
  }

  const isProduction =
    import.meta?.env?.MODE === 'production' ||
    (typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      !window.location.hostname.includes('127.0.0.1'));

  if (isProduction) {
    return 'https://m-verify-production.up.railway.app';
  }

  return '';
})();

const state = {
  limit: DEFAULT_LIMIT,
  offset: 0,
  q: '',
  category: '',
  isLoading: false,
  lastError: null,
};

let listEl;
let summaryEl;
let searchInputEl;
let categorySelectEl;
let refreshBtnEl;
let appEl;
let searchTimeout;

document.addEventListener('DOMContentLoaded', () => {
  listEl = document.getElementById('compendiumList');
  summaryEl = document.getElementById('compendiumSummary');
  searchInputEl = document.getElementById('compendiumSearch');
  categorySelectEl = document.getElementById('compendiumCategory');
  refreshBtnEl = document.getElementById('compendiumRefresh');
  appEl = document.getElementById('compendiumApp');

  searchInputEl?.addEventListener('input', handleSearchInput);
  categorySelectEl?.addEventListener('change', () => {
    state.category = categorySelectEl.value;
    state.offset = 0;
    void loadCompendium();
  });
  refreshBtnEl?.addEventListener('click', () => {
    void loadCompendium(true);
  });

  void loadCompendium();
});

function handleSearchInput(event) {
  state.q = event.target.value.trim();
  state.offset = 0;

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  searchTimeout = setTimeout(() => {
    void loadCompendium();
  }, SEARCH_DEBOUNCE_MS);
}

async function loadCompendium(forceRefresh = false) {
  if (state.isLoading) return;

  state.isLoading = true;
  setLoadingState(true);
  summaryEl && (summaryEl.textContent = 'Trwa ładowanie danych…');

  const params = new URLSearchParams({
    limit: String(state.limit),
    offset: String(state.offset),
  });

  if (state.q) {
    params.append('q', state.q);
  }

  if (state.category) {
    params.append('category', state.category);
  }

  if (forceRefresh) {
    params.append('refresh', 'true');
  }

  try {
    const response = await fetch(`${buildApiUrl('/api/domains/compendium')}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Compendium request failed with status ${response.status}`);
    }
    const data = await response.json();
    renderCompendium(data);
    state.lastError = null;
  } catch (error) {
    console.error('Failed to fetch compendium', error);
    state.lastError = error;
    renderCompendiumError(error);
  } finally {
    state.isLoading = false;
    setLoadingState(false);
  }
}

function renderCompendium(data) {
  if (!listEl || !summaryEl) return;

  updateSummary(data);
  updateCategoryOptions(data?.categories);
  renderCompendiumList(data?.items);
}

function renderCompendiumList(items) {
  if (!listEl) return;

  listEl.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'compendium-empty';
    empty.textContent = state.q
      ? 'Brak domen spełniających podane kryteria.'
      : 'Brak danych do wyświetlenia.';
    listEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'compendium-card';

    const title = document.createElement('div');
    title.className = 'compendium-card__domain';
    title.textContent = item?.domain || item?.display_name || '—';

    const category = document.createElement('span');
    category.className = 'compendium-card__category';
    category.textContent = item?.category || 'Brak kategorii';

    const meta = document.createElement('p');
    meta.className = 'compendium-card__meta';
    meta.textContent = item?.last_seen_at
      ? `Aktualizacja: ${formatDate(item.last_seen_at)}`
      : 'Brak daty aktualizacji';

    card.appendChild(title);
    card.appendChild(category);
    card.appendChild(meta);

    if (item?.source_link) {
      const link = document.createElement('a');
      link.className = 'compendium-card__link';
      link.href = item.source_link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Zobacz w rejestrze';
      card.appendChild(link);
    }

    fragment.appendChild(card);
  });

  listEl.appendChild(fragment);
}

function updateSummary(data) {
  if (!summaryEl) return;
  const count = data?.count ?? 0;
  const total = data?.total ?? count;
  const cacheInfo = data?.cache ?? {};
  const refreshed = cacheInfo?.last_refreshed
    ? `Ostatnia aktualizacja: ${formatDate(cacheInfo.last_refreshed)}`
    : 'Brak informacji o aktualizacji.';

  summaryEl.textContent = `Wyświetlono ${count} z ${total} domen. ${refreshed}`;
}

function updateCategoryOptions(categories) {
  if (!categorySelectEl || !Array.isArray(categories)) return;

  const selected = categorySelectEl.value;
  categorySelectEl.innerHTML = '<option value="">Wszystkie kategorie</option>';

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelectEl.appendChild(option);
  });

  if (selected && categories.includes(selected)) {
    categorySelectEl.value = selected;
  }
}

function renderCompendiumError(error) {
  if (!listEl || !summaryEl) return;
  listEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'compendium-error';
  box.textContent = `Nie udało się pobrać kompendium: ${error?.message ?? 'nieznany błąd'}.`;
  listEl.appendChild(box);
  summaryEl.textContent = 'Spróbuj odświeżyć dane lub wrócić później.';
}

function setLoadingState(isLoading) {
  if (!appEl) return;
  appEl.dataset.loading = String(isLoading);
  if (refreshBtnEl) {
    refreshBtnEl.disabled = isLoading;
    refreshBtnEl.setAttribute('aria-busy', String(isLoading));
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${API_BASE_URL}${normalizedPath}`;
  console.log('compendium buildApiUrl:', { path, API_BASE_URL, fullUrl });
  return fullUrl;
}


