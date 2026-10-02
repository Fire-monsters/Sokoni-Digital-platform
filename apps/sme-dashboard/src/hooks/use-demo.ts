import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useDemoQuery<T>(key: string[], fn: () => Promise<T>) {
  return useQuery({ queryKey: ["demo", ...key], queryFn: fn, retry: false });
}

export function useDemoMutation<V, R>(
  fn: (v: V) => Promise<R>,
  success?: string | ((r: R, v: V) => string),
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ["demo"] });
      if (success) toast.success(typeof success === "function" ? success(r, v) : success);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Something went wrong"),
  });
}
