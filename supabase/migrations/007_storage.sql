-- Migration 007: Storage Buckets
-- Creates private storage buckets per SEC-ISO-03
-- All document/report access must use time-limited signed URLs

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- BUCKET: project-documents
-- Stores uploaded SME documents (PDF, DOCX, TXT)
-- Max 25 MB per file — FR-S1-01
-- Max 20 files per project — enforced at application layer
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  FALSE,   -- private: no public URL access (SEC-ISO-03)
  26214400, -- 25 MB in bytes
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- BUCKET: report-exports
-- Stores generated PDF/DOCX report files
-- Access exclusively via storage-signer Edge Function (signed URLs)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-exports',
  'report-exports',
  FALSE,   -- private: delivered via signed URL with 1-hour expiry (INT-EXPORT-02)
  52428800, -- 50 MB for report files
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/html'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Storage RLS Policies
-- Only project members can upload/read their own project documents
-- The storage-signer Edge Function uses service_role to generate signed URLs
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- project-documents: editors can upload, all members can read metadata
CREATE POLICY "editors_upload_documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND is_project_editor(
      -- Extract project_id from path: project-documents/{project_id}/{filename}
      (string_to_array(name, '/'))[1]::UUID,
      auth.uid()
    )
  );

CREATE POLICY "members_read_document_objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND is_project_member(
      (string_to_array(name, '/'))[1]::UUID,
      auth.uid()
    )
  );

CREATE POLICY "editors_delete_document_objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND is_project_editor(
      (string_to_array(name, '/'))[1]::UUID,
      auth.uid()
    )
  );

-- report-exports: readable by project members (via signed URL only — bucket is private)
CREATE POLICY "members_read_report_objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-exports'
    AND is_project_member(
      (string_to_array(name, '/'))[1]::UUID,
      auth.uid()
    )
  );
