"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Consentimiento de cookies (RGPD / LSSI). Las cookies técnicas (carrito, sesión) no
 * necesitan consentimiento; Google Analytics solo se carga si el usuario lo acepta.
 */
type Consent = { analytics: boolean; date: string };
const KEY = "rmm-consent-v1";
const OPEN_EVENT = "rmm:open-cookie-settings";
const CHANGE_EVENT = "rmm:consent-change";

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

let cachedRaw: string | null | undefined;
let cachedConsent: Consent | null = null;
function snapshot(): Consent | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedConsent = readConsent();
  }
  return cachedConsent;
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function save(analytics: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ analytics, date: new Date().toISOString() }));
  } catch {
    /* sin almacenamiento: se volverá a preguntar */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function CookieSettingsLink() {
  return (
    <button type="button" className="hover:text-cocoa-800" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Configurar cookies
    </button>
  );
}

export function CookieConsent({ gaId }: { gaId: string }) {
  const consent = useSyncExternalStore(subscribe, snapshot, () => undefined as Consent | null | undefined);
  const [forceOpen, setForceOpen] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const open = () => {
      setForceOpen(true);
      setConfiguring(true);
      setAnalytics(!!readConsent()?.analytics);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const visible = consent !== undefined && (consent === null || forceOpen);
  const decide = (value: boolean) => {
    save(value);
    setForceOpen(false);
    setConfiguring(false);
  };

  return (
    <>
      {gaId && consent?.analytics && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});gtag('config','${gaId}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {visible && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Preferencias de cookies"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-3xl border border-sand-300 bg-white p-5 shadow-lift sm:inset-x-6 sm:bottom-6"
        >
          <p className="font-display text-lg text-cocoa-900">Un momento dulce para tu privacidad 🍪</p>
          <p className="mt-2 text-sm leading-relaxed text-cocoa-600">
            Usamos cookies técnicas necesarias para el carrito y, solo si nos das permiso, cookies de analítica para
            entender cómo se usa la web y mejorarla. Más información en nuestra{" "}
            <Link href="/cookies" className="font-medium text-blush-700 underline">
              política de cookies
            </Link>
            .
          </p>
          {configuring && (
            <div className="mt-4 space-y-3 rounded-2xl bg-cream-100 p-4 text-sm">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked disabled className="mt-1 size-4 accent-blush-600" />
                <span>
                  <strong>Técnicas (siempre activas).</strong> Carrito, preferencias y seguridad.
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-1 size-4 accent-blush-600"
                />
                <span>
                  <strong>Analítica (Google Analytics).</strong> Estadísticas anónimas de visitas.
                </span>
              </label>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {configuring ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => decide(analytics)}>
                Guardar preferencias
              </button>
            ) : (
              <>
                <button type="button" className="btn-primary btn-sm" onClick={() => decide(true)}>
                  Aceptar todas
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => decide(false)}>
                  Rechazar
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setConfiguring(true)}>
                  Configurar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
