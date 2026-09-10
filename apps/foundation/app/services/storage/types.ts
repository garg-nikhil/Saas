/**
 * Provider-Agnostic Storage Service Contracts
 *
 * Isolates the application from specific object storage providers (e.g. Supabase Storage, S3, R2).
 */

export interface StorageFile {
  data: Uint8Array | ArrayBuffer | Blob;
  contentType?: string;
}

export interface StorageUploadOptions {
  contentType?: string;
  upsert?: boolean;
  metadata?: Record<string, string>;
}

export interface StorageSignedUrlOptions {
  expiresInSeconds: number;
}

export type StorageErrorCode =
  | "INVALID_PATH"
  | "INVALID_BUCKET"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "UPLOAD_FAILED"
  | "DOWNLOAD_FAILED"
  | "DELETE_FAILED"
  | "SIGNED_URL_FAILED"
  | "CONFIGURATION_ERROR";

export interface StorageError {
  message: string;
  code: StorageErrorCode;
  details?: unknown;
}

export interface StorageResult<T> {
  data: T | null;
  error: StorageError | null;
}

/**
 * Provider-agnostic adapter interface for underlying storage implementations.
 */
export interface IStorageAdapter {
  upload(
    bucket: string,
    path: string,
    file: StorageFile,
    options?: StorageUploadOptions,
  ): Promise<StorageResult<{ path: string }>>;

  download(
    bucket: string,
    path: string,
  ): Promise<StorageResult<{ data: Uint8Array; contentType?: string }>>;

  delete(
    bucket: string,
    paths: string[],
  ): Promise<StorageResult<{ deleted: string[] }>>;

  exists(
    bucket: string,
    path: string,
  ): Promise<StorageResult<boolean>>;

  list(
    bucket: string,
    prefix?: string,
  ): Promise<StorageResult<{ files: string[] }>>;

  deleteFolder(
    bucket: string,
    prefix: string,
  ): Promise<StorageResult<{ deleted: string[] }>>;

  getSignedUrl(
    bucket: string,
    path: string,
    options: StorageSignedUrlOptions,
  ): Promise<StorageResult<{ url: string }>>;
}

/**
 * High-level storage service boundary interface for application code.
 */
export interface IStorageService {
  getUserScopedPath(userId: string, fileName: string): string;

  upload(
    bucket: string,
    path: string,
    file: StorageFile,
    options?: StorageUploadOptions,
  ): Promise<StorageResult<{ path: string }>>;

  download(
    bucket: string,
    path: string,
  ): Promise<StorageResult<{ data: Uint8Array; contentType?: string }>>;

  delete(
    bucket: string,
    paths: string[],
  ): Promise<StorageResult<{ deleted: string[] }>>;

  list(
    bucket: string,
    prefix?: string,
  ): Promise<StorageResult<{ files: string[] }>>;

  deleteFolder(
    bucket: string,
    prefix: string,
  ): Promise<StorageResult<{ deleted: string[] }>>;

  exists(
    bucket: string,
    path: string,
  ): Promise<StorageResult<boolean>>;

  getSignedUrl(
    bucket: string,
    path: string,
    options: StorageSignedUrlOptions,
  ): Promise<StorageResult<{ url: string }>>;
}
