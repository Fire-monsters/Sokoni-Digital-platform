export type AccountRole = "consumer" | "vendor" | "rider" | "admin" | "agent";

export type OperationalRole = "vendor" | "rider";

export type ApprovalStatus =
  | "not_required"
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "suspended";

export type OnboardingStep =
  | "product_onboarding"
  | "phone_number"
  | "otp_verification"
  | "password_creation"
  | "personal_details"
  | "stall_details"
  | "motorcycle_details"
  | "association_and_next_of_kin"
  | "verification"
  | "review"
  | "pending_approval"
  | "complete";

export interface AuthenticatedProfile {
  userId: string;
  role: AccountRole;
  phoneNumber?: string;
  phoneVerified: boolean;
  approvalStatus: ApprovalStatus;
  trustedDeviceStatus: "not_required" | "unknown" | "pending_approval" | "approved" | "rejected";
}

export interface OnboardingSnapshot {
  role: OperationalRole | "consumer";
  currentStep: OnboardingStep;
  applicationStatus: ApprovalStatus;
  requiredActions: string[];
}

export type AuthSessionState =
  | {
      status: "loading";
    }
  | {
      status: "guest";
    }
  | {
      status: "authenticated";
      profile: AuthenticatedProfile;
      onboarding?: OnboardingSnapshot;
    }
  | {
      status: "error";
      message: string;
    };

export type ProtectedRouteArea = "public" | "auth" | "registration" | "approval" | "operations";

export type AuthRouteDecision =
  | {
      action: "allow";
    }
  | {
      action: "redirect";
      pathname:
        | "/(public)/sign-in"
        | "/(auth)/phone"
        | "/(registration)/personal-details"
        | "/(approval)/pending"
        | "/(approval)/changes-requested"
        | "/(approval)/rejected"
        | "/(approval)/suspended"
        | "/(tabs)";
    };
