import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  IStorageAdapter,
  StorageFile,
  StorageUploadOptions,
  StorageSignedUrlOptions,
  StorageResult,
} from "../types";

export interface SupabaseStorageConfig {
  supabaseUrl?: string;
  supabaseKey?: string; // Service role key on server or anon key with RLS
}

/**
 * Validates a storage path to prevent directory traversal and invalid characters.
 */
export function validateStoragePath(path: string): { valid: boolean; normalized?: string; error?: string } {
  if (!path || typeof path !== "string") {
    return { valid: false, error: "Storage path must be a non-empty string" };
  }

  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Storage path cannot be empty" };
  }

  // Prevent path traversal
  if (trimmed.includes("..") || trimmed.includes("./")) {
    return { valid: false, error: "Storage path contains prohibited path traversal sequences" };
  }

  // Clean leading and trailing slashes
  const normalized = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
  if (normalized.length === 0) {
    return { valid: false, error: "Storage path is invalid" };
  }

  // Check for safe characters: alphanumeric, dashes, underscores, dots, and forward slashes
  const validPathRegex = /^[a-zA-Z0-9_\-\.\/]+$/;
  if (!validPathRegex.test(normalized)) {
    return { valid: false, error: "Storage path contains invalid characters" };
  }

  return { valid: true, normalized };
}

/**
 * Validates bucket identifier.
 */
export function validateBucketName(bucket: string): boolean {
  if (!bucket || typeof bucket !== "string") return false;
  const trimmed = bucket.trim();
  return /^[a-zA-Z0-9_\-]+$/.test(trimmed) && trimmed.length > 0;
}

export class SupabaseStorageAdapter implements IStorageAdapter {
  private client: SupabaseClient | null = null;
  private isConfigured = false;

  constructor(private config: SupabaseStorageConfig) {
    const url = config.supabaseUrl?.trim();
    const key = config.supabaseKey?.trim();
    const isPlaceholder =
      !url ||
      !key ||
      url.includes("placeholder-project") ||
      url.includes("your-project-id") ||
      key.includes("placeholder-anon-key") ||
      key.includes("your-supabase-anon-key");

    this.isConfigured = Boolean(
      url &&
        key &&
        url.length > 0 &&
        key.length > 0 &&
        !isPlaceholder,
    );
  }

  private getClient(): SupabaseClient | null {
    if (!this.isConfigured || !this.config.supabaseUrl || !this.config.supabaseKey) {
      return null;
    }

    if (!this.client) {
      try {
        this.client = createClient(this.config.supabaseUrl, this.config.supabaseKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
      } catch (err) {
        console.error("Failed to initialize Supabase Storage client:", err);
        this.isConfigured = false;
        return null;
      }
    }

    return this.client;
  }

  async upload(
    bucket: string,
    path: string,
    file: StorageFile,
    options?: StorageUploadOptions,
  ): Promise<StorageResult<{ path: string }>> {
    if (!validateBucketName(bucket)) {
      return {
        data: null,
        error: { code: "INVALID_BUCKET", message: `Invalid bucket name: '${bucket}'` },
      };
    }

    const pathValidation = validateStoragePath(path);
    if (!pathValidation.valid || !pathValidation.normalized) {
      return {
        data: null,
        error: { code: "INVALID_PATH", message: pathValidation.error || "Invalid path" },
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        data: null,
        error: { code: "CONFIGURATION_ERROR", message: "Supabase Storage is not configured" },
      };
    }

    try {
      let bodyData: any = file.data;
      if (file.data instanceof Uint8Array || file.data instanceof ArrayBuffer) {
        bodyData = file.data;
      }

      const { data, error } = await client.storage
        .from(bucket)
        .upload(pathValidation.normalized, bodyData, {
          contentType: options?.contentType || file.contentType || "application/octet-stream",
          upsert: options?.upsert ?? true,
        });

      if (error) {
        return {
          data: null,
          error: {
            code: "UPLOAD_FAILED",
            message: error.message,
            details: error,
          },
        };
      }

      return {
        data: { path: data.path },
        error: null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: {
          code: "UPLOAD_FAILED",
          message: err?.message || "Failed to upload file to storage",
          details: err,
        },
      };
    }
  }

  async download(
    bucket: string,
    path: string,
  ): Promise<StorageResult<{ data: Uint8Array; contentType?: string }>> {
    if (!validateBucketName(bucket)) {
      return {
        data: null,
        error: { code: "INVALID_BUCKET", message: `Invalid bucket name: '${bucket}'` },
      };
    }

    const pathValidation = validateStoragePath(path);
    if (!pathValidation.valid || !pathValidation.normalized) {
      return {
        data: null,
        error: { code: "INVALID_PATH", message: pathValidation.error || "Invalid path" },
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        data: null,
        error: { code: "CONFIGURATION_ERROR", message: "Supabase Storage is not configured" },
      };
    }

    try {
      const { data, error } = await client.storage
        .from(bucket)
        .download(pathValidation.normalized);

      if (error || !data) {
        return {
          data: null,
          error: {
            code: error?.message?.includes("not found") ? "NOT_FOUND" : "DOWNLOAD_FAILED",
            message: error?.message || "File not found or download failed",
            details: error,
          },
        };
      }

      const arrayBuffer = await data.arrayBuffer();
      return {
        data: {
          data: new Uint8Array(arrayBuffer),
          contentType: data.type,
        },
        error: null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: {
          code: "DOWNLOAD_FAILED",
          message: err?.message || "Download failed",
          details: err,
        },
      };
    }
  }

  async delete(
    bucket: string,
    paths: string[],
  ): Promise<StorageResult<{ deleted: string[] }>> {
    if (!validateBucketName(bucket)) {
      return {
        data: null,
        error: { code: "INVALID_BUCKET", message: `Invalid bucket name: '${bucket}'` },
      };
    }

    const normalizedPaths: string[] = [];
    for (const p of paths) {
      const v = validateStoragePath(p);
      if (v.valid && v.normalized) {
        normalizedPaths.push(v.normalized);
      }
    }

    if (normalizedPaths.length === 0) {
      return { data: { deleted: [] }, error: null };
    }

    const client = this.getClient();
    if (!client) {
      return {
        data: null,
        error: { code: "CONFIGURATION_ERROR", message: "Supabase Storage is not configured" },
      };
    }

    try {
      const { data, error } = await client.storage
        .from(bucket)
        .remove(normalizedPaths);

      if (error) {
        return {
          data: null,
          error: {
            code: "DELETE_FAILED",
            message: error.message,
            details: error,
          },
        };
      }

      return {
        data: { deleted: (data || []).map((d) => d.name) },
        error: null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: {
          code: "DELETE_FAILED",
          message: err?.message || "Delete failed",
          details: err,
        },
      };
    }
  }

  async exists(
    bucket: string,
    path: string,
  ): Promise<StorageResult<boolean>> {
    if (!validateBucketName(bucket)) {
      return {
        data: null,
        error: { code: "INVALID_BUCKET", message: `Invalid bucket name: '${bucket}'` },
      };
    }

    const pathValidation = validateStoragePath(path);
    if (!pathValidation.valid || !pathValidation.normalized) {
      return {
        data: null,
        error: { code: "INVALID_PATH", message: pathValidation.error || "Invalid path" },
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        data: null,
        error: { code: "CONFIGURATION_ERROR", message: "Supabase Storage is not configured" },
      };
    }

    try {
      const pathParts = pathValidation.normalized.split("/");
      const fileName = pathParts.pop();
      const folderPath = pathParts.join("/");

      const { data, error } = await client.storage
        .from(bucket)
        .list(folderPath, { search: fileName });

      if (error) {
        return {
          data: null,
          error: { code: "DOWNLOAD_FAILED", message: error.message, details: error },
        };
      }

      const match = (data || []).some((item) => item.name === fileName);
      return { data: match, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: { code: "DOWNLOAD_FAILED", message: err?.message || "Exists check failed", details: err },
      };
    }
  }

  async list(
    bucket: string,
    prefix = "",
  ): Promise<StorageResult<{ files: string[] }>> {
    if (!validateBucketName(bucket)) {
      return {
        data: null,
        error: { code: "INVALID_BUCKET", message: `Invalid bucket name: '${bucket}'` },
      };
    }

    const normalizedPrefix = prefix ? prefix.replace(/^\/+/, "").replace(/\/+$/, "") : "";
    if (normalizedPrefix.length > 0) {
      const v = validateStoragePath(normalizedPrefix);
      if (!v.valid) {
        return { data: null, error: { code: "INVALID_PATH", message: v.error || "Invalid prefix" } };
      }
    }

    const client = this.getClient();
    if (!client) {
      return {
        data: null,
        error: { code: "CONFIGURATION_ERROR", message: "Supabase Storage is not configured" },
      };
    }

    try {
      const allFiles: string[] = [];

      const enumerateFolder = async (folder: string): Promise<void> => {
        const { data, error } = await client.storage.from(bucket).list(folder, {
          limit: 100,
          sortBy: { column: "name", order: "asc" },
        });

        if (error) {
          throw error;
        }

        if (!data || data.length === 0) return;

        for (const item of data) {
          const itemPath = folder ? `${folder}/${item.name}` : item.name;
          if (!item.id && !item.metadata) {
            await enumerateFolder(itemPath);
          } else {
            allFiles.push(itemPath);
          }
        }
      };

      await enumerateFolder(normalizedPrefix);
      return { data: { files: allFiles }, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: {
          code: "DOWNLOAD_FAILED",
          message: err?.message || "Failed to list storage objects",
          details: err,
        },
      };
    }
  }

  async deleteFolder(
    bucket: string,
    prefix: string,
  ): Promise<StorageResult<{ deleted: string[] }>> {
    const listResult = await this.list(bucket, prefix);
    if (listResult.error) {
      return { data: null, error: listResult.error };
    }

    const files = listResult.data?.files || [];
    if (files.length === 0) {
      return { data: { deleted: [] }, error: null };
    }

    return await this.delete(bucket, files);
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    options: StorageSignedUrlOptions,
  ): Promise<StorageResult<{ url: string }>> {
    if (!validateBucketName(bucket)) {
      return {
        data: null,
        error: { code: "INVALID_BUCKET", message: `Invalid bucket name: '${bucket}'` },
      };
    }

    const pathValidation = validateStoragePath(path);
    if (!pathValidation.valid || !pathValidation.normalized) {
      return {
        data: null,
        error: { code: "INVALID_PATH", message: pathValidation.error || "Invalid path" },
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        data: null,
        error: { code: "CONFIGURATION_ERROR", message: "Supabase Storage is not configured" },
      };
    }

    try {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(pathValidation.normalized, options.expiresInSeconds);

      if (error || !data?.signedUrl) {
        return {
          data: null,
          error: {
            code: "SIGNED_URL_FAILED",
            message: error?.message || "Failed to create signed URL",
            details: error,
          },
        };
      }

      return {
        data: { url: data.signedUrl },
        error: null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: {
          code: "SIGNED_URL_FAILED",
          message: err?.message || "Failed to create signed URL",
          details: err,
        },
      };
    }
  }
}
