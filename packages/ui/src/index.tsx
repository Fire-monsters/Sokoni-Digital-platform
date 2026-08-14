import { useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  primary: "#1F7A4D",
  primaryDark: "#145C39",
  primaryLight: "#EAF6EF",
  accentYellow: "#FFC83D",
  accentOrange: "#F58A3A",
  background: "#F8FAF8",
  surface: "#FFFFFF",
  surfaceMuted: "#EFF3F0",
  textPrimary: "#17211B",
  textSecondary: "#5E6A63",
  border: "#DCE4DF",
  success: "#218A52",
  warning: "#D98212",
  error: "#C93F3F",
  information: "#2878B5",
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "700" },
  heading1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  heading2: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  heading3: { fontSize: 20, lineHeight: 26, fontWeight: "600" },
  bodyLarge: { fontSize: 17, lineHeight: 25, fontWeight: "400" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} as const satisfies Record<string, TextStyle>;

interface AppScreenProps {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function AppScreen({ children, scroll = false, style, contentStyle }: AppScreenProps) {
  const content = <View style={[styles.screenContent, contentStyle]}>{children}</View>;

  return (
    <SafeAreaView style={[styles.screen, style]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

type AppTextVariant = keyof typeof typography;

interface AppTextProps {
  children: ReactNode;
  variant?: AppTextVariant;
  color?: "primary" | "secondary" | "inverse";
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function AppText({
  children,
  variant = "body",
  color = "primary",
  align,
  style,
  numberOfLines,
}: AppTextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        typography[variant],
        textColorStyles[color],
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

type AppButtonVariant = "primary" | "secondary" | "ghost";

interface AppButtonProps {
  label: string;
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

interface AppTextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string | undefined;
  error?: string | undefined;
  disabled?: boolean;
  keyboardType?: TextInputProps["keyboardType"] | undefined;
  textContentType?: TextInputProps["textContentType"] | undefined;
  autoComplete?: TextInputProps["autoComplete"] | undefined;
  secureTextEntry?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppTextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  disabled = false,
  keyboardType,
  textContentType,
  autoComplete,
  secureTextEntry = false,
  style,
}: AppTextFieldProps) {
  return (
    <View style={[styles.field, style]}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoComplete={autoComplete}
        editable={!disabled}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secureTextEntry}
        style={[
          styles.textInput,
          error ? styles.textInputError : null,
          disabled ? styles.textInputDisabled : null,
        ]}
        textContentType={textContentType}
        value={value}
      />
      {error ? (
        <AppText color="secondary" style={styles.fieldError} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

interface PhoneNumberFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export function PhoneNumberField({
  value,
  onChangeText,
  error,
  disabled = false,
}: PhoneNumberFieldProps) {
  return (
    <AppTextField
      autoComplete="tel"
      disabled={disabled}
      error={error}
      keyboardType="phone-pad"
      label="Phone number"
      onChangeText={onChangeText}
      placeholder="+256 7XX XXX XXX"
      textContentType="telephoneNumber"
      value={value}
    />
  );
}

interface PasswordFieldProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  autoComplete?: TextInputProps["autoComplete"] | undefined;
}

export function PasswordField({
  label = "Password",
  value,
  onChangeText,
  error,
  disabled = false,
  autoComplete = "new-password",
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <View
        style={[
          styles.passwordInputShell,
          error ? styles.textInputError : null,
          disabled ? styles.textInputDisabled : null,
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoComplete={autoComplete}
          editable={!disabled}
          onChangeText={onChangeText}
          placeholder="Enter password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={!isVisible}
          style={styles.passwordInput}
          textContentType="password"
          value={value}
        />
        <Pressable
          accessibilityLabel={isVisible ? "Hide password" : "Show password"}
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => {
            setIsVisible((currentValue) => !currentValue);
          }}
          style={styles.passwordToggle}
        >
          <AppText color="secondary" variant="label">
            {isVisible ? "Hide" : "Show"}
          </AppText>
        </Pressable>
      </View>
      {error ? (
        <AppText color="secondary" style={styles.fieldError} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

interface OtpInputProps {
  value: string;
  onChangeText: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  length?: number;
}

export function OtpInput({
  value,
  onChangeText,
  error,
  disabled = false,
  length = 6,
}: OtpInputProps) {
  const inputRef = useRef<TextInput>(null);
  const sanitizedValue = value.replace(/\D/g, "").slice(0, length);

  return (
    <View style={styles.field}>
      <AppText variant="label">Verification code</AppText>
      <TextInput
        accessibilityLabel="Verification code"
        autoComplete="sms-otp"
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={length}
        ref={inputRef}
        onChangeText={(nextValue) => {
          onChangeText(nextValue.replace(/\D/g, "").slice(0, length));
        }}
        placeholder="000000"
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.otpInput,
          error ? styles.textInputError : null,
          disabled ? styles.textInputDisabled : null,
        ]}
        textContentType="oneTimeCode"
        value={sanitizedValue}
      />
      <Pressable
        accessibilityLabel="Enter verification code"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          inputRef.current?.focus();
        }}
        style={styles.otpSlots}
      >
        {Array.from({ length }, (_, index) => (
          <View
            key={index}
            style={[styles.otpSlot, sanitizedValue[index] ? styles.otpSlotFilled : null]}
          >
            <AppText variant="heading3">{sanitizedValue[index] ?? ""}</AppText>
          </View>
        ))}
      </Pressable>
      {error ? (
        <AppText color="secondary" style={styles.fieldError} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

interface UploadCardProps {
  title: string;
  description: string;
  actionLabel?: string;
  status?: "empty" | "ready" | "uploading" | "error";
  onPress?: () => void;
  disabled?: boolean;
}

export function UploadCard({
  title,
  description,
  actionLabel = "Add file",
  status = "empty",
  onPress,
  disabled = false,
}: UploadCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.uploadCard,
        status === "ready" ? styles.uploadCardReady : null,
        status === "error" ? styles.uploadCardError : null,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <View style={styles.uploadCardCopy}>
        <AppText variant="label">{title}</AppText>
        <AppText color="secondary" variant="caption">
          {description}
        </AppText>
      </View>
      <AppText style={styles.uploadCardAction} variant="label">
        {status === "uploading" ? "Uploading" : actionLabel}
      </AppText>
    </Pressable>
  );
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonVariantStyles[variant],
        pressed && !isDisabled ? styles.buttonPressed : null,
        isDisabled ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.surface : colors.primary} />
      ) : (
        <AppText
          variant="label"
          color={variant === "primary" ? "inverse" : "primary"}
          style={variant === "ghost" ? styles.ghostButtonText : styles.buttonText}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

type OnboardingIllustrationVariant = "market" | "delivery";

interface OnboardingIllustrationProps {
  variant: OnboardingIllustrationVariant;
}

export function OnboardingIllustration({ variant }: OnboardingIllustrationProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.illustration,
        variant === "market" ? styles.marketIllustration : styles.deliveryIllustration,
      ]}
    >
      <View style={styles.sun} />
      <View style={styles.stallRoof} />
      <View style={styles.stallBody}>
        <View style={styles.crate} />
        <View style={[styles.crate, styles.crateAccent]} />
      </View>
      {variant === "delivery" ? (
        <View style={styles.deliveryPath}>
          <View style={styles.pickupPin} />
          <View style={styles.deliveryPin} />
        </View>
      ) : null}
    </View>
  );
}

interface OnboardingSlideProps {
  headline: string;
  supportingText: string;
  illustration: OnboardingIllustrationVariant;
  currentStep: number;
  totalSteps: number;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
}

export function OnboardingSlide({
  headline,
  supportingText,
  illustration,
  currentStep,
  totalSteps,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
}: OnboardingSlideProps) {
  return (
    <View style={styles.slide}>
      <View style={styles.slideHeader}>
        <OnboardingIllustration variant={illustration} />
        <View style={styles.progressDots}>
          {Array.from({ length: totalSteps }, (_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index + 1 === currentStep ? styles.progressDotActive : null,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.slideCopy}>
        <AppText variant="display">{headline}</AppText>
        <AppText variant="bodyLarge" color="secondary">
          {supportingText}
        </AppText>
      </View>

      {primaryActionLabel || secondaryActionLabel ? (
        <View style={styles.slideActions}>
          {primaryActionLabel ? (
            <AppButton label={primaryActionLabel} onPress={onPrimaryAction} />
          ) : null}
          {secondaryActionLabel ? (
            <AppButton label={secondaryActionLabel} onPress={onSecondaryAction} variant="ghost" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

interface InfoCardProps {
  title: string;
  description: string;
  aside?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

interface AppTopBarProps {
  title: string;
  backIcon: ReactNode;
  onBack: () => void;
  actionIcon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function AppTopBar({
  title,
  backIcon,
  onBack,
  actionIcon,
  actionLabel = "Open settings",
  onAction,
}: AppTopBarProps) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onBack}
        style={({ pressed }) => [styles.iconButton, pressed ? styles.buttonPressed : null]}
      >
        {backIcon}
      </Pressable>
      <AppText align="center" numberOfLines={1} style={styles.topBarTitle} variant="heading3">
        {title}
      </AppText>
      {actionIcon && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          hitSlop={12}
          onPress={onAction}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.buttonPressed : null]}
        >
          {actionIcon}
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

interface ProfileSummaryCardProps {
  name: string;
  roleLabel: string;
  contact?: string;
  statusLabel?: string;
}

export function ProfileSummaryCard({
  name,
  roleLabel,
  contact,
  statusLabel,
}: ProfileSummaryCardProps) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => /[A-Za-z0-9]/.exec(part)?.[0]?.toUpperCase())
      .filter(Boolean)
      .join("") || "EK";

  return (
    <View style={styles.profileSummary}>
      <View accessibilityLabel={`${name} profile picture placeholder`} style={styles.avatar}>
        <AppText color="inverse" variant="heading2">
          {initials}
        </AppText>
      </View>
      <View style={styles.profileSummaryCopy}>
        <AppText variant="heading2">{name}</AppText>
        {contact ? <AppText color="secondary">{contact}</AppText> : null}
        <View style={styles.profilePills}>
          <View style={styles.rolePill}>
            <AppText style={styles.rolePillText} variant="caption">
              {roleLabel}
            </AppText>
          </View>
          {statusLabel ? (
            <View style={styles.statusPill}>
              <AppText variant="caption">{statusLabel}</AppText>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export interface ProfileDetail {
  label: string;
  value: string;
  hint?: string;
}

export function ProfileDetailSection({
  title,
  details,
}: {
  title: string;
  details: readonly ProfileDetail[];
}) {
  return (
    <View style={styles.detailSection}>
      <AppText variant="heading3">{title}</AppText>
      <View style={styles.detailCard}>
        {details.map((detail, index) => (
          <View
            key={`${detail.label}-${String(index)}`}
            style={[styles.detailRow, index > 0 ? styles.detailRowBorder : null]}
          >
            <View style={styles.detailCopy}>
              <AppText color="secondary" variant="caption">
                {detail.label}
              </AppText>
              <AppText variant="label">{detail.value}</AppText>
              {detail.hint ? (
                <AppText color="secondary" variant="caption">
                  {detail.hint}
                </AppText>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

interface SettingsRowProps {
  title: string;
  description: string;
  value?: string;
  onPress?: () => void;
  trailingIcon?: ReactNode;
}

export function SettingsRow({
  title,
  description,
  value,
  onPress,
  trailingIcon,
}: SettingsRowProps) {
  const content = (
    <>
      <View style={styles.settingsRowCopy}>
        <AppText variant="label">{title}</AppText>
        <AppText color="secondary" variant="caption">
          {description}
        </AppText>
      </View>
      {value ? (
        <AppText color="secondary" variant="caption">
          {value}
        </AppText>
      ) : null}
      {trailingIcon}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed ? styles.settingsRowPressed : null]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.settingsRow}>{content}</View>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.detailSection}>
      <AppText variant="heading3">{title}</AppText>
      <View style={styles.settingsCard}>{children}</View>
    </View>
  );
}

export function InfoCard({ title, description, aside, style }: InfoCardProps) {
  return (
    <View style={[styles.infoCard, style]}>
      <View style={styles.infoCardCopy}>
        <AppText variant="heading3">{title}</AppText>
        <AppText color="secondary">{description}</AppText>
      </View>
      {aside ? <View>{aside}</View> : null}
    </View>
  );
}

function createPressedStyle(
  baseStyle: ViewStyle,
): (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return ({ pressed }) => [baseStyle, pressed ? styles.buttonPressed : null];
}

export const pressableStyles = {
  createPressedStyle,
};

const textColorStyles = StyleSheet.create({
  primary: {
    color: colors.textPrimary,
  },
  secondary: {
    color: colors.textSecondary,
  },
  inverse: {
    color: colors.surface,
  },
});

const buttonVariantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    flex: 1,
    padding: spacing.lg,
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  topBarTitle: {
    flex: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  profileSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
    backgroundColor: colors.primary,
  },
  profileSummaryCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  profilePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  rolePill: {
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  rolePillText: {
    color: colors.primaryDark,
    fontWeight: "600",
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  detailSection: {
    gap: spacing.sm,
  },
  detailCard: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  settingsCard: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  settingsRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsRowPressed: {
    backgroundColor: colors.primaryLight,
  },
  settingsRowCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  scrollContent: {
    flexGrow: 1,
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonText: {
    textAlign: "center",
  },
  ghostButtonText: {
    color: colors.primary,
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  field: {
    gap: spacing.xs,
  },
  textInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  textInputError: {
    borderColor: colors.error,
  },
  textInputDisabled: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textSecondary,
  },
  fieldError: {
    color: colors.error,
  },
  passwordInputShell: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  passwordInput: {
    flex: 1,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  passwordToggle: {
    minHeight: 48,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  otpInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpSlots: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  otpSlot: {
    width: 44,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  otpSlotFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  uploadCard: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  uploadCardReady: {
    borderStyle: "solid",
    borderColor: colors.success,
    backgroundColor: colors.primaryLight,
  },
  uploadCardError: {
    borderColor: colors.error,
  },
  uploadCardCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  uploadCardAction: {
    color: colors.primary,
  },
  illustration: {
    minHeight: 220,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryLight,
  },
  marketIllustration: {
    backgroundColor: colors.primaryLight,
  },
  deliveryIllustration: {
    backgroundColor: "#EAF4FB",
  },
  sun: {
    position: "absolute",
    top: spacing.lg,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentYellow,
  },
  stallRoof: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: 104,
    height: 48,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: colors.primary,
  },
  stallBody: {
    position: "absolute",
    left: spacing.xl + spacing.sm,
    right: spacing.xl + spacing.sm,
    bottom: spacing.xl,
    height: 84,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: spacing.sm,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  crate: {
    width: 64,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.accentOrange,
  },
  crateAccent: {
    height: 56,
    backgroundColor: colors.primaryDark,
  },
  deliveryPath: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xl,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.information,
  },
  pickupPin: {
    position: "absolute",
    left: 0,
    top: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  deliveryPin: {
    position: "absolute",
    right: 0,
    top: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentOrange,
  },
  slide: {
    flex: 1,
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  slideHeader: {
    gap: spacing.md,
  },
  progressDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  slideCopy: {
    gap: spacing.md,
  },
  slideActions: {
    gap: spacing.sm,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  infoCardCopy: {
    flex: 1,
    gap: spacing.xs,
  },
});
