-- ═══════════════════════════════════════════════════════════════
-- 周报助手 · 分表结构（v2）
-- 在 Supabase 控制台 → SQL Editor 中整段执行一次即可。
-- 幂等：重复执行无副作用。旧表 user_data 保留不动，作为迁移前备份；
-- 应用首次以新结构登录时会自动把 user_data 中的数据迁移到分表。
-- ═══════════════════════════════════════════════════════════════

-- ── 工作记录 ──
create table if not exists work_records (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  date       date not null,
  project    text not null default '',
  content    text not null default '',
  outcome    text not null default '',
  hours      numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists work_records_user_date_idx    on work_records (user_id, date);
create index if not exists work_records_user_project_idx on work_records (user_id, project);

-- ── 报告（周报/月报/季报/半年报/年报） ──
create table if not exists reports (
  user_id            uuid not null references auth.users(id) on delete cascade,
  id                 text not null,
  type               text not null default 'weekly',
  period_start       date not null,
  period_end         date not null,
  range_label        text not null default '',
  markdown           text not null default '',
  items              jsonb not null default '[]',
  next_items         jsonb not null default '[]',
  ai_generated       text not null default '',
  extra_material     text not null default '',
  style_distilled_md text not null default '',
  generated_at       timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists reports_user_type_period_idx on reports (user_id, type, period_start desc);

-- ── 报告版本历史（从报告对象中拆出，主表瘦身） ──
create table if not exists report_versions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  report_id  text not null,
  label      text not null default '',
  markdown   text not null default '',
  items      jsonb not null default '[]',
  next_items jsonb not null default '[]',
  saved_at   timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists report_versions_user_report_idx on report_versions (user_id, report_id);

-- ── 项目（进度 + 档案） ──
create table if not exists projects (
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  progress       text not null default '',
  goal           text not null default '',
  background     text not null default '',
  milestone_plan text not null default '',
  updated_at     timestamptz not null default now(),
  primary key (user_id, name)
);

-- ── 里程碑/关键成果 ──
create table if not exists milestones (
  user_id uuid not null references auth.users(id) on delete cascade,
  id      text not null,
  project text not null default '',
  date    date not null,
  title   text not null default '',
  metric  text not null default '',
  primary key (user_id, id)
);
create index if not exists milestones_user_date_idx on milestones (user_id, date);

-- ── 用户设置（仅真正的设置：LLM 配置、写作规则、报告范文、偏好） ──
create table if not exists user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  llm              jsonb not null default '{}',
  style_rules      jsonb not null default '[]',
  report_templates jsonb not null default '{}',
  prefs            jsonb not null default '{}',
  updated_at       timestamptz not null default now()
);

-- ═══ 行级安全（RLS）：每个用户只能读写自己的行 ═══
do $$
declare t text;
begin
  foreach t in array array['work_records','reports','report_versions','projects','milestones','user_settings'] loop
    execute format('alter table %I enable row level security', t);
    -- 幂等：先删后建
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
