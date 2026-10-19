import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage. Everything lives in S3 (or an S3-compatible service such as
 * Cloudflare R2); nothing is ever written to local disk.
 */
export interface Storage {
  put(key: string, body: Buffer | Uint8Array | Readable, contentType: string): Promise<void>;
  /** Streams the object. Throws ObjectNotFoundError if the key doesn't exist. */
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  /** Short-lived presigned GET URL; the bucket itself stays private. */
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export class ObjectNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Object not found: ${key}`);
    this.name = "ObjectNotFoundError";
  }
}

export const DEFAULT_PRESIGN_SECONDS = 5 * 60;

export function filingObjectKey(companyId: string, filingId: string): string {
  return `filings/${companyId}/${filingId}.pdf`;
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for R2 / other S3-compatible services; omit for AWS S3. */
  endpoint?: string;
}

export function createS3Client(config: S3StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    // Custom endpoints (R2, MinIO) are most reliable with path-style addressing.
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export class S3Storage implements Storage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer | Uint8Array | Readable, contentType: string) {
    // lib-storage handles both buffers and streams of unknown length (multipart).
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
    }).done();
  }

  async getStream(key: string): Promise<Readable> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) throw new ObjectNotFoundError(key);
      return res.Body as Readable;
    } catch (err) {
      if (err instanceof NoSuchKey) throw new ObjectNotFoundError(key);
      throw err;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getPresignedUrl(key: string, expiresInSeconds = DEFAULT_PRESIGN_SECONDS) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}

export function createStorageFromEnv(env: {
  S3_BUCKET: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT?: string;
}): Storage {
  const client = createS3Client({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    endpoint: env.S3_ENDPOINT,
  });
  return new S3Storage(client, env.S3_BUCKET);
}

/** Reads a stream fully into memory (for PDF parsing); never touches disk. */
export async function streamToBuffer(
  stream: Readable,
  maxBytes = 100 * 1024 * 1024,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error(`Object exceeds ${maxBytes} bytes`);
    }
    parts.push(buf);
  }
  return Buffer.concat(parts);
}
