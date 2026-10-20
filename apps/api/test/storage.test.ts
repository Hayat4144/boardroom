import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteFile,
  downloadFile,
  filingKey,
  getFileUrl,
  uploadFile,
} from "../src/services/storage";

// Bucket and region come from the test env in vitest.config.ts.
const s3Mock = mockClient(S3Client);
beforeEach(() => s3Mock.reset());

describe("storage", () => {
  it("uploads a file with bucket, key and content type", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await uploadFile("filings/c/f.pdf", Buffer.from("%PDF-1"), "application/pdf");

    const [call] = s3Mock.commandCalls(PutObjectCommand);
    expect(call!.args[0].input).toMatchObject({
      Bucket: "test-bucket",
      Key: "filings/c/f.pdf",
      ContentType: "application/pdf",
    });
  });

  it("downloads a file into memory", async () => {
    const body = sdkStreamMixin(Readable.from([Buffer.from("%PDF-"), Buffer.from("data")]));
    s3Mock.on(GetObjectCommand, { Bucket: "test-bucket", Key: "k" }).resolves({ Body: body });

    const file = await downloadFile("k");
    expect(file.toString()).toBe("%PDF-data");
  });

  it("deletes by key", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await deleteFile("k");

    const [call] = s3Mock.commandCalls(DeleteObjectCommand);
    expect(call!.args[0].input).toEqual({ Bucket: "test-bucket", Key: "k" });
  });

  it("presigns a short-lived GET URL without calling S3", async () => {
    const url = new URL(await getFileUrl("filings/c/f.pdf", 120));
    expect(url.hostname).toBe("test-bucket.s3.ap-south-1.amazonaws.com");
    expect(url.pathname).toBe("/filings/c/f.pdf");

    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(s3Mock.calls()).toHaveLength(0);
  });

  it("builds filing keys", () => {
    expect(filingKey("c1", "f1")).toBe("filings/c1/f1.pdf");
  });
});
