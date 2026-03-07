/**
 * Step1KnowledgeIngestion — Document Upload Panel
 *
 * Allows editors to upload SME documents (PDF, DOCX, TXT).
 * Writes document metadata to project_documents table.
 * Creates a Step 1 workflow_node on first upload, unlocking Step 2.
 *
 * Spec: Section 3.3, FR-S1-01 through FR-S1-06
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ConsultingProject, ProjectDocument, AnyWorkflowNode } from '@/lib/types';
import { WorkflowStep } from '@/lib/types';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_PROJECT,
  ACCEPTED_DOCUMENT_EXTENSIONS,
} from '@/lib/constants';
import { formatFileSize } from '@/lib/utils';

interface Step1Props {
  project: ConsultingProject;
  nodes: AnyWorkflowNode[];
  documents: ProjectDocument[];
  isEditor: boolean;
  onDocumentAdded: (doc: ProjectDocument) => void;
  onDocumentRemoved: (docId: string) => void;
  onCompleted: () => void;
}

export default function Step1KnowledgeIngestion({
  project,
  nodes,
  documents,
  isEditor,
  onDocumentAdded,
  onDocumentRemoved,
  onCompleted,
}: Step1Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [contextSummary, setContextSummary] = useState(project.context_summary ?? '');
  const [isDragOver, setIsDragOver] = useState(false);

  const step1Node = nodes.find(
    (n) => n.step_type === WorkflowStep.KNOWLEDGE_INGESTION && n.execution_status === 'completed'
  );

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!isEditor) return;

    if (documents.length + files.length > MAX_FILES_PER_PROJECT) {
      setUploadError(`Maximum ${MAX_FILES_PER_PROJECT} documents per project`);
      return;
    }

    setUploading(true);
    setUploadError(null);

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError(`${file.name} exceeds 25 MB limit`);
        continue;
      }

      const storagePath = `${project.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      // Upload to private bucket
      const { error: storageError } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file);

      if (storageError) {
        setUploadError(`Upload failed: ${storageError.message}`);
        continue;
      }

      // Write metadata to project_documents
      const { data: docRecord, error: dbError } = await supabase
        .from('project_documents')
        .insert({
          project_id:   project.id,
          storage_path: storagePath,
          filename:     file.name,
          mime_type:    file.type,
          size_bytes:   file.size,
          status:       'uploaded',
        })
        .select()
        .single();

      if (dbError) {
        setUploadError(`Database error: ${dbError.message}`);
        continue;
      }

      onDocumentAdded(docRecord as ProjectDocument);
    }

    // Create Step 1 workflow_node if not exists (completes the step)
    if (!step1Node) {
      await supabase.rpc('insert_workflow_node', {
        p_project_id:      project.id,
        p_step_type:       WorkflowStep.KNOWLEDGE_INGESTION,
        p_input_data:      { context_summary: contextSummary, language: project.language },
        p_output_data:     {
          document_chunks:         [],
          total_tokens:            0,
          ingestion_completed_at:  new Date().toISOString(),
        },
        p_idempotency_key: `${project.id}:knowledge_ingestion:initial`,
        p_triggered_by:    null,
      });
    }

    setUploading(false);
  }

  async function handleRemoveDocument(doc: ProjectDocument) {
    if (!isEditor) return;

    await supabase.storage.from('project-documents').remove([doc.storage_path]);
    await supabase.from('project_documents').delete().eq('id', doc.id);
    onDocumentRemoved(doc.id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('step1.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('step1.description')}</p>
      </div>

      {/* Context Summary */}
      {isEditor && (
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('step1.context_label')}</label>
          <textarea
            value={contextSummary}
            onChange={(e) => setContextSummary(e.target.value)}
            placeholder={t('step1.context_placeholder')}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {/* Upload Area */}
      {isEditor && documents.length < MAX_FILES_PER_PROJECT && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 cursor-pointer transition-colors ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">{t('step1.drag_drop')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('step1.upload_hint')}</p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.txt"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {uploadError}
        </div>
      )}

      {/* Document List */}
      {documents.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">{t('step1.documents')} ({documents.length})</h3>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.filename}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(doc.size_bytes)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Uploaded
                  </span>
                  {isEditor && (
                    <button
                      onClick={() => void handleRemoveDocument(doc)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proceed button */}
      {documents.length > 0 && isEditor && (
        <button
          onClick={onCompleted}
          disabled={uploading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {t('step1.proceed')}
        </button>
      )}
    </div>
  );
}
