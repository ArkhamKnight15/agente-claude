"use client";

import { createContext, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/server/actions/helpers";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>({});

/** Estado da última submissão (erros por campo etc.) para os campos filhos. */
export function useFormActionState() {
  return useContext(FormStateContext);
}

export function fieldError(state: ActionState, name: string): string | undefined {
  return state.fieldErrors?.[name]?.[0];
}

interface ActionFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "children"> {
  action: FormAction;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  refresh?: boolean;
}

export function ActionForm({ action, children, successMessage, resetOnSuccess, onSuccess, refresh = true, ...props }: ActionFormProps) {
  const [state, formAction] = useActionState(action, {});
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const lastAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state.at || state.at === lastAt.current) return;
    lastAt.current = state.at;
    if (state.ok === false) {
      toast({ tone: "error", title: "Não foi possível salvar", description: state.error });
    } else {
      if (state.message || successMessage) toast({ tone: "success", title: state.message ?? successMessage! });
      if (resetOnSuccess) formRef.current?.reset();
      if (refresh) router.refresh();
      onSuccess?.(state);
    }
  }, [state, toast, successMessage, resetOnSuccess, onSuccess, refresh, router]);

  return (
    <FormStateContext.Provider value={state}>
      <form ref={formRef} action={formAction} noValidate {...props}>
        {typeof children === "function" ? children(state) : children}
      </form>
    </FormStateContext.Provider>
  );
}

export function SubmitButton({ children, variant = "primary", ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} {...props}>
      {children}
    </Button>
  );
}
