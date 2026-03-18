import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSectorVisibility1769000000000
  implements MigrationInterface
{
  name = 'AddProductSectorVisibility1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "allowAllSectors" boolean NOT NULL DEFAULT true;
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "allowedSectorIds" uuid[] NOT NULL DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "allowedSectorIds";
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "allowAllSectors";
    `);
  }
}

