export type ReviewStatus = 'in_progress' | 'completed';

export interface ReviewSection {
  title: string;
  content: string;
  images?: string[];
}

export interface Review {
  id: string;
  authorId: string;
  company: string;
  description: string;
  sections: ReviewSection[];
  tags: string[];
  sources: string[];
  status: ReviewStatus;
  heatScore: number | null;
  distributed: boolean;
  distributedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewWithAuthor extends Review {
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
    role: string;
  };
  scoringProgress: ScoringProgress;
}

export interface ScoringProgress {
  total: number;
  completed: number;
  scorers: ScorerStatus[];
}

export interface ScorerStatus {
  userId: string;
  name: string;
  avatarUrl: string | null;
  hasScored: boolean;
  totalScore: number | null;
}

export interface CreateReviewInput {
  company: string;
  description: string;
  sections: ReviewSection[];
  tags: string[];
  sources?: string[];
}

export interface UpdateReviewInput extends Partial<CreateReviewInput> {}
