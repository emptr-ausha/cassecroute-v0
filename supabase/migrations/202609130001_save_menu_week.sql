BEGIN;

-- Prerequisite: menu_weeks and menu_week_meals already exist.
-- One RPC call is one transaction: any failure rolls back the entire save.
CREATE OR REPLACE FUNCTION public.save_menu_week(p_week_start date, p_meals jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  saved_week public.menu_weeks%ROWTYPE;
BEGIN
  IF p_week_start IS NULL OR EXTRACT(ISODOW FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'week_start must be a Monday';
  END IF;
  IF p_meals IS NULL OR jsonb_typeof(p_meals) <> 'array' THEN
    RAISE EXCEPTION 'meals must be an array';
  END IF;
  IF jsonb_array_length(p_meals) NOT BETWEEN 1 AND 14 THEN
    RAISE EXCEPTION 'meals must contain between 1 and 14 entries';
  END IF;

  -- Serialize saves, including the retention step, across server instances.
  PERFORM pg_catalog.pg_advisory_xact_lock(178932401, 1);

  INSERT INTO public.menu_weeks (week_start, updated_at)
  VALUES (p_week_start, clock_timestamp())
  ON CONFLICT (week_start) DO UPDATE
    SET updated_at = EXCLUDED.updated_at
  RETURNING * INTO saved_week;

  DELETE FROM public.menu_week_meals WHERE menu_week_id = saved_week.id;

  INSERT INTO public.menu_week_meals (
    menu_week_id, day_index, moment, recipe_id, recipe_name, is_leftovers
  )
  SELECT
    saved_week.id,
    meal.day_index,
    meal.moment,
    CASE WHEN meal.is_leftovers THEN NULL ELSE meal.recipe_id END,
    CASE WHEN meal.is_leftovers THEN '🥡 Restes' ELSE meal.recipe_name END,
    meal.is_leftovers
  FROM jsonb_to_recordset(p_meals) AS meal (
    day_index smallint, moment text, recipe_id text,
    recipe_name text, is_leftovers boolean
  );

  DELETE FROM public.menu_weeks
  WHERE id IN (
    SELECT id FROM public.menu_weeks
    ORDER BY week_start DESC
    OFFSET 4
  );

  RETURN to_jsonb(saved_week);
END;
$$;

-- Functions otherwise grant EXECUTE to PUBLIC by default.
REVOKE ALL PRIVILEGES ON FUNCTION public.save_menu_week(date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_menu_week(date, jsonb) TO service_role;

COMMIT;
