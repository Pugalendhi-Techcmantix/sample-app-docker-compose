import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import contractJson from './prisma/contract.json' with { type: 'json' };
import { config } from './config.js';

export const contract = contractFromJson(contractJson);

// The one Prisma 8 client. Connects lazily on first query.
export const db = postgres({ contract, url: config.databaseUrl });
