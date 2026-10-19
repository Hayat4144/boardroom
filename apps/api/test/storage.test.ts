import { Readable } from "node:stream";
import {
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createS3Client,
  filingObjectKey,
  ObjectNotFoundError,
  S3Storage,
  streamToBuffer,
} from "../src/services/storage";

const config = {
  bucket: "test-bucket",
  region: "ap-south-1",
  accessKeyId: "AKIATEST",
  secretAccessKey: "secret",
};
const s3Mock = mockClient(S3Client);

beforeEach(() => s3Mock.reset());

describe("S3Storage", () => {
  const storage = () => new S3Storage(createS3Client(config), config.bucket);

  it("puts a buffer with bucket, key and content type", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await storage().put("filings/c/f.pdf", Buffer.from("%PDF-1"), "application/pdf");
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toMatchObject({
      Bucket: "test-bucket",
      Key: "filings/c/f.pdf",
      ContentType: "application/pdf",
    });
    expect(s3Mock.commandCalls(CreateMultipartUploadCommand)).toHaveLength(0);
  });

  it("puts a stream", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await storage().put("k", Readable.from([Buffer.from("a"), Buffer.from("b")]), "text/plain");
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
  });

  it("streams an object back", async () => {
    s3Mock.on(GetObjectCommand, { Bucket: "test-bucket", Key: "k" }).resolves({
      Body: sdkStreamMixin(Readable.from([Buffer.from("%PDF-"), Buffer.from("data")])),
    });
    const body = await streamToBuffer(await storage().getStream("k"));
    expect(body.toString()).toBe("%PDF-data");
  });

  it("maps NoSuchKey to ObjectNotFoundError", async () => {
    s3Mock.on(GetObjectCommand).rejects(new NoSuchKey({ message: "missing", $metadata: {} }));
    await expect(storage().getStream("missing")).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("deletes by key", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await storage().delete("k");
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0]!.args[0].input).toEqual({
      Bucket: "test-bucket",
      Key: "k",
    });
  });

  it("presigns a short-lived GET URL without calling S3", async () => {
    const url = new URL(await storage().getPresignedUrl("filings/c/f.pdf", 120));
    expect(url.hostname).toBe("test-bucket.s3.ap-south-1.amazonaws.com");
    expect(url.pathname).toBe("/filings/c/f.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(s3Mock.calls()).toHaveLength(0);
  });

  it("uses path-style URLs for a custom endpoint (R2)", async () => {
    const r2 = new S3Storage(
      createS3Client({
        ...config,
        region: "auto",
        endpoint: "https://acct.r2.cloudflarestorage.com",
      }),
      config.bucket,
    );
    const url = new URL(await r2.getPresignedUrl("k"));
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/test-bucket/k");
  });
});

describe("helpers", () => {
  it("builds filing keys", () => {
    expect(filingObjectKey("c1", "f1")).toBe("filings/c1/f1.pdf");
  });

  it("streamToBuffer enforces a size cap", async () => {
    const stream = Readable.from([Buffer.alloc(6), Buffer.alloc(6)]);
    await expect(streamToBuffer(stream, 10)).rejects.toThrow(/exceeds 10 bytes/);
  });
});
