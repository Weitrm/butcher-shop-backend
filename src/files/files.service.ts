import { existsSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoredProductImage } from './entities/stored-product-image.entity';


@Injectable()
export class FilesService {
    private readonly productImagesPath = join(__dirname, '..', '..', 'static', 'products');

    constructor(
      @InjectRepository(StoredProductImage)
      private readonly storedProductImageRepository: Repository<StoredProductImage>,
    ) {}
  
    getStaticProductImage( imageName: string ) {

        const path = join(this.productImagesPath, imageName);

        if ( !existsSync(path) ) 
            throw new BadRequestException(`No product found with image ${ imageName }`);

        return path;
    }

    async getStoredProductImage(imageName: string) {
      return this.storedProductImageRepository.findOneBy({ fileName: imageName });
    }

    async storeProductImage(file: Express.Multer.File) {
      try {
        const fileBuffer = await readFile(file.path);

        await this.storedProductImageRepository.save(
          this.storedProductImageRepository.create({
            fileName: file.filename,
            mimeType: file.mimetype,
            data: fileBuffer,
          }),
        );

        return file.filename;
      } finally {
        await unlink(file.path).catch(() => null);
      }
    }

}
