# Envelope — HTML Email Builder

A Flask-based web application for building production-grade, table-based HTML emails designed for marketing and transactional use cases. The platform features a live preview system, inbox rendering mock-up, reusable template library, and comprehensive quality assurance tools tailored for marketing operations teams.

## Overview

Envelope provides a complete solution for email template development and management, with built-in compliance features and quality controls to ensure reliable email delivery and rendering across clients.

## Features

### Content Blocks
All content blocks are modular and optional—disable any block and it will be excluded from the exported HTML:

- Header with logo, alt text, and header text
- Full-width hero banner image with optional click-through link
- Body copy with merge-tag support (`{{first_name}}`, `{{company}}`, `{{account_id}}`, `{{unsubscribe_link}}`)
- Two-column image and text feature block (responsive mobile stacking)
- Primary and optional secondary/outline call-to-action buttons
- Divider line and adjustable spacer elements
- Social icon row (Facebook, X, LinkedIn, Instagram, YouTube)
- Footer with mailing address and unsubscribe link (CAN-SPAM/GDPR compliant)

### Workflow and Quality Assurance Tools

- **Live preview** with real-time rendering in iframe as you edit
- **Inbox mock-up** showing exact rendering of sender name, subject line, and preheader text
- **Subject line analysis** including character counter and lightweight deliverability checker with risk meter
- **WCAG compliance checker** for button text and background color contrast ratios
- **Responsive preview modes** for desktop, tablet, and mobile viewports, plus dark-mode inbox preview
- **History management** with undo/redo functionality (Ctrl+Z / Ctrl+Shift+Z) and Ctrl+S save shortcut
- **Brand color presets** for one-click recoloring of buttons, headers, and social icons

### Template Library

- Five professionally designed starter templates (Newsletter, Promotional Sale, Welcome Email, Event Invitation, Transactional Receipt)
- Server-side template storage as JSON files
- Export and import designs as portable `.json` files
- One-click export functionality (copy HTML to clipboard or download)

### Email Sending Capabilities

- Integrated Send feature for testing and delivery directly from the builder
- One-time configuration for sending email credentials stored in `.env` (not version-controlled)
- Gmail SMTP support by default with option to configure alternative providers
- Support for app password authentication with optional account switching

## Getting Started

### Installation

```bash
pip install -r requirements.txt
python3 app.py
```

Open http://127.0.0.1:5000 in your browser.

### Configuring Email Send

The Send feature requires Gmail SMTP configuration:

1. Enable 2-Step Verification on your Google account
2. Generate an app password at https://myaccount.google.com/apppasswords (select "Mail")
3. Click Send in the builder, enter your Gmail address and the 16-character app password, then specify the recipient

Credentials are stored in a `.env` file and transmitted only to the SMTP server. The `.env` file is git-ignored and should never be committed to version control.

## Project Structure

```
app.py                          Flask application, routing, sanitization, template API
templates/index.html            Builder user interface
templates/email_template.html   Email markup (Jinja2, table-based, inline CSS)
static/style.css                UI styling (light/dark themes)
static/script.js                Preview rendering, undo/redo, validation, template gallery
saved_templates/                Server-side template storage (git-ignored)
.env                             SMTP credentials (git-ignored, auto-created)
```

## Technical Details

### Email Markup Standards

- **Table-based layout**: Nested `<table>` elements ensure consistent rendering across Outlook, Gmail, Apple Mail, and other clients
- **Inline CSS**: All styles are inlined—external stylesheets are stripped by most email clients
- **Security**: Colors are validated as hex values; URLs are restricted to `http(s)://` or `mailto:` schemes
- **Dark mode support**: Optional `color-scheme` and `supported-color-schemes` meta tags for email client dark mode

## Future Enhancements

Consider these improvements for production deployments:

- Replace JSON file storage with a database backend for multi-user environments
- Implement authentication for `/download`, `/send`, and template API endpoints before public deployment
- Integrate with transactional email services (SendGrid, Postmark, AWS SES) for delivery tracking, bounce handling, and higher send volumes

## Author

Developed by Anhar Hussan. Visit the [GitHub profile](https://github.com/zerosocialcode) for additional projects and contributions.
