import { useQuery } from "@tanstack/react-query"
import { api, type AuditResponse, type AuditEntry } from "../api/client"

export interface AuditFilters {
  action?: string
  agent?: string
  user?: string
  from?: string
  to?: string
  search?: string
  page?: number
  limit?: number
}

export function useAudit(filters?: AuditFilters) {
  return useQuery<AuditResponse>({
    queryKey: ["audit", filters],
    queryFn: () => api.getAudit(filters),
    refetchInterval: 30000,
    staleTime: 15000,
  })
}
