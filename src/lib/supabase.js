import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://qjzzmaqwudawizwkxipc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqenptYXF3dWRhd2l6d2t4aXBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjE0NDAsImV4cCI6MjA5NDE5NzQ0MH0.PaKTRzXNsRQFFgGGDoQd-hnDblSHD1gtey6GmoIN--Y';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function sbLoad() {
  const { data, error } = await sb.from('user_data').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { workRecords: [], weeklyReports: [], settings: null };
  return {
    workRecords:   data.work_records   || [],
    weeklyReports: data.weekly_reports || [],
    settings:      data.settings       || null,
  };
}

export async function sbSave(workRecords, weeklyReports, settings) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('未登录');
  const { error } = await sb.from('user_data').upsert(
    { user_id: user.id, work_records: workRecords, weekly_reports: weeklyReports, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
  if (settings) {
    await sb.from('user_data').upsert(
      { user_id: user.id, settings: settings },
      { onConflict: 'user_id' }
    ).then(() => {}).catch(() => {});
  }
}
