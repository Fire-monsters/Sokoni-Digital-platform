# E-Katale Phase 1 Implementation Prompt for Codex

You are working as a senior full-stack TypeScript engineer and product-minded mobile architect inside the existing **E-Katale monorepo**.

Your task is to implement **Phase 1: authentication, role-specific onboarding, OTP recovery, trusted-device registration, and administrator approval** using clean, production-quality code and a consistent UI architecture.

Do not rebuild the repository from scratch. First inspect the existing codebase, database types, migrations, package conventions, linting rules, TypeScript configuration, and application structure. Preserve working conventions unless there is a strong technical reason to improve them.

---

## 1. Existing technology stack

Use the existing stack:

- Monorepo: pnpm workspaces and Turborepo

- Mobile: Expo and React Native

- Routing: Expo Router

- Operations dashboard: React, Vite and TypeScript

- Backend: Express.js and TypeScript

- Database: Supabase PostgreSQL

- Authentication: Supabase Auth

- Storage: Supabase Storage

- Server-state management: TanStack Query

- Local workflow state: Zustand

- Validation: Zod

- Testing: Vitest, Jest or the testing tools already configured in each workspace

- Styling: use the existing styling approach in the repository; do not introduce a second styling framework unnecessarily

Applications:

```text
apps/
├── consumer-mobile/
├── vendor-mobile/
├── rider-mobile/
├── operations-web/
└── api/
```

Shared packages:

```text
packages/
├── api-client/
├── auth/
├── config/
├── database-types/
├── domain/
├── localization/
├── observability/
├── offline-sync/
├── test-utils/
├── ui/
└── validation/
```

---

## 2. Phase 1 objective

Implement the complete authentication and onboarding foundation for:

1. Consumers

2. Vendors

3. Riders

4. E-Katale administrators and agents

The system must support:

- Guest browsing for consumers

- Google authentication for consumers

- Phone number and password authentication for vendors and riders

- Phone OTP verification

- OTP password recovery

- Exactly one operational role per account

- Vendor onboarding and document submission

- Rider onboarding and document submission

- Administrator review and approval

- Approval, rejection and changes-requested states

- Trusted-device registration

- One active approved device for vendors and riders

- Protected application routes

- Low-bandwidth-friendly interfaces

- Resumable onboarding

- Clear audit records for sensitive actions

---

## 3. Mandatory engineering rules

### 3.1 Inspect before modifying

Before writing code:

1. Inspect the root `package.json`.

2. Inspect `pnpm-workspace.yaml`.

3. Inspect `turbo.json`.

4. Inspect all existing database migrations.

5. Inspect generated Supabase types.

6. Inspect the existing Express application structure.

7. Inspect shared UI, domain, auth, validation and API client packages.

8. Inspect the existing route structures in all applications.

9. Run the current lint, type-check and tests before changing anything.

Report any existing failures separately from failures introduced by your work.

### 3.2 Do not duplicate server state

Use **TanStack Query** for all server-owned data, including:

- Supabase session

- Authenticated profile

- Vendor application

- Rider application

- Approval status

- Verification documents

- Trusted devices

- Administrator queues

- Application review details

Use **Zustand only for temporary local workflow state**, including:

- Current onboarding step

- Temporary unsaved form data

- Selected language

- Onboarding slides already viewed

- Local reduced-data preference

- Camera capture workflow

- Temporary upload progress

- Temporary UI filters

Do not copy full API responses into Zustand.

### 3.3 Security boundaries

Never:

- Store passwords in public database tables

- Expose the Supabase service-role key to mobile or web clients

- Let the client assign administrator roles

- Let the client approve its own onboarding application

- Trust a role sent from an unvalidated client request

- Allow direct unrestricted writes to approval status

- Expose private verification documents through public URLs

- Treat a device model, IMEI or Android ID as the sole trusted-device identifier

Sensitive operations must go through Express.

### 3.4 Type safety

- Use strict TypeScript.

- Avoid `any`.

- Use discriminated unions for authentication and approval states.

- Use generated Supabase database types.

- Use Zod schemas for every request body, route parameter and environment variable.

- Define shared response types in the domain package.

- Use exhaustive `switch` statements for state transitions.

### 3.5 Error handling

Use the existing API response format.

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request was invalid.",
    "details": [],
    "requestId": "uuid"
  }
}
```

Every backend response must include the request ID.

Do not expose stack traces or provider secrets in production responses.

---

## 4. Product onboarding requirement

Each role must have exactly **two short product-introduction screens** before registration or application entry.

These are not the full registration forms. They are short value-proposition screens.

## 4.1 Consumer onboarding

### Screen 1

Headline:

```text
Kitooro Market,
closer to you
```

Supporting text:

```text
Find fresh produce, ready-to-cook food and household essentials from trusted local vendors.
```

### Screen 2

Headline:

```text
Delivery or market pickup
```

Supporting text:

```text
Choose affordable delivery by a registered rider, schedule your order or collect it from the market.
```

Actions:

```text
Primary: Explore the market
Secondary: Sign in
```

Consumers must be able to continue into guest browsing without authentication.

## 4.2 Vendor onboarding

### Screen 1

Headline:

```text
Take your stall online
```

Supporting text:

```text
Show customers what is available, receive orders and reach more buyers around Entebbe.
```

### Screen 2

Headline:

```text
Manage orders with ease
```

Supporting text:

```text
Update availability, prepare customer orders and track your online sales from one simple application.
```

Actions:

```text
Primary: Register my stall
Secondary: I already have an account
```

## 4.3 Rider onboarding

### Screen 1

Headline:

```text
Deliver and earn
```

Supporting text:

```text
Receive nearby delivery requests from Kitooro Market and choose the trips that work for you.
```

### Screen 2

Headline:

```text
Every delivery, clearly guided
```

Supporting text:

```text
See pickup details, customer contacts and delivery progress even when the network is unstable.
```

Actions:

```text
Primary: Register as a rider
Secondary: Sign in
```

---

## 5. Design-system requirements

Build a reusable, consistent design system in `packages/ui`.

Do not duplicate button, input, card or status implementations across applications.

Use or adapt these design tokens:

```text
Primary green:       #1F7A4D
Primary dark:        #145C39
Primary light:       #EAF6EF

Accent yellow:       #FFC83D
Accent orange:       #F58A3A

Background:          #F8FAF8
Surface:             #FFFFFF
Surface muted:       #EFF3F0

Text primary:        #17211B
Text secondary:      #5E6A63
Border:              #DCE4DF

Success:             #218A52
Warning:             #D98212
Error:               #C93F3F
Information:         #2878B5
```

Use an eight-point spacing system.

Recommended typography:

```text
Display:      32 / 38, Bold
Heading 1:    28 / 34, Bold
Heading 2:    24 / 30, Semibold
Heading 3:    20 / 26, Semibold
Body large:   17 / 25, Regular
Body:         15 / 22, Regular
Label:        14 / 18, Medium
Caption:      12 / 16, Regular
```

Create or improve these reusable components:

```text
AppScreen
AppText
AppButton
AppIconButton
AppTextField
PhoneNumberField
PasswordField
OtpInput
SearchField
SelectField
Checkbox
RadioCard
StatusBadge
ProgressHeader
OnboardingSlide
OnboardingIllustration
InfoCard
VerificationCard
UploadCard
BottomActionBar
EmptyState
ErrorState
OfflineBanner
ApprovalStatusCard
LanguageSelector
NetworkAwareImage
LoadingScreen
ConfirmationDialog
```

Every interactive component must support appropriate states:

```text
default
focused
pressed
loading
disabled
error
offline
```

Requirements:

- Minimum accessible touch targets

- Visible focus states on web

- Proper labels for screen readers

- Correct keyboard configuration

- Password visibility toggle

- Loading and disabled protection against duplicate submissions

- Small-screen support

- Keyboard-safe forms

- Reduced-motion compatibility where practical

- No hardcoded application-specific strings in generic components

---

## 6. Authentication state machine

Model authentication as a discriminated union.

Required states:

```text
loading
unauthenticated
authenticated_incomplete
pending_approval
changes_requested
approved
rejected
suspended
```

Example:

```typescript
type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated_incomplete";
      userId: string;
      role: "vendor" | "rider" | "consumer";
    }
  | {
      status: "pending_approval";
      userId: string;
      role: "vendor" | "rider";
      applicationId: string;
    }
  | {
      status: "changes_requested";
      userId: string;
      role: "vendor" | "rider";
      applicationId: string;
      note: string;
    }
  | {
      status: "approved";
      userId: string;
      role: "vendor" | "rider" | "consumer" | "admin";
    }
  | {
      status: "rejected";
      userId: string;
      role: "vendor" | "rider";
      reason: string;
    }
  | {
      status: "suspended";
      userId: string;
      role: "vendor" | "rider" | "consumer";
      reason?: string;
    };
```

Implement route protection through Expo Router.

Users must never see approved operational routes when their application is pending, rejected or incomplete.

---

## 7. Route structures

Implement or align the vendor application with:

```text
apps/vendor-mobile/app/
├── _layout.tsx
├── index.tsx
├── (public)/
│   ├── onboarding/
│   │   ├── index.tsx
│   │   └── benefits.tsx
│   └── sign-in.tsx
├── (auth)/
│   ├── phone.tsx
│   ├── verify-otp.tsx
│   ├── create-password.tsx
│   ├── forgot-password.tsx
│   ├── verify-recovery-otp.tsx
│   ├── create-new-password.tsx
│   └── password-reset-success.tsx
├── (registration)/
│   ├── personal-details.tsx
│   ├── stall-details.tsx
│   ├── verification.tsx
│   └── review.tsx
├── (approval)/
│   ├── pending.tsx
│   ├── changes-requested.tsx
│   ├── rejected.tsx
│   └── suspended.tsx
└── (app)/
    ├── _layout.tsx
    └── (tabs)/
        ├── index.tsx
        ├── orders.tsx
        ├── listings.tsx
        └── profile.tsx
```

Implement the same structural pattern for riders, replacing vendor-specific registration pages with:

```text
personal-details
motorcycle-details
association-and-next-of-kin
verification
review
```

The consumer application must support:

```text
Guest browsing
Google authentication
Phone confirmation before first paid checkout
Profile completion
Protected checkout
```

---

## 8. Vendor onboarding flow

Required sequence:

```text
Product onboarding
→ Phone number
→ OTP verification
→ Password creation
→ Personal details
→ Stall details
→ Verification documents
→ Review
→ Submit
→ Pending approval
```

Collect:

### Account

```text
Phone number
OTP
Password
Password confirmation
Preferred language
```

### Personal details

```text
Full name
Profile photograph
National ID number
National ID front image
National ID back image
```

### Stall details

```text
Business or stall name
Kitooro stall number
Product categories
Market identification number
Market identification image
```

### Verification

```text
Market leadership approval
Stall photograph
Agreement to platform terms
Agreement to commission terms
```

Support:

- Draft saving

- Resume after application restart

- Validation per step

- Upload progress

- Image compression before upload

- Weak-network retry

- Review before final submission

- Changes-requested resubmission

Do not permit submitted identity or role data to be edited without a controlled correction workflow.

---

## 9. Rider onboarding flow

Required sequence:

```text
Product onboarding
→ Phone number
→ OTP verification
→ Password creation
→ Personal details
→ Motorcycle details
→ Association and next-of-kin
→ Verification
→ Review
→ Submit
→ Pending approval
```

Collect:

### Account

```text
Phone number
OTP
Password
Preferred language
```

### Personal details

```text
Full name
Rider photograph
National ID number
National ID front image
National ID back image
```

### Motorcycle details

```text
Motorcycle number plate
Motorcycle photograph
Vehicle type
Primary operating area
```

### Safety and association

```text
Rider association
Association identifier
Next-of-kin name
Next-of-kin phone
Next-of-kin relationship
```

Support the same draft, resume, validation, compression and resubmission behavior as vendor onboarding.

---

## 10. Consumer authentication flow

Consumers must not be forced to register before browsing.

Required flow:

```text
Open application
→ View two onboarding screens
→ Browse as guest
→ Add products to cart
→ Proceed to checkout
→ Continue with Google
→ Confirm phone number
→ Complete address
→ Continue checkout
```

Do not implement unnecessary consumer identity verification in Phase 1.

The guest cart must survive authentication and be merged into the authenticated session safely.

---

## 11. Supabase authentication behavior

Implement:

### Consumers

```text
Google OAuth
Automatic consumer profile creation
No administrator approval
Phone confirmation before first paid checkout
```

### Vendors and riders

```text
Phone number and password
OTP phone verification
One role per account
Administrator approval required
OTP password recovery
```

Rules:

- Normalize Ugandan phone numbers consistently.

- Prefer E.164 storage.

- Validate `+256` numbers.

- Never reveal whether a phone number exists during password recovery.

- Add cooldown handling for OTP resend.

- Handle expired OTPs.

- Handle invalid OTPs.

- Protect against duplicate submission.

- Map Supabase errors into user-friendly application errors.

---

## 12. Database and migration work

Inspect the existing schema first. Reuse existing tables where possible.

Only create a new migration for missing Phase 1 structures.

Expected structures may include:

```text
vendor_applications
rider_applications
verification_documents
trusted_devices
application_review_events
auth_audit_events
```

Use enums or constrained values for:

```text
draft
submitted
under_review
changes_requested
approved
rejected
suspended
```

Requirements:

- RLS enabled

- Users can read their own application

- Users can update only draft or changes-requested applications

- Users cannot approve themselves

- Administrators can review applications

- Verification documents remain private

- Review actions are audited

- Role-changing operations are restricted

- Application submission is transactional

- Approval is transactional

- Device approval is transactional

- Every status change has a history record

Do not directly modify generated database types. Regenerate them after migrations.

---

## 13. Verification document storage

Create or configure a private bucket for identity and onboarding documents.

Recommended path structure:

```text
verification-documents/{user_id}/{application_type}/{document_type}/{filename}
```

Requirements:

- Private bucket

- No public URLs

- Upload only to the authenticated user’s own path

- User can read their own documents

- Authorized administrators can read review documents

- Signed URLs issued by the backend when needed

- Image size and MIME type validation

- On-device compression

- Filename sanitization

- No service-role key in the client

- Rejected documents remain auditable instead of being silently overwritten

---

## 14. Trusted-device registration

Implement an application-level trusted-device system.

Vendor and rider policy:

```text
Maximum approved active devices: 1
```

Generate a random installation UUID on first app launch and store it securely.

Do not use IMEI.

Required flow:

```text
Approved user signs in
→ Client sends installation ID
→ Backend checks trusted devices
→ Unknown device triggers OTP verification
→ User completes OTP
→ Device registration request is created
→ First device may be approved automatically
→ Replacement device requires administrator approval
```

Device statuses should support:

```text
pending
trusted
rejected
revoked
```

Store:

```text
User ID
Installation ID
Platform
Application role
Device display name
Push token
Trusted timestamp
Last-seen timestamp
Revocation timestamp
```

Ensure revoked devices lose operational access.

---

## 15. Password recovery

Implement:

```text
Enter phone number
→ Send recovery OTP
→ Enter OTP
→ Verify OTP
→ Create new password
→ Revoke or review old sessions
→ Require device verification
```

Requirements:

- Generic response whether or not account exists

- OTP resend cooldown

- Failed-attempt handling

- Expired-code handling

- New-password validation

- Password confirmation

- Audit event

- Trusted-device reassessment after reset

- Clear success screen

---

## 16. Administrator operations dashboard

Implement Phase 1 sections in `apps/operations-web`.

Required pages:

```text
Authentication
Application queue
Vendor application review
Rider application review
Changes-requested queue
Trusted-device requests
User suspension controls
```

Application queue filters:

```text
submitted
under_review
changes_requested
approved
rejected
suspended
role
market
submission date
```

Application review screen:

```text
Applicant information
Phone verification status
Application timeline
Submitted documents
Stall or motorcycle details
Association information
Internal review notes
Approve action
Request changes action
Reject action
Suspend action
```

Sensitive actions must:

- Use confirmation dialogs

- Require a reason when rejecting or requesting changes

- Go through Express

- Write audit records

- Invalidate TanStack Query caches

- Surface success and failure states clearly

---

## 17. Backend endpoints

Follow the repository’s existing module structure.

Implement or adapt endpoints similar to:

```text
POST /v1/auth/vendor/register
POST /v1/auth/rider/register
POST /v1/auth/send-otp
POST /v1/auth/verify-otp
POST /v1/auth/sign-in
POST /v1/auth/recovery/request
POST /v1/auth/recovery/verify
POST /v1/auth/recovery/reset-password

GET  /v1/me
GET  /v1/me/onboarding
PATCH /v1/me/vendor-application
PATCH /v1/me/rider-application
POST /v1/me/application/submit

POST /v1/me/verification-documents/sign-upload
POST /v1/me/verification-documents/complete

GET  /v1/me/trusted-devices
POST /v1/me/trusted-devices/challenge
POST /v1/me/trusted-devices/verify
DELETE /v1/me/trusted-devices/:deviceId

GET  /v1/admin/applications
GET  /v1/admin/applications/:applicationId
POST /v1/admin/applications/:applicationId/start-review
POST /v1/admin/applications/:applicationId/approve
POST /v1/admin/applications/:applicationId/request-changes
POST /v1/admin/applications/:applicationId/reject
POST /v1/admin/users/:userId/suspend

GET  /v1/admin/device-requests
POST /v1/admin/device-requests/:requestId/approve
POST /v1/admin/device-requests/:requestId/reject
POST /v1/admin/trusted-devices/:deviceId/revoke
```

Do not blindly create all endpoints if equivalent routes already exist. Reuse and refactor where appropriate.

---

## 18. API module organization

Prefer feature-based backend modules:

```text
apps/api/src/modules/
├── auth/
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.repository.ts
│   ├── auth.schemas.ts
│   ├── auth.routes.ts
│   └── auth.errors.ts
├── onboarding/
│   ├── onboarding.controller.ts
│   ├── onboarding.service.ts
│   ├── onboarding.repository.ts
│   ├── onboarding.schemas.ts
│   └── onboarding.routes.ts
├── verification-documents/
├── trusted-devices/
└── administration/
```

Responsibilities:

- Controllers: HTTP concerns only

- Services: business logic

- Repositories: database access

- Schemas: Zod input validation

- Routes: route definitions and middleware

- Errors: typed domain errors

Do not place all Phase 1 logic in one file.

---

## 19. Shared API client

Implement typed API methods in `packages/api-client`.

Requirements:

- Shared request wrapper

- Authorization header handling

- Request ID propagation

- Timeout handling

- Abort signal support

- Typed success responses

- Typed API errors

- No duplicated fetch logic in screens

- TanStack Query hooks should use shared client methods

Organize by domain:

```text
packages/api-client/src/
├── client.ts
├── errors.ts
├── auth.ts
├── onboarding.ts
├── verification-documents.ts
├── trusted-devices.ts
└── administration.ts
```

---

## 20. Forms and validation

Use shared Zod schemas where validation rules apply to both frontend and backend.

Recommended package:

```text
packages/validation/src/
├── phone.ts
├── password.ts
├── vendor-application.ts
├── rider-application.ts
├── verification-document.ts
└── trusted-device.ts
```

Requirements:

- Ugandan phone normalization

- Strong but usable password validation

- Exact error messages

- Validation per onboarding step

- Full validation before submission

- Server revalidation

- No reliance on client validation alone

---

## 21. Low-bandwidth requirements

Phase 1 must work reasonably on weak networks.

Implement:

- Text-first screens

- Small image assets

- Compressed uploads

- Upload retry

- Visible offline banner

- Cached current onboarding state

- Resumable uploads where practical

- No unnecessary background requests

- Appropriate TanStack Query stale times

- Avoid refetch-on-focus for stable onboarding reference data

- Skeletons instead of blocking spinners where suitable

- Clear “saved locally” and “synced” indicators

- Do not claim server submission succeeded until confirmed

Do not cache passwords or OTP codes.

---

## 22. Localization structure

Prepare English, Luganda and Swahili namespaces, even if English is completed first.

Recommended structure:

```text
packages/localization/src/locales/
├── en/
│   ├── common.json
│   ├── auth.json
│   ├── vendor-onboarding.json
│   └── rider-onboarding.json
├── lg/
└── sw/
```

Do not hardcode onboarding text directly inside screens when a localization system already exists.

---

## 23. Testing requirements

Add meaningful tests.

### Backend unit tests

Test:

- Phone normalization

- Role validation

- Application status transitions

- Approval authorization

- Changes-requested resubmission

- Trusted-device limits

- Recovery flows

- Error mapping

### Backend integration tests

Test:

- Vendor registration

- Rider registration

- OTP verification behavior

- Application submission

- Administrator approval

- Rejection and requested changes

- Unauthorized approval attempt

- Trusted-device replacement

- Suspended-user access

### Mobile component tests

Test:

- Onboarding navigation

- Form validation

- OTP input

- Loading states

- Error states

- Approval-state rendering

- Protected route decisions

### Database tests

Test:

- RLS ownership

- Administrative access

- Self-approval denial

- Document privacy

- Application transition restrictions

- Trusted-device uniqueness

- Audit-event creation

All new tests must run in CI.

---

## 24. Logging and observability

Use structured logs.

Log:

```text
Request ID
Authenticated user ID
Role
Operation
Application ID
Device request ID
Result
Duration
```

Do not log:

```text
Passwords
OTP codes
Access tokens
Refresh tokens
National ID image URLs
Full service-role credentials
```

Audit events should cover:

```text
account_created
phone_verified
application_submitted
application_review_started
application_approved
application_changes_requested
application_rejected
account_suspended
password_reset
trusted_device_requested
trusted_device_approved
trusted_device_rejected
trusted_device_revoked
```

---

## 25. Implementation order

Work in this order.

### Step 1 — Repository analysis

- Inspect the codebase.

- Identify reusable structures.

- Document required migrations.

- Run baseline checks.

### Step 2 — Shared design system

- Add tokens.

- Build foundational components.

- Add Storybook only if already supported; do not introduce it unless justified.

- Add component tests.

### Step 3 — Domain and validation contracts

- Authentication states

- Application status types

- Request and response schemas

- Phone and password validation

- Shared API contracts

### Step 4 — Database migration

- Missing application tables

- Verification documents

- Trusted devices

- Review history

- Audit events

- RLS and indexes

- Database tests

- Regenerate database types

### Step 5 — Backend authentication

- Registration

- OTP verification

- Sign-in

- Recovery

- Profile bootstrap

- Auth middleware

### Step 6 — Backend onboarding

- Draft application updates

- Submission

- Document registration

- Application state retrieval

- Resume support

### Step 7 — Admin approval backend

- Queue

- Review

- Approval

- Request changes

- Rejection

- Suspension

- Audit events

### Step 8 — Trusted-device backend

- Challenge

- OTP confirmation

- Registration

- Replacement request

- Approval and revocation

### Step 9 — Mobile product onboarding

- Two screens per role

- Guest consumer entry

- Vendor and rider registration entry

- Local completion flag

### Step 10 — Mobile authentication

- Phone and password

- OTP

- Recovery

- Session restoration

- Protected routes

### Step 11 — Role onboarding forms

- Vendor

- Rider

- Draft saving

- Uploads

- Review

- Submission

- Approval states

### Step 12 — Operations web

- Queues

- Review

- Actions

- Trusted-device requests

### Step 13 — Verification

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:reset
pnpm db:test
pnpm db:types
```

Ensure generated database types have no uncommitted drift.

---

## 26. Expected output from each Codex work cycle

Do not attempt to implement the entire phase as one unreviewable change.

For each work cycle:

1. State the selected subtask.

2. List files inspected.

3. Explain important architectural decisions.

4. Implement the smallest coherent production-ready slice.

5. Add or update tests.

6. Run relevant validation commands.

7. Report:

   - Files created

   - Files changed

   - Migrations added

   - Tests added

   - Commands run

   - Results

   - Remaining work

   - Risks or assumptions

Do not claim a command passed unless it was actually executed successfully.

---

## 27. Code-quality expectations

The implementation must be:

- Modular

- Typed

- Testable

- Secure

- Accessible

- Consistent across applications

- Appropriate for low-bandwidth conditions

- Easy for another engineer to understand

- Free of unnecessary abstraction

- Free of duplicated business logic

- Free of giant components and giant service files

- Free of placeholder production logic

Avoid:

- Premature microservices

- Redux

- Duplicated server data in Zustand

- Hardcoded roles throughout components

- Direct Supabase administrative writes from clients

- One universal onboarding form for all roles

- Massive shared components with many unrelated props

- Silent error swallowing

- Optimistic approval or authentication status changes

- UI-only authorization

- Untracked schema changes

---

## 28. Definition of done

Phase 1 is complete only when:

- Consumers can browse as guests.

- Consumer Google authentication works.

- Consumer guest carts survive authentication.

- Vendor phone/password registration works.

- Rider phone/password registration works.

- OTP verification works.

- OTP recovery works.

- Each account has one role.

- Vendor onboarding is resumable.

- Rider onboarding is resumable.

- Verification documents are private.

- Applications can be submitted.

- Administrators can review applications.

- Administrators can approve, reject and request changes.

- Unapproved users cannot access operational routes.

- Suspended users cannot access operational routes.

- Trusted-device registration works.

- Second-device requests require approval.

- Revoked devices lose access.

- Product onboarding contains two screens per role.

- UI components are shared and consistent.

- TanStack Query owns server state.

- Zustand owns local workflow state only.

- RLS and API authorization are tested.

- Audit events are recorded.

- CI passes.

- Local Supabase can be rebuilt from migrations.

- Database types are regenerated and committed.

---

## 29. Begin now

Start with **repository analysis and the shared design-system foundation**.

Do not immediately implement every Phase 1 feature.

First:

1. Inspect the existing repository.

2. Run baseline validation.

3. Identify the current UI and routing conventions.

4. Propose the exact files to create or modify.

5. Implement design tokens and the first reusable components.

6. Implement the two vendor onboarding introduction screens as the first vertical slice.

7. Add tests.

8. Run lint, type-check, tests and the relevant application build.

9. Report the results and the recommended next slice.
