"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/server/actions/helpers";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface ActionButtonProps extends Omit<ButtonProps, "onClick"> {
  action: () => Promise<ActionState>;
  confirm?: { title: string; description: React.ReactNode; confirmLabel?: string; tone?: "danger" | "primary" };
  successMessage?: string;
  onDone?: (state: ActionState) => void;
}

/** Botão que executa uma Server Action com estado de carregamento, confirmação e toast. */
export function ActionButton({ action, confirm, successMessage, onDone, children, ...props }: ActionButtonProps) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const execute = () => {
    setConfirming(false);
    startTransition(async () => {
      const result = await action();
      if (result.ok === false) {
        toast({ tone: "error", title: "Não foi possível concluir", description: result.error });
      } else {
        toast({ tone: "success", title: result.message ?? successMessage ?? "Feito." });
        router.refresh();
      }
      onDone?.(result);
    });
  };

  return (
    <>
      <Button {...props} loading={pending} onClick={() => (confirm ? setConfirming(true) : execute())}>
        {children}
      </Button>
      {confirm ? (
        <Dialog
          open={confirming}
          onClose={() => setConfirming(false)}
          title={confirm.title}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button variant={confirm.tone === "danger" ? "danger" : "primary"} onClick={execute} loading={pending}>
                {confirm.confirmLabel ?? "Confirmar"}
              </Button>
            </>
          }
        >
          <div className="text-sm text-fg-2">{confirm.description}</div>
        </Dialog>
      ) : null}
    </>
  );
}
