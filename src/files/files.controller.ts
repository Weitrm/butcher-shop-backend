import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { Response } from 'express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { FilesService } from './files.service';

import { fileFilter, fileNamer } from './helpers';

const PRODUCT_IMAGES_PATH = join(__dirname, '..', '..', 'static', 'products');
if (!existsSync(PRODUCT_IMAGES_PATH)) {
  mkdirSync(PRODUCT_IMAGES_PATH, { recursive: true });
}

@ApiTags('Files - Get and Upload')
@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
  ) {}

  @Get('product/:imageName')
  async findProductImage(
    @Res() res: Response,
    @Param('imageName') imageName: string,
  ) {
    const storedImage = await this.filesService.getStoredProductImage(imageName);

    if (storedImage) {
      res.setHeader('Content-Type', storedImage.mimeType);
      return res.send(storedImage.data);
    }

    const path = this.filesService.getStaticProductImage(imageName);
    return res.sendFile(path);
  }

  @Post('product')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: fileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: diskStorage({
        destination: PRODUCT_IMAGES_PATH,
        filename: fileNamer,
      }),
    }),
  )
  async uploadProductImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Make sure that the file is an image');
    }

    const fileName = await this.filesService.storeProductImage(file);
    const secureUrl = `${this.configService.get('HOST_API')}/files/product/${
      fileName
    }`;

    return { secureUrl, fileName };
  }
}
