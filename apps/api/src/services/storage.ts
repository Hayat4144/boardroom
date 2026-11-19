import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

/**
 * Files live in a private S3 bucket and are never written to local disk.
 * The browser opens them through short-lived presigned URLs.
 */
const s3 = new S3Client({
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

const bucket = env.S3_BUCKET;

export const URL_EXPIRES_SECONDS = 5 * 60;

export function filingKey(companyId: string, filingId: string): string {
  return `filings/${companyId}/${filingId}.pdf`;
}

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,

    Body: body,
    ContentType: contentType,
  });

  await s3.send(command);
}

/** Downloads an object into memory. */
export async function downloadFile(key: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error(`S3 object has no body: ${key}`);

  return Buffer.from(await result.Body.transformToByteArray());
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * A short-lived URL that lets the browser read one private object.
 * Served as an inline PDF so it renders inside the app's viewer instead of downloading.
 */
export function getFileUrl(key: string, expiresIn = URL_EXPIRES_SECONDS): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,

    ResponseContentType: "application/pdf",
    ResponseContentDisposition: "inline",
  });

  return getSignedUrl(s3, command, { expiresIn });
}
