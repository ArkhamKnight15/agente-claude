"use client";

import { useEffect, useState } from "react";
import { BRAZIL_STATES } from "@/data/locations-states";
import { Field, Input, Select } from "@/components/ui/form";

interface Props {
  defaultState?: string;
  defaultCity?: string;
  errors?: { state?: string; city?: string };
  required?: boolean;
}

/** UF + município com sugestões da lista oficial do IBGE. */
export function LocationFields({ defaultState = "", defaultCity = "", errors, required = true }: Props) {
  const [uf, setUf] = useState(defaultState);
  const [loaded, setLoaded] = useState<{ uf: string; cities: Array<{ name: string; capital: boolean }> }>({ uf: "", cities: [] });
  const cities = uf && loaded.uf === uf ? loaded.cities : [];
  const loading = Boolean(uf) && loaded.uf !== uf;

  useEffect(() => {
    if (!uf) return;
    let cancelled = false;
    fetch(`/api/locations/cities?uf=${uf}`)
      .then((r) => (r.ok ? r.json() : { cities: [] }))
      .then((data) => !cancelled && setLoaded({ uf, cities: data.cities }))
      .catch(() => !cancelled && setLoaded({ uf, cities: [] }));
    return () => {
      cancelled = true;
    };
  }, [uf]);

  return (
    <>
      <Field label="Estado" htmlFor="state" error={errors?.state} required={required}>
        <Select id="state" name="state" value={uf} onChange={(e) => setUf(e.target.value)} aria-invalid={errors?.state ? true : undefined}>
          <option value="">Selecione…</option>
          {BRAZIL_STATES.map((s) => (
            <option key={s.uf} value={s.uf}>
              {s.name} ({s.uf})
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Cidade"
        htmlFor="city"
        error={errors?.city}
        required={required}
        hint={uf ? (loading ? "Carregando municípios…" : `${cities.length} municípios — digite para filtrar`) : "Selecione o estado primeiro"}
      >
        <Input
          id="city"
          name="city"
          list="city-options"
          defaultValue={defaultCity}
          disabled={!uf}
          autoComplete="off"
          placeholder={uf ? "Ex.: Campinas" : ""}
          aria-invalid={errors?.city ? true : undefined}
        />
        <datalist id="city-options">
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.capital ? "Capital" : undefined}
            </option>
          ))}
        </datalist>
      </Field>
    </>
  );
}
