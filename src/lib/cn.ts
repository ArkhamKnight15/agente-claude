/** Junta classes condicionais: cn("a", cond && "b"). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
