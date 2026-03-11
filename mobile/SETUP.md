# Sova App Setup Guide

## Overview

Sova is a baby sleep tracking and coaching app powered by ChatGPT. It allows parents to track sleep sessions, get AI-powered recommendations, and share access with multiple parents.

## Features

- **Sleep Tracking**: Log naps and night sleep with real-time timers
- **Multi-Parent Support**: Share baby profiles with multiple parents (e.g., mom and dad)
- **Real-time Sync**: All parents see sleep updates instantly
- **ChatGPT Recommendations**: Get personalized sleep coaching based on baby's age and sleep patterns
- **Proactive Alerts**: Get notified when it's time to put baby down for a nap
- **Sleep History**: View past sleep sessions with statistics and charts
- **Wake Window Calculator**: Automatically calculates optimal wake windows based on baby's age

## Prerequisites

- Node.js and npm
- Expo CLI
- Supabase account (or use local Supabase)
- OpenAI API key (for ChatGPT recommendations)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

#### Option A: Local Development (Recommended for testing)

1. Install Supabase CLI: `npm install -g supabase`
2. Start local Supabase: `supabase start`
3. The app is configured to use local Supabase by default (`http://127.0.0.1:54421`)

#### Option B: Production Supabase

1. Create a Supabase project at https://supabase.com
2. Run the migration: `supabase db push` (or apply `supabase/migrations/001_initial_schema.sql` manually)
3. Set environment variables:
   - `EXPO_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon key

### 3. Set Up OpenAI API Key

1. Get an OpenAI API key from https://platform.openai.com
2. For local development, set the environment variable:
   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```
3. For production, set it in your Supabase Edge Function secrets:
   ```bash
   supabase secrets set OPENAI_API_KEY=your_api_key_here
   ```

### 4. Deploy Edge Function (for ChatGPT recommendations)

```bash
supabase functions deploy chatgpt-sleep-coach
```

### 5. Email-to-CSV import (optional)

Users can email a sleep CSV to a unique address (e.g. `import+abc123@in.yourdomain.com`) to import data without using the in-app file picker.

1. **Resend**: Create a [Resend](https://resend.com) account, add a domain (or use their inbound subdomain), and enable **Inbound** for that domain.
2. **Webhook**: In Resend, create a webhook for the `email.received` event. Set the URL to your Edge Function:
   - Production: `https://<project-ref>.supabase.co/functions/v1/import-sleep-email`
   - Save the **webhook signing secret** (`whsec_...`).
3. **Edge Function secrets** (Supabase dashboard or CLI):
   - `RESEND_API_KEY`: Your Resend API key
   - `RESEND_WEBHOOK_SECRET`: The webhook signing secret from step 2
   - `INBOUND_EMAIL_DOMAIN`: The inbound domain (e.g. `in.yourdomain.com`) — must match the domain used in Resend Inbound
4. **Deploy the import function**:
   ```bash
   supabase functions deploy import-sleep-email
   ```
5. **App config**: Set the same inbound domain in your app so the Settings screen can show the import address:
   - `EXPO_PUBLIC_SLEEP_IMPORT_INBOUND_DOMAIN=in.yourdomain.com` (in `.env` or EAS env)

### 6. Caregiver invitations (optional)

When you invite another parent/caregiver, the app sends an email via Resend so they know to open the app and accept. If the person doesn't have an account yet, the invitation is stored in `baby_invitations`; when they sign up with that email, they're automatically added to `baby_parents` so they can accept in the app.

1. **Resend API key**: Uses the same `RESEND_API_KEY` as the import feature. If you've set up step 5, you're ready.
2. **Deploy the invite function**:
   ```bash
   supabase functions deploy send-caregiver-invite
   ```
3. **Optional**: Set `INVITE_FROM_EMAIL` in Supabase secrets to customize the sender. **Important**: With Resend's free `onboarding@resend.dev` domain, you can only send to your own email. To invite real users, verify your own domain in Resend and set `INVITE_FROM_EMAIL` (e.g. `Sova <noreply@yourdomain.com>`).

### 7. Run the App

```bash
npm start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- `w` for web browser

(If you skipped step 5, the "Import by email" section in Settings will ask you to set `EXPO_PUBLIC_SLEEP_IMPORT_INBOUND_DOMAIN` to enable it.)

## Database Schema

The app uses the following main tables:

- **profiles**: User profiles (linked to Supabase auth)
- **babies**: Baby profiles with birth date
- **baby_parents**: Junction table for sharing babies between parents
- **sleep_sessions**: Sleep logs (naps and night sleep)
- **recommendations**: Stored ChatGPT recommendations

## Usage

1. **Sign Up/Login**: Create an account or sign in
2. **Add Baby**: Set up your baby's profile with name and birth date
3. **Track Sleep**: Use the Today tab to start/end sleep sessions
4. **Get Recommendations**: Visit the Insights tab to get ChatGPT-powered sleep coaching
5. **Share with Partner**: Use the Share button to invite another parent

## Environment Variables

Create a `.env.local` file (optional, defaults work for local dev):

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

For **email-to-CSV import** (optional):

- **App**: `EXPO_PUBLIC_SLEEP_IMPORT_INBOUND_DOMAIN` — inbound email domain (e.g. `in.yourdomain.com`) so Settings can show the import address.
- **Edge Function** (set via Supabase secrets): `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN`.

For **caregiver invitations** (optional):

- **Edge Function** `send-caregiver-invite`: Uses `RESEND_API_KEY`. Optionally set `INVITE_FROM_EMAIL` (e.g. `Sova <noreply@yourdomain.com>`).

## Troubleshooting

- **"Missing Supabase environment variables"**: Make sure Supabase is running locally or environment variables are set
- **ChatGPT recommendations not working**: Check that the Edge Function is deployed and OPENAI_API_KEY is set
- **Real-time updates not working**: Ensure Supabase Realtime is enabled in your project settings

## Notes

- The app uses Row Level Security (RLS) to ensure parents can only access their shared babies
- All sleep data is synced in real-time between parents
- Wake windows are calculated based on baby's age using evidence-based guidelines



