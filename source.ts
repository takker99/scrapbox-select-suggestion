export interface Candidate {
  title: string;
  titleLc: string;
  updated: number;
  metadata: {
    project: string;
    hasIcon: boolean;
  }[];
}
