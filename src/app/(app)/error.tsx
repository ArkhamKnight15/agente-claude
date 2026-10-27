"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Algo deu errado ao carregar esta página"
        description={`Tente novamente. Se o problema continuar, verifique a conexão com o banco de dados e o registro em Tarefas e erros.${error.digest ? ` (código ${error.digest})` : ""}`}
        action={<Button variant="primary" onClick={reset}>Tentar novamente</Button>}
      />
    </Card>
  );
}
