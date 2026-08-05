import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 23, WS49/WS50 (F42/F43) — objectExists() is the shared ground-truth
// check for both the storage test-upload diagnostic and the orphaned-
// document scan. The critical behavior under test: a real 404 means "the
// file really isn't there", but any other failure (bad credentials, a
// permissions error, a network blip) must surface as an error, not be
// silently treated as "missing" — the exact false-negative risk Q67's
// Method section calls out as the reason automatic deletion (Option A)
// was rejected.

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send(...args: unknown[]) {
      return mockSend(...args);
    }
  }
  class HeadObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { S3Client, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand, GetObjectCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));

import { objectExists, deleteObject } from "@/lib/s3";

describe("objectExists", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns true when HeadObject succeeds", async () => {
    mockSend.mockResolvedValueOnce({});
    await expect(objectExists("documents/real-key")).resolves.toBe(true);
  });

  it("returns false on a 404 (object genuinely missing)", async () => {
    mockSend.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(objectExists("documents/missing-key")).resolves.toBe(false);
  });

  it("re-throws on a non-404 status (e.g. a permissions error) instead of treating it as missing", async () => {
    const err = { $metadata: { httpStatusCode: 403 } };
    mockSend.mockRejectedValueOnce(err);
    await expect(objectExists("documents/some-key")).rejects.toBe(err);
  });

  it("re-throws when there's no $metadata at all (e.g. a network/credentials error)", async () => {
    const err = new Error("getaddrinfo ENOTFOUND");
    mockSend.mockRejectedValueOnce(err);
    await expect(objectExists("documents/some-key")).rejects.toThrow("getaddrinfo ENOTFOUND");
  });
});

describe("deleteObject", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("sends a DeleteObjectCommand for the given key", async () => {
    mockSend.mockResolvedValueOnce({});
    await deleteObject("documents/some-key");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
