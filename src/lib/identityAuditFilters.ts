export interface IdentityLogFilters {
  logFp?: string;
  logUser?: string;
  logFrom?: string;
  logTo?: string;
}

export function readIdentityLogFilters(search: Record<string, unknown>): IdentityLogFilters {
  return {
    logFp: typeof search.logFp === "string" ? search.logFp : undefined,
    logUser: typeof search.logUser === "string" ? search.logUser : undefined,
    logFrom: typeof search.logFrom === "string" ? search.logFrom : undefined,
    logTo: typeof search.logTo === "string" ? search.logTo : undefined,
  };
}

export function identityLogShortcut(filters: IdentityLogFilters, field: "logFp" | "logUser", value: string): IdentityLogFilters {
  return { ...filters, [field]: value.trim() || undefined };
}