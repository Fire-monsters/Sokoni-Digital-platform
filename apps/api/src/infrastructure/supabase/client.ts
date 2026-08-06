import { createClient } from "@supabase/supabase-js";

import { parseServerEnvironment } from "../../config/index.js";

const env = parseServerEnvironment();

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);
