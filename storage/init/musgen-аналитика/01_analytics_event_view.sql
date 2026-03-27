CREATE OR REPLACE VIEW musgen.analytics_event AS
  -- First bot start event (user registration)
  SELECT
    id AS chat_id,
    'BOT_START'::text AS event_name,
    created_at AS event_time
  FROM musgen.chat
UNION ALL
  -- Successful generations
  SELECT
    chat_id,
    'GENERATION'::text AS event_name,
    created_at AS event_time
  FROM musgen.music_generation
  WHERE status = 'DELIVERED'
UNION ALL
  -- Generation errors
  SELECT
    chat_id,
    'ERROR'::text AS event_name,
    created_at AS event_time
  FROM musgen.music_generation
  WHERE status IN ('NOT_DELIVERED', 'ERROR_DELIVERED')
UNION ALL
  -- Payments
  SELECT
    chat_id,
    'PAYMENT'::text AS event_name,
    created_at AS event_time
  FROM musgen.payment;
