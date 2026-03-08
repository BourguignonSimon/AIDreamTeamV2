# Operia — Full Deployment Guide

This document provides a comprehensive, step-by-step guide to installing and deploying the Operia platform from scratch.

---

## 🏗️ Prerequisites

Ensure you have the following installed on your local machine:
- **Node.js** (v20 or higher)
- **Supabase CLI** (v1.150 or higher)
- **Git**
- **npm** (comes with Node.js)

---

## 1. Supabase Initialization

### 1.1 Create a Supabase Project
1. Log in to the [Supabase Dashboard](https://supabase.com).
2. Create a new project.
3. Note your **Project Reference ID**, **API URL**, and **service_role key**.

### 1.2 Link Local Environment
Open your terminal in the project root and run:
```bash
supabase login
supabase link --project-ref <your-project-ref>
```

---

## 2. Database Setup

### 2.1 Apply Migrations
Operia uses a sequence of 9 migrations to establish the schema, RLS policies, and storage buckets.
```bash
supabase db push
```

### 2.2 Critical Post-Installation Config
The platform uses `pg_net` for asynchronous quality gate evaluation. This requires two database-level settings.

Run the following SQL in your Supabase **SQL Editor**:
```sql
-- For Production
SELECT set_app_runtime_config(
  p_edge_function_url := 'https://<your-project-ref>.supabase.co/functions/v1',
  p_supabase_anon_key := '<your-supabase-anon-key>'
);
```

For **Local Development**:
```sql
SELECT set_app_runtime_config(
  p_edge_function_url := 'http://localhost:54321/functions/v1',
  p_supabase_anon_key := '<local-anon-key>'
);
```

---

## 3. AI Secret Configuration

Operia requires direct API keys for Google Gemini (primary) and Anthropic (fallback).

Run these commands to set the secrets in your Supabase project:
```bash
supabase secrets set GOOGLE_GEMINI_API_KEY=your_key_here
supabase secrets set ANTHROPIC_API_KEY=your_key_here
```

> [!NOTE]
> Ensure you are using a **Google Gemini API Key** (from Google AI Studio) and NOT a standard Google Cloud service account key.

---

## 4. Edge Function Deployment

Deploy all 14 Edge Functions to your Supabase project:

```bash
supabase functions deploy --project-ref <your-project-ref>
```

### Verification
After deployment, verify the system health by calling the health-check function:
```bash
curl https://<your-project-ref>.supabase.co/functions/v1/health-check
```
All checks should return `"ok": true`.

---

## 5. Frontend Deployment

### 5.1 Local Configuration
Create a `.env.local` file in the project root:
```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 5.2 Build and Deploy
You can host the static build on any provider (Vercel, Netlify, Github Pages, or Supabase Storage).

```bash
npm install
npm run build
```

The output will be in the `dist/` folder. Upload these files to your static hosting provider and ensure the environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are set in the hosting provider's dashboard.

---

## 6. Security Posture

### 🚨 Production Checklist
1. **Disable Signups**: If this is a private instance, disable "Allow new users to sign up" in Supabase Auth settings.
2. **Key Rotation**: Rotate your `GOOGLE_GEMINI_API_KEY` every 90 days.
3. **Audit Logs**: Enable Supabase Database Webhooks logging for the `pipeline_executions` table to track AI usage.

---

## 7. Troubleshooting

| Issue | Resolution |
|-------|------------|
| **Pipeline stuck in "running"** | Check if the Edge Function was actually invoked. Verify `app.edge_function_url` is correct. |
| **Quality Gate is always "pending"** | Ensure the `pg_net` extension is enabled (Migration 001) and `set_app_runtime_config` was run. |
| **"Unauthorized" error on AI steps** | Ensure the user has the 'owner' or 'editor' role in the `project_collaborators` table. |
