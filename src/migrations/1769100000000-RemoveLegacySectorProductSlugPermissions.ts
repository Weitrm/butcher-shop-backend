import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveLegacySectorProductSlugPermissions1769100000000
  implements MigrationInterface
{
  name = 'RemoveLegacySectorProductSlugPermissions1769100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sectors"
      DROP COLUMN IF EXISTS "allowAllProducts";
    `);

    await queryRunner.query(`
      ALTER TABLE "sectors"
      DROP COLUMN IF EXISTS "allowedProductSlugs";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sectors"
      ADD COLUMN IF NOT EXISTS "allowAllProducts" boolean NOT NULL DEFAULT true;
    `);

    await queryRunner.query(`
      ALTER TABLE "sectors"
      ADD COLUMN IF NOT EXISTS "allowedProductSlugs" text[] NOT NULL DEFAULT '{}';
    `);
  }
}

