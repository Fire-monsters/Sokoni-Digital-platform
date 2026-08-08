import { createClient } from "@supabase/supabase-js";
import type { Database } from "@sokoni-digital/database-types";

import { parseServerEnvironment } from "../../config/index.js";

const env = parseServerEnvironment();

export const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: {
    persistSession: false,
  },
});
