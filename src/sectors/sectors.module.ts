import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { Product } from '../products/entities';
import { Sector } from './entities/sector.entity';
import { SectorsController } from './sectors.controller';
import { SectorsService } from './sectors.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sector, Product, User]), AuthModule],
  controllers: [SectorsController],
  providers: [SectorsService],
  exports: [TypeOrmModule],
})
export class SectorsModule {}
