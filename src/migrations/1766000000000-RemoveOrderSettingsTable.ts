import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOrderSettingsTable1766000000000
  implements MigrationInterface
{
  name = 'RemoveOrderSettingsTable1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "order_settings";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_settings" (
        "id" SERIAL NOT NULL,
        "maxTotalKg" integer NOT NULL DEFAULT 10,
        "maxItems" integer NOT NULL DEFAULT 2,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_settings_id" PRIMARY KEY ("id")
      );
    `);
  }
}
