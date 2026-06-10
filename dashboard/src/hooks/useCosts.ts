import { useQuery } from "@tanstack/react-query"
import { api, type CostSummary } from "../api/client"

export function useCosts(params?: { from?: string; to?: string }) {
  return useQuery<CostSummary>({
    queryKey: ["costs", params],
    queryFn: () => api.getCosts(params),
    refetchInterval: 30000,
    staleTime: 15000,
  })
}
