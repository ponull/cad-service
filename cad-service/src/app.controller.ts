import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // @Get()
  // getHello(): string {
  //   return this.appService.getHello();
  // }

  @Get('/api/models')
  async getModels() {
    const objects = await this.appService.listObjects();
    return objects.map((o) => ({
      name: o.objectKey,
      urn: this.appService.urnify(o.objectId!),
    }));
  }

  @Get('/api/models/:urn/status')
  getModelStatus(@Param() params: { urn: string }) {
    const urn = params.urn;
    return this.appService.getManifest(urn);
  }

  @Post('/api/models')
  @UseInterceptors(FileInterceptor('model-file'))
  async uploadModel(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { 'model-zip-entrypoint': string },
  ) {
    const obj = await this.appService.uploadResource(
      file.originalname,
      file.buffer,
    );
    const urnId = this.appService.urnify(obj.objectId);
    await this.appService.translateObject(urnId, body['model-zip-entrypoint']);
    return {
      name: obj.objectKey,
      urn: urnId,
    };
  }

  @Delete('/api/models/:objectKey')
  deleteModel(@Param() param: { objectKey: string }) {
    return this.appService.deleteObject(param.objectKey);
  }

  @Get('/api/auth/token')
  getApiAuthToken() {
    return this.appService.getPublicToken();
  }
}
