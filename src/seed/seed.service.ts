import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductsService } from './../products/products.service';
import { initialData } from './data/seed-data';
import { User } from '../auth/entities/user.entity';
import { UserRole } from '../auth/entities/user-role.entity';


@Injectable()
export class SeedService {

  constructor(
    private readonly productsService: ProductsService,

    @InjectRepository( User )
    private readonly userRepository: Repository<User>,

    @InjectRepository( UserRole )
    private readonly userRoleRepository: Repository<UserRole>,
  ) {}


  async runSeed() {

    await this.deleteTables();
    const adminUser = await this.insertUsers();

    await this.insertNewProducts( adminUser );

    return 'SEED EXECUTED';
  }

  private async deleteTables() {

    await this.productsService.deleteAllProducts();

    const queryBuilder = this.userRepository.createQueryBuilder();
    await queryBuilder
      .delete()
      .where({})
      .execute()

  }

  private async insertUsers() {

    const seedUsers = initialData.users;
    const users = seedUsers.map((seedUser) => this.userRepository.create(seedUser));

    const dbUsers = await this.userRepository.save(users);
    const userRoles = dbUsers.flatMap((savedUser, index) => {
      const roles = Array.from(
        new Set((seedUsers[index]?.roles || ['user']).filter(Boolean)),
      );
      return roles.map((role) =>
        this.userRoleRepository.create({
          userId: savedUser.id,
          role,
        }),
      );
    });
    if (userRoles.length > 0) {
      await this.userRoleRepository.save(userRoles);
    }

    return dbUsers[0];
  }


  private async insertNewProducts( user: User ) {
    await this.productsService.deleteAllProducts();

    const products = initialData.products;

    const insertPromises = [];

    products.forEach( product => {
      insertPromises.push( this.productsService.create( product, user ) );
    });

    await Promise.all( insertPromises );


    return true;
  }


}
