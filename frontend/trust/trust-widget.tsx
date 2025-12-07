import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { VerificationSession, UseTrustStatusReturn } from './useTrustStatus';
import { useTrustStatus } from './useTrustStatus';

type TrustVerificationPanelProps = {
  hostname: string;
  state: UseTrustStatusReturn['state'];
  session: VerificationSession | null;
  isStarting: boolean;
  isPolling: boolean;
  onStartVerification: () => Promise<void> | void;
};

type TrustCornerWidgetProps = {
  hostname: string;
  trustImageUrl: string;
};

const formatDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const TrustInfoLine = ({ label, value }: { label: string; value: string }) => (
  <p className="trust-panel__info-line">
    <span className="trust-panel__info-label">{label}</span>
    <span className="trust-panel__info-value">{value}</span>
  </p>
);

const QrPlaceholder = ({
  session,
  isPolling
}: {
  session: VerificationSession | null;
  isPolling: boolean;
}) => {
  if (session?.qrCodeUrl) {
    return (
      <div className="trust-panel__qr">
        <img
          src={session.qrCodeUrl}
          alt="Kod QR do weryfikacji mObywatel"
          width={160}
          height={160}
          loading="lazy"
        />
        <p className="trust-panel__qr-hint" aria-live="polite">
          {isPolling
            ? 'Oczekiwanie na potwierdzenie w mObywatel...'
            : 'Zeskanuj kod w aplikacji mObywatel.'}
        </p>
      </div>
    );
  }

  return (
    <div className="trust-panel__qr trust-panel__qr--placeholder">
      <span>[Tutaj pojawi się kod QR wygenerowany backendem]</span>
    </div>
  );
};

const TrustImagePreview = ({
  imageUrl,
  isVerified
}: {
  imageUrl?: string;
  isVerified: boolean;
}) => {
  if (isVerified && imageUrl) {
    return (
      <div className="trust-panel__image">
        <img
          src={imageUrl}
          alt="Twój znak zaufania gov.pl"
          width={120}
          height={120}
          loading="lazy"
        />
        <p className="trust-panel__image-caption">Twój znak zaufania</p>
      </div>
    );
  }

  return (
    <div className="trust-panel__image trust-panel__image--placeholder">
      <span>[Znak zaufania pojawi się tutaj po weryfikacji]</span>
    </div>
  );
};

export const TrustVerificationPanel = ({
  hostname,
  state,
  session,
  isStarting,
  isPolling,
  onStartVerification
}: TrustVerificationPanelProps) => {
  const [isButtonPressed, setIsButtonPressed] = useState(false);
  const isVerified = state.status === 'verified';
  const isLoading = state.status === 'loading';
  const isError = state.status === 'error';
  const heading = isVerified
    ? '✅ Strona zweryfikowana'
    : '🔒 Sprawdź, czy ta strona jest prawdziwa';

  const handleVerificationClick = async () => {
    setIsButtonPressed(true);
    await onStartVerification();
    setIsButtonPressed(false);
  };

  return (
    <section
      className={`trust-panel ${isVerified ? 'trust-panel--verified' : ''}`}
      aria-live="polite"
    >
      <div className="trust-panel__header">
        <p className="trust-panel__eyebrow">Mechanizm zaufania gov.pl</p>
        <h2>{heading}</h2>
        <TrustInfoLine label="Jesteś na" value={`https://${hostname}`} />
      </div>

      {isLoading && (
        <div className="trust-panel__status">
          <span className="trust-panel__status-dot" />
          Ładuję status zaufania...
        </div>
      )}

      {isError && state.message && (
        <div className="trust-panel__alert" role="alert">
          {state.message}
        </div>
      )}

      <div className="trust-panel__grid">
        <TrustImagePreview
          imageUrl={state.status === 'verified' ? state.trustImageUrl : undefined}
          isVerified={isVerified}
        />

        {isVerified ? (
          <div className="trust-panel__copy">
            <p className="trust-panel__lead">
              To jest oficjalna domena gov.pl zweryfikowana przez mObywatel.
            </p>
            {state.status === 'verified' && (
              <TrustInfoLine
                label="Ostatnia weryfikacja"
                value={formatDate(state.lastVerifiedAt)}
              />
            )}
            <p className="trust-panel__hint">
              Jeśli chcesz, możesz ponownie zeskanować kod QR na tym urządzeniu.
            </p>
            <button
              type="button"
              className="trust-panel__button trust-panel__button--ghost"
              onClick={handleVerificationClick}
              disabled={isStarting}
            >
              Zeskanuj ponownie
            </button>
          </div>
        ) : (
          <div className="trust-panel__copy">
            <p className="trust-panel__lead">
              To wygląda jak oficjalna strona, ale nie została jeszcze zweryfikowana
              na Twoim urządzeniu.
            </p>
            <p className="trust-panel__hint">
              Aby mieć pewność, zeskanuj kod QR w aplikacji mObywatel.
            </p>
            <button
              type="button"
              className="trust-panel__button"
              onClick={handleVerificationClick}
              disabled={isStarting || isLoading}
            >
              {isStarting ? 'Ładowanie…' : 'Zweryfikuj stronę w mObywatel'}
            </button>
            {isButtonPressed && isStarting && (
              <span className="trust-panel__subtext">
                Przygotowuję sesję weryfikacyjną...
              </span>
            )}
          </div>
        )}
      </div>

      <div className="trust-panel__qr-grid">
        <QrPlaceholder session={session} isPolling={isPolling} />
        <div className="trust-panel__qr-info">
          <h3>Jak to działa?</h3>
          <ol>
            <li>Zeskanuj kod QR w aplikacji mObywatel.</li>
            <li>Potwierdź, że chcesz zaufać domenie {hostname}.</li>
            <li>
              Po potwierdzeniu pokażemy Twój znak zaufania razem z historią
              ostatniej weryfikacji.
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
};

export const TrustCornerWidget = ({
  hostname,
  trustImageUrl
}: TrustCornerWidgetProps) => (
  <aside className="trust-corner-widget">
    <img
      src={trustImageUrl}
      alt="Zweryfikowany znak zaufania gov.pl"
      width={64}
      height={64}
      loading="lazy"
    />
    <div>
      <p className="trust-corner-widget__title">Strona zweryfikowana</p>
      <p className="trust-corner-widget__subtitle">
        To jest Twój znak zaufania dla {hostname}
      </p>
    </div>
  </aside>
);

const TrustWidgetHost = () => {
  const { hostname, state, session, isStarting, isPolling, startVerification } =
    useTrustStatus();

  const shouldShowPanel =
    state.status === 'loading' ||
    state.status === 'unverified' ||
    state.status === 'verified' ||
    state.status === 'error';

  return (
    <>
      {shouldShowPanel && (
        <div className="trust-panel-wrapper">
          <TrustVerificationPanel
            hostname={hostname}
            state={state}
            session={session}
            isStarting={isStarting}
            isPolling={isPolling}
            onStartVerification={startVerification}
          />
        </div>
      )}

      {state.status === 'verified' && (
        <TrustCornerWidget
          hostname={hostname}
          trustImageUrl={state.trustImageUrl}
        />
      )}
    </>
  );
};

const TRUST_WIDGET_ROOT_ID = 'trusted-image-widget-root';

export const initTrustWidget = () => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  if (document.getElementById(TRUST_WIDGET_ROOT_ID)) {
    return () => undefined;
  }

  const container = document.createElement('div');
  container.id = TRUST_WIDGET_ROOT_ID;
  container.className = 'trust-widget-host';

  const insertionPoint = document.body.firstChild;
  if (insertionPoint) {
    document.body.insertBefore(container, insertionPoint);
  } else {
    document.body.appendChild(container);
  }

  const root = createRoot(container);
  root.render(<TrustWidgetHost />);

  return () => root.unmount();
};

