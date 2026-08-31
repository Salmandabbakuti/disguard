#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1ecf582227cb651cc4c9e82b97ec225e04a0d8a769b2ace5fbec70b693459dab/contract';
import endContract from '../../snapshots/1ecf582227cb651cc4c9e82b97ec225e04a0d8a769b2ace5fbec70b693459dab/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'serverConfig',
        columns: [
          col('guildId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('minimumBalance', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('roleId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('rpcUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startChannelId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenAddress', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('webhookUrl', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'serverConfig',
        constraint: 'serverConfig_guildId_key',
        columns: ['guildId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
