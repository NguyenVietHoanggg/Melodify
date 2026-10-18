/** Creates the fake LOCAL_DEV_USER_ID account in the local PGlite database (local testing only). */
import { env } from '../config/env';
import { sql } from '../db/client';

const id = env.LOCAL_DEV_USER_ID;
if (!id) throw new Error('Set LOCAL_DEV_USER_ID in the env file first');
await sql`
  insert into auth.users (id, email, raw_user_meta_data)
  values (${id}, 'local.tester@example.com', ${sql.json({ display_name: 'HDK', birth_date: '2000-01-01', gender: 'male' })})
  on conflict (id) do nothing`;
console.log(await sql`select id, username, display_name from profiles where id = ${id}`);
await sql.end();
