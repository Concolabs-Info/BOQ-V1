export type RateBreakdownItem = {
  id: string;
  project_id: string;
  code: string | null;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type RateBreakdownItemInput = {
  code: string | null;
  title: string;
  description: string | null;
};
