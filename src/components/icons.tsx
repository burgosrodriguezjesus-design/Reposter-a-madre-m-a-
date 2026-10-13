/** Iconos de marcas (no incluidos en lucide). */
type Props = { className?: string };

export function WhatsAppIcon({ className = "size-5" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.44 9.43m8.03-17.46A11.27 11.27 0 0 0 12.05.72C5.79.72.7 5.81.7 12.07c0 2 .52 3.95 1.52 5.67L.6 23.62l6.02-1.58a11.33 11.33 0 0 0 5.42 1.38h.01c6.25 0 11.34-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.03" />
    </svg>
  );
}

export function InstagramIcon({ className = "size-5" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className = "size-5" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.87.25-1.46 1.5-1.46h1.55V4.47A21 21 0 0 0 14.3 4.3c-2.24 0-3.78 1.37-3.78 3.88v2.32H8v3h2.52V21z" />
    </svg>
  );
}

export function TikTokIcon({ className = "size-5" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.35-2.49V9.66a5.69 5.69 0 0 0-6.45 5.64A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.68-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.89.09-3.24-1.48" />
    </svg>
  );
}

/** Marca: pequeña tarta con guinda en trazo dorado. */
export function BrandMark({ className = "size-9" }: Props) {
  // Porción de tarta de línea fina en negro con una guinda dorada
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 36 39 25v11z" stroke="#111110" strokeWidth="1.6" />
      <path d="M7 36 39 25" stroke="#111110" strokeWidth="1.6" />
      <path d="M7 36c4-1 6 1.6 9 .3s5-3 8.5-3.6 6.5-.6 8.5-2.2 4.5-2.9 6-3" stroke="#111110" strokeWidth="1.1" opacity=".55" />
      <path d="M12 36v0M20 36v0M28 36v0M35 36v0" stroke="#111110" strokeWidth="1" opacity=".35" />
      <path d="M7 36c2.5-3.2 7.5-6.5 13-8.7S32 23.6 39 25" stroke="#111110" strokeWidth="1.6" />
      <path d="M26 21.5c.7-3 2.8-5.5 5.5-6.8" stroke="#7a6139" strokeWidth="1.2" />
      <circle cx="25.6" cy="23.6" r="2.6" fill="#b8955b" />
    </svg>
  );
}
