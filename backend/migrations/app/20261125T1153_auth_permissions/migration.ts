#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b041b20aa553d3edbeba6f423a61ad24c365a42e5cb9d666472410c670a5226d/contract';
import startContract from '../../snapshots/b041b20aa553d3edbeba6f423a61ad24c365a42e5cb9d666472410c670a5226d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d9fb1df96b9432db96a06f1bbcabfb45503456bb0424be4122513b688a6e6938/contract';
import endContract from '../../snapshots/d9fb1df96b9432db96a06f1bbcabfb45503456bb0424be4122513b688a6e6938/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'roles',
        column: col('permissions', 'text[]', {
          notNull: true,
          default: fn(sql`'{}'::text[]`),
          codecRef: { codecId: 'pg/text@1', many: true },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('password_hash', 'character varying(100)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'roles',
        constraint: 'roles_permissions_elem_not_null_318e2952',
        expression: sql`array_position("permissions", NULL) IS NULL`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
