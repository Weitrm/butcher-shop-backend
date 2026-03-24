import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { UserWeeklyOrderException } from './entities/user-weekly-order-exception.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserRoleResolverService } from './services/user-role-resolver.service';
import { Sector } from '../sectors/entities';
import { Order } from '../orders/entities';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, UserRoleResolverService],
  imports: [
    ConfigModule,

    TypeOrmModule.forFeature([ User, UserRole, Sector, Order, UserWeeklyOrderException ]),

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ ConfigModule ],
      inject: [ ConfigService ],
      useFactory: ( configService: ConfigService ) => {
        // console.log('JWT Secret', configService.get('JWT_SECRET') )
        // console.log('JWT SECRET', process.env.JWT_SECRET)
        return {
          secret: configService.get('JWT_SECRET'),
          signOptions: {
            expiresIn:'2h'
          }
        }
      }
    })
    // JwtModule.register({
      // secret: process.env.JWT_SECRET,
      // signOptions: {
      //   expiresIn:'2h'
      // }
    // })

  ],
  exports: [ TypeOrmModule, JwtStrategy, PassportModule, JwtModule ]
})
export class AuthModule {}
