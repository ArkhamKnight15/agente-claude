import { fetchPublicPage } from "@/server/integrations/http";

/** Verificação mínima de robots.txt para a página inicial ("/"). */
export function rootDisallowed(robotsTxt: string, agent = "prospectabot"): boolean {
  const groups: Array<{ agents: string[]; allowRoot: boolean; disallowRoot: boolean }> = [];
  let current: { agents: string[]; allowRoot: boolean; disallowRoot: boolean } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const key = field.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allowRoot: false, disallowRoot: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value === "/") current.disallowRoot = true;
    if (key === "allow" && (value === "/" || value === "/$")) current.allowRoot = true;
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const group = specific ?? groups.find((g) => g.agents.includes("*"));
  return Boolean(group && group.disallowRoot && !group.allowRoot);
}

export async function isRootAllowed(origin: string): Promise<boolean> {
  const page = await fetchPublicPage(`${origin}/robots.txt`, { timeoutMs: 6000, maxBytes: 100_000 });
  if (!page.html || page.status === null || page.status >= 400) return true;
  return !rootDisallowed(page.html);
}
