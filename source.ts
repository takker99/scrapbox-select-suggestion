export interface Candidate {
  title: string;
  titleLc: string;
  updated: number;
  linked: number;
  metadata: Map<string, { image?: string }>;
}
