import { Injectable } from '@nestjs/common';
import { AuthenticationClient, Scopes } from '@aps_sdk/authentication';
import { SdkManagerBuilder } from '@aps_sdk/autodesk-sdkmanager';
import { ModelDerivativeClient, Type, View } from '@aps_sdk/model-derivative';
import {
  CreateBucketsPayloadPolicyKeyEnum,
  CreateBucketXAdsRegionEnum,
  FileTransferConfigurations,
  OssClient,
  OSSFileTransfer,
  RequiredError,
} from '@aps_sdk/oss';
const sdk = SdkManagerBuilder.create().build();
const authenticationClient = new AuthenticationClient(sdk);
const ossClient = new OssClient(sdk);
const ossTransfer = new OSSFileTransfer(new FileTransferConfigurations(3), sdk);
const modelDerivativeClient = new ModelDerivativeClient(sdk);

const APS_CLIENT_ID = '6OMEXUWGlGDrTR6vkPtuTax0EDiNOdFLKY1yIWcrsTOAt9uG';
const APS_CLIENT_SECRET =
  '3cHUGOAKoMlE0uhiAjcf0OHNYlR2ipR8XNGm6NI60On7L0doGDyDgZ2hOxoLn2ao';
const APS_BUCKET = `${APS_CLIENT_ID.toLowerCase()}-basic-app`;

@Injectable()
export class AppService {
  constructor() {}
  getHello(): string {
    return 'Hello World!';
  }
  async getInternalToken() {
    return await authenticationClient.getTwoLeggedToken(
      APS_CLIENT_ID,
      APS_CLIENT_SECRET,
      [
        Scopes.DataRead,
        Scopes.DataCreate,
        Scopes.DataWrite,
        Scopes.BucketCreate,
        Scopes.BucketRead,
      ],
    );
  }
  async getPublicToken() {
    return await authenticationClient.getTwoLeggedToken(
      APS_CLIENT_ID,
      APS_CLIENT_SECRET,
      [Scopes.DataRead],
    );
  }
  async ensureBucketExists(bucketKey: string) {
    const { access_token } = await this.getInternalToken();
    try {
      await ossClient.getBucketDetails(access_token!, bucketKey);
    } catch (err: any) {
      if (err.axiosError.response.status === 404) {
        await ossClient.createBucket(
          access_token!,
          CreateBucketXAdsRegionEnum.Us,
          {
            bucketKey: bucketKey,
            policyKey: CreateBucketsPayloadPolicyKeyEnum.Persistent,
          },
        );
      } else {
        throw err;
      }
    }
  }
  async uploadObject(objectName: string, filePath: string) {
    await this.ensureBucketExists(APS_BUCKET);
    const { access_token } = await this.getInternalToken();
    const obj = await ossClient.upload(
      APS_BUCKET,
      objectName,
      filePath,
      access_token!,
    );
    return obj;
  }

  async uploadResource(objectName: string, resource: Buffer) {
    await this.ensureBucketExists(APS_BUCKET);
    const { access_token } = await this.getInternalToken();
    const cancellationToken = new AbortController();
    const rt = await ossTransfer.upload(
      APS_BUCKET,
      objectName,
      resource,
      access_token!,
      cancellationToken,
    );
    // const obj = await ossClient.uploadSignedResource(access_token!, APS_BUCKET, file.size, file);
    return rt.content;
  }

  async listObjects() {
    await this.ensureBucketExists(APS_BUCKET);
    const { access_token } = await this.getInternalToken();
    let resp = await ossClient.getObjects(access_token!, APS_BUCKET, {
      limit: 64,
    });
    let objects = resp.items || [];
    while (resp.next) {
      const startAt =
        new URL(resp.next).searchParams.get('startAt') || undefined;
      resp = await ossClient.getObjects(access_token!, APS_BUCKET, {
        limit: 64,
        startAt,
      });
      objects = objects?.concat(resp.items!) || resp.items!;
    }
    return objects;
  }

  async deleteObject(ObjectName: string) {
    await this.ensureBucketExists(APS_BUCKET);
    const { access_token } = await this.getInternalToken();
    return await ossClient.deleteObject(access_token!, APS_BUCKET, ObjectName);
  }

  async translateObject(urn: string, rootFilename: string) {
    const { access_token } = await this.getInternalToken();
    const job = await modelDerivativeClient.startJob(access_token!, {
      input: {
        urn,
        compressedUrn: !!rootFilename,
        rootFileName: rootFilename,
      },
      output: {
        formats: [
          {
            views: [View._2d, View._3d],
            type: Type.Svf,
          },
        ],
      },
    });
    return job.result;
  }

  async getManifest(urn: string) {
    const { access_token } = await this.getInternalToken();
    try {
      const manifest = await modelDerivativeClient.getManifest(
        access_token!,
        urn,
      );
      return manifest;
    } catch (err: any) {
      if (err.axiosError.response.status === 404) {
        return null;
      } else {
        throw err;
      }
    }
  }

  urnify(id: string) {
    return Buffer.from(id).toString('base64').replace(/=/g, '');
  }
}
