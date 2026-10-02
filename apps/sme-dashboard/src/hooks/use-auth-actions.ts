import { useMutation, useQueryClient } from "@tanstack/react-query";
import { businessAuth } from "@/services/business-auth";

export function useAuthActions() {
  const queryClient = useQueryClient();
  return {
    login: useMutation({
      mutationFn: (input: { phoneNumber: string; password: string }) =>
        businessAuth.login(input.phoneNumber, input.password),
      onSuccess: () => queryClient.clear(),
    }),
    register: useMutation({
      mutationFn: (input: { phoneNumber: string; password: string }) =>
        businessAuth.register(input.phoneNumber, input.password),
    }),
    verify: useMutation({
      mutationFn: (input: { phoneNumber: string; otpCode: string }) =>
        businessAuth.verify(input.phoneNumber, input.otpCode),
      onSuccess: () => queryClient.clear(),
    }),
    resend: useMutation({ mutationFn: (phoneNumber: string) => businessAuth.resend(phoneNumber) }),
    logout: useMutation({
      mutationFn: () => businessAuth.logout(),
      onSuccess: () => queryClient.clear(),
    }),
  };
}
