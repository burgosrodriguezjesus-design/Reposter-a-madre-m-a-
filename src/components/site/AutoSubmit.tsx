"use client";

import { useEffect, useRef } from "react";

/** Envía automáticamente el formulario padre al cambiar un filtro (sin JS sigue funcionando con el botón). */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = () => form.requestSubmit();
    form.addEventListener("change", onChange);
    form.querySelectorAll<HTMLElement>("[data-nojs]").forEach((el) => (el.hidden = true));
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
