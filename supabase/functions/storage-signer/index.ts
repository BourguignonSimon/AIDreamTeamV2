/**
 * storage-signer — Signed URL Generation for Private Storage Buckets
 *
 * The ONLY Edge Function with access to SUPABASE_SERVICE_ROLE_KEY. (SEC-AUTH-03)
 * Generates time-limited signed URLs for document downloads and report exports.
 *
 * Storage buckets are private — no object is publicly accessible. (SEC-ISO-03)
 * Document access: 24-hour signed URLs
 * Report export access: 1-hour signed URLs (INT-EXPORT-02)
 *
 * Specification: Section 9.1, SEC-AUTH-03, SEC-ISO-03
 */

import { createAdminClient, createUserClient } from '../_shared/supabase.ts';
import { verifyJWT, handleCORS, errorResponse, jsonResponse, AuthError } from '../_shared/auth.ts';

type BucketName = 'project-documents' | 'report-exports';

interface SignerRequest {
  bucket: BucketName;
  storage_path: string;
  project_id: string;
  expires_in?: number;  // seconds; defaults to bucket-appropriate value
}

const EXPIRY_DEFAULTS: Record<BucketName, number> = {
  'project-documents': 24 * 60 * 60,  // 24 hours
  'report-exports':    60 * 60,         // 1 hour (INT-EXPORT-02)
};

Deno.serve(async (req: Request) => {
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    const user = await verifyJWT(req);
    const body = await req.json() as SignerRequest;

    const { bucket, storage_path, project_id, expires_in } = body;

    if (!bucket || !storage_path || !project_id) {
      return errorResponse('bucket, storage_path, and project_id are required', 400);
    }

    if (!['project-documents', 'report-exports'].includes(bucket)) {
      return errorResponse(`Invalid bucket: ${bucket}`, 400);
    }

    // 1. Verify the user is a project member (any role can download)
    const authHeader = req.headers.get('Authorization')!;
    const userClient = createUserClient(authHeader);

    const { data: isMember } = await userClient.rpc('is_project_member', {
      p_project_id: project_id,
      p_user_id: user.id,
    });

    if (!isMember) {
      return errorResponse('You do not have access to this project', 403);
    }

    // 2. Use service role client to generate signed URL (bypasses storage RLS)
    // This is the ONLY place the service role is used — all other operations use anon+RLS
    const adminClient = createAdminClient();

    const expiresIn = expires_in ?? EXPIRY_DEFAULTS[bucket];

    const { data, error } = await adminClient.storage
      .from(bucket)
      .createSignedUrl(storage_path, expiresIn);

    if (error || !data?.signedUrl) {
      console.error(`[storage-signer] Failed to create signed URL for ${bucket}/${storage_path}:`, error);
      return errorResponse('Failed to generate signed URL', 500);
    }

    console.log(
      `[storage-signer] Signed URL generated for ${bucket}/${storage_path}. ` +
      `User: ${user.id}. Project: ${project_id}. Expires in: ${expiresIn}s`
    );

    return jsonResponse({
      signed_url: data.signedUrl,
      expires_in: expiresIn,
    });

  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[storage-signer] Error:', errorMessage);
    return errorResponse(errorMessage, 500);
  }
});
