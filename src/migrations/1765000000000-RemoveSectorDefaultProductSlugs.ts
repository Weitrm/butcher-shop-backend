import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSectorDefaultProductSlugs1765000000000
  implements MigrationInterface
{
  name = 'RemoveSectorDefaultProductSlugs1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sectors"
      DROP COLUMN IF EXISTS "defaultProductSlugs";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sectors"
      ADD COLUMN IF NOT EXISTS "defaultProductSlugs" text[] NOT NULL DEFAULT '{}';
    `);
  }
}

