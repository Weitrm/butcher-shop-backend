import { existsSync } from 'fs';
import { join } from 'path';

import { Injectable, BadRequestException } from '@nestjs/common';


@Injectable()
export class FilesService {
    private readonly productImagesPath = join(__dirname, '..', '..', 'static', 'products');
  
    getStaticProductImage( imageName: string ) {

        const path = join(this.productImagesPath, imageName);

        if ( !existsSync(path) ) 
            throw new BadRequestException(`No product found with image ${ imageName }`);

        return path;
    }


}
