import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client.js";
import { clearStoredAuth, getStoredAuth, setStoredAuth, type StoredAuth } from "./tokenStore.js";
import { signInWithGoogle } from "./googleAuth.js";
import type { AnalyzeSuccessResponse, HistoryResponse, PendingAnalysis } from "../../shared/types.js";

export function useAuthState() {
  return useQuery({ queryKey: ["auth"], queryFn: getStoredAuth });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<StoredAuth> => {
      const idToken = await signInWithGoogle();
      const data = await apiFetch<{ accessToken: string; refreshToken: string; user: StoredAuth["user"] }>(
        "/auth/google",
        { method: "POST", body: JSON.stringify({ idToken }) }
      );
      const auth: StoredAuth = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user };
      await setStoredAuth(auth);
      return auth;
    },
    onSuccess: (auth) => {
      queryClient.setQueryData(["auth"], auth);
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearStoredAuth,
    onSuccess: () => {
      queryClient.setQueryData(["auth"], null);
      queryClient.clear();
    },
  });
}

export function useBalance(enabled: boolean) {
  return useQuery({
    queryKey: ["balance"],
    queryFn: () => apiFetch<{ balance: number }>("/credits/balance"),
    enabled,
  });
}

export function useHistory(enabled: boolean, cursor?: string) {
  return useQuery({
    queryKey: ["history", cursor ?? null],
    queryFn: () =>
      apiFetch<HistoryResponse>(
        `/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
      ),
    enabled,
  });
}

export function useAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pending: PendingAnalysis & { languages: string[] }) =>
      apiFetch<AnalyzeSuccessResponse>("/analyze", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: pending.idempotencyKey,
          sourceType: pending.sourceType,
          imageUrl: pending.imageUrl,
          screenshotBase64: pending.screenshotBase64,
          languages: pending.languages,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
      void queryClient.invalidateQueries({ queryKey: ["history"] });
    },
  });
}
