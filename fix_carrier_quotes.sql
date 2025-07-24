-- Fix carrier_quotes table and its sequence
CREATE SEQUENCE IF NOT EXISTS carrier_quotes_id_seq;

CREATE TABLE IF NOT EXISTS carrier_quotes (
    id bigint NOT NULL DEFAULT nextval('carrier_quotes_id_seq'::regclass), 
    email_msg_id text, 
    updated_at timestamptz DEFAULT now(), 
    received_at timestamptz DEFAULT now(), 
    special_notes text, 
    raw_email_content text, 
    extraction_confidence numeric DEFAULT 0.0, 
    equipment_type text, 
    load_id bigint, 
    delivery_date date, 
    score numeric, 
    pickup_date date, 
    status text DEFAULT 'NEW'::text, 
    rate_type text, 
    carrier_id bigint, 
    quoted_rate numeric, 
    accessorials text, 
    created_at timestamptz DEFAULT now(), 
    fuel_surcharge numeric,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS carrier_quotes_load_id_idx ON carrier_quotes USING btree (load_id);
CREATE INDEX IF NOT EXISTS carrier_quotes_carrier_id_idx ON carrier_quotes USING btree (carrier_id);
CREATE INDEX IF NOT EXISTS carrier_quotes_score_idx ON carrier_quotes USING btree (score DESC);
CREATE INDEX IF NOT EXISTS carrier_quotes_status_idx ON carrier_quotes USING btree (status);