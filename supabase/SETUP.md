# FindBack Supabase setup

The connected FindBack project already has the SQL changes below applied. If you deploy this code to another Supabase project, run the SQL files in this order:

1. `setup_profile_contact_terms.sql`
2. `setup_items_storage.sql`
3. `setup_tracking_and_reporter_resolution.sql`
4. `setup_admin_dashboard_access.sql`
5. `setup_president_admin_management.sql`
6. `setup_profile_photo.sql`

Sign-up accepts an optional JPG, PNG, WebP, or GIF profile photo up to 5 MB. The photo is held locally until email verification establishes a signed-in session, then uploaded to the private `item-images` bucket under the user's own folder and saved as `profiles.avatar_path`.

Run `setup_president_admin_management.sql` after the earlier SQL files. Deploy `functions/create-admin/index.ts` as `create-admin` and `functions/remove-admin/index.ts` as `remove-admin`, with JWT verification enabled. They validate the caller's live Auth session. Super Admins and the President can create or remove regular Admins; only the President can create or demote Super Admins. The President account itself cannot be removed through this dashboard.

The Auth trigger grants `super_admin` to `govind-admin@findback.com` and `president` to `govindpandit295@gmail.com`. The connected project account `govindpandit295@gmail.com` is assigned the President role by `grant_president_govindpandit.sql`. Login sends all three admin roles to `FBPU-admin.html`; public pages show the Admin Dashboard navigation link only to these roles.

## Email OTP setup (required for signup and recovery)

Email confirmation and outgoing mail are Supabase project settings; deploying the website does not change them. In the Supabase Dashboard for this project:

1. Open **Authentication → Sign In / Providers → Email** and enable **Confirm email**. This makes Supabase require verified email before password sign-in. The signup page will route a new account to `verify-otp.html` when Supabase returns no session, as expected with email confirmation enabled.
2. Open **Authentication → Email Templates → Confirm signup**. Set the subject to `Your FindBack verification code` and replace the body with `signup-email-template.html`. The body must contain `{{ .Token }}` and must not contain `{{ .ConfirmationURL }}` if you want a six-digit code instead of a confirmation link. The signup page verifies the code with Supabase `verifyOtp` using `type: "email"`; resend uses `auth.resend({ type: "signup", email })`.
3. Open **Authentication → Email Templates → Reset Password**. Set the subject to `Your FindBack password reset code` and replace the body with `recovery-email-template.html`. The body must contain `{{ .Token }}` and must not contain `{{ .ConfirmationURL }}` or another link. The reset page verifies this code as a `recovery` OTP and updates the password only after Supabase creates a recovery session.
4. Save each template and request a fresh email. Supabase templates are hosted in the project dashboard; the HTML files in this repository are copy/paste sources.

### Configure Gmail SMTP

For delivery to arbitrary user addresses, configure custom SMTP in **Authentication → Settings → SMTP Settings** (the built-in Supabase mail service is for limited testing and may only deliver to project team members). In Google Account security settings, enable 2-Step Verification and create an **App Password** for mail; do not use the regular Gmail password. Store the App Password only in the Supabase Dashboard.

Use these values in Supabase's custom SMTP form:

- SMTP host: `smtp.gmail.com`
- SMTP port: `587` (STARTTLS; port `465` is also supported by Gmail)
- SMTP username: the full Gmail address
- SMTP password: the Google App Password
- Sender email: the same Gmail address
- Sender name: `FindBack`

Keep the SMTP password and Supabase secret/service-role keys out of this repository and all browser JavaScript. Gmail and Google Workspace policies can restrict SMTP/App Password availability; use another SMTP provider if Google does not offer App Passwords for the account.

Set the Supabase **Site URL** to the real production app origin (the deployed FindBack domain, never localhost). Add the exact local development origin and production origin to the redirect allow list only if other Auth callbacks need them. These OTP flows don't send a redirect URL and both email templates use only `{{ .Token }}`, so the flows do not depend on clickable localhost links. If an email still contains one, the hosted template has not been replaced/saved, or a different template is sending that message.

## Local verification

Serve the `FindBack-src/FindBack` directory on localhost (for example with VS Code Live Server), then test with an email account you control. Sign up, read the six-digit message, enter it on `verify-otp.html`, and confirm the app returns to `index.html`. Then use **Forgot password?**, enter the account email, verify its six-digit recovery code, set a new password, and sign in with it. Test an incorrect/expired code and the resend cooldown as well. Never test with fake codes or by placing codes/passwords in browser storage.

The signup verification page asks for the email again and does not store the email, password, or OTP in browser storage. This repository can validate browser-side code, but actual email delivery, template rendering, and SMTP settings must be verified in the connected Supabase project after the dashboard settings are saved.
