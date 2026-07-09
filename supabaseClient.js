import { createClient } from '@supabase/supabase-js';

// En Vite se usa import.meta.env en lugar de os.getenv
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);