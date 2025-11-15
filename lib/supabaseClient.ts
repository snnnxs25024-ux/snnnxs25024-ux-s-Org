import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bcpcktordkkmatpibmfz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcGNrdG9yZGtrbWF0cGlibWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxODU5MTEsImV4cCI6MjA3ODc2MTkxMX0.LU6WbnJ6bKIwO7u6e90nKR4DQU_spLmhfU5TpRkpKKY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
