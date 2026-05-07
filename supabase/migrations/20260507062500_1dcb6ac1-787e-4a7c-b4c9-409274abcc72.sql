
CREATE TABLE public.entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pc_no TEXT NOT NULL,
  name TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view entries"
  ON public.entries FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert"
  ON public.entries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update"
  ON public.entries FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete"
  ON public.entries FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entries_updated_at
  BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.entries;
ALTER TABLE public.entries REPLICA IDENTITY FULL;
