"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmButton, ResultMessage } from "@/components/admin/forms";
import { deleteDemoData } from "./actions";

export function DemoDataButton() {
  const [result, action] = useActionState(deleteDemoData, null);
  return (
    <form action={action} className="space-y-3">
      <ConfirmButton message="Se borrará todo el contenido de demostración. ¿Continuar?" className="btn-outline btn-sm text-red-700">
        <Trash2 className="size-4" /> Eliminar datos de demostración
      </ConfirmButton>
      <ResultMessage result={result} />
    </form>
  );
}
