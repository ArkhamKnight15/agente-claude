"use client";

import { useState } from "react";
import { CUSTOM_NICHE_KEY, NICHES } from "@/data/niches";
import { Field, Input, Select } from "@/components/ui/form";

export function NicheField({ defaultValue = "", error }: { defaultValue?: string; error?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <Field label="Nicho de mercado" htmlFor="nicheKey" error={error} required>
        <Select id="nicheKey" name="nicheKey" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={error ? true : undefined}>
          <option value="">Selecione…</option>
          {NICHES.map((n) => (
            <option key={n.key} value={n.key}>
              {n.label}
            </option>
          ))}
          <option value={CUSTOM_NICHE_KEY}>Outro (digitar termo de busca)</option>
        </Select>
      </Field>
      {value === CUSTOM_NICHE_KEY ? (
        <Field label="Termo de busca" htmlFor="customTerm" hint="Ex.: pet shop, vidraçaria, autoescola">
          <Input id="customTerm" name="customTerm" required maxLength={60} />
        </Field>
      ) : null}
    </>
  );
}
