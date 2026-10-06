# Yaqeen authentication emails

All 13 localized Supabase email templates were redesigned and applied on 2026-10-06. Each saved HTML body was copied back after reload and matched the prepared file exactly. The design uses a navy header, bright blue buttons, pale blue backgrounds, compact spacing, and the current app icon at `https://app.yaqeenguide.com/icon.png`. That public PNG was verified to match `web/src/app/icon.png` exactly.

The 14 bilingual HTML copies use the same design. Localized emails retain English/Arabic selection and right-to-left layout; authentication variables and security notes are preserved. No email was sent as part of this redesign, and no SMTP, notification, redirect, or application settings were changed.

The 14 remote Resend templates remain historical **drafts**. They are not used by the live Supabase SMTP flow. `resend-drafts.json` remains the original export for recovery; it has not been regenerated or applied to Resend.

## Review

Open `preview.html` in a browser for desktop/mobile sample previews. The sandboxed preview disables action links and uses fake data. The dropdown covers 26 localized versions and 14 bilingual copies. Run `python3 supabase/templates/check_templates.py` from the repository root to check variables, locale rendering, icon markup, payload consistency, and safe preview links.

`templates.json` contains subjects, file names, Supabase template keys, Resend draft links, and required variables. Resend drafts contain the verified HTML and plain-text versions. The MCP visual editor reported successful saves but returned empty content, so the prepared HTML was restored and read back exactly; drafts use HTML mode. `resend-drafts.json` is a local content backup (HTML, text, editor document).

| Template | Supabase slot | Resend draft |
| --- | --- | --- |
| confirm-signup | `confirmation` | [Review draft](https://resend.com/templates/7b4db5a1-de61-43f6-a1f9-15bc20f645a8) |
| sign-in | `magic_link` | [Review draft](https://resend.com/templates/b1a6615a-2697-49ab-92ee-0bc261babbae) |
| sign-in-otp | Alternative body for `magic_link` | [Review draft](https://resend.com/templates/6f824cd2-d4e1-4002-9f30-53302d779029) |
| reset-password | `recovery` | [Review draft](https://resend.com/templates/76c438c7-db5c-405a-b38d-a4858f4d3fd0) |
| invitation | `invite` | [Review draft](https://resend.com/templates/297c317f-6d69-4d18-b5db-9a97f0356d24) |
| change-email | `email_change` | [Review draft](https://resend.com/templates/0db0d92a-7377-4c27-bfc3-cd2fb55f2eb8) |
| reauthentication | `reauthentication` | [Review draft](https://resend.com/templates/fa1dca75-89c1-44ac-999e-c4e5a031c93b) |
| password-changed | `password_changed_notification` | [Review draft](https://resend.com/templates/609e08b0-2d8d-4e18-a097-dcf91860d939) |
| email-changed | `email_changed_notification` | [Review draft](https://resend.com/templates/5063b2ee-2ae0-4f71-bd8c-c59d88be658e) |
| phone-changed | `phone_changed_notification` | [Review draft](https://resend.com/templates/e601c291-4e8b-4d44-9080-0a9a211b3b2b) |
| sign-in-method-linked | `identity_linked_notification` | [Review draft](https://resend.com/templates/72e5d7b0-dddc-4408-86f9-61553c0cdfd3) |
| sign-in-method-removed | `identity_unlinked_notification` | [Review draft](https://resend.com/templates/c3d1afd1-3d69-4303-ab8d-38d89c078d10) |
| verification-method-added | `mfa_factor_enrolled_notification` | [Review draft](https://resend.com/templates/b2ea477c-d4ea-4102-b15b-709c80349370) |
| verification-method-removed | `mfa_factor_unenrolled_notification` | [Review draft](https://resend.com/templates/73db0a72-b64d-4395-b655-20c46fd08095) |

## Prepared Supabase copies

The individual HTML files use Supabase Go template variables, including `{{ .ConfirmationURL }}`, `{{ .Token }}`, and notification-specific fields. Preserve `ConfirmationURL`: Supabase generates the verification URL with the redirect requested by the app.

`supabase-auth-draft.json` is an **unapplied** Management API template/subject payload. It contains no notification enablement flags and has not been sent to Supabase. There is no Auth-template configuration tool in the connected Supabase MCP; the MCP was used to confirm the project and check its documented Auth variables.

The sign-in-code email is an alternative for the magic-link slot, not an additional Supabase event. It is not included in the draft configuration payload. The current app uses email/password login and Google OAuth; neither sends a normal sign-in email. Its existing email flows are sign-up confirmation and forgot-password recovery. Magic-link/OTP login, invitations, email changes, reauthentication, phone changes, and MFA templates are prepared for those flows if enabled later; no application flow was added.

Security notification templates are applied in Supabase. Delivery still depends on the existing notification settings.

## Resend variable mapping

Supabase and Resend use different template engines. Resend copies use triple-brace variables, supplied by the caller:

| Supabase | Resend |
| --- | --- |
| `{{ .ConfirmationURL }}` | `{{{CONFIRMATION_URL}}}` |
| `{{ .SiteURL }}` | `{{{SITE_URL}}}` |
| `{{ .Token }}` | `{{{TOKEN}}}` |
| `{{ .NewEmail }}` | `{{{NEW_EMAIL}}}` |
| `{{ .OldEmail }}` | `{{{OLD_EMAIL}}}` |
| `{{ .Email }}` | `{{{ACCOUNT_EMAIL}}}` |
| `{{ .OldPhone }}` | `{{{OLD_PHONE}}}` |
| `{{ .Phone }}` | `{{{PHONE}}}` |
| `{{ .Provider }}` | `{{{PROVIDER}}}` |
| `{{ .FactorType }}` | `{{{FACTOR_TYPE}}}` |

`CONFIRMATION_URL` must come from Supabase for the particular auth event; `TOKEN` must be that event's actual OTP. `SITE_URL` must be the configured trusted app origin. Never use preview values for real authentication. Escape user-controlled text variables as HTML before substitution into raw Resend HTML.

Using Resend as Supabase SMTP delivers the HTML configured **in Supabase**; it does not automatically select these Resend API template drafts. Using Resend API templates requires a separate Send Email hook/integration, which has not been created. No sender defaults were set.

Preserve the existing `/auth/callback/` signup redirect and `/reset-password/` recovery redirect. Keep email link tracking disabled so the provider does not rewrite authentication links. The redesign was verified through exact dashboard readback and desktop/mobile previews; real email delivery was not triggered for this appearance-only update.

Sources: [Supabase Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Resend templates](https://resend.com/docs/dashboard/templates/introduction).
