import type {
  ApprovalStatus,
  AuthRouteDecision,
  AuthSessionState,
  OnboardingSnapshot,
  ProtectedRouteArea
} from "@sokoni-digital/domain";

export type AuthEvent =
  | {
      type: "session_loading";
    }
  | {
      type: "session_missing";
    }
  | {
      type: "profile_loaded";
      profile: Extract<AuthSessionState, { status: "authenticated" }>["profile"];
      onboarding?: OnboardingSnapshot;
    }
  | {
      type: "session_failed";
      message: string;
    }
  | {
      type: "signed_out";
    };

export function reduceAuthSession(_state: AuthSessionState, event: AuthEvent): AuthSessionState {
  switch (event.type) {
    case "session_loading":
      return { status: "loading" };
    case "session_missing":
    case "signed_out":
      return { status: "guest" };
    case "profile_loaded":
      return {
        status: "authenticated",
        profile: event.profile,
        ...(event.onboarding ? { onboarding: event.onboarding } : {})
      };
    case "session_failed":
      return {
        status: "error",
        message: event.message
      };
    default: {
      const exhaustiveCheck: never = event;
      return exhaustiveCheck;
    }
  }
}

export function getApprovalRoute(approvalStatus: ApprovalStatus): AuthRouteDecision {
  switch (approvalStatus) {
    case "not_required":
    case "approved":
      return { action: "redirect", pathname: "/(tabs)" };
    case "draft":
      return { action: "redirect", pathname: "/(registration)/personal-details" };
    case "submitted":
    case "under_review":
      return { action: "redirect", pathname: "/(approval)/pending" };
    case "changes_requested":
      return { action: "redirect", pathname: "/(approval)/changes-requested" };
    case "rejected":
      return { action: "redirect", pathname: "/(approval)/rejected" };
    case "suspended":
      return { action: "redirect", pathname: "/(approval)/suspended" };
    default: {
      const exhaustiveCheck: never = approvalStatus;
      return exhaustiveCheck;
    }
  }
}

export function decideProtectedRoute(
  session: AuthSessionState,
  area: ProtectedRouteArea
): AuthRouteDecision {
  if (session.status === "loading") {
    return { action: "allow" };
  }

  if (session.status === "guest" || session.status === "error") {
    return area === "public" || area === "auth"
      ? { action: "allow" }
      : { action: "redirect", pathname: "/(public)/sign-in" };
  }

  const { profile } = session;

  if (area === "public" || area === "auth") {
    return getApprovalRoute(profile.approvalStatus);
  }

  if (area === "operations") {
    if (profile.approvalStatus !== "approved" && profile.approvalStatus !== "not_required") {
      return getApprovalRoute(profile.approvalStatus);
    }

    if (profile.trustedDeviceStatus !== "approved" && profile.trustedDeviceStatus !== "not_required") {
      return { action: "redirect", pathname: "/(approval)/pending" };
    }

    return { action: "allow" };
  }

  if (area === "approval") {
    return profile.approvalStatus === "approved" || profile.approvalStatus === "not_required"
      ? { action: "redirect", pathname: "/(tabs)" }
      : { action: "allow" };
  }

  return profile.approvalStatus === "draft"
    ? { action: "allow" }
    : getApprovalRoute(profile.approvalStatus);
}
