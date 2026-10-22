# FindBack Supabase setup

The connected FindBack project already has the SQL changes below applied, including `setup_report_chats.sql`. If you deploy this code to another Supabase project, run the SQL files in this order:

1. `setup_profile_contact_terms.sql`
2. `setup_items_storage.sql`
3. `setup_tracking_and_reporter_resolution.sql`
4. `setup_admin_dashboard_access.sql`
5. `setup_president_admin_management.sql`
6. `setup_profile_photo.sql`
7. `secure_photo_access.sql` (for an already-deployed project; this replaces the broad photo-read policy)
8. `setup_report_chats.sql` (removes report contact-field reads and adds persistent private report chats)

Sign-up accepts an optional JPG, PNG, WebP, or GIF profile photo up to 5 MB. The photo is held locally until email verification establishes a signed-in session, then uploaded to the private `item-images` bucket under the user's own folder and saved as `profiles.avatar_path`.

The item photo viewer requests five-minute signed URLs through the current Supabase session, with Storage RLS authorizing each request. Storage read policies allow report photos referenced by a report visible under the `items` table's RLS policies, the signed-in user's own profile photo, and the existing admin policy. This preserves the current signed-in report-browsing behavior; it does not make reports private between signed-in users. Before applying `secure_photo_access.sql`, confirm that policy impact matches the intended audience for report listings. The migration can be reverted with `rollback_secure_photo_access.sql`, which restores the prior broad read policy and is therefore less restrictive. The connected project had no legacy HTTP image URLs when checked; app-created image references are Storage object paths.

The viewer blocks context menus and dragging on displayed item photos as basic deterrents. These measures cannot stop screenshots, screen recording, developer tools, or saving an image from a still-valid signed URL.

Run `setup_president_admin_management.sql` after the earlier SQL files. Deploy `functions/create-admin/index.ts` as `create-admin` and `functions/remove-admin/index.ts` as `remove-admin`, with JWT verification enabled. They validate the caller's live Auth session. Super Admins and the President can create or remove regular Admins; only the President can create or demote Super Admins. The President account itself cannot be removed through this dashboard.

The Auth trigger grants `super_admin` to `govind-admin@findback.com` and `president` to `govindpandit295@gmail.com`. The connected project account `govindpandit295@gmail.com` is assigned the President role by `grant_president_govindpandit.sql`. Login sends all three admin roles to `FBPU-admin.html`; public pages show the Admin Dashboard navigation link only to these roles.

`setup_report_chats.sql` enables persistent private report chats. The dedicated `chats.html` page fills the browser window, with Lost and Found tabs. A conversation appears under the type of the current user's own linked report (lost-item reporters see Lost; found-item reporters see Found). Starting a chat from a matching report links the user's opposite-type report when available. The reporter and the person who contacted them can read and send messages; Super Admins and the President can review conversation history. Regular Admins and other users cannot read those chats. Messages support private image, document, audio, and video attachments up to 15 MB; images, videos, audio, and PDFs can be previewed in the chat. The script revokes Data API read access to report contact name, email, and phone columns so contact details are no longer exposed through report listings.

## Email OTP setup (required for signup only)

Email confirmation and outgoing mail are Supabase project settings; deploying the website does not change them. In the Supabase Dashboard for this project:

1. Open **Authentication → Sign In / Providers → Email** and enable **Confirm email**. This makes Supabase require verified email before password sign-in. The signup page will route a new account to `verify-otp.html` when Supabase returns no session, as expected with email confirmation enabled.
2. Open **Authentication → Email Templates → Confirm signup**. Set the subject to `Your FindBack verification code` and replace the body with `signup-email-template.html`. The body must contain `{{ .Token }}` and must not contain `{{ .ConfirmationURL }}` if you want a six-digit code instead of a confirmation link. The signup page verifies the code with Supabase `verifyOtp` using `type: "email"`; resend uses `auth.resend({ type: "signup", email })`.
3. Save the signup template and request a fresh email. Supabase templates are hosted in the project dashboard; the HTML file in this repository is the copy/paste source. Login and signup use email and password. Forgot password sends a standard Supabase password reset link and lets the user set a new password after opening it.

For password recovery, open **Authentication → Email Templates → Reset Password** and make sure the message uses Supabase's `{{ .ConfirmationURL }}` link (not a recovery OTP template). The link returns to `reset-password.html`, where the user enters a new password.

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

Set the Supabase **Site URL** to the real production app origin (the deployed FindBack domain, never localhost). Add the full production and local `reset-password.html` URLs to Supabase **Authentication → URL Configuration → Redirect URLs** so password reset links return to FindBack. If signup email contains a localhost link instead of a code, the hosted confirmation template has not been replaced/saved, or a different template is sending that message.

## Local verification

Serve the `FindBack-src/FindBack` directory on localhost (for example with VS Code Live Server), then test with accounts you control. Confirm signup with its six-digit email code, and verify forgot-password sends a reset link that opens the password update form. Open **Chats** from the home page and confirm the participant names and saved messages appear for each chat participant.

The signup verification page asks for the email again and does not store the email, password, or OTP in browser storage. This repository can validate browser-side code, but actual email delivery, template rendering, and SMTP settings must be verified in the connected Supabase project after the dashboard settings are saved.
