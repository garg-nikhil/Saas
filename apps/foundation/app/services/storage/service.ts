import type { Env } from "../../context";
import type {
  IStorageService,
  IStorageAdapter,
  StorageFile,
  StorageUploadOptions,
  StorageSignedUrlOptions,
  StorageResult,
} from "./types";
import { SupabaseStorageAdapter, validateStoragePath } from "./adapters/supabase";

export class StorageService implements IStorageService {
  constructor(private adapter: IStorageAdapter) {}

  upload(
    bucket: string,
    path: string,
    file: StorageFile,
    options?: StorageUploadOptions,
  ): Promise<StorageResult<{ path: string }>> {
    return this.adapter.upload(bucket, path, file, options);
  }

  download(
    bucket: string,
    path: string,
  ): Promise<StorageResult<{ data: Uint8Array; contentType?: string }>> {
    return this.adapter.download(bucket, path);
  }

  delete(
    bucket: string,
    paths: string[],
  ): Promise<StorageResult<{ deleted: string[] }>> {
    return this.adapter.delete(bucket, paths);
  }

  exists(
    bucket: string,
    path: string,
  ): Promise<StorageResult<boolean>> {
    return this.adapter.exists(bucket, path);
  }

  list(
    bucket: string,
    prefix?: string,
  ): Promise<StorageResult<{ files: string[] }>> {
    return this.adapter.list(bucket, prefix);
  }

  deleteFolder(
    bucket: string,
    prefix: string,
  ): Promise<StorageResult<{ deleted: string[] }>> {
    return this.adapter.deleteFolder(bucket, prefix);
  }

  getSignedUrl(
    bucket: string,
    path: string,
    options: StorageSignedUrlOptions,
  ): Promise<StorageResult<{ url: string }>> {
    return this.adapter.getSignedUrl(bucket, path, options);
  }

  /**
   * Helper to construct a strictly user-scoped safe path.
   * Derives path from verified user ID to ensure multi-tenant file separation.
   */
  getUserScopedPath(userId: string, fileName: string): string {
    const cleanUserId = userId.replace(/[^a-zA-Z0-9_\-]/g, "");
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    return `users/${cleanUserId}/${cleanFileName}`;
  }
}

/**
 * Factory helper to construct the internal StorageService boundary.
 */
export function createStorageService(
  env?: Env,
  customAdapter?: IStorageAdapter,
): IStorageService {
  if (customAdapter) {
    return new StorageService(customAdapter);
  }

  // Use SUPABASE_SERVICE_ROLE_KEY if available on server, or fallback to SUPABASE_ANON_KEY
  const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_ANON_KEY;

  const adapter = new SupabaseStorageAdapter({
    supabaseUrl: env?.SUPABASE_URL,
    supabaseKey,
  });

  return new StorageService(adapter);
}
