import { z } from "zod";

export * from "./vendor-order.js";
export * from "./quality-check.js";
export * from "./delivery.js";

export const ugandanPhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^(?:\+256|0)(?:7[0-9]|3[0-9])[0-9]{7}$/, "Enter a valid Ugandan phone number.");

export function normalizeUgandanPhoneNumber(phoneNumber: string): string {
  const trimmed = phoneNumber.trim().replace(/\s+/g, "");

  if (trimmed.startsWith("0")) {
    return `+256${trimmed.slice(1)}`;
  }

  return trimmed;
}

export function parseUgandanPhoneNumber(
  phoneNumber: string,
): { success: true; phoneNumber: string } | { success: false; message: string } {
  const normalized = normalizeUgandanPhoneNumber(phoneNumber);
  const result = ugandanPhoneNumberSchema.safeParse(normalized);

  if (!result.success) {
    return {
      success: false,
      message: "Enter a valid Ugandan phone number.",
    };
  }

  return {
    success: true,
    phoneNumber: normalized,
  };
}

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, "Enter the 6-digit verification code.");

export function parseOtpCode(
  otpCode: string,
): { success: true; otpCode: string } | { success: false; message: string } {
  const normalized = otpCode.trim().replace(/\s+/g, "");
  const result = otpCodeSchema.safeParse(normalized);

  if (!result.success) {
    return {
      success: false,
      message: "Enter the 6-digit verification code.",
    };
  }

  return {
    success: true,
    otpCode: normalized,
  };
}

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .regex(/[A-Z]/, "Use at least one uppercase letter.")
  .regex(/[a-z]/, "Use at least one lowercase letter.")
  .regex(/[0-9]/, "Use at least one number.");

export function parsePasswordPair(
  password: string,
  passwordConfirmation: string,
): { success: true; password: string } | { success: false; message: string } {
  const result = passwordSchema.safeParse(password);

  if (!result.success) {
    return {
      success: false,
      message: result.error.issues[0]?.message ?? "Enter a stronger password.",
    };
  }

  if (password !== passwordConfirmation) {
    return {
      success: false,
      message: "Passwords must match.",
    };
  }

  return {
    success: true,
    password,
  };
}

export const personalIdentityDetailsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  nationalIdNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{8,20}$/, "Enter a valid National ID number."),
});

export function parsePersonalIdentityDetails(input: {
  fullName: string;
  nationalIdNumber: string;
}):
  | { success: true; fullName: string; nationalIdNumber: string }
  | { success: false; fieldErrors: { fullName?: string; nationalIdNumber?: string } } {
  const result = personalIdentityDetailsSchema.safeParse(input);

  if (!result.success) {
    const fieldErrors: { fullName?: string; nationalIdNumber?: string } = {};

    for (const issue of result.error.issues) {
      const fieldName = issue.path[0];

      if (fieldName === "fullName" || fieldName === "nationalIdNumber") {
        fieldErrors[fieldName] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    fullName: result.data.fullName.trim(),
    nationalIdNumber: result.data.nationalIdNumber.trim().toUpperCase(),
  };
}

export const vendorStallDetailsSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business or stall name."),
  stallNumber: z.string().trim().min(1, "Enter your Kitooro stall number."),
  productCategories: z
    .array(z.string().trim().min(1))
    .min(1, "Choose at least one product category."),
  marketIdentificationNumber: z.string().trim().min(3, "Enter your market identification number."),
});

export function parseVendorStallDetails(input: {
  businessName: string;
  stallNumber: string;
  productCategories: string[];
  marketIdentificationNumber: string;
}):
  | {
      success: true;
      businessName: string;
      stallNumber: string;
      productCategories: string[];
      marketIdentificationNumber: string;
    }
  | {
      success: false;
      fieldErrors: {
        businessName?: string;
        stallNumber?: string;
        productCategories?: string;
        marketIdentificationNumber?: string;
      };
    } {
  const result = vendorStallDetailsSchema.safeParse(input);

  if (!result.success) {
    const fieldErrors: {
      businessName?: string;
      stallNumber?: string;
      productCategories?: string;
      marketIdentificationNumber?: string;
    } = {};

    for (const issue of result.error.issues) {
      const fieldName = issue.path[0];

      if (
        fieldName === "businessName" ||
        fieldName === "stallNumber" ||
        fieldName === "productCategories" ||
        fieldName === "marketIdentificationNumber"
      ) {
        fieldErrors[fieldName] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    businessName: result.data.businessName.trim(),
    stallNumber: result.data.stallNumber.trim().toUpperCase(),
    productCategories: result.data.productCategories.map((category) => category.trim()),
    marketIdentificationNumber: result.data.marketIdentificationNumber.trim().toUpperCase(),
  };
}

export const riderMotorcycleDetailsSchema = z.object({
  motorcycleNumberPlate: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,12}$/, "Enter a valid motorcycle number plate."),
  vehicleType: z.enum(["motorcycle", "bicycle", "tuk-tuk"], {
    error: "Choose a vehicle type.",
  }),
  primaryOperatingArea: z.string().trim().min(2, "Enter your primary operating area."),
});

export function parseRiderMotorcycleDetails(input: {
  motorcycleNumberPlate: string;
  vehicleType: "motorcycle" | "bicycle" | "tuk-tuk" | "";
  primaryOperatingArea: string;
}):
  | {
      success: true;
      motorcycleNumberPlate: string;
      vehicleType: "motorcycle" | "bicycle" | "tuk-tuk";
      primaryOperatingArea: string;
    }
  | {
      success: false;
      fieldErrors: {
        motorcycleNumberPlate?: string;
        vehicleType?: string;
        primaryOperatingArea?: string;
      };
    } {
  const result = riderMotorcycleDetailsSchema.safeParse(input);

  if (!result.success) {
    const fieldErrors: {
      motorcycleNumberPlate?: string;
      vehicleType?: string;
      primaryOperatingArea?: string;
    } = {};

    for (const issue of result.error.issues) {
      const fieldName = issue.path[0];

      if (
        fieldName === "motorcycleNumberPlate" ||
        fieldName === "vehicleType" ||
        fieldName === "primaryOperatingArea"
      ) {
        fieldErrors[fieldName] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    motorcycleNumberPlate: result.data.motorcycleNumberPlate.trim().toUpperCase(),
    vehicleType: result.data.vehicleType,
    primaryOperatingArea: result.data.primaryOperatingArea.trim(),
  };
}

export const vendorVerificationDetailsSchema = z.object({
  hasMarketLeadershipApproval: z.boolean().refine((value) => value, {
    message: "Confirm market leadership approval.",
  }),
  hasAcceptedPlatformTerms: z.boolean().refine((value) => value, {
    message: "Accept the platform terms.",
  }),
  hasAcceptedCommissionTerms: z.boolean().refine((value) => value, {
    message: "Accept the commission terms.",
  }),
});

export function parseVendorVerificationDetails(input: {
  hasMarketLeadershipApproval: boolean;
  hasAcceptedPlatformTerms: boolean;
  hasAcceptedCommissionTerms: boolean;
}):
  | {
      success: true;
      hasMarketLeadershipApproval: true;
      hasAcceptedPlatformTerms: true;
      hasAcceptedCommissionTerms: true;
    }
  | {
      success: false;
      fieldErrors: {
        hasMarketLeadershipApproval?: string;
        hasAcceptedPlatformTerms?: string;
        hasAcceptedCommissionTerms?: string;
      };
    } {
  const result = vendorVerificationDetailsSchema.safeParse(input);

  if (!result.success) {
    const fieldErrors: {
      hasMarketLeadershipApproval?: string;
      hasAcceptedPlatformTerms?: string;
      hasAcceptedCommissionTerms?: string;
    } = {};

    for (const issue of result.error.issues) {
      const fieldName = issue.path[0];

      if (
        fieldName === "hasMarketLeadershipApproval" ||
        fieldName === "hasAcceptedPlatformTerms" ||
        fieldName === "hasAcceptedCommissionTerms"
      ) {
        fieldErrors[fieldName] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    hasMarketLeadershipApproval: true,
    hasAcceptedPlatformTerms: true,
    hasAcceptedCommissionTerms: true,
  };
}

export const riderAssociationDetailsSchema = z.object({
  riderAssociation: z.string().trim().min(2, "Enter your rider association."),
  associationIdentifier: z.string().trim().min(2, "Enter your association identifier."),
  nextOfKinName: z.string().trim().min(2, "Enter your next-of-kin name."),
  nextOfKinPhone: ugandanPhoneNumberSchema,
  nextOfKinRelationship: z.string().trim().min(2, "Enter your next-of-kin relationship."),
});

export function parseRiderAssociationDetails(input: {
  riderAssociation: string;
  associationIdentifier: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  nextOfKinRelationship: string;
}):
  | {
      success: true;
      riderAssociation: string;
      associationIdentifier: string;
      nextOfKinName: string;
      nextOfKinPhone: string;
      nextOfKinRelationship: string;
    }
  | {
      success: false;
      fieldErrors: {
        riderAssociation?: string;
        associationIdentifier?: string;
        nextOfKinName?: string;
        nextOfKinPhone?: string;
        nextOfKinRelationship?: string;
      };
    } {
  const result = riderAssociationDetailsSchema.safeParse({
    ...input,
    nextOfKinPhone: normalizeUgandanPhoneNumber(input.nextOfKinPhone),
  });

  if (!result.success) {
    const fieldErrors: {
      riderAssociation?: string;
      associationIdentifier?: string;
      nextOfKinName?: string;
      nextOfKinPhone?: string;
      nextOfKinRelationship?: string;
    } = {};

    for (const issue of result.error.issues) {
      const fieldName = issue.path[0];

      if (
        fieldName === "riderAssociation" ||
        fieldName === "associationIdentifier" ||
        fieldName === "nextOfKinName" ||
        fieldName === "nextOfKinPhone" ||
        fieldName === "nextOfKinRelationship"
      ) {
        fieldErrors[fieldName] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    riderAssociation: result.data.riderAssociation.trim(),
    associationIdentifier: result.data.associationIdentifier.trim().toUpperCase(),
    nextOfKinName: result.data.nextOfKinName.trim(),
    nextOfKinPhone: result.data.nextOfKinPhone,
    nextOfKinRelationship: result.data.nextOfKinRelationship.trim(),
  };
}

export const riderVerificationDetailsSchema = z.object({
  hasAssociationConfirmation: z.boolean().refine((value) => value, {
    message: "Confirm rider association verification.",
  }),
  hasAcceptedPlatformTerms: z.boolean().refine((value) => value, {
    message: "Accept the platform terms.",
  }),
  hasAcceptedSafetyTerms: z.boolean().refine((value) => value, {
    message: "Accept the rider safety terms.",
  }),
});

export function parseRiderVerificationDetails(input: {
  hasAssociationConfirmation: boolean;
  hasAcceptedPlatformTerms: boolean;
  hasAcceptedSafetyTerms: boolean;
}):
  | {
      success: true;
      hasAssociationConfirmation: true;
      hasAcceptedPlatformTerms: true;
      hasAcceptedSafetyTerms: true;
    }
  | {
      success: false;
      fieldErrors: {
        hasAssociationConfirmation?: string;
        hasAcceptedPlatformTerms?: string;
        hasAcceptedSafetyTerms?: string;
      };
    } {
  const result = riderVerificationDetailsSchema.safeParse(input);

  if (!result.success) {
    const fieldErrors: {
      hasAssociationConfirmation?: string;
      hasAcceptedPlatformTerms?: string;
      hasAcceptedSafetyTerms?: string;
    } = {};

    for (const issue of result.error.issues) {
      const fieldName = issue.path[0];

      if (
        fieldName === "hasAssociationConfirmation" ||
        fieldName === "hasAcceptedPlatformTerms" ||
        fieldName === "hasAcceptedSafetyTerms"
      ) {
        fieldErrors[fieldName] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    hasAssociationConfirmation: true,
    hasAcceptedPlatformTerms: true,
    hasAcceptedSafetyTerms: true,
  };
}
