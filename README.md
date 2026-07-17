# Envelope — HTML Email Builder (Enterprise Edition)

A Flask web tool for building production-grade, table-based HTML
marketing and transactional emails, with a live preview, an inbox
mock-up, a reusable template library, and the kind of guardrails
a marketing-ops team actually needs day to day.

**Developed by Anhar Hussan** — [github.com/zerosocialcode](https://github.com/zerosocialcode)

## Feature overview

**Content blocks** (every block is optional — turn it off and it's
simply left out of the exported HTML):
- Header with logo, alt text, and header text
- Full-width hero banner image (with optional click-through link)
- Body heading + copy, with merge-tag shortcuts (`{{first_name}}`,
  `{{company}}`, `{{account_id}}`, `{{unsubscribe_link}}`)
- Two-column image + text feature block (stacks on mobile)
- Primary CTA button + optional secondary/outline button
- Divider line and adjustable spacer
- Social icon row (Facebook, X, LinkedIn, Instagram, YouTube)
- Footer with mailing address and unsubscribe link (CAN-SPAM/GDPR-friendly)

**Workflow & QA tools:**
- Live, debounced preview as you type, rendered in an iframe
- Inbox mock-up showing exactly how the from name / subject /
  preheader will look in a recipient's inbox
- Subject-line length counter and a lightweight deliverability
  ("spam word") checker with a live risk meter
- WCAG contrast checker for the primary button's text/background pair
- Desktop / tablet / mobile preview widths, plus a dark-inbox preview toggle
- Undo / redo history (also via Ctrl+Z / Ctrl+Shift+Z) and Ctrl+S to save
- Brand color presets to recolor buttons, header text, and social icons in one click

**Template library:**
- Five ready-made starter templates (Newsletter, Promotional Sale,
  Welcome Email, Event Invitation, Transactional Receipt)
- Save/load/delete your own templates, stored server-side as JSON
  under `saved_templates/`
- Export/import a design as a portable `.json` file
- One-click "Copy HTML to clipboard" and "Download HTML"

**Send it for real:**
- A "Send" button sends the email you just built straight from the browser
- The first time you use it, you're asked once for the sending email
  address and an app password — these are saved to a local `.env`
  file (git-ignored) so you won't be asked again
- Defaults to Gmail's SMTP server; use "use a different account" in
  the Send dialog to swap accounts, or edit `SMTP_HOST`/`SMTP_PORT`
  in `.env` for another provider

## Run it

```bash
pip install -r requirements.txt
python3 app.py
```

Then open http://127.0.0.1:5000 in your browser.

### Setting up "Send"
The Send button uses Gmail's SMTP server by default and needs an
**app password**, not your normal Google account password:
1. Turn on 2-Step Verification on your Google account, if it isn't already.
2. Go to https://myaccount.google.com/apppasswords and create an app
   password (choose "Mail" as the app).
3. Click "Send" in the builder, enter your Gmail address and the
   16-character app password it gives you, then the recipient address.

These credentials are written to a `.env` file next to `app.py` and
are never sent anywhere except directly to the SMTP server when you
click Send. `.env` is listed in `.gitignore` — don't commit it.

## Project structure

```
app.py                          Flask routes, sanitization, template-library API
templates/index.html            The builder UI
templates/email_template.html   The actual email markup (Jinja2, table-based, inline CSS)
static/style.css                Builder UI styling (light/dark chrome)
static/script.js                Live preview, accordion, undo/redo, spam check, template gallery
saved_templates/                JSON storage for saved designs (git-ignored)
.env                             SMTP credentials for the Send feature (git-ignored, created on first use)
```

## Notes on the generated email HTML
- Uses nested `<table>` layout rather than `<div>`/flexbox, since that's
  still the most reliable way to get consistent rendering across Outlook,
  Gmail, Apple Mail, etc.
- All styling is inlined (no external stylesheet), which is required by
  most email clients that strip `<style>`/`<link>` tags.
- Colors are restricted to valid hex values and URLs are restricted to
  `http(s)://` or `mailto:` schemes as a basic safety measure.
- Optional `color-scheme`/`supported-color-schemes` meta tags for
  email-client dark mode.

## Extending it further
- Swap the JSON-file template store for a real database if this needs
  to serve multiple concurrent authors
- Add authentication before deploying `/download`, `/send`, and the
  template API publicly — right now anyone who can reach the app can
  send from the configured account
- Swap direct SMTP for a transactional ESP API (SendGrid, Postmark,
  SES, etc.) if you need delivery tracking, bounce handling, or higher
  send volume than a personal Gmail account allows
