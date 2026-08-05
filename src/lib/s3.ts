import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Lazy-initialize to avoid errors when env vars are missing during build
let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return _client;
}

const BUCKET = process.env.S3_BUCKET || "dfslab-uploads";

/**
 * Generate a presigned URL for uploading a file.
 */
export async function getUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: 3600 });
  return url;
}

/**
 * Generate a presigned URL for downloading a file.
 */
export async function getDownloadUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: 3600 });
  return url;
}

/**
 * Check whether an object actually exists in the bucket. Used by the
 * storage test-upload diagnostic (Part 23, WS49) and the orphaned-document
 * scan (Part 23, WS50) — both need to answer "is this key really there?"
 * rather than trust anything client-reported.
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw err; // a real credentials/permission/network error should surface, not be swallowed as "missing"
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
