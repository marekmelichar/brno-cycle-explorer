import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InfraIndex, analyzeRoute, computeDatasetStats, type RouteAnalysis } from '@bce/geo';
import type { InfrastructureResponse, LngLat } from '@bce/shared';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';

export function useAppConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity, retry: 2 });
}

export function useInfrastructure() {
  return useQuery({
    queryKey: ['infrastructure'],
    queryFn: api.infrastructure,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    // if the server is still downloading the dataset, poll until it is ready
    refetchInterval: (q) => {
      const d = q.state.data as InfrastructureResponse | undefined;
      return d && d.meta.featureCount === 0 && d.meta.refreshing ? 3000 : false;
    },
  });
}

export function useRefreshInfrastructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.refreshInfrastructure,
    onSuccess: (data) => qc.setQueryData(['infrastructure'], data),
  });
}

export function useImportInfrastructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.importInfrastructure,
    onSuccess: (data) => qc.setQueryData(['infrastructure'], data),
  });
}

export function useInfraIndex(): InfraIndex | null {
  const { data } = useInfrastructure();
  return useMemo(() => (data && data.data.features.length ? new InfraIndex(data.data.features) : null), [data]);
}

export function useDatasetStats() {
  const { data } = useInfrastructure();
  return useMemo(() => (data && data.data.features.length ? computeDatasetStats(data.data.features) : null), [data]);
}

export function useAnalysis(lines: LngLat[][] | null | undefined): RouteAnalysis | null {
  const index = useInfraIndex();
  const opts = useAppStore((s) => s.matchOptions);
  return useMemo(() => {
    if (!lines || !lines.length || !index) return null;
    return analyzeRoute(lines, index, opts);
  }, [lines, index, opts]);
}

export function useActiveAnalysis(): RouteAnalysis | null {
  const active = useAppStore((s) => s.activeRoute);
  return useAnalysis(active?.lines);
}
