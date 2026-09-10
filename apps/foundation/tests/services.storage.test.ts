import { describe, it, expect, vi } from "vitest";
import {
  StorageService,
  SupabaseStorageAdapter,
  createStorageService,
  validateStoragePath,
  validateBucketName,
  type IStorageAdapter,
} from "../app/services/storage";

describe("Milestone 4B — Storage Service & Supabase Adapter", () => {
  describe("1. Path Traversal & Name Validation", () => {
    it("rejects path traversal attempts with dot-dot", () => {
      expect(validateStoragePath("../etc/passwd").valid).toBe(false);
      expect(validateStoragePath("user/../../secret.txt").valid).toBe(false);
      expect(validateStoragePath("./folder/file.png").valid).toBe(false);
    });

    it("rejects invalid path characters", () => {
      expect(validateStoragePath("user/file<name>.txt").valid).toBe(false);
      expect(validateStoragePath("user/file*?.txt").valid).toBe(false);
      expect(validateStoragePath("user/file|pipe.txt").valid).toBe(false);
    });

    it("normalizes and accepts safe paths", () => {
      const result = validateStoragePath("///users/usr_123/documents/report-v1.pdf///");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("users/usr_123/documents/report-v1.pdf");
    });

    it("validates bucket names correctly", () => {
      expect(validateBucketName("user-assets")).toBe(true);
      expect(validateBucketName("avatars_2026")).toBe(true);
      expect(validateBucketName("invalid/bucket")).toBe(false);
      expect(validateBucketName("invalid bucket")).toBe(false);
      expect(validateBucketName("")).toBe(false);
    });
  });

  describe("2. Unconfigured / Error Handling", () => {
    it("returns error result when Supabase is not configured", async () => {
      const adapter = new SupabaseStorageAdapter({
        supabaseUrl: undefined,
        supabaseKey: undefined,
      });

      const uploadResult = await adapter.upload("user-assets", "avatar.png", {
        data: new Uint8Array([1, 2, 3]),
      });
      expect(uploadResult.data).toBeNull();
      expect(uploadResult.error?.code).toBe("CONFIGURATION_ERROR");

      const downloadResult = await adapter.download("user-assets", "avatar.png");
      expect(downloadResult.data).toBeNull();
      expect(downloadResult.error?.code).toBe("CONFIGURATION_ERROR");

      const existsResult = await adapter.exists("user-assets", "avatar.png");
      expect(existsResult.data).toBeNull();
      expect(existsResult.error?.code).toBe("CONFIGURATION_ERROR");

      const listResult = await adapter.list("user-assets", "users/u1");
      expect(listResult.data).toBeNull();
      expect(listResult.error?.code).toBe("CONFIGURATION_ERROR");

      const deleteFolderResult = await adapter.deleteFolder("user-assets", "users/u1");
      expect(deleteFolderResult.data).toBeNull();
      expect(deleteFolderResult.error?.code).toBe("CONFIGURATION_ERROR");

      const signedResult = await adapter.getSignedUrl("user-assets", "avatar.png", {
        expiresInSeconds: 300,
      });
      expect(signedResult.data).toBeNull();
      expect(signedResult.error?.code).toBe("CONFIGURATION_ERROR");
    });
  });

  describe("3. Storage Service Scoping & Delegation", () => {
    it("generates user-scoped safe storage paths", () => {
      const service = new StorageService({} as any);
      const scopedPath = service.getUserScopedPath("usr_abc-123", "report 2026.pdf");
      expect(scopedPath).toBe("users/usr_abc-123/report_2026.pdf");
    });

    it("delegates storage operations to injected adapter", async () => {
      const mockAdapter: IStorageAdapter = {
        upload: vi.fn().mockResolvedValue({ data: { path: "users/u1/doc.pdf" }, error: null }),
        download: vi.fn().mockResolvedValue({ data: { data: new Uint8Array([10, 20]), contentType: "application/pdf" }, error: null }),
        delete: vi.fn().mockResolvedValue({ data: { deleted: ["users/u1/doc.pdf"] }, error: null }),
        exists: vi.fn().mockResolvedValue({ data: true, error: null }),
        list: vi.fn().mockResolvedValue({ data: { files: ["users/u1/doc.pdf", "users/u1/avatar.png"] }, error: null }),
        deleteFolder: vi.fn().mockResolvedValue({ data: { deleted: ["users/u1/doc.pdf", "users/u1/avatar.png"] }, error: null }),
        getSignedUrl: vi.fn().mockResolvedValue({ data: { url: "https://signed.example.com/asset" }, error: null }),
      };

      const service = new StorageService(mockAdapter);

      const up = await service.upload("user-assets", "users/u1/doc.pdf", { data: new Uint8Array([1]) });
      expect(up.data?.path).toBe("users/u1/doc.pdf");
      expect(mockAdapter.upload).toHaveBeenCalledWith("user-assets", "users/u1/doc.pdf", expect.any(Object), undefined);

      const dl = await service.download("user-assets", "users/u1/doc.pdf");
      expect(dl.data?.data).toEqual(new Uint8Array([10, 20]));

      const del = await service.delete("user-assets", ["users/u1/doc.pdf"]);
      expect(del.data?.deleted).toContain("users/u1/doc.pdf");

      const ex = await service.exists("user-assets", "users/u1/doc.pdf");
      expect(ex.data).toBe(true);

      const ls = await service.list("user-assets", "users/u1");
      expect(ls.data?.files).toHaveLength(2);

      const df = await service.deleteFolder("user-assets", "users/u1");
      expect(df.data?.deleted).toHaveLength(2);

      const sign = await service.getSignedUrl("user-assets", "users/u1/doc.pdf", { expiresInSeconds: 600 });
      expect(sign.data?.url).toBe("https://signed.example.com/asset");
    });

    it("creates StorageService via factory function", () => {
      const service = createStorageService({
        SUPABASE_URL: "https://xyz.supabase.co",
        SUPABASE_ANON_KEY: "anon_key_123",
      } as any);

      expect(service).toBeInstanceOf(StorageService);
    });
  });
});
